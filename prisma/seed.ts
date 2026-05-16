import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding NKSW CRM...");

  // Admin padrão
  const adminHash = await bcrypt.hash("nksw2025admin", 12);
  // Remove email antigo se existir, para evitar duplicata
  await db.user.deleteMany({ where: { email: "admin@nakedsw.com.br" } });
  await db.user.upsert({
    where: { email: "wlisses@nakedsw.com.br" },
    create: {
      email: "wlisses@nakedsw.com.br",
      name: "Wlisses (Admin)",
      passwordHash: adminHash,
      role: "ADMIN",
    },
    update: {},
  });

  // Personal Shoppers de exemplo
  const shopperHash = await bcrypt.hash("nksw2025ps", 12);
  const shoppers = [
    { email: "ps1@nakedsw.com.br", name: "Ana Paula" },
    { email: "ps2@nakedsw.com.br", name: "Carolina M." },
    { email: "ps3@nakedsw.com.br", name: "Fernanda S." },
  ];

  for (const s of shoppers) {
    await db.user.upsert({
      where: { email: s.email },
      create: { ...s, passwordHash: shopperHash, role: "PERSONAL_SHOPPER" },
      update: {},
    });
  }

  // Pipeline padrão
  const existingPipeline = await db.pipeline.findFirst();
  if (!existingPipeline) {
    await db.pipeline.create({
      data: {
        name: "Pipeline Principal",
        stages: {
          createMany: {
            data: [
              { name: "Novo Lead", color: "#6366f1", order: 0 },
              { name: "Em Atendimento", color: "#3b82f6", order: 1 },
              { name: "Interessado", color: "#f59e0b", order: 2 },
              { name: "Aguardando Retorno", color: "#8b5cf6", order: 3 },
              { name: "Compra Realizada", color: "#10b981", order: 4, isWon: true },
              { name: "Pós Venda", color: "#06b6d4", order: 5 },
              { name: "Cliente VIP", color: "#f43f5e", order: 6 },
            ],
          },
        },
      },
    });
  }

  // Integrações iniciais
  for (const type of ["SHOPIFY", "OMNISEND"] as const) {
    await db.integration.upsert({
      where: { type },
      create: { type, status: "IDLE" },
      update: {},
    });
  }

  console.log("✅ Seed concluído!");
  console.log("📧 Admin: wlisses@nakedsw.com.br / nksw2025admin");
  console.log("📧 PS:    ps1@nakedsw.com.br / nksw2025ps");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
