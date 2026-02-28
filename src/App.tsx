import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  Users,
  ArrowLeft,
  LogOut,
  Loader2,
  Send,
  User,
  Building2,
  Heart,
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
  phone: z.string().min(10, "Nomor telepon minimal 10 digit").optional().or(z.literal("")),
  organization: z.string().min(2, "Nama organisasi minimal 2 karakter").optional().or(z.literal("")),
  role: z.string().min(2, "Jabatan minimal 2 karakter").optional().or(z.literal("")),
  interest: z.string().min(5, "Tolong jelaskan minat Anda minimal 5 karakter").optional().or(z.literal("")),
});

type FormData = z.infer<typeof formSchema>;

interface Submission {
  id: number;
  name: string;
  email: string;
  phone: string;
  organization: string;
  role: string;
  interest: string;
  created_at: string;
}

type AuthMode = "login" | "signup";
const ADMIN_EMAIL = "ramadhancareem@gmail.com";

function mapAuthErrorMessage(message: string, mode: AuthMode) {
  const normalized = message.toLowerCase();

  if (mode === "login" && normalized.includes("invalid login credentials")) {
    return "masukan email/password yang benar";
  }

  return message;
}

export default function App() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const heroVideoSrc = "/hero/hero-ramadhan.mp4";
  const isAdmin = (session?.user?.email ?? "").toLowerCase() === ADMIN_EMAIL;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

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
    setIsSubmitted(false);
    setSubmissions([]);
    setSession(null);
    await supabase.auth.signOut({ scope: "local" });
  };

  const handleLogout = async () => {
    setShowAdmin(false);
    setIsSubmitted(false);
    setSubmissions([]);
    setAuthError("");
    setAuthMessage("");
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

      if (response.ok) {
        setIsSubmitted(true);
        reset();
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

  useEffect(() => {
    if (showAdmin && session) {
      fetchSubmissions();
    }
  }, [showAdmin, session]);

  const handleOpenAdmin = () => {
    if (!isAdmin) {
      return;
    }

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
                    <th className="p-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tanggal</th>
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
                        <td className="p-4 text-sm text-gray-600">{sub.email}</td>
                        <td className="p-4 text-sm text-gray-600">{sub.organization || "-"}</td>
                        <td className="p-4 text-sm text-gray-600">{sub.role || "-"}</td>
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

  return (
    <div className="min-h-screen bg-[#F0EBF8] pb-12">
      {/* Google Forms Style Header Accent */}
      <div className="h-2.5 bg-[#673AB7] w-full sticky top-0 z-10" />

      <div className="max-w-3xl mx-auto px-4 pt-8">
        <div className="flex justify-end mb-4">
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
                      label="Nomor Telepon"
                      error={errors.phone?.message}
                      {...register("phone")}
                      placeholder="0812xxxxxx"
                    />
                  </div>
                </FormSection>

                {/* Professional Data */}
                <FormSection
                  title="Informasi Profesional"
                  icon={<Building2 className="text-[#673AB7]" size={20} />}
                >
                  <div className="space-y-6">
                    <InputField
                      label="Nama Organisasi / Perusahaan"
                      error={errors.organization?.message}
                      {...register("organization")}
                      placeholder="PT. Contoh Indonesia"
                    />
                    <InputField
                      label="Jabatan / Posisi"
                      error={errors.role?.message}
                      {...register("role")}
                      placeholder="Software Engineer"
                    />
                  </div>
                </FormSection>

                {/* Additional Info */}
                <FormSection title="Informasi Tambahan" icon={<Heart className="text-[#673AB7]" size={20} />}>
                  <div className="space-y-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Apa yang membuat Anda tertarik mengikuti event ini?
                    </label>
                    <textarea
                      {...register("interest")}
                      className={cn(
                        "w-full p-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#673AB7]/20 focus:border-[#673AB7] outline-none transition-all min-h-[120px] resize-none",
                        errors.interest && "border-red-500 focus:ring-red-500/20 focus:border-red-500",
                      )}
                      placeholder="Ceritakan sedikit motivasi Anda..."
                    />
                    {errors.interest && <p className="text-xs text-red-500 mt-1">{errors.interest.message}</p>}
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
