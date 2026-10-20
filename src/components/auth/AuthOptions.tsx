import Link from "next/link";
import { cn } from "@/lib/utils";

export function AuthOptions({ active }: { active: "sign-in" | "sign-up" }) {
  return (
    <nav aria-label="Account options" className="mb-5 grid grid-cols-2 rounded-xl border border-border bg-muted/50 p-1">
      <Link
        href="/login"
        aria-current={active === "sign-in" ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
          active === "sign-in" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Sign in
      </Link>
      <Link
        href="/register"
        aria-current={active === "sign-up" ? "page" : undefined}
        className={cn(
          "rounded-lg px-3 py-2 text-center text-sm font-medium transition-colors",
          active === "sign-up" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Sign up
      </Link>
    </nav>
  );
}
