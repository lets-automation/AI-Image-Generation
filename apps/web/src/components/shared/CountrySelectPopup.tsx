"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth.store";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";

const COUNTRIES = [
  { code: "IN", name: "India" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
  { code: "CN", name: "China" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "TR", name: "Turkey" },
  { code: "RU", name: "Russia" },
  { code: "ZA", name: "South Africa" },
  { code: "NG", name: "Nigeria" },
  { code: "EG", name: "Egypt" },
  { code: "KE", name: "Kenya" },
  { code: "PH", name: "Philippines" },
  { code: "ID", name: "Indonesia" },
  { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "NZ", name: "New Zealand" },
  { code: "PK", name: "Pakistan" },
  { code: "BD", name: "Bangladesh" },
  { code: "LK", name: "Sri Lanka" },
  { code: "NP", name: "Nepal" },
  { code: "AR", name: "Argentina" },
  { code: "CL", name: "Chile" },
  { code: "CO", name: "Colombia" },
];

/**
 * Shows a blocking popup when the logged-in user has no country set.
 * After selection, patches the user profile and updates the auth store.
 */
export function CountrySelectPopup() {
  const { user, isAuthenticated, updateUser } = useAuthStore();
  const [selectedCountry, setSelectedCountry] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Only show if authenticated and country is null
  if (!isAuthenticated || !user || user.country) return null;

  async function handleSave() {
    if (!selectedCountry) {
      toast.error("Please select your country");
      return;
    }
    setIsSaving(true);
    try {
      const normalizedCountry = selectedCountry.toUpperCase();
      const response = await apiClient.patch<{ data: { country: string | null } }>("/users/me", {
        country: normalizedCountry,
      });
      const savedCountry = response.data?.data?.country ?? normalizedCountry;
      const meResponse = await apiClient.get<{ data: { country: string | null } }>("/auth/me");
      const persistedCountry = meResponse.data?.data?.country ?? savedCountry;
      if (!persistedCountry) {
        toast.error("Country update was not persisted. Please try again.");
        return;
      }
      updateUser({ country: persistedCountry });
      toast.success("Country saved!");
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || "Failed to save country. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border bg-white p-6 shadow-xl dark:bg-gray-900">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Select Your Country</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This helps us show you relevant content and festivals from your region.
          </p>
        </div>

        <Select value={selectedCountry} onValueChange={setSelectedCountry}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose your country..." />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          className="mt-4 w-full"
          onClick={handleSave}
          disabled={!selectedCountry || isSaving}
        >
          {isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}
