"use client";

import { useState } from "react";
import { Search, Bell } from "lucide-react";
import { GlobalSearch } from "@/components/shared/global-search";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="min-h-14 border-b border-border bg-white px-6 flex items-center gap-4 shrink-0 flex-wrap py-2">
        {title && (
          <div className="flex-1 min-w-0">
            <h1 className="font-serif text-[18px] font-bold text-foreground leading-tight">{title}</h1>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        )}

        {!title && <div className="flex-1" />}

        {/* Busca */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-lg transition-colors border border-border"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar cliente...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-white px-1.5 text-[10px] font-medium text-muted-foreground ml-1">
            ⌘K
          </kbd>
        </button>

        {actions}

        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="w-4 h-4" />
        </Button>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
