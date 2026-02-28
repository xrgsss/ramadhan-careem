import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Users,
  ArrowLeft,
  LogOut,
  Car,
  Bike,
  Clock3,
  Loader2,
  Send,
  User,
  UserRound,
  ReceiptText,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./lib/supabase";

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Validation Schema
const formSchema = z.object({
  name: z.string().min(3, "Nama minimal 3 karakter"),
  email: z.string().email("Email tidak valid"),
  phone: z.string().min(10, "Nomor WhatsApp minimal 10 digit"),
  organization: z.string().min(2, "Nama organisasi minimal 2 karakter").optional().or(z.literal("")),
  role: z.string().min(2, "Jabatan minimal 2 karakter").optional().or(z.literal("")),
  vehicleType: z.string().min(1, "Silakan pilih jenis kendaraan"),
  transferProof: z.string().min(1, "Bukti transfer wajib diunggah"),
});

type FormData = z.infer<typeof formSchema>;

interface Submission {
  id: number;
  name: string;
  email: string;
  phone: string;
  organization: string;
  role: string;
  vehicle_type: string;
  transfer_proof: string;
  created_at: string;
}

interface AccountProfile {
  id: string | null;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
}

type AuthMode = "login" | "signup";
const ADMIN_EMAIL = "ramadhancareem@gmail.com";
const MAX_TRANSFER_PROOF_SIZE_BYTES = 5 * 1024 * 1024;

interface VehicleAvailability {
  mobil: {
    limit: number;
    used: number;
    remaining: number;
    isFull: boolean;
  };
  motor: {
    limit: number;
    used: number;
    remaining: number;
    isFull: boolean;
  };
  non_kendaraan: {
    isFull: boolean;
  };
}

const DEFAULT_VEHICLE_AVAILABILITY: VehicleAvailability = {
  mobil: { limit: 30, used: 0, remaining: 30, isFull: false },
  motor: { limit: 20, used: 0, remaining: 20, isFull: false },
  non_kendaraan: { isFull: false },
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file."));
    reader.readAsDataURL(file);
  });
}

function mapAuthErrorMessage(message: string, mode: AuthMode) {
  const normalized = message.toLowerCase();

  if (mode === "login" && normalized.includes("invalid login credentials")) {
    return "masukan email/password yang benar";
  }

  return message;
}

function getVehicleTypeLabel(vehicleType: string) {
  if (vehicleType === "non_kendaraan") {
    return "Non Kendaraan";
  }

  if (!vehicleType) {
    return "-";
  }

  return vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function App() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [transferProofName, setTransferProofName] = useState("");
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability>(
    DEFAULT_VEHICLE_AVAILABILITY,
  );
  const transferProofInputRef = useRef<HTMLInputElement>(null);
  const heroVideoSrc = "/hero/hero-ramadhan.mp4";
  const isAdmin = (session?.user?.email ?? "").toLowerCase() === ADMIN_EMAIL;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });
  const selectedVehicleType = watch("vehicleType");

  const handleTransferProofChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      setError("transferProof", {
        type: "manual",
        message: "File harus berupa gambar (JPG, PNG, WEBP).",
      });
      event.target.value = "";
      return;
    }

    if (file.size > MAX_TRANSFER_PROOF_SIZE_BYTES) {
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      setError("transferProof", {
        type: "manual",
        message: "Ukuran file maksimal 5MB.",
      });
      event.target.value = "";
      return;
    }

    try {
      const fileDataUrl = await readFileAsDataUrl(file);
      if (!fileDataUrl) {
        throw new Error("File data kosong.");
      }

      setTransferProofName(file.name);
      setValue("transferProof", fileDataUrl, {
        shouldDirty: true,
        shouldValidate: true,
      });
      clearErrors("transferProof");
    } catch (error) {
      console.error("Failed to parse transfer proof image:", error);
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      setError("transferProof", {
        type: "manual",
        message: "Gagal membaca file. Silakan pilih ulang gambar.",
      });
      event.target.value = "";
    }
  };

  useEffect(() => {
    let mounted = true;

    const initSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      setIsAuthReady(true);
    };

    initSession().catch((error) => {
      console.error("Failed to initialize auth session:", error);
      if (mounted) {
        setSession(null);
        setIsAuthReady(true);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const getAccessToken = async () => {
    if (session?.access_token) return session.access_token;

    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      setSession(data.session);
      return data.session.access_token;
    }

    return null;
  };

  const handleUnauthorized = async () => {
    setAuthError("Sesi login Anda berakhir. Silakan login kembali.");
    setShowAdmin(false);
    setShowProfile(false);
    setIsSubmitted(false);
    setSubmissions([]);
    setMySubmissions([]);
    setAccountProfile(null);
    setVehicleAvailability(DEFAULT_VEHICLE_AVAILABILITY);
    setSession(null);
    await supabase.auth.signOut({ scope: "local" });
  };

  const handleLogout = async () => {
    setShowAdmin(false);
    setShowProfile(false);
    setIsSubmitted(false);
    setSubmissions([]);
    setMySubmissions([]);
    setAccountProfile(null);
    setAuthError("");
    setAuthMessage("");
    setVehicleAvailability(DEFAULT_VEHICLE_AVAILABILITY);
    setSession(null);

    // Clear local session first so logout works even if network/revoke fails.
    const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });
    if (localSignOutError) {
      console.error("Local sign out failed:", localSignOutError);
    }

    // Optional global revoke. Failure here should not block logout UX.
    const { error: globalSignOutError } = await supabase.auth.signOut();
    if (globalSignOutError) {
      console.error("Global sign out failed:", globalSignOutError);
    }
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!authEmail.trim() || !authPassword) {
      setAuthError("Email dan password wajib diisi.");
      return;
    }

    setIsAuthLoading(true);
    setAuthError("");
    setAuthMessage("");

    try {
      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

        if (error) {
          setAuthError(mapAuthErrorMessage(error.message, "login"));
          return;
        }

        setAuthPassword("");
        setAuthMessage("Login berhasil.");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (error) {
        setAuthError(mapAuthErrorMessage(error.message, "signup"));
        return;
      }

      setAuthPassword("");
      setShowAuthPassword(false);
      setAuthMode("login");

      // Signup must not grant direct access to the form.
      if (data.session) {
        await supabase.auth.signOut();
        setSession(null);
      }

      setAuthMessage(
        data.session
          ? "Akun berhasil dibuat. Silakan login untuk melanjutkan."
          : "Akun berhasil dibuat. Silakan cek email verifikasi Anda, lalu login.",
      );
    } catch (error) {
      console.error("Auth error:", error);
      setAuthError("Terjadi kesalahan koneksi.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    if ((data.vehicleType === "mobil" || data.vehicleType === "motor") && vehicleAvailability[data.vehicleType].isFull) {
      setError("vehicleType", {
        type: "manual",
        message: `Kuota ${data.vehicleType} sudah penuh.`,
      });
      return;
    }

    setIsLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        await handleUnauthorized();
        return;
      }

      const response = await fetch("/api/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (response.status === 409) {
        const payload = await response.json().catch(() => null);
        setError("vehicleType", {
          type: "manual",
          message: payload?.error ?? "Kuota kendaraan sudah penuh.",
        });
        await fetchVehicleAvailability();
        return;
      }

      if (response.ok) {
        setIsSubmitted(true);
        reset();
        setTransferProofName("");
        if (transferProofInputRef.current) {
          transferProofInputRef.current.value = "";
        }
        await fetchVehicleAvailability();
      } else {
        alert("Gagal mengirim formulir. Silakan coba lagi.");
      }
    } catch (error) {
      console.error("Error submitting form:", error);
      alert("Terjadi kesalahan koneksi.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVehicleAvailability = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        await handleUnauthorized();
        return;
      }

      const response = await fetch("/api/vehicle-availability", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch vehicle availability");
      }

      const data = (await response.json()) as VehicleAvailability;
      setVehicleAvailability(data);
    } catch (error) {
      console.error("Error fetching vehicle availability:", error);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        await handleUnauthorized();
        return;
      }

      const response = await fetch("/api/submissions", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (response.status === 403) {
        setShowAdmin(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch submissions");
      }

      const data = await response.json();
      setSubmissions(data);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    }
  };

  const fetchProfileData = async () => {
    setIsProfileLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        await handleUnauthorized();
        return;
      }

      const [profileResponse, historyResponse] = await Promise.all([
        fetch("/api/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
        fetch("/api/my-submissions", {
          headers: { Authorization: `Bearer ${accessToken}` },
        }),
      ]);

      if (profileResponse.status === 401 || historyResponse.status === 401) {
        await handleUnauthorized();
        return;
      }

      if (!profileResponse.ok) {
        throw new Error("Failed to fetch profile");
      }

      if (!historyResponse.ok) {
        throw new Error("Failed to fetch submission history");
      }

      const profileData = (await profileResponse.json()) as AccountProfile;
      const historyData = (await historyResponse.json()) as Submission[];
      setAccountProfile(profileData);
      setMySubmissions(historyData);
    } catch (error) {
      console.error("Error fetching profile data:", error);
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    if (showAdmin && session) {
      fetchSubmissions();
    }
  }, [showAdmin, session]);

  useEffect(() => {
    if (showProfile && session) {
      fetchProfileData();
    }
  }, [showProfile, session]);

  useEffect(() => {
    if (session) {
      fetchVehicleAvailability();
    }
  }, [session]);

  const handleOpenProfile = () => {
    setShowAdmin(false);
    setShowProfile(true);
  };

  const handleOpenAdmin = () => {
    if (!isAdmin) {
      return;
    }

    setShowProfile(false);
    setShowAdmin(true);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#F0EBF8] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 text-gray-600 text-sm">
          Memuat sesi login...
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-[#F0EBF8] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-2 bg-[#673AB7]" />
          <div className="p-6 md:p-8">
            <h1 className="text-2xl font-bold text-[#202124] mb-2">
              {authMode === "login" ? "Login Diperlukan" : "Buat Akun Baru"}
            </h1>
            <p className="text-gray-600 mb-6">
              {authMode === "login"
                ? "Silakan login terlebih dahulu sebelum mengisi formulir pendaftaran."
                : "Daftar akun dengan email dan password untuk mengakses formulir."}
            </p>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              <InputField
                label="Email"
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                autoComplete="email"
                placeholder="nama@email.com"
              />
              <div className="w-full">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showAuthPassword ? "text" : "password"}
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    placeholder="Minimal 6 karakter"
                    className="w-full p-3 pr-12 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#673AB7]/20 focus:border-[#673AB7] outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-[#673AB7] transition-colors"
                    aria-label={showAuthPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showAuthPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                  </button>
                </div>
              </div>
              {authError && <p className="text-sm text-red-500">{authError}</p>}
              {authMessage && <p className="text-sm text-green-600">{authMessage}</p>}

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full bg-[#673AB7] hover:bg-[#5E35B1] disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                {isAuthLoading
                  ? "Memproses..."
                  : authMode === "login"
                    ? "Login"
                    : "Signup"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAuthMode((prev) => (prev === "login" ? "signup" : "login"));
                  setAuthError("");
                  setAuthMessage("");
                }}
                className="w-full text-sm text-[#673AB7] hover:underline"
              >
                {authMode === "login" ? "Belum punya akun? Signup" : "Sudah punya akun? Login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (showAdmin) {
    return (
      <div className="min-h-screen bg-[#F0EBF8] py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <button
              onClick={() => setShowAdmin(false)}
              className="flex items-center gap-2 text-[#673AB7] hover:text-[#5E35B1] font-medium transition-colors"
            >
              <ArrowLeft size={20} />
              Kembali ke Formulir
            </button>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-[#202124]">Data Registrasi</h1>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#673AB7] hover:border-[#673AB7]/30 transition-colors"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-bottom border-gray-200">
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Organisasi</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Jabatan</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kendaraan</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bukti</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-400 italic">
                        Belum ada data masuk
                      </td>
                    </tr>
                  ) : (
                    submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-sm text-gray-900 font-medium">{sub.name}</td>
                        <td className="p-4 text-sm text-gray-600">{sub.email}</td>
                        <td className="p-4 text-sm text-gray-600">{sub.organization || "-"}</td>
                        <td className="p-4 text-sm text-gray-600">{sub.role || "-"}</td>
                        <td className="p-4 text-sm text-gray-600">
                          {sub.vehicle_type === "non_kendaraan"
                            ? "Non Kendaraan"
                            : sub.vehicle_type
                              ? sub.vehicle_type.charAt(0).toUpperCase() + sub.vehicle_type.slice(1)
                              : "-"}
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {sub.transfer_proof ? (
                            <a
                              href={sub.transfer_proof}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#673AB7] hover:underline"
                            >
                              Lihat
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="p-4 text-sm text-gray-500">
                          {new Date(sub.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showProfile) {
    const profileEmail = accountProfile?.email ?? session.user.email ?? "-";
    const profileCreatedAt = accountProfile?.created_at ?? session.user.created_at ?? null;
    const profileLastSignInAt = accountProfile?.last_sign_in_at ?? session.user.last_sign_in_at ?? null;

    return (
      <div className="min-h-screen bg-[#F0EBF8] py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowProfile(false)}
              className="flex items-center gap-2 text-[#673AB7] hover:text-[#5E35B1] font-medium transition-colors"
            >
              <ArrowLeft size={20} />
              Kembali ke Formulir
            </button>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-[#202124]">Profil Akun</h1>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#673AB7] hover:border-[#673AB7]/30 transition-colors"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
              <UserRound className="text-[#673AB7]" size={20} />
              <h3 className="font-semibold text-gray-800">Informasi Akun</h3>
            </div>
            <div className="p-6 md:p-8 grid gap-4 md:grid-cols-2">
              <ProfileItem label="Email" value={profileEmail} />
              <ProfileItem label="Tanggal Daftar" value={formatDateTime(profileCreatedAt)} />
              <ProfileItem label="Login Terakhir" value={formatDateTime(profileLastSignInAt)} />
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
              <Clock3 className="text-[#673AB7]" size={20} />
              <h3 className="font-semibold text-gray-800">Riwayat Pengisian Form</h3>
            </div>

            {isProfileLoading ? (
              <div className="p-8 text-center text-gray-500">Memuat riwayat...</div>
            ) : mySubmissions.length === 0 ? (
              <div className="p-8 text-center text-gray-400 italic">Belum ada riwayat pengisian form.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {mySubmissions.map((submission) => (
                  <div key={submission.id} className="p-5 md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-base font-semibold text-[#202124]">{submission.name}</p>
                      <p className="text-xs font-medium text-gray-500">{formatDateTime(submission.created_at)}</p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 text-sm text-gray-600">
                      <p>
                        <span className="font-medium text-gray-800">Email:</span> {submission.email || "-"}
                      </p>
                      <p>
                        <span className="font-medium text-gray-800">WhatsApp:</span> {submission.phone || "-"}
                      </p>
                      <p>
                        <span className="font-medium text-gray-800">Kendaraan:</span>{" "}
                        {getVehicleTypeLabel(submission.vehicle_type)}
                      </p>
                      <p>
                        <span className="font-medium text-gray-800">Organisasi:</span>{" "}
                        {submission.organization || "-"}
                      </p>
                    </div>
                    <div className="mt-3">
                      <span className="text-sm font-medium text-gray-800">Bukti transfer: </span>
                      {submission.transfer_proof ? (
                        <a
                          href={submission.transfer_proof}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-[#673AB7] hover:underline"
                        >
                          Lihat gambar
                        </a>
                      ) : (
                        <span className="text-sm text-gray-500">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0EBF8] pb-12">
      {/* Google Forms Style Header Accent */}
      <div className="h-2.5 bg-[#673AB7] w-full sticky top-0 z-10" />

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={handleOpenProfile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#673AB7] hover:border-[#673AB7]/30 transition-colors"
            aria-label="Profile"
            title="Profile"
          >
            <UserRound size={16} />
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#673AB7] hover:border-[#673AB7]/30 transition-colors"
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {!isSubmitted ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
            >
              {/* Header Card */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
                <div className="h-2 bg-[#673AB7]" />
                <div className="p-6 md:p-8">
                  <h1 className="text-3xl md:text-4xl font-bold text-[#202124] mb-4">
                    Marhaban ya Ramadhan Careem
                  </h1>
                  <p className="text-gray-600 leading-relaxed">
                    Silakan lengkapi data diri Anda untuk mendaftar pada acara Ramadhan mendatang. Pastikan
                    informasi yang Anda berikan sudah benar.
                  </p>

                  {/* Video Hero Section */}
                  <div className="mt-6 rounded-xl overflow-hidden aspect-video relative bg-gray-900 shadow-inner group">
                    <video
                      autoPlay
                      loop
                      muted
                      playsInline
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500"
                    >
                      <source src={heroVideoSrc} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-4 sm:p-6">
                      <div className="text-white">
                        <p className="text-xs sm:text-sm font-medium uppercase tracking-wider opacity-80 mb-1">
                          Ramadhan Special Event
                        </p>
                        <h3 className="text-base sm:text-xl font-bold">Buka Bersama & Berbagi 2026</h3>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-red-500">* Wajib diisi</span>
                    {isAdmin ? (
                      <button
                        onClick={handleOpenAdmin}
                        className="text-xs text-gray-400 hover:text-[#673AB7] transition-colors flex items-center gap-1"
                      >
                        <Users size={14} />
                        Admin View
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Form Content */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Name Field */}
                <FormSection title="Data Pribadi" icon={<User className="text-[#673AB7]" size={20} />}>
                  <div className="space-y-6">
                    <InputField
                      label="Nama Lengkap"
                      required
                      error={errors.name?.message}
                      {...register("name")}
                      placeholder="Masukkan nama lengkap Anda"
                    />
                    <InputField
                      label="Alamat Email"
                      required
                      type="email"
                      error={errors.email?.message}
                      {...register("email")}
                      placeholder="contoh@email.com"
                    />
                    <InputField
                      label="Nomor WhatsApp"
                      required
                      error={errors.phone?.message}
                      {...register("phone")}
                      placeholder="0812xxxxxx"
                    />
                  </div>
                </FormSection>

                <FormSection title="Jenis Kendaraan" icon={<Car className="text-[#673AB7]" size={20} />}>
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      Pilih kendaraan yang digunakan <span className="text-red-500">*</span>
                    </label>
                    <input type="hidden" {...register("vehicleType")} />
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        {
                          value: "mobil",
                          label: "Mobil",
                          description: "Kapasitas maksimal 30 kendaraan",
                          icon: <Car size={18} />,
                        },
                        {
                          value: "motor",
                          label: "Motor",
                          description: "Kapasitas maksimal 20 kendaraan",
                          icon: <Bike size={18} />,
                        },
                        {
                          value: "non_kendaraan",
                          label: "Non Kendaraan",
                          description: "Datang tanpa kendaraan pribadi",
                          icon: <User size={18} />,
                        },
                      ].map((option) => {
                        const isSelected = selectedVehicleType === option.value;
                        const isLimitedOption = option.value === "mobil" || option.value === "motor";
                        const availability =
                          option.value === "mobil"
                            ? vehicleAvailability.mobil
                            : option.value === "motor"
                              ? vehicleAvailability.motor
                              : null;
                        const isFull = isLimitedOption ? Boolean(availability?.isFull) : false;

                        return (
                          <button
                            key={option.value}
                            type="button"
                            disabled={isFull}
                            onClick={() => {
                              setValue("vehicleType", option.value, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              clearErrors("vehicleType");
                            }}
                            className={cn(
                              "rounded-2xl border p-4 text-left transition-all",
                              isSelected &&
                                "border-[#673AB7] bg-gradient-to-br from-[#673AB7]/10 to-white ring-2 ring-[#673AB7]/20 shadow-sm",
                              !isSelected && !isFull && "border-gray-200 bg-white hover:border-[#673AB7]/40 hover:shadow-sm",
                              isFull && "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed",
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={cn("text-[#673AB7]", isFull && "text-gray-400")}>{option.icon}</span>
                                <p className="font-semibold">{option.label}</p>
                              </div>
                              {isSelected ? (
                                <span className="text-[11px] font-semibold text-[#673AB7] bg-[#673AB7]/10 px-2 py-1 rounded-full">
                                  Dipilih
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">{option.description}</p>

                            {isLimitedOption && availability ? (
                              <p className={cn("mt-3 text-xs font-semibold", isFull ? "text-red-500" : "text-[#673AB7]")}>
                                {isFull ? "Kuota penuh" : `Sisa ${availability.remaining} slot`}
                              </p>
                            ) : (
                              <p className="mt-3 text-xs font-semibold text-emerald-600">Selalu tersedia</p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {errors.vehicleType ? (
                      <p className="text-xs text-red-500">{errors.vehicleType.message}</p>
                    ) : null}
                  </div>
                </FormSection>

                <FormSection title="Bukti Transfer" icon={<ReceiptText className="text-[#673AB7]" size={20} />}>
                  <div className="space-y-3">
                    <input type="hidden" {...register("transferProof")} />
                    <label className="block text-sm font-medium text-gray-700">
                      Upload screenshot bukti transfer <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={transferProofInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleTransferProofChange}
                      className={cn(
                        "w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#673AB7] file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-[#5E35B1]",
                        errors.transferProof && "border-red-500",
                      )}
                    />
                    <p className="text-xs text-gray-500">Format gambar, maksimal 5MB.</p>
                    {transferProofName ? (
                      <p className="text-xs text-gray-700">File terpilih: {transferProofName}</p>
                    ) : null}
                    {errors.transferProof ? (
                      <p className="text-xs text-red-500">{errors.transferProof.message}</p>
                    ) : null}
                  </div>
                </FormSection>

                {/* Submit Button */}
                <div className="flex justify-end pt-4 pb-8">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="bg-[#673AB7] hover:bg-[#5E35B1] disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 group"
                  >
                    {isLoading ? (
                      <Loader2 className="animate-spin" size={20} />
                    ) : (
                      <>
                        Kirim Pendaftaran
                        <Send size={18} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="h-2 bg-[#673AB7]" />
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-50 rounded-full mb-6">
                  <CheckCircle2 className="text-green-500" size={48} />
                </div>
                <h2 className="text-3xl font-bold text-[#202124] mb-4">Pendaftaran Berhasil!</h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Terima kasih telah mendaftar. Kami telah menerima data Anda dan akan segera menghubungi melalui
                  email untuk informasi selanjutnya.
                </p>
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="text-[#673AB7] font-semibold hover:underline"
                >
                  Kirim tanggapan lain
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Sub-components
function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
        {icon}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-6 md:p-8">{children}</div>
    </div>
  );
}

function ProfileItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-gray-100 bg-gray-50 p-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-sm text-gray-800">{value}</p>
    </div>
  );
}

const InputField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; required?: boolean }
>(({ label, error, required, className, ...props }, ref) => {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        ref={ref}
        className={cn(
          "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#673AB7]/20 focus:border-[#673AB7] outline-none transition-all",
          error && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
});

InputField.displayName = "InputField";
