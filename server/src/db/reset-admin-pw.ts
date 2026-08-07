import bcrypt from "bcryptjs";
import prisma from "./client";

async function main() {
  const newPw = process.argv[2] || "agent00754";
  const hash = await bcrypt.hash(newPw, 10);
  await prisma.user.update({
    where: { username: "admin" },
    data: { passwordHash: hash, passwordMustChange: true },
  });
  console.log(`Admin password reset to "${newPw}".`);
  console.log("passwordMustChange set to true — user will be forced to change it on first login.");
}

main().finally(() => prisma.$disconnect());
