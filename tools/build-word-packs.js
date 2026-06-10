const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");
const OUT_DIR = path.join(ROOT, "data", "packs");
const ECDICT_URL = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv";

const PACKS = [
  {
    id: "zk",
    tag: "zk",
    name: "中考词汇",
    category: "国内考试",
    description: "ECDICT 标注的中考核心词汇，适合做基础词汇回收。"
  },
  {
    id: "gk",
    tag: "gk",
    name: "高考词汇",
    category: "国内考试",
    description: "ECDICT 标注的高考词汇，覆盖高中阶段常见考纲词。"
  },
  {
    id: "cet4",
    tag: "cet4",
    name: "CET-4 四级词汇",
    category: "国内考试",
    description: "ECDICT 标注的大学英语四级词汇。"
  },
  {
    id: "cet6",
    tag: "cet6",
    name: "CET-6 六级词汇",
    category: "国内考试",
    description: "ECDICT 标注的大学英语六级词汇。"
  },
  {
    id: "ky",
    tag: "ky",
    name: "考研词汇",
    category: "国内考试",
    description: "ECDICT 标注的考研英语词汇。"
  },
  {
    id: "ielts",
    tag: "ielts",
    name: "IELTS 雅思词汇",
    category: "国际考试",
    description: "ECDICT 标注的雅思词汇，作为高频学习词书使用。"
  },
  {
    id: "toefl",
    tag: "toefl",
    name: "TOEFL 托福词汇",
    category: "国际考试",
    description: "ECDICT 标注的托福词汇，作为高频学习词书使用。"
  },
  {
    id: "gre",
    tag: "gre",
    name: "GRE 词汇",
    category: "国际考试",
    description: "ECDICT 标注的 GRE 词汇，难度较高。"
  }
];

const SOURCE = {
  name: "ECDICT",
  url: "https://github.com/skywind3000/ECDICT",
  license: "MIT",
  licenseUrl: "https://github.com/skywind3000/ECDICT/blob/master/LICENSE"
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const sourcePath = path.join(CACHE_DIR, "ecdict.csv");
  if (!fs.existsSync(sourcePath) || process.argv.includes("--refresh")) {
    await download(ECDICT_URL, sourcePath);
  }

  const content = fs.readFileSync(sourcePath, "utf8");
  const records = parseCsvRecords(content);
  const header = records.next().value;
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  const packByTag = new Map(PACKS.map((pack) => [pack.tag, { ...pack, items: [] }]));

  for (const row of records) {
    const word = cleanupWord(row[column.word]);
    const translation = cleanupTranslation(row[column.translation]);
    const tags = new Set(String(row[column.tag] || "").split(/\s+/).filter(Boolean));
    if (!word || !translation || !tags.size) continue;

    for (const pack of packByTag.values()) {
      if (!tags.has(pack.tag)) continue;
      pack.items.push({
        id: `book-${pack.id}-${stableKey(word)}`,
        english: word,
        chinese: translation,
        phonetic: String(row[column.phonetic] || "").trim()
      });
    }
  }

  const index = {
    version: 1,
    generatedAt: "2026-06-10",
    source: SOURCE,
    packs: []
  };

  for (const pack of packByTag.values()) {
    const uniqueItems = [];
    const seenIds = new Set();
    pack.items.forEach((item) => {
      if (seenIds.has(item.id)) return;
      seenIds.add(item.id);
      uniqueItems.push(item);
    });
    pack.items = uniqueItems;
    pack.items.sort((a, b) => a.english.localeCompare(b.english, "en"));
    const output = {
      id: pack.id,
      name: pack.name,
      category: pack.category,
      description: pack.description,
      source: SOURCE,
      items: pack.items
    };

    const fileName = `${pack.id}.json`;
    fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(output));
    index.packs.push({
      id: pack.id,
      name: pack.name,
      category: pack.category,
      description: pack.description,
      file: `./data/packs/${fileName}`,
      count: pack.items.length,
      source: SOURCE.name,
      license: SOURCE.license
    });
  }

  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(index, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "NOTICE.md"), buildNotice(index));
  console.log(index.packs.map((pack) => `${pack.name}: ${pack.count}`).join("\n"));
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode} ${url}`));
        response.resume();
        return;
      }
      response.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (error) => {
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

function* parseCsvRecords(text) {
  let record = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    record += char;

    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        record += text[index + 1];
        index += 1;
      } else {
        quoted = !quoted;
      }
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      const line = record.replace(/[\r\n]+$/g, "");
      record = "";
      if (line) yield parseCsvLine(line);
    }
  }

  if (record.trim()) yield parseCsvLine(record);
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quoted) {
      if (char === "\"") {
        if (line[index + 1] === "\"") {
          current += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

function cleanupWord(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanupTranslation(value) {
  const lines = String(value || "")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const useful = lines.filter((line) => /[\u3400-\u9fff]/u.test(line));
  const withoutNetwork = useful.length > 1
    ? useful.filter((line) => !/^\[网络\]/u.test(line))
    : useful;

  return withoutNetwork
    .slice(0, 3)
    .map((line) => line.replace(/^\[(网络|计|化|医|经|法|电)\]\s*/u, ""))
    .join("；")
    .replace(/\s+/g, " ")
    .trim();
}

function stableKey(word) {
  const normalized = word
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || Buffer.from(word).toString("hex").slice(0, 24);
}

function buildNotice(index) {
  const lines = [
    "# Built-in Word Packs",
    "",
    "NanStar Lex 的内置词书由开源词典数据生成，只作为学习辅助词表，不表示官方完整题库。",
    "",
    "## Source",
    "",
    `- ${index.source.name}: ${index.source.url}`,
    `- License: ${index.source.license} (${index.source.licenseUrl})`,
    "",
    "## Generated Packs",
    ""
  ];

  index.packs.forEach((pack) => {
    lines.push(`- ${pack.name}: ${pack.count} entries`);
  });

  lines.push("");
  return lines.join("\n");
}
