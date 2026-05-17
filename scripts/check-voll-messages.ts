import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();
  const convs = await db.conversation.findMany({
    where: { channel: "WHATSAPP" },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { id: true, subject: true, snippet: true, body: true }
  });
  for (const c of convs) {
    const msgs = JSON.parse(c.body) as Array<Record<string, unknown>>;
    const types = [...new Set(msgs.map(m => m.message_type))];
    console.log("Sessao:", c.subject, "| types:", types.join(", "));
    const nonText = msgs.find(m => m.message_type !== "text" && m.message_type !== "system");
    if (nonText) console.log("Midia:", JSON.stringify(nonText, null, 2));
    else console.log("  (sem midia nessa sessao)");
  }
  await db.$disconnect();
}
main().catch(console.error);
