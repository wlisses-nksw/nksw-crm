"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Kanban,
  CheckSquare,
  Settings,
  LogOut,
  ShoppingBag,
  ShoppingCart,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Clientes", icon: Users },
  { href: "/carrinhos", label: "Carrinhos", icon: ShoppingCart, badge: true },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/tasks", label: "Tarefas", icon: CheckSquare },
  { href: "/email-campanhas", label: "Email", icon: Mail },
];

const BOTTOM_NAV = [
  { href: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    fetch("/api/abandoned-carts")
      .then(r => r.json())
      .then(({ total }) => setCartCount(total ?? 0))
      .catch(() => {});
  }, [pathname]);

  return (
    <aside className="flex flex-col w-[220px] min-w-[220px] min-h-screen bg-white border-r border-border z-10">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <ShoppingBag className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="font-serif text-sm font-bold text-foreground leading-tight block">
              Naked SW
            </span>
            <span className="text-[10px] text-muted-foreground tracking-widest uppercase">
              CRM
            </span>
          </div>
        </div>
      </div>

      {/* Nav principal */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-none">
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold text-muted-foreground tracking-widest uppercase">
          Menu
        </p>
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname.startsWith(href);
          const count = badge ? cartCount : 0;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all border-l-[3px]",
                active
                  ? "bg-accent text-primary border-l-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border-l-transparent"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {count > 0 && (
                <span className="bg-orange-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-2 border-t border-border pt-2 space-y-0.5">
        {BOTTOM_NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all border-l-[3px]",
                active
                  ? "bg-accent text-primary border-l-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50 border-l-transparent"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* Usuário */}
        <div className="flex items-center gap-2.5 px-3 py-2 mt-1">
          <div className="w-7 h-7 rounded-full bg-accent border border-border flex items-center justify-center shrink-0">
            <span className="text-primary text-xs font-bold">
              {session?.user?.name?.charAt(0)?.toUpperCase() ?? "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-foreground text-xs font-semibold truncate">
              {session?.user?.name ?? "Usuário"}
            </p>
            <p className="text-muted-foreground text-[10px] truncate capitalize">
              {session?.user?.role?.toLowerCase().replace("_", " ") ?? ""}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Sair"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
