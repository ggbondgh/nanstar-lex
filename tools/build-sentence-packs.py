import bz2
import json
import re
import urllib.request
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "tools" / ".cache" / "tatoeba"
OUT_DIR = ROOT / "data" / "sentence-packs"

SOURCES = {
    "cmn_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn_sentences.tsv.bz2",
    "eng_sentences.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences.tsv.bz2",
    "cmn-eng_links.tsv.bz2": "https://downloads.tatoeba.org/exports/per_language/cmn/cmn-eng_links.tsv.bz2",
}

SOURCE_META = {
    "name": "Tatoeba",
    "url": "https://tatoeba.org/",
    "downloadsUrl": "https://downloads.tatoeba.org/exports/",
    "license": "CC-BY 2.0 FR",
    "licenseUrl": "https://creativecommons.org/licenses/by/2.0/fr/",
}

PACKS = [
    {
        "id": "sent-core",
        "name": "\u9ad8\u9891\u57fa\u7840\u53e5",
        "category": "\u57fa\u7840\u8868\u8fbe",
        "description": "\u9002\u5408\u6bcf\u5929\u56de\u6536\u7684\u9ad8\u9891\u57fa\u7840\u82f1\u6587\u53e5\uff0c\u4ee5\u7b80\u77ed\u53e5\u548c\u5e38\u7528\u7ed3\u6784\u4e3a\u4e3b\u3002",
        "limit": 120,
        "pattern": r"\b(I|you|we|it|this|that|there|can|could|should|would|need|want|like|think|know|have|make|get|take|go|come|help)\b",
    },
    {
        "id": "sent-daily",
        "name": "\u65e5\u5e38\u53e3\u8bed\u53e5",
        "category": "\u751f\u6d3b\u6c9f\u901a",
        "description": "\u65e5\u5e38\u5bf9\u8bdd\u4e2d\u5e38\u7528\u7684\u8be2\u95ee\u3001\u8868\u8fbe\u9700\u6c42\u548c\u4e92\u52a8\u53e5\u5f0f\u3002",
        "limit": 100,
        "pattern": r"\b(Can you|Could you|Do you|Would you|What|Where|When|How|please|thanks|sorry|need|want|like|feel|sure|ready)\b",
    },
    {
        "id": "sent-travel",
        "name": "\u65c5\u884c\u573a\u666f\u53e5",
        "category": "\u573a\u666f\u8868\u8fbe",
        "description": "\u56f4\u7ed5\u4ea4\u901a\u3001\u9152\u5e97\u3001\u9910\u5385\u548c\u51fa\u884c\u9700\u6c42\u7684\u5b9e\u7528\u53e5\u3002",
        "limit": 90,
        "pattern": r"\b(airport|hotel|room|taxi|cab|train|ticket|passport|reservation|restaurant|menu|coffee|water|station|bus|address|luggage|flight|trip)\b",
    },
    {
        "id": "sent-work",
        "name": "\u5de5\u4f5c\u6c9f\u901a\u53e5",
        "category": "\u5de5\u4f5c\u8868\u8fbe",
        "description": "\u9002\u5408\u5de5\u4f5c\u6c9f\u901a\u3001\u4efb\u52a1\u8ba8\u8bba\u548c\u529e\u516c\u573a\u666f\u7684\u53e5\u5f0f\u7ec3\u4e60\u3002",
        "limit": 90,
        "pattern": r"\b(meeting|project|report|email|plan|schedule|team|deadline|office|job|call|client|work|business|manager|company)\b",
    },
    {
        "id": "sent-writing",
        "name": "\u5199\u4f5c\u8fde\u63a5\u53e5",
        "category": "\u5199\u4f5c\u53e5\u578b",
        "description": "\u5305\u542b\u539f\u56e0\u3001\u8f6c\u6298\u3001\u5efa\u8bae\u3001\u53ef\u80fd\u6027\u7b49\u5199\u4f5c\u5e38\u7528\u8868\u8fbe\u3002",
        "limit": 90,
        "pattern": r"\b(because|although|however|therefore|important|possible|problem|solution|reason|example|consider|suggest|result|should|could|might|necessary|depends)\b",
    },
]

TRADITIONAL_CODEPOINTS = {
    0x5011, 0x9019, 0x9EBC, 0x7D66, 0x9031, 0x5167, 0x64FA, 0x4F86, 0x96BB, 0x8C93,
    0x7D00, 0x6A23, 0x92FC, 0x8A72, 0x8B93, 0x88CF, 0x88E1, 0x96FB, 0x8996, 0x9593,
    0x8F1B, 0x8A08, 0x8ECA, 0x6703, 0x8D95, 0x6EFF, 0x6E96, 0x5099, 0x70BA, 0x5E6B,
    0x500B, 0x55CE, 0x8CB7, 0x5C0D, 0x958B, 0x95DC, 0x807D, 0x8AAA, 0x898B, 0x904E,
    0x9084, 0x6642, 0x5F8C, 0x7121, 0x5B78, 0x554F, 0x6B72, 0x96E3, 0x61C9, 0x9AD4,
    0x982D, 0x6383, 0x9032, 0x5F9E, 0x5C07, 0x8207, 0x65BC, 0x865F, 0x81FA, 0x5922,
    0x66F8, 0x8A9E, 0x842C, 0x7576, 0x932F, 0x89AA, 0x8AB0, 0x9EDE, 0x9577, 0x525B,
    0x611B, 0x6C23, 0x5BE6, 0x4E26, 0x54E1, 0x98A8, 0x96D9, 0x908A, 0x8B8A, 0x8655,
    0x689D, 0x9EB5, 0x98F2, 0x98EF, 0x8A5E, 0x984C, 0x8CE3, 0x6A13, 0x9580, 0x8A8D,
    0x9322, 0x9023, 0x9078, 0x64C7, 0x5BEB, 0x8B80, 0x5F48, 0x5F35, 0x96DE, 0x96D6,
    0x8457, 0x5152, 0x85E5, 0x91AB, 0x7522, 0x696D, 0x9280, 0x92B7, 0x8B70, 0x8B1B,
    0x8A66, 0x6536, 0x8CC7, 0x6E2C, 0x7D50, 0x69CB, 0x8209, 0x8FA6, 0x5BE6, 0x8A18,
    0x6B61, 0x968A, 0x91E7, 0x7B87, 0x7A2E, 0x9A5A, 0x5F4E, 0x7522, 0x8C50, 0x860B,
    0x5EE3, 0x8077, 0x8F49, 0x7E8C, 0x6EAB, 0x570B, 0x6B78, 0x5E25, 0x5E63, 0x62CD,
    0x9060, 0x6163,
}

BAD_ENGLISH = re.compile(
    r"\b(Tom|Mary|Muiriel|Sami|Layla|Jim|Jane|John|Mr\.?|Mrs\.?|Boston|Esperanto|"
    r"French|German|Japanese|Japan|Spanish|Australia|Canada|L\.A\.|Monday|Tuesday|"
    r"Wednesday|Thursday|Friday|Saturday|Sunday|Ford|CIA|Dutch|Italian|Sanda|Kushiro|"
    r"Shanghai|Italy|London|America|American|China|Chinese|Korea|Korean)\b",
    re.I,
)
BAD_TOPIC = re.compile(
    r"\b(brothel|kill|killed|die|died|dead|gun|war|sex|naked|drunk|stupid|hate|fight|divorce|"
    r"suicide|hell|steal|fool|fear|soul|animal|animals|garbanzo|beans|private school|"
    r"fly|fan|raffle|lottery|golf)\b",
    re.I,
)
ASCII_ONLY = re.compile(r"[^\x00-\x7f]")
WORD_RE = re.compile(r"[A-Za-z]+(?:['\u2019][A-Za-z]+)?")
ENGLISH_ALLOWED = re.compile(r"^[A-Za-z][A-Za-z\s.,?!'\u2019-]*[.?!]?$")
HAS_CJK = re.compile(r"[\u4e00-\u9fff]")
HAS_LATIN = re.compile(r"[A-Za-z]")
TITLE_CASE_WORD = re.compile(r"\b[A-Z][a-z]{2,}\b")


def main():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for filename, url in SOURCES.items():
        ensure_downloaded(filename, url)

    pairs = load_pairs()
    generated_packs = []
    used_english = set()

    for pack in PACKS:
        selected = select_pack_items(pairs, pack, used_english)
        used_english.update(normalize_english_key(item["english"]) for item in selected)
        pack_payload = {
            "id": pack["id"],
            "type": "sentence",
            "name": pack["name"],
            "category": pack["category"],
            "description": pack["description"],
            "source": SOURCE_META,
            "items": selected,
        }
        file_name = f"{pack['id']}.json"
        write_json(OUT_DIR / file_name, pack_payload)
        generated_packs.append(
            {
                "id": pack["id"],
                "type": "sentence",
                "name": pack["name"],
                "category": pack["category"],
                "description": pack["description"],
                "file": f"./data/sentence-packs/{file_name}",
                "count": len(selected),
                "source": SOURCE_META["name"],
                "license": SOURCE_META["license"],
            }
        )

    index = {
        "version": 1,
        "generatedAt": date.today().isoformat(),
        "source": SOURCE_META,
        "packs": generated_packs,
    }
    write_json(OUT_DIR / "index.json", index, indent=2)
    (OUT_DIR / "NOTICE.md").write_text(build_notice(index), encoding="utf-8")
    print("\n".join(f"{pack['name']}: {pack['count']}" for pack in generated_packs))


def ensure_downloaded(filename, url):
    destination = CACHE_DIR / filename
    if destination.exists() and destination.stat().st_size > 0:
        return
    print(f"Downloading {filename}...")
    urllib.request.urlretrieve(url, destination)


def load_pairs():
    links = []
    cmn_ids = set()
    eng_ids = set()

    with bz2.open(CACHE_DIR / "cmn-eng_links.tsv.bz2", "rt", encoding="utf-8") as file:
        for line in file:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 2:
                continue
            cmn_id = int(parts[0])
            eng_id = int(parts[1])
            links.append((cmn_id, eng_id))
            cmn_ids.add(cmn_id)
            eng_ids.add(eng_id)

    cmn = load_sentences("cmn_sentences.tsv.bz2", cmn_ids)
    eng = load_sentences("eng_sentences.tsv.bz2", eng_ids)
    pairs = []
    seen = set()

    for cmn_id, eng_id in links:
        english = cleanup_spaces(eng.get(eng_id, ""))
        chinese = cleanup_spaces(cmn.get(cmn_id, ""))
        if not is_clean_pair(english, chinese):
            continue
        key = normalize_english_key(english)
        if key in seen:
            continue
        seen.add(key)
        pairs.append(
            {
                "englishId": eng_id,
                "chineseId": cmn_id,
                "english": english.replace("\u2019", "'"),
                "chinese": chinese,
            }
        )

    return pairs


def load_sentences(filename, wanted_ids):
    sentences = {}
    with bz2.open(CACHE_DIR / filename, "rt", encoding="utf-8") as file:
        for line in file:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            sentence_id = int(parts[0])
            if sentence_id in wanted_ids:
                sentences[sentence_id] = parts[2]
    return sentences


def cleanup_spaces(value):
    return re.sub(r"\s+", " ", value or "").strip()


def is_clean_pair(english, chinese):
    if not english or not chinese:
        return False
    if ASCII_ONLY.search(english.replace("\u2019", "'")):
        return False
    if not ENGLISH_ALLOWED.match(english):
        return False
    if BAD_ENGLISH.search(english) or BAD_TOPIC.search(english):
        return False
    if has_suspicious_title_case(english):
        return False
    if not HAS_CJK.search(chinese) or HAS_LATIN.search(chinese):
        return False
    if has_traditional_char(chinese):
        return False
    if re.search(r"[\d\[\]{}<>#@\"“”]", english + chinese):
        return False

    word_count = len(WORD_RE.findall(english))
    if word_count < 4 or word_count > 15:
        return False
    if len(chinese) < 4 or len(chinese) > 38:
        return False
    return True


def has_traditional_char(text):
    return any(ord(char) in TRADITIONAL_CODEPOINTS for char in text)


def has_suspicious_title_case(english):
    for match in TITLE_CASE_WORD.finditer(english):
        if match.start() > 0:
            return True
    return False


def select_pack_items(pairs, pack, used_english):
    pattern = re.compile(pack["pattern"], re.I)
    candidates = [
        pair for pair in pairs
        if normalize_english_key(pair["english"]) not in used_english and pattern.search(pair["english"])
    ]
    candidates.sort(key=score_pair)

    items = []
    seen = set()
    for pair in candidates:
        key = normalize_english_key(pair["english"])
        if key in seen:
            continue
        seen.add(key)
        items.append(
            {
                "id": f"book-{pack['id']}-{pair['englishId']}-{pair['chineseId']}",
                "english": pair["english"],
                "chinese": pair["chinese"],
                "sourceIds": {
                    "english": pair["englishId"],
                    "chinese": pair["chineseId"],
                },
            }
        )
        if len(items) >= pack["limit"]:
            break
    return items


def score_pair(pair):
    words = WORD_RE.findall(pair["english"])
    word_count = len(words)
    question_bonus = -4 if pair["english"].endswith("?") else 0
    first_second_person_bonus = -3 if re.search(r"\b(I|you|we)\b", pair["english"], re.I) else 0
    return (
        abs(word_count - 7) * 12
        + len(pair["english"]) * 0.35
        + len(pair["chinese"]) * 0.2
        + question_bonus
        + first_second_person_bonus
    )


def normalize_english_key(value):
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def write_json(path, payload, indent=None):
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=None if indent else (",", ":"), indent=indent), encoding="utf-8")


def build_notice(index):
    lines = [
        "# Built-in Sentence Packs",
        "",
        "NanStar Lex 的内置句子词书由 Tatoeba 英中句子对筛选生成，只作为个人英语练习素材。",
        "",
        "## Source",
        "",
        f"- {index['source']['name']}: {index['source']['url']}",
        f"- Downloads: {index['source']['downloadsUrl']}",
        f"- License: {index['source']['license']} ({index['source']['licenseUrl']})",
        "",
        "每条句子保留 Tatoeba 英文句子 ID 和中文句子 ID，可通过 `https://tatoeba.org/en/sentences/show/{id}` 查看原句。",
        "",
        "## Generated Packs",
        "",
    ]
    for pack in index["packs"]:
        lines.append(f"- {pack['name']}: {pack['count']} entries")
    lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
