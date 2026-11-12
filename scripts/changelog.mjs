#!/usr/bin/env node
// Writes CHANGELOG.md from release-notes.json, for people reading the code on GitHub.
// `npm run release` runs it; `npm run changelog` runs it alone. The site itself reads release-notes.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const isVersion = (v) => /^\d+\.\d+\.\d+$/.test(v);

export function changelogText(notes) {
  const lines = [
    "# Changelog - מה חדש בכל גרסה",
    "",
    "<!-- Generated from release-notes.json by scripts/changelog.mjs. Edit release-notes.json, not this file. -->",
    "",
    "הקובץ נוצר אוטומטית מ-`release-notes.json`. מנהלי אתרים רואים את אותם חידושים בלוח ניהול האתר, בלשונית **עדכונים**.",
    "",
  ];
  for (const r of notes.releases.filter((r) => isVersion(r.version))) {
    lines.push(`## ${r.version}${r.date ? ` (${r.date})` : ""}`, "");
    for (const n of r.notes) lines.push(`- ${n}`);
    if (r.adminAction) lines.push("", `> **צריך לעשות בגרסה הזו:** ${r.adminAction}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function writeChangelog(file = "CHANGELOG.md") {
  const notes = JSON.parse(readFileSync("release-notes.json", "utf8"));
  writeFileSync(file, changelogText(notes));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeChangelog();
  console.log("CHANGELOG.md written");
}
