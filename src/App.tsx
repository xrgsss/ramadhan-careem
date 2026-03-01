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
  Trash2,
  Download,
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
const TRANSFER_PROOF_BUCKET = "bukti-transfer";
const REGISTRATION_DEADLINE_MS = new Date("2026-03-08T15:00:00+07:00").getTime();
const REGISTRATION_DEADLINE_TEXT = "8 Maret 2026, 15:00 WIB";

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

function getCountdownParts(remainingMs: number) {
  const safeRemainingMs = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(safeRemainingMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

function formatCountdownUnit(value: number) {
  return value.toString().padStart(2, "0");
}

function buildVehicleAvailability(mobilUsed: number, motorUsed: number): VehicleAvailability {
  const mobilLimit = DEFAULT_VEHICLE_AVAILABILITY.mobil.limit;
  const motorLimit = DEFAULT_VEHICLE_AVAILABILITY.motor.limit;

  return {
    mobil: {
      limit: mobilLimit,
      used: mobilUsed,
      remaining: Math.max(0, mobilLimit - mobilUsed),
      isFull: mobilUsed >= mobilLimit,
    },
    motor: {
      limit: motorLimit,
      used: motorUsed,
      remaining: Math.max(0, motorLimit - motorUsed),
      isFull: motorUsed >= motorLimit,
    },
    non_kendaraan: {
      isFull: false,
    },
  };
}

function isDataImageUrl(value: string) {
  return value.startsWith("data:image/");
}

function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}

function isStorageObjectPath(value: string) {
  return Boolean(value) && !isDataImageUrl(value) && !isHttpUrl(value) && !value.startsWith("blob:");
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
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<number | null>(null);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
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
  const [mustLoginAfterSignup, setMustLoginAfterSignup] = useState(false);
  const [transferProofFile, setTransferProofFile] = useState<File | null>(null);
  const [transferProofName, setTransferProofName] = useState("");
  const [transferProofLinks, setTransferProofLinks] = useState<Record<string, string>>({});
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [vehicleAvailability, setVehicleAvailability] = useState<VehicleAvailability>(
    DEFAULT_VEHICLE_AVAILABILITY,
  );
  const transferProofInputRef = useRef<HTMLInputElement>(null);
  const heroVideoSrc = "/hero/hero-ramadhan.mp4";
  const isAdmin = (session?.user?.email ?? "").toLowerCase() === ADMIN_EMAIL;
  const isRegistrationClosed = currentTimestamp >= REGISTRATION_DEADLINE_MS;
  const countdown = getCountdownParts(REGISTRATION_DEADLINE_MS - currentTimestamp);

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
      setTransferProofFile(null);
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      return;
    }

    if (!file.type.startsWith("image/")) {
      setTransferProofFile(null);
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
      setTransferProofFile(null);
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
      setTransferProofFile(file);
      setTransferProofName(file.name);
      setValue("transferProof", file.name, {
        shouldDirty: true,
        shouldValidate: true,
      });
      clearErrors("transferProof");
    } catch (error) {
      console.error("Failed to store transfer proof file:", error);
      setTransferProofFile(null);
      setTransferProofName("");
      setValue("transferProof", "", { shouldValidate: true });
      setError("transferProof", {
        type: "manual",
        message: "Gagal memproses file. Silakan pilih ulang gambar.",
      });
      event.target.value = "";
    }
  };

  const uploadTransferProofToStorage = async (file: File, userId: string) => {
    const extension = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const safeExtension = /^[a-z0-9]+$/.test(extension) ? extension : "jpg";
    const randomSuffix = Math.random().toString(36).slice(2, 10);
    const filePath = `${userId}/${Date.now()}-${randomSuffix}.${safeExtension}`;

    const { error } = await supabase.storage.from(TRANSFER_PROOF_BUCKET).upload(filePath, file, {
      upsert: false,
      contentType: file.type || "image/jpeg",
      cacheControl: "3600",
    });

    if (error) {
      throw error;
    }

    return filePath;
  };

  const getTransferProofHref = (transferProofValue: string) => {
    if (!transferProofValue) {
      return "";
    }

    if (isDataImageUrl(transferProofValue) || isHttpUrl(transferProofValue) || transferProofValue.startsWith("blob:")) {
      return transferProofValue;
    }

    return transferProofLinks[transferProofValue] ?? "";
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
    setAuthError("");
    setMustLoginAfterSignup(false);
    setShowAdmin(false);
    setShowProfile(false);
    setIsSubmitted(false);
    setSubmissions([]);
    setMySubmissions([]);
    setAccountProfile(null);
    setTransferProofFile(null);
    setTransferProofName("");
    setTransferProofLinks({});
    setVehicleAvailability(DEFAULT_VEHICLE_AVAILABILITY);
    setSession(null);
    await supabase.auth.signOut({ scope: "local" });
  };

  const handleLogout = async () => {
    setMustLoginAfterSignup(false);
    setShowAdmin(false);
    setShowProfile(false);
    setIsSubmitted(false);
    setSubmissions([]);
    setMySubmissions([]);
    setAccountProfile(null);
    setTransferProofFile(null);
    setTransferProofName("");
    setTransferProofLinks({});
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

        setMustLoginAfterSignup(false);
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
      setMustLoginAfterSignup(true);

      // Signup must not grant direct access to the form.
      if (data.session) {
        await supabase.auth.signOut({ scope: "local" });
      }
      setSession(null);

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
    if (isRegistrationClosed) {
      alert(`Pendaftaran sudah ditutup pada ${REGISTRATION_DEADLINE_TEXT}.`);
      return;
    }

    if ((data.vehicleType === "mobil" || data.vehicleType === "motor") && vehicleAvailability[data.vehicleType].isFull) {
      setError("vehicleType", {
        type: "manual",
        message: `Kuota ${data.vehicleType} sudah penuh.`,
      });
      return;
    }

    const sessionUserId = session?.user?.id ?? "";
    const sessionUserEmail = session?.user?.email ?? "";
    if (!sessionUserId || !sessionUserEmail) {
      await handleUnauthorized();
      return;
    }

    if (!transferProofFile) {
      setError("transferProof", {
        type: "manual",
        message: "Bukti transfer wajib diunggah.",
      });
      return;
    }

    setIsLoading(true);
    try {
      let uploadedTransferProofPath = "";
      try {
        uploadedTransferProofPath = await uploadTransferProofToStorage(transferProofFile, sessionUserId);
      } catch (uploadError) {
        console.error("Upload transfer proof failed:", uploadError);
        setError("transferProof", {
          type: "manual",
          message: "Upload bukti transfer gagal. Coba lagi.",
        });
        return;
      }

      const submissionPayload = {
        ...data,
        transferProof: uploadedTransferProofPath,
      };

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
        body: JSON.stringify(submissionPayload),
      });

      if (response.status === 404) {
        const [mobilUsage, motorUsage] = await Promise.all([
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("vehicle_type", "mobil"),
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("vehicle_type", "motor"),
        ]);

        if (mobilUsage.error || motorUsage.error) {
          const message = mobilUsage.error?.message ?? motorUsage.error?.message ?? "Gagal cek kuota kendaraan.";
          alert(message);
          return;
        }

        const fallbackAvailability = buildVehicleAvailability(mobilUsage.count ?? 0, motorUsage.count ?? 0);
        setVehicleAvailability(fallbackAvailability);

        if (
          (data.vehicleType === "mobil" || data.vehicleType === "motor") &&
          fallbackAvailability[data.vehicleType].isFull
        ) {
          setError("vehicleType", {
            type: "manual",
            message: `Kuota ${data.vehicleType} sudah penuh.`,
          });
          return;
        }

        const { error: insertError } = await supabase.from("submissions").insert({
          name: data.name,
          email: sessionUserEmail,
          user_id: sessionUserId,
          phone: data.phone,
          organization: data.organization ?? "",
          role: data.role ?? "",
          vehicle_type: data.vehicleType,
          transfer_proof: uploadedTransferProofPath,
        });

        if (insertError) {
          alert(insertError.message);
          return;
        }

        setIsSubmitted(true);
        reset();
        setTransferProofFile(null);
        setTransferProofName("");
        if (transferProofInputRef.current) {
          transferProofInputRef.current.value = "";
        }
        await fetchVehicleAvailability();
        return;
      }

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
        setTransferProofFile(null);
        setTransferProofName("");
        if (transferProofInputRef.current) {
          transferProofInputRef.current.value = "";
        }
        await fetchVehicleAvailability();
      } else {
        const responseText = await response.text().catch(() => "");
        let parsedError: string | null = null;
        if (responseText) {
          try {
            const payload = JSON.parse(responseText) as { error?: string };
            parsedError = typeof payload.error === "string" ? payload.error : null;
          } catch {
            parsedError = null;
          }
        }

        alert(parsedError ?? `Gagal mengirim formulir (HTTP ${response.status}). Silakan coba lagi.`);
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

      if (response.status === 404) {
        const [mobilUsage, motorUsage] = await Promise.all([
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("vehicle_type", "mobil"),
          supabase.from("submissions").select("id", { count: "exact", head: true }).eq("vehicle_type", "motor"),
        ]);

        if (mobilUsage.error || motorUsage.error) {
          throw new Error(mobilUsage.error?.message ?? motorUsage.error?.message ?? "Failed to fetch vehicle usage");
        }

        setVehicleAvailability(buildVehicleAvailability(mobilUsage.count ?? 0, motorUsage.count ?? 0));
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

      if (response.status === 404) {
        if (!isAdmin) {
          setShowAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from("submissions")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          throw new Error(error.message);
        }

        setSubmissions((data ?? []) as Submission[]);
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

  const handleDeleteSubmission = async (submissionId: number) => {
    const confirmed = window.confirm("Hapus data pendaftar ini?");
    if (!confirmed) {
      return;
    }

    setDeletingSubmissionId(submissionId);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        await handleUnauthorized();
        return;
      }

      const response = await fetch(`/api/submissions/${submissionId}`, {
        method: "DELETE",
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

      if (response.status === 404) {
        const { error: deleteError } = await supabase.from("submissions").delete().eq("id", submissionId);
        if (deleteError) {
          alert(deleteError.message);
          return;
        }

        setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
        await fetchVehicleAvailability();
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete submission");
      }

      setSubmissions((prev) => prev.filter((item) => item.id !== submissionId));
      await fetchVehicleAvailability();
    } catch (error) {
      console.error("Error deleting submission:", error);
      alert("Gagal menghapus data pendaftar.");
    } finally {
      setDeletingSubmissionId(null);
    }
  };

  const handleDownloadExcel = async () => {
    if (submissions.length === 0) {
      alert("Belum ada data pendaftar untuk diunduh.");
      return;
    }

    setIsExportingExcel(true);
    try {
      const XLSX = await import("xlsx");
      const rows = submissions.map((sub, index) => ({
        No: index + 1,
        Nama: sub.name || "-",
        Email: sub.email || "-",
        WhatsApp: sub.phone || "-",
        Kendaraan: getVehicleTypeLabel(sub.vehicle_type),
        "Bukti Transfer": sub.transfer_proof ? "Ada" : "Tidak",
        Tanggal: formatDateTime(sub.created_at),
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 6 },
        { wch: 24 },
        { wch: 28 },
        { wch: 18 },
        { wch: 16 },
        { wch: 14 },
        { wch: 24 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Pendaftar");

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateTag = new Date().toISOString().slice(0, 10);
      link.href = downloadUrl;
      link.download = `pendaftaran-ramadhan-${dateTag}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Error exporting Excel:", error);
      alert("Gagal membuat file Excel.");
    } finally {
      setIsExportingExcel(false);
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

      if (profileResponse.status === 404 || historyResponse.status === 404) {
        const currentUser = session?.user;
        if (!currentUser) {
          await handleUnauthorized();
          return;
        }

        const profileData: AccountProfile = {
          id: currentUser.id ?? null,
          email: currentUser.email ?? null,
          full_name:
            typeof currentUser.user_metadata?.full_name === "string"
              ? currentUser.user_metadata.full_name
              : typeof currentUser.user_metadata?.name === "string"
                ? currentUser.user_metadata.name
                : null,
          created_at: currentUser.created_at ?? null,
          last_sign_in_at: currentUser.last_sign_in_at ?? null,
        };
        setAccountProfile(profileData);

        const userId = currentUser.id ?? "";
        const email = currentUser.email ?? "";
        const { data: ownRows, error: ownRowsError } = await supabase
          .from("submissions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (ownRowsError) {
          throw new Error(ownRowsError.message);
        }

        let legacyRows: Submission[] = [];
        if (email) {
          const { data: legacyData, error: legacyError } = await supabase
            .from("submissions")
            .select("*")
            .is("user_id", null)
            .eq("email", email)
            .order("created_at", { ascending: false });

          if (legacyError) {
            throw new Error(legacyError.message);
          }

          legacyRows = (legacyData ?? []) as Submission[];
        }

        const mergedMap = new Map<number, Submission>();
        for (const row of (ownRows ?? []) as Submission[]) {
          mergedMap.set(row.id, row);
        }
        for (const row of legacyRows) {
          mergedMap.set(row.id, row);
        }

        const mergedRows = Array.from(mergedMap.values()).sort((a, b) => {
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          return timeB - timeA;
        });

        setMySubmissions(mergedRows);
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

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const allTransferProofValues = [...submissions, ...mySubmissions]
      .map((submission) => submission.transfer_proof)
      .filter((value): value is string => Boolean(value));

    const uniqueValues = Array.from(new Set(allTransferProofValues));
    const unresolvedPaths = uniqueValues.filter(
      (value) => isStorageObjectPath(value) && !transferProofLinks[value],
    );

    if (unresolvedPaths.length === 0) {
      return;
    }

    let isCancelled = false;

    const resolveSignedUrls = async () => {
      const resolvedLinks: Record<string, string> = {};
      await Promise.all(
        unresolvedPaths.map(async (path) => {
          const { data, error } = await supabase.storage.from(TRANSFER_PROOF_BUCKET).createSignedUrl(path, 60 * 60);
          if (!error && data?.signedUrl) {
            resolvedLinks[path] = data.signedUrl;
          }
        }),
      );

      if (!isCancelled && Object.keys(resolvedLinks).length > 0) {
        setTransferProofLinks((prev) => ({
          ...prev,
          ...resolvedLinks,
        }));
      }
    };

    resolveSignedUrls().catch((error) => {
      console.error("Failed to resolve transfer proof links:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, [submissions, mySubmissions, transferProofLinks]);

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
      <div className="min-h-screen bg-[#F8EFF1] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 text-gray-600 text-sm">
          Memuat sesi login...
        </div>
      </div>
    );
  }

  if (!session || mustLoginAfterSignup) {
    return (
      <div className="min-h-screen bg-[#F8EFF1] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="h-2 bg-[#7A1F2B]" />
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
                    className="w-full p-3 pr-12 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7A1F2B]/20 focus:border-[#7A1F2B] outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAuthPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 px-3 text-gray-500 hover:text-[#7A1F2B] transition-colors"
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
                className="w-full bg-[#7A1F2B] hover:bg-[#651823] disabled:bg-gray-400 text-white py-3 rounded-lg font-semibold transition-colors"
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
                className="w-full text-sm text-[#7A1F2B] hover:underline"
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
      <div className="min-h-screen bg-[#F8EFF1] pb-12">
        <div className="h-2.5 bg-[#7A1F2B] w-full sticky top-0 z-10" />

        <div className="max-w-3xl mx-auto px-4 pt-8">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setShowAdmin(false)}
              className="flex items-center gap-2 text-[#7A1F2B] hover:text-[#651823] font-medium transition-colors"
            >
              <ArrowLeft size={20} />
              Kembali ke Formulir
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#7A1F2B] hover:border-[#7A1F2B]/30 transition-colors"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4 overflow-hidden">
            <div className="h-2 bg-[#7A1F2B]" />
            <div className="p-6 md:p-8">
              <h1 className="text-3xl md:text-4xl font-bold text-[#202124] mb-3">Data Registrasi</h1>
              <p className="text-gray-600 leading-relaxed">
                Daftar peserta yang telah mengisi formulir pendaftaran acara Ramadhan Careem.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDownloadExcel}
                  disabled={isExportingExcel || submissions.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#7A1F2B] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#651823] disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {isExportingExcel ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  {isExportingExcel ? "Memproses..." : "Download Excel"}
                </button>
              </div>
            </div>
          </div>

          <FormSection
            title="Daftar Pendaftar"
            icon={<Users className="text-[#7A1F2B]" size={20} />}
            headerRight={
              <span className="rounded-full bg-[#7A1F2B]/10 px-2.5 py-1 text-xs font-semibold text-[#7A1F2B]">
                Total: {submissions.length}
              </span>
            }
          >
            <div className="overflow-x-auto -mx-6 md:-mx-8">
              <table className="w-full min-w-[860px] text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-200">
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Kendaraan</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Bukti</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {submissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-400 italic">
                        Belum ada data masuk
                      </td>
                    </tr>
                  ) : (
                    submissions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 text-sm text-gray-900 font-medium">{sub.name}</td>
                        <td className="p-4 text-sm text-gray-600">
                          {sub.vehicle_type === "non_kendaraan"
                            ? "Non Kendaraan"
                            : sub.vehicle_type
                              ? sub.vehicle_type.charAt(0).toUpperCase() + sub.vehicle_type.slice(1)
                              : "-"}
                        </td>
                        <td className="p-4 text-sm text-gray-600">
                          {sub.transfer_proof ? (
                            getTransferProofHref(sub.transfer_proof) ? (
                              <a
                                href={getTransferProofHref(sub.transfer_proof)}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[#7A1F2B] hover:underline"
                              >
                                Lihat
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Memuat...</span>
                            )
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
                        <td className="p-4 text-sm text-gray-600">
                          <button
                            type="button"
                            onClick={() => handleDeleteSubmission(sub.id)}
                            disabled={deletingSubmissionId === sub.id}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                            aria-label={`Hapus pendaftar ${sub.name}`}
                            title="Hapus pendaftar"
                          >
                            {deletingSubmissionId === sub.id ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </FormSection>
        </div>
      </div>
    );
  }

  if (showProfile) {
    const profileEmail = accountProfile?.email ?? session.user.email ?? "-";
    const profileCreatedAt = accountProfile?.created_at ?? session.user.created_at ?? null;
    const profileLastSignInAt = accountProfile?.last_sign_in_at ?? session.user.last_sign_in_at ?? null;

    return (
      <div className="min-h-screen bg-[#F8EFF1] py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setShowProfile(false)}
              className="flex items-center gap-2 text-[#7A1F2B] hover:text-[#651823] font-medium transition-colors"
            >
              <ArrowLeft size={20} />
              Kembali ke Formulir
            </button>
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold text-[#202124]">Profil Akun</h1>
              <button
                onClick={handleLogout}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#7A1F2B] hover:border-[#7A1F2B]/30 transition-colors"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
              <UserRound className="text-[#7A1F2B]" size={20} />
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
              <Clock3 className="text-[#7A1F2B]" size={20} />
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
                    </div>
                    <div className="mt-3">
                      <span className="text-sm font-medium text-gray-800">Bukti transfer: </span>
                      {submission.transfer_proof ? (
                        getTransferProofHref(submission.transfer_proof) ? (
                          <a
                            href={getTransferProofHref(submission.transfer_proof)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-[#7A1F2B] hover:underline"
                          >
                            Lihat gambar
                          </a>
                        ) : (
                          <span className="text-sm text-gray-400">Memuat...</span>
                        )
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
    <div className="min-h-screen bg-[#F8EFF1] pb-12">
      {/* Google Forms Style Header Accent */}
      <div className="h-2.5 bg-[#7A1F2B] w-full sticky top-0 z-10" />

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={handleOpenProfile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#7A1F2B] hover:border-[#7A1F2B]/30 transition-colors"
            aria-label="Profile"
            title="Profile"
          >
            <UserRound size={16} />
          </button>
          <button
            onClick={handleLogout}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 hover:text-[#7A1F2B] hover:border-[#7A1F2B]/30 transition-colors"
            aria-label="Logout"
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>

        <div
          className={cn(
            "mb-4 rounded-xl border px-5 py-4 shadow-sm",
            isRegistrationClosed ? "border-red-200 bg-red-50" : "border-[#7A1F2B]/20 bg-white",
          )}
        >
          <p className={cn("text-sm font-semibold", isRegistrationClosed ? "text-red-700" : "text-[#7A1F2B]")}>
            Hitung Mundur Pendaftaran
          </p>
          <p className={cn("mt-1 text-xs", isRegistrationClosed ? "text-red-600" : "text-gray-600")}>
            Form ditutup pada {REGISTRATION_DEADLINE_TEXT}.
          </p>

          {isRegistrationClosed ? (
            <p className="mt-3 text-sm font-medium text-red-700">
              Waktu pendaftaran sudah berakhir. Formulir tidak dapat diisi.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: "Hari", value: countdown.days.toString() },
                { label: "Jam", value: formatCountdownUnit(countdown.hours) },
                { label: "Menit", value: formatCountdownUnit(countdown.minutes) },
                { label: "Detik", value: formatCountdownUnit(countdown.seconds) },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-[#7A1F2B]/15 bg-[#F8EFF1] px-2 py-3 text-center">
                  <p className="text-xl font-bold text-[#7A1F2B]">{item.value}</p>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{item.label}</p>
                </div>
              ))}
            </div>
          )}
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
                <div className="h-2 bg-[#7A1F2B]" />
                <div className="p-6 md:p-8">
                  <h1 className="text-3xl md:text-4xl font-bold text-[#202124] mb-4">
                    Ramadhan Careem Vol 4
                  </h1>
                  <p className="text-gray-600 leading-relaxed">
                    Silakan lengkapi data diri Anda untuk mendaftar pada acara Ramadhan Careem. Pastikan
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
                        <h3 className="text-base sm:text-xl font-bold">Buka Bersama & Berbagi Takjil</h3>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-red-500">* Wajib diisi</span>
                    {isAdmin ? (
                      <button
                        onClick={handleOpenAdmin}
                        className="text-xs text-gray-400 hover:text-[#7A1F2B] transition-colors flex items-center gap-1"
                      >
                        <Users size={14} />
                        Admin View
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Form Content */}
              {isRegistrationClosed ? (
                <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6 md:p-8">
                  <h3 className="text-lg font-semibold text-red-700">Pendaftaran sudah ditutup</h3>
                  <p className="mt-2 text-sm text-red-600">
                    Formulir tidak dapat diisi setelah {REGISTRATION_DEADLINE_TEXT}.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  {/* Name Field */}
                  <FormSection title="Data Pribadi" icon={<User className="text-[#7A1F2B]" size={20} />}>
                    <div className="space-y-6">
                      <InputField
                        label="Nama Lengkap"
                        required
                        error={errors.name?.message}
                        {...register("name")}
                        placeholder="Masukkan nama lengkap Anda"
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

                  <FormSection title="Jenis Kendaraan" icon={<Car className="text-[#7A1F2B]" size={20} />}>
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
                                  "border-[#7A1F2B] bg-gradient-to-br from-[#7A1F2B]/10 to-white ring-2 ring-[#7A1F2B]/20 shadow-sm",
                                !isSelected &&
                                  !isFull &&
                                  "border-gray-200 bg-white hover:border-[#7A1F2B]/40 hover:shadow-sm",
                                isFull && "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={cn("text-[#7A1F2B]", isFull && "text-gray-400")}>{option.icon}</span>
                                  <p className="font-semibold">{option.label}</p>
                                </div>
                                {isSelected ? (
                                  <span className="text-[11px] font-semibold text-[#7A1F2B] bg-[#7A1F2B]/10 px-2 py-1 rounded-full">
                                    Dipilih
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-2 text-xs text-gray-500">{option.description}</p>

                              {isLimitedOption && availability ? (
                                <p
                                  className={cn("mt-3 text-xs font-semibold", isFull ? "text-red-500" : "text-[#7A1F2B]")}
                                >
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

                  <FormSection title="Bukti Transfer" icon={<ReceiptText className="text-[#7A1F2B]" size={20} />}>
                    <div className="space-y-3">
                      <input type="hidden" {...register("transferProof")} />
                      <p className="text-sm text-gray-700 leading-relaxed">
                        Seabank
                        <br />
                        a.n Mukhammad Rangga Hari Febrianto
                        <br />
                        no rek 901167340597
                      </p>
                      <label className="block text-sm font-medium text-gray-700">
                        Upload screenshot bukti transfer <span className="text-red-500">*</span>
                      </label>
                      <input
                        ref={transferProofInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleTransferProofChange}
                        className={cn(
                          "w-full text-sm text-gray-600 file:mr-4 file:rounded-lg file:border-0 file:bg-[#7A1F2B] file:px-4 file:py-2 file:font-medium file:text-white hover:file:bg-[#651823]",
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
                      className="bg-[#7A1F2B] hover:bg-[#651823] disabled:bg-gray-400 text-white px-8 py-3 rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center gap-2 group"
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
              )}
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            >
              <div className="h-2 bg-[#7A1F2B]" />
              <div className="p-12 text-center">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-green-50 rounded-full mb-6">
                  <CheckCircle2 className="text-green-500" size={48} />
                </div>
                <h2 className="text-3xl font-bold text-[#202124] mb-4">Pendaftaran Berhasil!</h2>
                <p className="text-gray-600 mb-8 max-w-md mx-auto">
                  Pendaftaran berhasil dikirim. Silakan cek riwayat pendaftaran Anda di menu Profile.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setIsSubmitted(false);
                      handleOpenProfile();
                    }}
                    className="bg-[#7A1F2B] hover:bg-[#651823] text-white px-6 py-2.5 rounded-lg font-semibold transition-colors"
                  >
                    Cek Riwayat di Profile
                  </button>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="text-[#7A1F2B] font-semibold hover:underline"
                  >
                    Kirim tanggapan lain
                  </button>
                </div>
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
  headerRight,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        {headerRight}
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
          "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#7A1F2B]/20 focus:border-[#7A1F2B] outline-none transition-all",
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
