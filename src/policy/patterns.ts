export const BUILTIN_PATTERNS: {
  id: string;
  pattern: RegExp;
  replacement: string;
}[] = [
  { id: "ansi", pattern: /\x1b\[[0-9;]{0,40}[A-Za-z]/g, replacement: "" },
  {
    id: "bidi",
    pattern: /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    replacement: "",
  },
  {
    id: "synthetic-canary",
    pattern: /TSG_SYNTHETIC_CANARY_[^\s\r\n]{0,1024}/g,
    replacement: "[SYNTHETIC OMITTED]",
  },
  {
    id: "url",
    pattern:
      /\b(?:[a-z][a-z0-9+.-]{0,20}:\/\/|(?:https?|wss?|ftp|file|data|mailto|tel|urn|javascript):)[^\s<>"']{1,8192}/gi,
    replacement: "[URL OMITTED]",
  },
  {
    id: "home-path",
    pattern: /(?:\/Users\/|\/home\/|[A-Z]:\\Users\\)[^\s<>"']{1,8192}/gi,
    replacement: "[PATH OMITTED]",
  },
  {
    id: "absolute-path",
    pattern: /(?:^|\s)(?:\/(?:[^\s<>"']{1,8192})|[A-Z]:\\[^\s<>"']{1,8192})/g,
    replacement: " [PATH OMITTED]",
  },
  {
    id: "email",
    pattern: /[\w.+-]{1,128}@[\w.-]{1,253}\.[A-Za-z]{2,24}/g,
    replacement: "[EMAIL OMITTED]",
  },
  {
    id: "bearer",
    pattern: /\bBearer\s+[A-Za-z0-9._~+\/-]{1,4096}=*/gi,
    replacement: "[AUTH OMITTED]",
  },
  {
    id: "jwt",
    pattern:
      /\beyJ[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,2048}/g,
    replacement: "[TOKEN OMITTED]",
  },
  {
    id: "credential-assignment",
    pattern:
      /\b(?:password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*(?:"[^"\r\n]{0,4096}"|'[^'\r\n]{0,4096}'|[^\s,;]{1,4096})/gi,
    replacement: "[CREDENTIAL OMITTED]",
  },
  {
    id: "control",
    pattern: /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,
    replacement: "",
  },
];
