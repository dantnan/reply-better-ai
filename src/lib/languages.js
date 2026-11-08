// Languages the user can ask a reply or rewrite to come out in ("Write in").
// "auto" keeps the old behaviour: same language as the draft, or as the
// instruction / conversation in reply mode. Names are in English because they go
// straight into the (English) system prompt.
export const AUTO_LANGUAGE = "auto";

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "pl", label: "Polish" },
  { code: "el", label: "Greek" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
  { code: "uk", label: "Ukrainian" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese (Simplified)" },
];

const BY_CODE = new Map(LANGUAGES.map(l => [l.code, l.label]));

// The code arrives from the page-side panel, so only known codes count.
export function isLanguage(code) {
  return typeof code === "string" && BY_CODE.has(code);
}

export function languageName(code) {
  return isLanguage(code) ? BY_CODE.get(code) : null;
}

// Gemini Nano can only promise output in these languages.
const ONDEVICE_LANGUAGES = new Set(["de", "en", "es", "fr", "ja"]);

export function onDeviceOutputLanguage(code) {
  return ONDEVICE_LANGUAGES.has(code) ? code : "en";
}

// ── "reply in English" inside the free-form instruction ──────────────────
// Models (Haiku especially) kept answering a French message in French even
// when the instruction said "reply in English", but always obey an explicit
// "Write in" choice. So an explicit request in the instruction is detected
// here and used as the "Write in" language. Only clear phrasings count ("in
// English", "translate to German", "ingilizce yaz"); "tell him I don't speak
// German" or "türkçe bilmiyorum de" change nothing.

// English exonyms, plus native names used after "en/auf/em/in".
const NAMES = {
  en: ["english", "inglés", "ingles", "anglais", "englisch", "inglês", "engels"],
  es: ["spanish", "español", "espanol", "espagnol", "spanisch", "espanhol", "spaans"],
  fr: ["french", "français", "francais", "francés", "frances", "französisch", "francês", "frans"],
  de: ["german", "deutsch", "alemán", "aleman", "allemand", "alemão", "duits"],
  it: ["italian", "italiano", "italien", "italienisch", "italiaans"],
  pt: ["portuguese", "português", "portugues", "portugais", "portugiesisch"],
  nl: ["dutch", "nederlands", "néerlandais", "niederländisch"],
  sv: ["swedish", "svenska", "suédois", "schwedisch"],
  pl: ["polish", "polski", "polonais", "polnisch"],
  el: ["greek", "grec", "griechisch", "griego"],
  tr: ["turkish", "türkçe", "turc", "türkisch", "turco"],
  ru: ["russian", "russe", "russisch", "ruso"],
  uk: ["ukrainian", "ukrainien", "ukrainisch"],
  ar: ["arabic", "arabe", "arabisch", "árabe"],
  hi: ["hindi"],
  id: ["indonesian", "bahasa indonesia"],
  vi: ["vietnamese", "tiếng việt", "vietnamien"],
  ja: ["japanese", "japonais", "japanisch", "japonés"],
  ko: ["korean", "coréen", "koreanisch", "coreano"],
  zh: ["chinese", "chinois", "chinesisch", "chino", "mandarin"],
};

// Turkish adverbs ("ingilizce" = "in English"); they need a verb next to them.
const TURKISH = {
  en: "ingilizce", es: "ispanyolca", fr: "fransızca", de: "almanca", it: "italyanca",
  pt: "portekizce", nl: "felemenkçe", sv: "isveççe", el: "yunanca", tr: "türkçe",
  ru: "rusça", uk: "ukraynaca", ar: "arapça", hi: "hintçe", id: "endonezce",
  vi: "vietnamca", ja: "japonca", ko: "korece", zh: "çince",
};

function norm(s) {
  // Default lower-casing turns "İ" into "i" + a combining dot; drop the dot.
  return String(s ?? "").toLowerCase().replace(/\u0307/g, "").replace(/\s+/g, " ");
}

const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const RULES = [];
for (const [code, names] of Object.entries(NAMES)) {
  const alt = names.map(esc).join("|");
  // "in English", "into French", "en français", "auf Deutsch", "em português"
  RULES.push({ code, re: new RegExp(`${B}(?:in|into|en|auf|em)\\s+(?:${alt})${E}`, "u") });
  // "translate (it) to German", "answer/reply/respond/write (it) in/to Greek"
  RULES.push({ code, re: new RegExp(`${B}(?:translate|reply|respond|answer|write)(?:\\s+(?:it|this|the reply|back))?\\s+(?:to|in|into)\\s+(?:${alt})${E}`, "u") });
}
for (const [code, word] of Object.entries(TURKISH)) {
  // "ingilizce cevap ver", "cevabı ingilizce yaz", "ingilizce olsun", "ingilizce yanıtla"
  RULES.push({ code, re: new RegExp(`${B}${esc(word)}\\s+(?:cevap|yanıt|yaz|olsun|söyle|de${E})`, "u") });
}

export function languageFromInstruction(instruction) {
  const text = norm(instruction);
  if (!text.trim()) return null;
  for (const { code, re } of RULES) if (re.test(text)) return code;
  return null;
}

// Read the browser's detectLanguage() result. CLD flags every short chat
// message as unreliable even when it gets the language right, so a confident
// guess (≥ 90%) on a non-trivial text counts too. Codes outside LANGUAGES
// (e.g. "gl" for garbled text) return null, leaving the prompt's own rule.
export function languageFromDetection(result, sample = "") {
  const top = result?.languages?.[0];
  const confident = result?.isReliable === true || (top?.percentage >= 90 && String(sample).trim().length >= 12);
  const code = confident && typeof top?.language === "string" ? top.language.split("-")[0] : null;
  return isLanguage(code) ? code : null;
}
