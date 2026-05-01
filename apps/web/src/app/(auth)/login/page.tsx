"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClient } from "@/lib/api-client";
import { loadPublicEnv } from "@/lib/env";
import { useAuth } from "@/providers/auth-provider";

const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    fullName: z.string(),
    role: z.enum(["OWNER", "CASHIER"]),
    tenantId: z.string().uuid()
  })
});

export default function LoginPage() {
  const router = useRouter();
  const { setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { NEXT_PUBLIC_API_URL } = loadPublicEnv();
      const client = new ApiClient({ baseUrl: NEXT_PUBLIC_API_URL, getToken: () => null });
      const result = await client.request("/auth/login", {
        method: "POST",
        body: { email, password },
        responseSchema: LoginResponseSchema
      });
      if (result) {
        setSession(result);
        if (result.user.role === "OWNER") {
          router.push("/admin/menu/categories" as never);
        } else {
          toast.error("Tài khoản này không có quyền vào trang quản trị");
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-background p-6 shadow-sm"
      >
        <h1 className="text-xl font-semibold">Đăng nhập</h1>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>
      </form>
    </main>
  );
}
