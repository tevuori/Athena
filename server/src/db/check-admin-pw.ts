import bcrypt from "bcryptjs";
import prisma from "./client";

async function main() {
  const user = await prisma.user.findUnique({ where: { username: "admin" } });
  if (!user) {
    console.log("ERROR: admin user not found");
    return;
  }
  console.log("bcryptjs version:", (bcrypt as any).version || "unknown");
  console.log("Hash from DB:", user.passwordHash);
  console.log("Hash length:", user.passwordHash.length);

  // Test with the password from argv
  const testPw = process.argv[2] || "";
  if (testPw) {
    console.log(`Testing password "${testPw}":`, await bcrypt.compare(testPw, user.passwordHash));
  } else {
    console.log("Usage: bun run check-admin-pw.ts <password-to-test>");
    console.log("No password provided for testing.");
  }
}

main().finally(() => prisma.$disconnect());
