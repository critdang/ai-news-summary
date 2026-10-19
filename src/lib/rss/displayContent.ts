import DOMPurify from "isomorphic-dompurify";

const CONTENT_TAGS = [
  "p", "br", "b", "i", "em", "strong", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code",
  "div", "span", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "caption", "hr", "sub", "sup", "mark", "del", "ins", "abbr", "details", "summary", "img",
];

/** Sanitize untrusted RSS HTML, preserving article images while removing executable content. */
export function sanitizeRssHtml(content: string | null | undefined): string {
  if (!content) return "";
  return DOMPurify.sanitize(content, {
    ALLOWED_TAGS: CONTENT_TAGS,
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "colspan", "rowspan", "width", "height", "loading"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Produce a compact, readable plain-text preview without exposing RSS markup. */
export function rssPlainText(content: string | null | undefined): string {
  const safe = sanitizeRssHtml(content);
  if (!safe) return "";
  const text = safe.replace(/<[^>]*>/g, " ");
  if (typeof document !== "undefined") {
    const decoder = document.createElement("textarea");
    decoder.innerHTML = text;
    return (decoder.value || "").replace(/\s+/g, " ").trim();
  }
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
