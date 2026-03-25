"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/lib/api-client";
import { LogOut } from "lucide-react";
import { useRequireAuth } from "@/hooks/useAuth";

export default function ProfilePage() {
  const { isReady } = useRequireAuth();
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();

  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState((user as any)?.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setPhone((user as any).phone ?? "");
      setAvatarUrl(user.avatarUrl ?? "");
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    try {
      const { data } = await apiClient.patch("/users/me", {
        name: name.trim(),
        phone: phone.trim() || null,
        avatarUrl: avatarUrl.trim() || null,
      });

      if (data.data) {
        updateUser(data.data);
      }
      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update profile",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push("/login");
    } catch {
      setIsLoggingOut(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Profile</h1>

      <form onSubmit={handleSubmit} className="max-w-lg overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-gray-200">
        <div className="space-y-6 p-8">
          {/* Email (read-only) */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-700 shadow-sm">
              {user?.email}
            </p>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              required
              minLength={2}
              maxLength={100}
            />
          </div>

          {/* Phone */}
          <div>
            <label htmlFor="phone" className="mb-1 block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm shadow-sm transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Avatar Upload */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Avatar Image
            </label>
            <div className="flex items-center gap-4">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="Avatar" className="h-16 w-16 rounded-full object-cover shadow-sm bg-gray-100 ring-1 ring-gray-200" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 ring-1 ring-gray-200">
                  <span className="text-xs text-gray-400">None</span>
                </div>
              )}
              <div className="flex-1">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setIsSaving(true);
                    try {
                      const formData = new FormData();
                      formData.append("logo", file);
                      const res = await apiClient.post("/users/upload-logo", formData, {
                        headers: { "Content-Type": "multipart/form-data" }
                      });
                      if (res.data?.data?.url) {
                        setAvatarUrl(res.data.data.url);
                        setMessage({ type: "success", text: "Avatar uploaded! Click Save Changes to apply." });
                      }
                    } catch (err) {
                      setMessage({ type: "error", text: "Failed to upload avatar" });
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  className="w-full text-sm text-gray-500 file:mr-4 file:cursor-pointer file:rounded-xl file:border-0 file:bg-primary-50 file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-primary-700 hover:file:bg-primary-100 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Role (read-only) */}
          <div className="flex gap-6 rounded-xl bg-gray-50 p-4 ring-1 ring-inset ring-gray-100">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold tracking-wider text-gray-500 uppercase">System Role</label>
              <p className="text-sm font-semibold capitalize text-gray-900">{user?.role.toLowerCase().replace("_", " ")}</p>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold tracking-wider text-gray-500 uppercase">Custom Role</label>
              <p className="text-sm font-semibold capitalize text-gray-900">
                {user?.customRole ? user.customRole.name : <span className="text-gray-400 font-normal">None</span>}
              </p>
            </div>
          </div>

          {/* Feedback message */}
          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-medium ${message.type === "success"
                ? "bg-green-50 text-green-700 ring-1 ring-green-600/20"
                : "bg-red-50 text-red-700 ring-1 ring-red-600/20"
                }`}
            >
              {message.text}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-gray-100 pt-6">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 active:scale-95 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
            
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-primary-600 px-8 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary-700 hover:shadow-md active:scale-95 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

