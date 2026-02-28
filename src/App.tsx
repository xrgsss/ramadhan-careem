import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "motion/react";
import { 
  ClipboardCheck, 
  Send, 
  CheckCircle2, 
  Users, 
  ArrowLeft,
  Loader2,
  Mail,
  User,
  Phone,
  Building2,
  Briefcase,
  Heart
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

export default function App() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const heroVideoSrc = "/hero/hero-ramadhan.mp4";

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

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
      const response = await fetch("/api/submissions");
      const data = await response.json();
      setSubmissions(data);
    } catch (error) {
      console.error("Error fetching submissions:", error);
    }
  };

  useEffect(() => {
    if (showAdmin) {
      fetchSubmissions();
    }
  }, [showAdmin]);

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
            <h1 className="text-2xl font-bold text-[#202124]">Data Registrasi</h1>
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
                      <td colSpan={5} className="p-8 text-center text-gray-400 italic">Belum ada data masuk</td>
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
                            year: "numeric"
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
                  <h1 className="text-3xl md:text-4xl font-bold text-[#202124] mb-4">Marhaban ya Ramadhan Careem</h1>
                  <p className="text-gray-600 leading-relaxed">
                    Silakan lengkapi data diri Anda untuk mendaftar pada acara Ramadhan mendatang. 
                    Pastikan informasi yang Anda berikan sudah benar.
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
                      <source 
                        src={heroVideoSrc}
                        type="video/mp4" 
                      />
                      Your browser does not support the video tag.
                    </video>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-6">
                      <div className="text-white">
                        <p className="text-sm font-medium uppercase tracking-wider opacity-80 mb-1">Ramadhan Special Event</p>
                        <h3 className="text-xl font-bold">Buka Bersama & Berbagi 2026</h3>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-sm text-red-500">* Wajib diisi</span>
                    <button 
                      onClick={() => setShowAdmin(true)}
                      className="text-xs text-gray-400 hover:text-[#673AB7] transition-colors flex items-center gap-1"
                    >
                      <Users size={14} />
                      Admin View
                    </button>
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
                <FormSection title="Informasi Profesional" icon={<Building2 className="text-[#673AB7]" size={20} />}>
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
                        errors.interest && "border-red-500 focus:ring-red-500/20 focus:border-red-500"
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
                  Terima kasih telah mendaftar. Kami telah menerima data Anda dan akan segera menghubungi melalui email untuk informasi selanjutnya.
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
function FormSection({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100 flex items-center gap-3">
        {icon}
        <h3 className="font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-6 md:p-8">
        {children}
      </div>
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
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
});

InputField.displayName = "InputField";
