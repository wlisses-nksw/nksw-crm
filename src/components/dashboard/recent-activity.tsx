import Link from "next/link";
import { formatRelative, formatCurrency } from "@/lib/utils";
import { ScoreBadge } from "@/components/shared/score-badge";
import type { CustomerSegment } from "@prisma/client";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  segment: CustomerSegment;
  totalSpent: unknown;
  createdAt: Date;
}

export function RecentActivity({ customers }: { customers: Customer[] }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold mb-4">Clientes Recentes</h3>
      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente ainda.</p>
      ) : (
        <ul className="space-y-3">
          {customers.map((c) => (
            <li key={c.id}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center gap-3 hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-primary text-xs font-semibold">
                    {c.firstName.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {c.firstName} {c.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <ScoreBadge segment={c.segment} />
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(c.createdAt)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
