// Splits a migration file into single SQL statements at BUILD time (vite.config.ts), so the Worker can apply
// migrations itself without a SQL parser. Used by the release check too. Plain Node, no dependencies.
//
// Rules for migration files (README, "migrations"): plain statements only. No BEGIN/COMMIT (each file already
// runs as one transaction) and no triggers (their bodies contain semicolons). Both are rejected here.

/** Splits SQL text into statements. Comments are dropped; quoted text, identifiers and `[names]` are kept as is. */
export function splitSql(sql) {
  const out = [];
  let cur = "";
  const push = () => {
    const s = cur.trim();
    if (s) out.push(s);
    cur = "";
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "-" && n === "-") {
      // Line comment (may contain quotes, like "don't"): skip to the end of the line.
      const e = sql.indexOf("\n", i);
      i = e === -1 ? sql.length : e + 1;
      cur += "\n";
      continue;
    }
    if (c === "/" && n === "*") {
      const e = sql.indexOf("*/", i + 2);
      if (e === -1) throw new Error("Unclosed /* comment");
      i = e + 2;
      cur += " ";
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const end = c === "[" ? "]" : c;
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) throw new Error(`Unclosed ${c} quote`);
        if (sql[j] === end) {
          if (end !== "]" && sql[j + 1] === end) {
            j += 2; // doubled quote = escaped quote
            continue;
          }
          break;
        }
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === ";") {
      push();
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  push();
  for (const s of out) {
    if (/^(BEGIN|COMMIT|END|ROLLBACK)\b/i.test(s)) throw new Error(`Transactions are not allowed in migrations: ${s.slice(0, 60)}`);
    if (/^CREATE\s+(TEMP\w*\s+)?TRIGGER\b/i.test(s)) throw new Error(`Triggers are not supported in migrations: ${s.slice(0, 60)}`);
  }
  return out;
}

const leadingNumber = (name) => {
  const m = /^(\d+)/.exec(name);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

/** Same order as `wrangler d1 migrations apply`: by the leading number, then by name. */
export function compareMigrationNames(a, b) {
  const an = leadingNumber(a);
  const bn = leadingNumber(b);
  if (an !== bn) return an < bn ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}
