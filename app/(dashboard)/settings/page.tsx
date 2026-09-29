"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../../../store/authStore";
import { usersApi } from "../../../lib/api/users.api";
import { authApi } from "../../../lib/api/auth.api";
import { uploadsApi } from "../../../lib/api/uploads.api";
import { toast } from "sonner";
import {
  User,
  Upload,
  Link as LinkIcon,
  Trash2,
  Shield,
  Laptop,
  CheckCircle2,
  Sparkles,
  Camera,
  Key,
  Flag,
  BellRing,
  ShieldCheck
} from "lucide-react";
import { KeySetupWizard } from "../chat/components/KeySetupWizard";
import { LeaveStatus } from "@/components/shared/LeaveStatus";
import { ReportsSection } from "@/components/shared/ReportsSection";
import { NotificationsSection } from "@/components/shared/NotificationsSection";
import { PrivacySection } from "@/components/shared/PrivacySection";
import { prepareCurrentPassword, prepareNewPassword, finishSignIn } from "../../../lib/auth/credentials";
import { resealBundleForNewPassword, WrongPasswordError } from "../../../lib/crypto/keyBundle";
import { passwordPolicyError } from "../../../lib/crypto/passwordKeys";

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const [activeSection, setActiveSection] = useState<"profile" | "security" | "sessions" | "encryption" | "reports" | "notifications" | "privacy">("profile");
  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? "",
    department: user?.department ?? "",
    designation: user?.designation ?? "",
    avatarUrl: user?.avatarUrl ?? ""
  });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [msg, setMsg] = useState({ text: "", type: "" });

  // Deep link: /settings?section=security (used for forced password changes)
  useEffect(() => {
    const section = new URLSearchParams(window.location.search).get("section");
    if (section === "security" || section === "sessions" || section === "encryption" || section === "profile" || section === "reports" || section === "notifications" || section === "privacy") {
      setActiveSection(section);
    }
  }, []);

  useEffect(() => {
    if (user?.mustChangePassword) setActiveSection("security");
  }, [user?.mustChangePassword]);

  const passwordMutation = useMutation({
    mutationFn: async () => {
      // Passwords never leave the browser: derive keys for the old and new one,
      // and re-encrypt the chat key bundle for the new password in the same request.
      const current = await prepareCurrentPassword(pwForm.currentPassword);
      const next = await prepareNewPassword(pwForm.newPassword);
      let keyBundle: { ciphertext: string; iv: string } | undefined;
      if (!current.legacy) {
        try {
          keyBundle = await resealBundleForNewPassword(current.wrapKey, next.wrapKey);
        } catch (err) {
          if (err instanceof WrongPasswordError) throw new Error("Current password is incorrect");
          throw err;
        }
      }
      const res = await authApi.changePassword({
        ...(current.legacy ? { currentPassword: current.password } : { currentAuthKey: current.authKey }),
        newAuthKey: next.authKey,
        newKdfSalt: next.kdfSalt,
        ...(keyBundle ? { keyBundle } : {})
      });
      return { res, wrapKey: next.wrapKey };
    },
    onSuccess: async ({ res, wrapKey }) => {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      const updated = res.data?.data?.user;
      if (updated) {
        setUser(updated);
        // Cache the new wrapKey here; creates chat keys if this is the first real password
        await finishSignIn(updated._id, wrapKey);
      }
      toast.success("Password changed. Other devices have been signed out.");
    },
    onError: (err: any) => {
      const details = err?.response?.data?.errors;
      const detail = Array.isArray(details) && details[0]?.message;
      toast.error(detail || err?.response?.data?.message || err?.message || "Could not change password.");
    }
  });

  const handleChangePassword = () => {
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      toast.error("Enter your current and new password.");
      return;
    }
    const policyError = passwordPolicyError(pwForm.newPassword);
    if (policyError) {
      toast.error(policyError);
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }
    passwordMutation.mutate();
  };

  const profileMutation = useMutation({
    mutationFn: () =>
      usersApi.updateProfile(
        user?.role === "customer" ? { name: profileForm.name, avatarUrl: profileForm.avatarUrl } : profileForm
      ),
    onSuccess: (r) => {
      setUser(r.data.data);
      toast.success("Profile updated successfully!");
      setMsg({ text: "Profile updated successfully!", type: "success" });
    },
    onError: (err: any) => {
      const errorMsg = err?.response?.data?.message || "Failed to update profile.";
      toast.error(errorMsg);
      setMsg({ text: errorMsg, type: "error" });
    }
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size (under 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setIsUploadingAvatar(true);
    try {
      const res = await uploadsApi.uploadAvatar(formData);
      const newAvatarUrl = res.data.data.avatarUrl;
      const updatedUser = res.data.data.user;

      setProfileForm((f) => ({ ...f, avatarUrl: newAvatarUrl }));
      if (updatedUser) {
        setUser(updatedUser);
      } else if (user) {
        setUser({ ...user, avatarUrl: newAvatarUrl });
      }

      toast.success("Profile picture uploaded successfully!");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to upload image. Please try again.");
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAvatar = async () => {
    setProfileForm((f) => ({ ...f, avatarUrl: "" }));
    try {
      const res = await usersApi.updateProfile({ ...profileForm, avatarUrl: "" });
      setUser(res.data.data);
      toast.success("Profile picture removed");
    } catch {
      toast.error("Failed to remove profile picture");
    }
  };

  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: () => authApi.getSessions().then((r) => r.data.data),
    enabled: activeSection === "sessions"
  });

  const revokeSessionMutation = useMutation({
    mutationFn: (sessionId: string) => authApi.revokeSession(sessionId),
    onSuccess: () => {
      toast.success("Device signed out");
      refetchSessions();
    },
    onError: () => toast.error("Couldn't sign out that device")
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => authApi.revokeOtherSessions(),
    onSuccess: (r) => {
      const n = r.data?.data?.signedOut ?? 0;
      toast.success(n === 1 ? "1 other device signed out" : `${n} other devices signed out`);
      refetchSessions();
    },
    onError: () => toast.error("Couldn't sign out other devices")
  });

  const sections = [
    { id: "profile", label: "Profile & Avatar", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "sessions", label: "Devices", icon: Laptop },
    { id: "encryption", label: "Chat Encryption", icon: Key },
    ...(user && user.role !== "marketing" ? [{ id: "reports", label: "Reports", icon: Flag }] : []),
    { id: "notifications", label: "Notifications", icon: BellRing },
    { id: "privacy", label: "Privacy & data", icon: ShieldCheck }
  ];

  return (
    <div className="max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Settings</h1>
        <p className="text-slate-400 text-xs mt-1">Manage your profile, security, signed-in devices and chat encryption</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Sidebar nav */}
        <div className="sm:w-52 flex sm:flex-col gap-1 shrink-0">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                id={`settings-tab-${s.id}`}
                onClick={() => {
                  setActiveSection(s.id as typeof activeSection);
                  setMsg({ text: "", type: "" });
                }}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-medium text-left transition-all ${
                  isActive
                    ? "bg-violet-600/20 border border-violet-500/40 text-violet-300 font-semibold shadow-sm shadow-violet-500/10"
                    : "text-slate-400 hover:text-white hover:bg-slate-900 border border-transparent"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-violet-400" : "text-slate-400"}`} />
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Content Box */}
        <div className="flex-1 bg-slate-900/80 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/20">
          {msg.text && (
            <div
              className={`mb-5 p-3 rounded-xl text-xs flex items-center gap-2 ${
                msg.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border border-rose-500/30 text-rose-400"
              }`}
            >
              {msg.type === "success" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
              <span>{msg.text}</span>
            </div>
          )}

          {activeSection === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-white">Profile Photo & Avatar</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Upload a photo directly or provide an image link. This will be displayed in the top navbar and across your team tasks.
                </p>
              </div>

              {/* Avatar Manager Card */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center gap-5">
                {/* Visual Avatar */}
                <div className="relative group">
                  {profileForm.avatarUrl ? (
                    <img
                      src={profileForm.avatarUrl}
                      alt={user?.name || "Avatar Preview"}
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-violet-500/40 ring-4 ring-violet-500/10 shadow-lg shadow-violet-500/10"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 border-2 border-violet-500/30 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-violet-500/20">
                      {user?.name?.[0]?.toUpperCase() || "U"}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-medium gap-1"
                  >
                    <Camera className="h-4 w-4" />
                    Change
                  </button>
                </div>

                {/* Actions & URL Input */}
                <div className="flex-1 space-y-3 w-full">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml"
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white font-medium text-xs transition flex items-center gap-1.5 shadow-sm shadow-violet-500/20"
                    >
                      {isUploadingAvatar ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-3.5 w-3.5" />
                          Upload Picture
                        </>
                      )}
                    </button>

                    {profileForm.avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        className="px-3 py-2 rounded-xl border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 text-xs font-medium transition flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Image URL alternative */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
                      <LinkIcon className="h-3 w-3 text-blue-400" />
                      Or provide an Image URL:
                    </label>
                    <input
                      type="url"
                      placeholder="https://example.com/avatar.jpg"
                      value={profileForm.avatarUrl}
                      onChange={(e) => setProfileForm((f) => ({ ...f, avatarUrl: e.target.value }))}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                </div>
              </div>

              {/* Personal Details */}
              <div className="border-t border-slate-800/80 pt-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-200">Personal Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Full Name</label>
                    <input
                      id="settings-name"
                      value={profileForm.name}
                      onChange={(e) => setProfileForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Your full name"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Email Address</label>
                    <input
                      disabled
                      value={user?.email || ""}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-slate-500 text-xs font-medium cursor-not-allowed"
                    />
                  </div>

                  {user?.role === "customer" ? (
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Mobile Number</label>
                    <input
                      disabled
                      value={user?.phone ? `${user.phone.replace(/^\+91/, "+91 ")}${user.phoneVerified ? " (verified)" : ""}` : "Not added"}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/40 border border-slate-800 text-slate-500 text-xs font-medium cursor-not-allowed"
                    />
                  </div>
                  ) : (
                  <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Department</label>
                    <input
                      id="settings-department"
                      value={profileForm.department}
                      onChange={(e) => setProfileForm((f) => ({ ...f, department: e.target.value }))}
                      placeholder="e.g. Engineering"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Designation</label>
                    <input
                      id="settings-designation"
                      value={profileForm.designation}
                      onChange={(e) => setProfileForm((f) => ({ ...f, designation: e.target.value }))}
                      placeholder="e.g. Senior Software Engineer"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs font-medium"
                    />
                  </div>
                  </>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    id="save-profile"
                    onClick={() => profileMutation.mutate()}
                    disabled={profileMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white font-semibold text-xs transition shadow-md shadow-violet-500/20 disabled:opacity-60 flex items-center gap-2"
                  >
                    {profileMutation.isPending ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>

              {user && ["superadmin", "admin", "user"].includes(user.role) && <LeaveStatus />}
            </div>
          )}

          {activeSection === "security" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-white">Security Settings</h2>
              {user?.mustChangePassword && (
                <div role="alert" className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs">
                  For your security, set a new password before using the rest of the app. Then turn on two-factor authentication.
                </div>
              )}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-slate-200 font-medium text-xs">Two-Factor Authentication (2FA)</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">Protect your account using TOTP Authenticator</p>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-1 rounded-full ${
                      user?.isTwoFactorEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {user?.isTwoFactorEnabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
              </div>

              <div className="border-t border-slate-800/80 pt-4">
                <h3 className="text-slate-300 font-medium text-xs mb-3">Change Password</h3>
                <div className="space-y-3">
                  {[
                    { field: "currentPassword", label: "Current Password" },
                    { field: "newPassword", label: "New Password" },
                    { field: "confirmPassword", label: "Confirm New Password" }
                  ].map(({ field, label }) => (
                    <div key={field}>
                      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
                      <input
                        id={`settings-${field}`}
                        type="password"
                        autoComplete={field === "currentPassword" ? "current-password" : "new-password"}
                        value={pwForm[field as keyof typeof pwForm]}
                        onChange={(e) => setPwForm((f) => ({ ...f, [field]: e.target.value }))}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-white focus:outline-none focus:ring-2 focus:ring-violet-500 transition text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  id="change-password"
                  className="mt-4 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs transition disabled:opacity-60"
                  onClick={handleChangePassword}
                  disabled={passwordMutation.isPending}
                >
                  {passwordMutation.isPending ? "Updating..." : "Update Password"}
                </button>
              </div>
            </div>
          )}

          {activeSection === "sessions" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">Devices</h2>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Devices signed in to your account. Signing a device out ends its session immediately and removes its
                    copy of your chat keys the next time it's used.
                  </p>
                </div>
                {sessions && sessions.length > 1 && (
                  <button
                    onClick={() => revokeOthersMutation.mutate()}
                    disabled={revokeOthersMutation.isPending}
                    className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition disabled:opacity-60"
                  >
                    Sign out all other devices
                  </button>
                )}
              </div>

              {!sessions || sessions.length === 0 ? (
                <p className="text-slate-500 text-xs py-4 text-center">No signed-in devices found.</p>
              ) : (
                <ul className="space-y-2.5">
                  {sessions.map(
                    (d: {
                      sessionId: string;
                      deviceName: string;
                      ipAddress: string;
                      lastActive: string;
                      createdAt: string;
                      trusted: boolean;
                      current: boolean;
                    }) => (
                      <li
                        key={d.sessionId}
                        className="flex items-start justify-between gap-3 p-3.5 rounded-xl border border-slate-800 bg-slate-950/50"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <Laptop className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-slate-200 text-xs font-medium flex flex-wrap items-center gap-2">
                              {d.deviceName}
                              {d.current && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold">
                                  This device
                                </span>
                              )}
                              {!d.trusted && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  Not remembered
                                </span>
                              )}
                            </p>
                            <p className="text-slate-500 text-[11px] mt-0.5">IP {d.ipAddress}</p>
                            <p className="text-slate-600 text-[10px] mt-0.5">
                              Signed in {new Date(d.createdAt).toLocaleDateString()} · Last active{" "}
                              {new Date(d.lastActive).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {!d.current && (
                          <button
                            onClick={() => revokeSessionMutation.mutate(d.sessionId)}
                            disabled={revokeSessionMutation.isPending}
                            className="text-xs text-rose-400 hover:text-rose-300 transition shrink-0"
                          >
                            Sign out
                          </button>
                        )}
                      </li>
                    )
                  )}
                </ul>
              )}
            </div>
          )}

          {activeSection === "reports" && <ReportsSection />}
          {activeSection === "notifications" && <NotificationsSection />}
          {activeSection === "privacy" && <PrivacySection />}

          {activeSection === "encryption" && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-white">End-to-End Chat Encryption</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  Messages are encrypted in your browser. Your keys sync to every device you sign in on, protected by your password.
                </p>
              </div>

              <div className="pt-2">
                <KeySetupWizard />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
