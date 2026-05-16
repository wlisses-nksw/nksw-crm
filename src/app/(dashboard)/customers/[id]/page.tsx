import { notFound } from "next/navigation";
import { getCustomerProfile } from "@/services/customer.service";
import { CustomerProfile } from "@/components/customers/customer-profile";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerPage({ params }: Props) {
  const { id } = await params;
  const customer = await getCustomerProfile(id);

  if (!customer) notFound();

  return (
    <div className="flex flex-col min-h-full">
      <Header
        title={`${customer.firstName} ${customer.lastName}`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/customers">
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Voltar
            </Link>
          </Button>
        }
      />
      <div className="flex-1 p-6">
        <CustomerProfile customer={customer} />
      </div>
    </div>
  );
}
