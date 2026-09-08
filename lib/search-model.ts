export type SearchKind = "contribution" | "reference" | "folder" | "builtin";
export type IndexStatus = "pending" | "processing" | "completed" | "partial" | "failed" | "unsupported";
export type MatchLocation = { attachment?: number; page?: number; path?: string; line?: number; chunk?: number };
export type SearchFilters = { subject?: string; year?: string; grade?: string; school?: string; exam?: string; filetype?: string; site?: string; type?: string };
export type SearchInput = SearchFilters & { query: string; sort?: string; cursor?: string; limit?: number; duplicates?: string };
export type SearchHit = { id: string; sourceType: SearchKind; title: string; description: string; subject: string; tags: string[]; year: string | null; grade: string | null; school: string | null; exam: string | null; fileType: string; sourceUrl: string; sourceName: string; createdAt: string; viewCount: number; indexStatus: IndexStatus; indexMessage: string; thumbnailUrl?: string; previewUrl?: string; searchSnippet: string; matchLocation: MatchLocation; duplicateCount: number; duplicateKey: string; [key: string]: unknown };
export type SearchResponse = { results: SearchHit[]; related: string[]; subjects: string[]; nextCursor: string | null; total: number; indexVersion: string; appliedFilters: SearchFilters; correctedQuery?: string; engine: "v2" };
export type TextSection = MatchLocation & { text: string; ordinal?: number; method?: string; confidence?: number };

export const statusLabels: Record<IndexStatus, string> = { pending: "본문 읽기 대기", processing: "본문 읽는 중", completed: "본문 검색 가능", partial: "일부 본문 검색", failed: "본문 읽기 실패", unsupported: "제목·설명 검색" };
export function normalizeSearch(value: unknown) { const raw=String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim(); const letters="ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"; return /^[\u1100-\u1112]+$/u.test(raw)?Array.from(raw).map(c=>letters[c.codePointAt(0)!-0x1100]).join(""):raw; }
export function compactSearch(value: unknown) { return normalizeSearch(value).replace(/\s/gu, ""); }
export function initials(value: string) { const initial = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"; return Array.from(value.normalize("NFC")).map(c => { const n = c.codePointAt(0)! - 0xac00; return n >= 0 && n <= 11171 ? initial[Math.floor(n / 588)] : c.toLowerCase(); }).join("").replace(/\s/gu, ""); }
export function isInitialQuery(value: string) { return /^[ㄱ-ㅎ]{2,}$/u.test(value); }
export function shortToken(value: string) { return "g" + Array.from(value).map(c => c.codePointAt(0)!.toString(16)).join("x"); }
export function shortGrams(value: string) { const chars = Array.from(compactSearch(value)); const terms = new Set<string>(); for (let i = 0; i < chars.length; i++) { terms.add(shortToken(chars[i])); if (i + 1 < chars.length) terms.add(shortToken(chars[i] + chars[i + 1])); } return [...terms].join(" "); }
export function quoteFts(value: string) { return '"' + value.replaceAll('"', '""') + '"'; }
export function readJson<T>(value: unknown, fallback: T): T { try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; } }
export function flattenText(value: unknown, depth = 0): string { if (depth > 20) return ""; if (typeof value === "string" || typeof value === "number") return String(value); if (Array.isArray(value)) return value.map(x => flattenText(x, depth + 1)).filter(Boolean).join("\n"); if (value && typeof value === "object") return Object.values(value).map(x => flattenText(x, depth + 1)).filter(Boolean).join("\n"); return ""; }

export type QueryTerm = { value: string; phrase: boolean; excluded: boolean };
const filterNames: Record<string, keyof SearchFilters> = { "과목": "subject", subject: "subject", "연도": "year", year: "year", "학년": "grade", grade: "grade", "학교": "school", school: "school", "시험": "exam", exam: "exam", filetype: "filetype", site: "site" };
export function parseSearch(input: SearchInput) {
  if (input.query.length > 160) throw new Error("검색어는 160자까지 입력할 수 있습니다.");
  const terms: QueryTerm[] = []; const filters: SearchFilters = {};
  for (const key of Object.values(filterNames)) { const value = input[key]; if (value && value !== "전체") filters[key] = value.trim().slice(0, 160); }
  if (input.type && input.type !== "전체") filters.type = input.type;
  const tokens = input.query.match(/-?(?:[^\s:"\u201c\u201d]+:)?(?:"[^"]*"|\u201c[^\u201d]*\u201d|[^\s]+)/gu) || [];
  for (const token of tokens) {
    const colon = token.indexOf(":"); const key = colon > 0 ? filterNames[token.slice(0, colon).toLowerCase()] : undefined;
    if (key) { filters[key] = token.slice(colon + 1).replace(/^["“]|["”]$/gu, "").trim(); continue; }
    const excluded = token.startsWith("-") && token.length > 1; const raw = excluded ? token.slice(1) : token; const phrase = /^["“]/u.test(raw);
    const value = normalizeSearch(raw.replace(/^["“]|["”]$/gu, "")); if (value) terms.push({ value, phrase, excluded });
  }
  const text = terms.filter(t => !t.excluded).map(t => t.value).join(" ");
  const multiword = synonymGroups.flat().filter(value=>value.includes(' ')).map(normalizeSearch);
  for(let i=0;i<terms.length;i++){
    if(terms[i].phrase||terms[i].excluded)continue;
    for(let count=Math.min(4,terms.length-i);count>1;count--){
      const sequence=terms.slice(i,i+count);
      if(sequence.some(t=>t.phrase||t.excluded))continue;
      const value=sequence.map(t=>t.value).join(' ');
      if(multiword.includes(value)){terms.splice(i,count,{value,phrase:false,excluded:false});break;}
    }
  }
  const unique=terms.filter((t,i)=>terms.findIndex(x=>x.value===t.value&&x.phrase===t.phrase&&x.excluded===t.excluded)===i);
  if (unique.length > 24) throw new Error("검색 단어는 24개 이하로 입력하거나 제목을 따옴표로 묶어 주세요.");
  return { terms:unique, filters, text };
}

export const synonymGroups = [
  ["돌림힘", "토크", "torque"], ["현재완료", "present perfect"], ["관성", "inertia"], ["운동량", "momentum"], ["충격량", "impulse"],
  ["역학적에너지", "역학적 에너지", "mechanical energy"], ["전기장", "electric field"], ["자기장", "magnetic field"], ["등가속도", "등가속도 운동"],
  ["미분", "derivative"], ["적분", "integral"], ["확률", "probability"], ["벡터", "vector"], ["국어", "국어영역"], ["영어", "영어영역"],
  ["수학", "수학영역"], ["모의고사", "학력평가", "전국연합학력평가"], ["평가원", "한국교육과정평가원"], ["보인고", "보인고등학교"],
];
export function aliasesFor(term: QueryTerm, groups = synonymGroups) { if (term.phrase || term.excluded || /\d/u.test(term.value)) return [term.value]; const key = compactSearch(term.value); const group = groups.find(g => g.some(x => compactSearch(x) === key)); return [...new Set([term.value, ...(group || []).map(normalizeSearch)])].slice(0, 4); }

export function inferMetadata(title: string, tags: string[], overrides: Partial<SearchFilters> = {}) {
  const text = [title, ...tags].join(" "); const years = [...new Set(text.match(/\b(?:19|20)\d{2}(?=년|학년도|\b)/gu) || [])]; const grades = [...new Set((text.match(/(?:고등학교|중학교|초등학교|고|중|초)\s*[1-6](?:학년)?/gu) || []).map(x => x.replace(/등학교|학교|학년|\s/gu, "")))];
  const schoolMatch = text.match(/([가-힣]{2,12}(?:고등학교|중학교|초등학교)|[가-힣]{2,8}고)(?=\s|\d|$)/u);
  const exam = /기말/u.test(text) ? "기말고사" : /중간/u.test(text) ? "중간고사" : /모의고사|학력평가/u.test(text) ? "모의고사" : /수능|수학능력시험/u.test(text) ? "수능" : null;
  return { year: overrides.year || (years.length === 1 ? years[0] : null), grade: overrides.grade || (grades.length === 1 ? grades[0] : null), school: overrides.school || schoolMatch?.[1] || null, exam: overrides.exam || exam };
}
export function splitSections(sections: TextSection[], size = 2200, overlap = 180): Array<TextSection & { key: string; normalized: string; compact: string }> {
  const output: Array<TextSection & { key: string; normalized: string; compact: string }> = [];
  sections.forEach((section, ordinal) => { const text = section.text.replace(/\r\n?/g, "\n"); const chars = Array.from(text); for (let start = 0, part = 0; start < chars.length; start += size - overlap, part++) { const slice = chars.slice(start, start + size).join(""); const normalized = normalizeSearch(slice); if (!normalized) continue; output.push({ ...section, text: slice, line: section.line === undefined ? undefined : section.line + chars.slice(0, start).join("").split("\n").length - 1, ordinal: section.ordinal ?? ordinal, key: `${section.attachment ?? 0}:${section.page ?? 0}:${section.path ?? ""}:${section.ordinal ?? ordinal}:${part}`, normalized, compact: compactSearch(slice) }); if (start + size >= chars.length) break; } });
  return output;
}
export function snippet(text: string, terms: QueryTerm[]) {
  const normalized=normalizeSearch(text);let match:RegExpExecArray|null=null;
  const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const term of terms.filter(t=>!t.excluded)){
    for(const value of aliasesFor(term)){
      const pattern=term.phrase?escape(value):Array.from(compactSearch(value)).map(escape).join('\\s*');
      match=new RegExp(pattern,'u').exec(normalized);if(match)break;
    }
    if(match)break;
  }
  const start=Math.max(0,(match?.index||0)-65),end=Math.min(normalized.length,Math.max(start+220,(match?.index||0)+(match?.[0].length||0)));
  const part=match?normalized.slice(start,match.index)+'[['+match[0]+']]'+normalized.slice(match.index+match[0].length,end):normalized.slice(start,end);
  return (start?'…':'')+part+(end<normalized.length?'…':'');
}
