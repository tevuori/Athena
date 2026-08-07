/**
 * SQLite → PostgreSQL migration script.
 * Reads all data from a SQLite database file and inserts it into the
 * PostgreSQL database configured via DATABASE_URL (Prisma).
 *
 * Handles:
 *  - Missing columns (SQLite is older schema → PG columns get defaults)
 *  - Boolean conversion (0/1 → true/false)
 *  - Timestamp conversion (epoch ms bigint → ISO string → PG timestamp)
 *  - JSON/JSONB casting (text → ::jsonb) + null byte sanitization
 *  - Enum casting (text → ::enum_type)
 *  - Table ordering (User first, then parents before children)
 *
 * Usage: bun run migrate-sqlite-to-pg.ts /path/to/athena.db
 */
import { Database } from "bun:sqlite";
import prisma from "./client";

const SQLITE_PATH = process.argv[2] || "/app/athena_backup.db";

interface PgColumnInfo {
  name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

// Tables that must be processed before their dependents.
// User is first (almost everything depends on it).
// Parent tables before child tables.
const TABLE_ORDER = [
  "User",
  "NoteFolder",
  "TaskWorkspace",
  "FlashcardDeck",
  "VFolder",
  "Course",
  "LearningWorkspace",
  "Workspace",
  "GamificationState",
  "Habit",
  "Setting",
];

async function main() {
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  // Get all table names from SQLite (excluding internal tables)
  const allTables = sqlite
    .query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' AND name NOT LIKE 'sqlite%'`
    )
    .all() as { name: string }[];

  // Sort tables: priority tables first (in defined order), then the rest alphabetically
  const remaining = allTables.map((t) => t.name).filter((n) => !TABLE_ORDER.includes(n)).sort();
  const orderedTables = [...TABLE_ORDER.filter((n) => allTables.some((t) => t.name === n)), ...remaining];

  console.log(`Found ${allTables.length} tables in SQLite`);
  console.log(`Processing order: ${orderedTables.join(", ")}\n`);

  // Get PostgreSQL column info for a given table
  async function getPgColumns(table: string): Promise<Map<string, PgColumnInfo>> {
    const rows = await prisma.$queryRaw<PgColumnInfo[]>`
      SELECT column_name as name, data_type, udt_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position
    `;
    return new Map(rows.map((r) => [r.name, r]));
  }

  // Get SQLite columns for a table (name + type)
  function getSqliteColumns(table: string): { name: string; type: string }[] {
    const cols = sqlite.query(`PRAGMA table_info("${table}")`).all() as {
      name: string;
      type: string;
    }[];
    return cols.map((c) => ({ name: c.name, type: c.type }));
  }

  // Determine the SQL cast suffix for a PostgreSQL column
  function castSuffix(pgCol: PgColumnInfo): string {
    const dt = pgCol.data_type;
    const udt = pgCol.udt_name;

    if (dt === "timestamp without time zone" || dt === "timestamp with time zone") {
      return "::timestamp";
    }
    if (dt === "jsonb" || dt === "json") {
      return "::jsonb";
    }
    if (dt === "USER-DEFINED") {
      return `::"${udt}"`;
    }
    return "";
  }

  // Remove null bytes and invalid Unicode escape sequences from strings
  function sanitizeString(s: string): string {
    // Remove literal null bytes
    let cleaned = s.replace(/\0/g, "");
    // Remove JSON Unicode escape for null character
    cleaned = cleaned.replace(/\\u0000/g, "");
    return cleaned;
  }

  // Convert a value from SQLite to be compatible with PostgreSQL
  function convertValue(val: unknown, pgCol: PgColumnInfo): unknown {
    if (val === null || val === undefined) return null;

    const dt = pgCol.data_type;

    // Timestamp conversion: SQLite stores as epoch-ms bigint or ISO string
    if (dt === "timestamp without time zone" || dt === "timestamp with time zone") {
      if (typeof val === "number") {
        if (val === 0) return null;
        return new Date(val).toISOString();
      }
      if (typeof val === "string") {
        return val;
      }
      return null;
    }

    // Boolean conversion: SQLite stores as 0/1
    if (dt === "boolean" && typeof val === "number") {
      return val === 1;
    }

    // Sanitize strings: remove null bytes that PostgreSQL rejects
    if (typeof val === "string") {
      return sanitizeString(val);
    }

    return val;
  }

  let totalRows = 0;
  let totalErrors = 0;

  for (const table of orderedTables) {
    const sqliteCols = getSqliteColumns(table);
    const pgCols = await getPgColumns(table);

    // Only use columns that exist in BOTH databases
    const commonCols = sqliteCols.filter((c) => pgCols.has(c.name));

    if (commonCols.length === 0) {
      console.log(`  SKIP ${table}: no common columns`);
      continue;
    }

    // Clear existing data in PostgreSQL (e.g. seed data)
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);

    // Read all rows from SQLite
    const colNames = commonCols.map((c) => c.name);
    const selectCols = colNames.map((c) => `"${c}"`).join(", ");
    const rows = sqlite.query(`SELECT ${selectCols} FROM "${table}"`).all() as Record<string, unknown>[];

    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (empty)`);
      continue;
    }

    // Build the INSERT statement with per-column casts
    const colList = colNames.map((c) => `"${c}"`).join(", ");
    const placeholders = colNames
      .map((c, i) => {
        const pgCol = pgCols.get(c)!;
        return `$${i + 1}${castSuffix(pgCol)}`;
      })
      .join(", ");
    const insertSql = `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`;

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const values = colNames.map((col) => {
        const pgCol = pgCols.get(col)!;
        return convertValue(row[col], pgCol);
      });

      try {
        await prisma.$executeRawUnsafe(insertSql, ...values);
        inserted++;
        totalRows++;
      } catch (e) {
        errors++;
        totalErrors++;
        if (errors <= 2) {
          console.error(`  ERROR [${table}]:`, (e as Error).message?.slice(0, 300));
        }
      }
    }

    console.log(`  ${table}: ${inserted}/${rows.length} rows inserted${errors > 0 ? ` (${errors} errors)` : ""}`);
  }

  console.log(`\nMigration complete! ${totalRows} rows inserted, ${totalErrors} errors.`);
  sqlite.close();
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
