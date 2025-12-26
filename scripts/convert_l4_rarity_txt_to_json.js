const fs = require("fs");

function usage() {
  console.log(
    [
      "Usage:",
      "  node scripts/convert_l4_rarity_txt_to_json.js --in data/l4_rarity.txt --out data/l4_rarity.json",
      ""
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--in") args.in = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function normalizeSectionHeader(line) {
  const s = line.trim().toLowerCase();
  if (s === "male" || s === "[male]" || s === "males") return "male";
  if (s === "female" || s === "[female]" || s === "females") return "female";
  if (s === "genderless" || s === "[genderless]" || s === "ungendered") return "genderless";
  if (s === "(?)" || s === "[?]" || s === "?" || s === "unknown") return "ungendered";
  return null;
}

function parseCount(raw) {
  const s = String(raw).trim().replace(/[, _]/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cleanName(raw) {
  return String(raw).trim().replace(/\s+/g, " ");
}

function isNoiseLine(line) {
  const s = line.trim();
  if (!s) return true;
  if (s === "." || s === "…" || s === "..." || s === ">") return true;
  if (/^\.+$/.test(s)) return true;
  return false;
}

// Tie-aware rank assignment like typical rarity lists:
// sort by total asc, rank increments only when value changes.
function assignRanksByTotal(dataObj) {
  const entries = Object.entries(dataObj).map(([name, v]) => ({
    name,
    total: v.total
  }));

  entries.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));

  let rank = 0;
  let prevTotal = null;

  for (let i = 0; i < entries.length; i++) {
    const { name, total } = entries[i];
    if (prevTotal === null || total !== prevTotal) {
      rank = rank + 1;
      prevTotal = total;
    }
    dataObj[name].rank = rank;
  }
}

function main() {
  const { in: inPath, out: outPath, help } = parseArgs(process.argv);
  if (help || !inPath || !outPath) {
    usage();
    process.exit(help ? 0 : 1);
  }

  const raw = fs.readFileSync(inPath, "utf8");
  const lines = raw.split(/\r?\n/);

  const data = {};
  let section = null;
  const warnings = [];
  let parsedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i];
    const line = lineRaw.trim();

    const header = normalizeSectionHeader(line);
    if (header) {
      section = header;
      continue;
    }

    if (isNoiseLine(line)) continue;

    const m = line.match(/^(.*?)\s*-\s*(\d[\d, _]*)\s*$/);
    if (!m) {
      warnings.push(`Line ${i + 1}: Unrecognized (ignored): ${lineRaw}`);
      continue;
    }

    if (!section) {
      warnings.push(`Line ${i + 1}: Entry before section header (ignored): ${lineRaw}`);
      continue;
    }

    const name = cleanName(m[1]);
    const count = parseCount(m[2]);

    if (!name) {
      warnings.push(`Line ${i + 1}: Empty name (ignored): ${lineRaw}`);
      continue;
    }
    if (count === null) {
      warnings.push(`Line ${i + 1}: Invalid count (ignored): ${lineRaw}`);
      continue;
    }

    if (!data[name]) {
      data[name] = {
        rank: 0,       // assigned later
        male: 0,
        female: 0,
        genderless: 0,
        ungendered: 0,
        total: 0
      };
    }

    // Put the count into the current bucket
    data[name][section] = count;

    // Recompute total (in case of duplicates or multiple sections)
    data[name].total =
      (data[name].male || 0) +
      (data[name].female || 0) +
      (data[name].genderless || 0) +
      (data[name].ungendered || 0);

    parsedLines++;
  }

  // Assign rarity rank based on total (ascending, tie-aware)
  assignRanksByTotal(data);

  const out = {
    meta: {
      source: "(manual level 4 rarity dump)",
      generatedAt: Date.now(),
      lastUpdatedText: null, // optional: you can add your own if you want
      count: Object.keys(data).length,
      warnings: warnings.length
    },
    data
  };

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`✅ Wrote ${outPath}`);
  console.log(`Entries: ${out.meta.count}`);
  if (warnings.length) {
    console.log(`⚠️ Warnings: ${warnings.length} (showing first 25)`);
    warnings.slice(0, 25).forEach(w => console.log(" - " + w));
  }
}

main();
