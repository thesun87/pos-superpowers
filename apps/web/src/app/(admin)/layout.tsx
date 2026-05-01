"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/menu/categories", label: "Danh mục" },
  { href: "/admin/menu/modifiers", label: "Tuỳ chọn" },
  { href: "/admin/menu/items", label: "Món" }
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, clear } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace("/login" as never);
    } else if (user.role !== "OWNER") {
      router.replace("/login" as never);
    }
  }, [user, router]);

  if (!user || user.role !== "OWNER") {
    return null;
  }

  return (
    <div className="min-h-screen bg-secondary/30">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <Link href={"/admin" as never} className="text-lg font-semibold">
          POS Admin
        </Link>
        <nav className="flex gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href as never}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm",
                pathname.startsWith(n.href)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-secondary"
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span>{user.fullName}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clear();
              router.push("/login" as never);
            }}
          >
            Đăng xuất
          </Button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
