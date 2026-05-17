"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { TasksView } from "@/components/tasks/tasks-view";
import { PersonalShopperView } from "@/components/tasks/personal-shopper-view";
import { Button } from "@/components/ui/button";
import { Plus, Sparkles, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

export default function TasksPage() {
  const [tab, setTab] = useState<"tasks" | "ps">("ps");

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Tarefas"
        actions={
          tab === "tasks" ? (
            <Button size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Nova Tarefa
            </Button>
          ) : null
        }
      />
      <div className="flex-1 p-6 space-y-5">
        {/* Abas */}
        <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          <TabBtn active={tab === "ps"} onClick={() => setTab("ps")} icon={<Sparkles className="w-3.5 h-3.5" />}>
            Personal Shopper IA
          </TabBtn>
          <TabBtn active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<ListTodo className="w-3.5 h-3.5" />}>
            Tarefas
          </TabBtn>
        </div>

        {tab === "ps" ? <PersonalShopperView /> : <TasksView />}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
        active
          ? "bg-white shadow-sm text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {children}
    </button>
  );
}
