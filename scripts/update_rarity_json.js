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

async function main() {
  console.log(`Fetching ${SOURCE_URL}...`);
  const html = await fetch(SOURCE_URL);

  console.log("Parsing...");
  const rarity = parseRarity(html);

  const lastUpdatedText = extractLastUpdatedText(html);

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
