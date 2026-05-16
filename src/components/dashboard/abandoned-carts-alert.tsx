import { ShoppingCart, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

interface AbandonedCartsAlertProps {
  count: number;
  value: number;
}

export function AbandonedCartsAlert({ count, value }: AbandonedCartsAlertProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <ShoppingCart className="w-4 h-4 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="text-sm font-semibold">Carrinhos Abandonados</h3>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <span className="text-3xl font-bold">{count}</span>
          <span className="text-xs text-muted-foreground">carrinhos abertos</span>
        </div>

        <div className="bg-muted/50 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-muted-foreground">Valor em risco:</span>
            <span className="font-semibold text-foreground">{formatCurrency(value)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Ações recomendadas:</p>
          <ul className="space-y-1.5">
            {[
              "Enviar email de recuperação",
              "WhatsApp personalizado via PS",
              "Oferecer desconto exclusivo",
            ].map((action) => (
              <li key={action} className="text-xs text-muted-foreground flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                {action}
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/customers?hasAbandonedCart=true"
          className="block text-center text-xs text-primary hover:underline mt-2"
        >
          Ver clientes com carrinho abandonado →
        </Link>
      </div>
    </div>
  );
}
