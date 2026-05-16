import { cn } from "@/lib/utils";
import type { CustomerSegment } from "@prisma/client";

interface ScoreBadgeProps {
  segment: CustomerSegment;
  className?: string;
}

const SEGMENT_CONFIG: Record<
  CustomerSegment,
  { label: string; className: string }
> = {
  VIP: {
    label: "VIP",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  ALTO_POTENCIAL: {
    label: "Alto Potencial",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  RECORRENTE: {
    label: "Recorrente",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  EM_RISCO: {
    label: "Em Risco",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  INATIVO: {
    label: "Inativo",
    className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
  NOVO: {
    label: "Novo",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
  PRIMEIRA_COMPRA: {
    label: "1ª Compra",
    className: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  },
};

export function ScoreBadge({ segment, className }: ScoreBadgeProps) {
  const config = SEGMENT_CONFIG[segment];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
