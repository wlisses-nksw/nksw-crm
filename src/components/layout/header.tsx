"use client";

import { useState } from "react";
import { Search, Bell } from "lucide-react";
import { GlobalSearch } from "@/components/shared/global-search";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title?: string;
  actions?: React.ReactNode;
}

export function Header({ title, actions }: HeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="h-14 border-b border-border bg-background px-6 flex items-center gap-4 shrink-0">
        {title && (
          <h1 className="text-base font-semibold text-foreground">{title}</h1>
        )}

        <div className="flex-1" />

        {/* Busca */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground bg-muted hover:bg-muted/80 px-3 py-1.5 rounded-md transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar cliente...</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border bg-background px-1.5 text-[10px] font-medium text-muted-foreground ml-1">
            ⌘K
          </kbd>
        </button>

        {actions}

        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-4 h-4" />
        </Button>
      </header>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
