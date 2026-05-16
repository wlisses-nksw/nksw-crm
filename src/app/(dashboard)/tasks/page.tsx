import { Header } from "@/components/layout/header";
import { TasksView } from "@/components/tasks/tasks-view";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Tarefas"
        actions={
          <Button size="sm">
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Nova Tarefa
          </Button>
        }
      />
      <div className="flex-1 p-6">
        <TasksView />
      </div>
    </div>
  );
}
