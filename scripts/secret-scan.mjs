import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  /\bsb_secret_[A-Za-z0-9_-]{20,}\b/,
  /\bEAA[A-Za-z0-9]{60,}\b/,
  /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/,
];
const issues = [];
for (const file of files) {
  if (/\.(png|jpg|ico|woff2?|lock)$/.test(file) || file === "package-lock.json")
    continue;
  const content = readFileSync(file, "utf8");
  if (patterns.some((p) => p.test(content))) issues.push(file);
}
function walk(dir) {
  try {
    return readdirSync(dir).flatMap((name) => {
      const file = path.join(dir, name);
      return statSync(file).isDirectory() ? walk(file) : [file];
    });
  } catch {
    return [];
  }
}
for (const file of walk(".next/static")) {
  if (!file.endsWith(".js")) continue;
  const content = readFileSync(file, "utf8");
  if (
    /WHATSAPP_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|DATABASE_URL/.test(
      content,
    ) ||
    patterns.some((p) => p.test(content))
  )
    issues.push(file);
}
if (issues.length) {
  console.error(
    "FAIL: potential secret/server-only code in",
    issues.join(", "),
  );
  process.exitCode = 1;
} else
  console.log(
    `PASS: secret pattern scan of ${files.length} repository files and client JavaScript; no secret values printed`,
  );
