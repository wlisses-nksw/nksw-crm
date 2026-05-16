import { Header } from "@/components/layout/header";
import { CustomerList } from "@/components/customers/customer-list";
import { RFMPanel } from "@/components/customers/rfm-panel";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

async function getClientesData() {
  try {
    const res = await fetch("https://nksw-api.vercel.app/data/clientes.json", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.clientes ?? null;
  } catch {
    return null;
  }
}

export default async function CustomersPage() {
  const clientes = await getClientesData();

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title="Clientes"
        subtitle="Base completa + análise RFM"
        actions={
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Sincronizar
          </Button>
        }
      />
      <div className="flex-1 p-6 space-y-6">
        {clientes && <RFMPanel data={clientes} />}
        <CustomerList />
      </div>
    </div>
  );
}
