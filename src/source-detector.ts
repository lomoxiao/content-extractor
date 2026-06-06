import type { SourceType } from "./types.js";

export function detectSourceType(url: string, tags: string[] = []): SourceType {
  const lower = url.toLowerCase();
  if (lower.includes("arxiv.org")) return "arxiv";
  if (lower.includes("twitter.com") || lower.includes("x.com")) return "x-post";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";

  // URL パスが .pdf で終わる場合(クエリ文字列・フラグメントを除く)
  const urlBase = lower.split("?")[0].split("#")[0];
  if (urlBase.endsWith(".pdf")) return "pdf-document";

  // タグによる上書き(手動タグ付けを優先)
  if (tags.includes("arxiv")) return "arxiv";
  if (tags.includes("youtube")) return "youtube";
  if (tags.includes("pdf")) return "pdf-document";

  return "web-article";
}
