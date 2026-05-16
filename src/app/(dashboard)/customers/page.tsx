import { Header } from "@/components/layout/header";
import { CustomerList } from "@/components/customers/customer-list";
import { Button } from "@/components/ui/button";
import { UserPlus, RefreshCw } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Clientes"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/settings/integrations">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Sincronizar
              </Link>
            </Button>
          </div>
        }
      />
      <div className="flex-1 p-6">
        <CustomerList />
      </div>
    </div>
  );
}
