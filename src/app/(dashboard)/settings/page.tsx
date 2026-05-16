import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

async function getIntegrationStatus() {
  const integration = await db.integration.findFirst({
    where: { type: "SHOPIFY" },
  });
  return integration;
}

async function getCustomerCount() {
  return db.customer.count({ where: { deletedAt: null } });
}

export default async function SettingsPage() {
  const session = await auth();
  const [integration, customerCount] = await Promise.all([
    getIntegrationStatus(),
    getCustomerCount(),
  ]);

  return (
    <SettingsClient
      session={session}
      integration={integration ? {
        status: integration.status,
        lastSyncAt: integration.lastSyncAt?.toISOString() ?? null,
        syncedCount: integration.syncedCount,
        lastError: integration.lastError,
      } : null}
      customerCount={customerCount}
    />
  );
}
