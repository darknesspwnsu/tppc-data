// scripts/update_rarity_json.js
const fs = require("fs");
const path = require("path");
const https = require("https");

const SOURCE_URL = "https://www.tppcrpg.net/rarity.html";
const OUT_FILE = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "data/rarity.json";

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function decodeHtml(s) {
  return s.replace(/&eacute;/g, "é");
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, "");
}

function parseRarity(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const data = {};

  for (const row of rows) {
    const cols = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)]
      .map((m) => decodeHtml(stripTags(m[1]).trim()));

    if (cols.length !== 7) continue;
    if (cols[0] === "Rank") continue;

    const [rank, name, male, female, genderless, ungendered, total] = cols;

    data[name] = {
      rank: Number(rank),
      male: Number(male),
      female: Number(female),
      genderless: Number(genderless),
      ungendered: Number(ungendered),
      total: Number(total)
    };
  }

  return data;
}

function extractLastUpdatedText(html) {
  // Matches: Last Updated: 12-25-2025 06:32
  // Allows extra whitespace and case differences.
  const m = html.match(
    /Last\s*Updated:\s*([0-9]{2}-[0-9]{2}-[0-9]{4}\s+[0-9]{2}:[0-9]{2})/i
  );
  return m ? m[1] : null;
}

function getEasternTimeZoneName(parts) {
  if (!parts) return null;

  const mm = Number(parts.month);
  const dd = Number(parts.day);
  const yyyy = Number(parts.year);
  const hh = Number(parts.hour);
  const min = Number(parts.minute);
  if (
    !Number.isFinite(mm) || mm < 1 || mm > 12 ||
    !Number.isFinite(dd) || dd < 1 || dd > 31 ||
    !Number.isFinite(yyyy) ||
    !Number.isFinite(hh) || hh < 0 || hh > 23 ||
    !Number.isFinite(min) || min < 0 || min > 59
  ) {
    return null;
  }

  const baseUtc = Date.UTC(yyyy, mm - 1, dd, hh, min, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  let utc = new Date(baseUtc);
  for (let i = 0; i < 3; i += 1) {
    const formatted = formatter.formatToParts(utc);
    const values = Object.fromEntries(
      formatted.filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
    );
    const asUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    const nextUtc = new Date(baseUtc - (asUtc - utc.getTime()));
    if (nextUtc.getTime() === utc.getTime()) {
      const zone = String(values.timeZoneName || "").toUpperCase();
      return zone === "EDT" || zone === "EST" ? zone : null;
    }
    utc = nextUtc;
  }

  const fallback = formatter.formatToParts(utc);
  const zone = String(
    fallback.find((part) => part.type === "timeZoneName")?.value || ""
  ).toUpperCase();
  return zone === "EDT" || zone === "EST" ? zone : null;
}

function normalizeLastUpdatedText(lastUpdatedText) {
  const m = String(lastUpdatedText || "").match(
    /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?:\s+(EST|EDT))?$/i
  );
  if (!m) return lastUpdatedText || null;

  const zone = (m[6] || getEasternTimeZoneName({
    month: m[1],
    day: m[2],
    year: m[3],
    hour: m[4],
    minute: m[5],
  }) || "EST").toUpperCase();
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} ${zone}`;
}

async function main() {
  console.log(`Fetching ${SOURCE_URL}...`);
  const html = await fetch(SOURCE_URL);

  console.log("Parsing...");
  const rarity = parseRarity(html);

  const lastUpdatedText = normalizeLastUpdatedText(extractLastUpdatedText(html));

  const out = {
    meta: {
      source: SOURCE_URL,
      generatedAt: Date.now(),
      lastUpdatedText: lastUpdatedText,
      count: Object.keys(rarity).length
    },
    data: rarity
  };

  const outPath = path.resolve(OUT_FILE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  console.log(`Wrote ${OUT_FILE} (${out.meta.count} rows)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
