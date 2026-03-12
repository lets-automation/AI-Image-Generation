"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth.store";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff, Sparkles, Check, X } from "lucide-react";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ characters", pass: password.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(password) },
    { label: "Lowercase letter", pass: /[a-z]/.test(password) },
    { label: "Number", pass: /\d/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;

  if (!password) return null;

  return (
    <div className="space-y-2 pt-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= passed
                ? passed <= 1 ? "bg-red-500"
                : passed <= 2 ? "bg-orange-500"
                : passed <= 3 ? "bg-yellow-500"
                : "bg-green-500"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {checks.map((c) => (
          <span key={c.label} className={`flex items-center gap-1 text-xs ${c.pass ? "text-green-600" : "text-muted-foreground"}`}>
            {c.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading } = useAuthStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      toast.error("Password needs uppercase, lowercase, and a number");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (phone && !/^\+?\d{7,15}$/.test(phone.replace(/\s/g, ""))) {
      toast.error("Enter a valid phone number (7-15 digits)");
      return;
    }

    try {
      await register({
        email,
        password,
        name,
        phone: phone || undefined,
      });
      toast.success("Account created!");
      router.push("/events");
    } catch {
      toast.error("Registration failed. Email may already be in use.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile-only logo */}
      <div className="flex items-center gap-2 lg:hidden">
        <Sparkles className="h-5 w-5" />
        <span className="text-lg font-semibold">EP Product</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start generating festival creatives in minutes
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <Input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9876543210"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
          />
          {confirmPassword && password !== confirmPassword && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
