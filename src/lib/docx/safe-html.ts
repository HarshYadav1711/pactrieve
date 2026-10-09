import type {DocxBlock, DocxInline} from "./types.ts";

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "tr", "td", "th"]);
const INLINE_TAGS = new Set(["strong", "b", "em", "i", "a", "br", "span"]);
const VOID_SKIP = new Set(["script", "style", "iframe", "object", "embed", "noscript"]);

export interface SafeParseResult {
  blocks: DocxBlock[];
  warnings: string[];
}

type Token =
  | {type: "open"; name: string; attrs: Record<string, string>}
  | {type: "close"; name: string}
  | {type: "self"; name: string; attrs: Record<string, string>}
  | {type: "text"; value: string};

/**
 * Convert Mammoth HTML into a React-safe semantic AST.
 * Only allowlisted tags/attributes survive; scripts and event handlers are dropped.
 */
export function mammothHtmlToSafeAst(html: string): SafeParseResult {
  const warnings: string[] = [];
  const tokens = tokenize(html);
  let i = 0;
  let idSeq = 0;
  const nextId = (prefix: string) => `${prefix}-${++idSeq}`;

  function peek(): Token | undefined {
    return tokens[i];
  }
  function take(): Token | undefined {
    return tokens[i++];
  }

  function skipUntilClose(name: string) {
    while (i < tokens.length) {
      const t = take();
      if (!t) break;
      if (t.type === "close" && t.name === name) break;
      if (t.type === "open" && t.name === name) {
        // nested same tag — continue until matching close (simple)
      }
    }
  }

  function isOpen(t: Token | undefined, name?: string): t is Extract<Token, {type: "open"}> {
    return Boolean(t && t.type === "open" && (name ? t.name === name : true));
  }

  function parseBlocks(stop?: string): DocxBlock[] {
    const out: DocxBlock[] = [];
    while (i < tokens.length) {
      const t = peek();
      if (!t) break;
      if (t.type === "close" && stop && t.name === stop) break;
      if (t.type === "close") {
        take();
        continue;
      }
      if (t.type === "text") {
        take();
        continue;
      }
      if (t.type !== "open" && t.type !== "self") {
        take();
        continue;
      }
      const name = t.name;
      if (VOID_SKIP.has(name)) {
        warnings.push(`Stripped unsafe tag <${name}>.`);
        take();
        if (t.type === "open") skipUntilClose(name);
        continue;
      }
      if (name === "p") {
        take();
        out.push({kind: "paragraph", id: nextId("p"), children: parseInlines("p")});
        expectClose("p");
      } else if (/^h[1-6]$/.test(name)) {
        take();
        const level = Number(name[1]) as 1 | 2 | 3 | 4 | 5 | 6;
        out.push({kind: "heading", id: nextId("h"), level, children: parseInlines(name)});
        expectClose(name);
      } else if (name === "ul" || name === "ol") {
        take();
        const ordered = name === "ol";
        const items: {id: string; children: DocxInline[]}[] = [];
        while (isOpen(peek(), "li")) {
          take();
          items.push({id: nextId("li"), children: parseInlines("li")});
          expectClose("li");
        }
        out.push({kind: "list", id: nextId("list"), ordered, items});
        expectClose(name);
      } else if (name === "table") {
        take();
        const rows: {id: string; cells: {id: string; blocks: DocxBlock[]}[]}[] = [];
        while (isOpen(peek(), "tr")) {
          take();
          const cells: {id: string; blocks: DocxBlock[]}[] = [];
          while (true) {
            const cellTok = peek();
            if (!isOpen(cellTok) || (cellTok.name !== "td" && cellTok.name !== "th")) break;
            const cellTag = cellTok.name;
            take();
            const cellBlocks = parseBlocks(cellTag);
            cells.push({id: nextId("cell"), blocks: cellBlocks});
            expectClose(cellTag);
          }
          rows.push({id: nextId("tr"), cells});
          expectClose("tr");
        }
        out.push({kind: "table", id: nextId("table"), rows});
        expectClose("table");
      } else {
        warnings.push(`Stripped unsupported tag <${name}>.`);
        take();
        if (t.type === "open") {
          // Do not keep script-like text; for unknown tags drop descendants text unless allowlisted blocks inside.
          if (BLOCK_TAGS.has(name)) {
            out.push(...parseBlocks(name));
          } else {
            skipUntilClose(name);
          }
        }
      }
    }
    return out;
  }

  function parseInlines(stop: string): DocxInline[] {
    const out: DocxInline[] = [];
    while (i < tokens.length) {
      const t = peek();
      if (!t) break;
      if (t.type === "close" && t.name === stop) break;
      if (t.type === "close") {
        take();
        continue;
      }
      if (t.type === "text") {
        const textTok = take();
        if (textTok && textTok.type === "text") {
          out.push({kind: "text", text: decodeEntities(textTok.value)});
        }
        continue;
      }
      if (t.type === "self" && t.name === "br") {
        take();
        out.push({kind: "br"});
        continue;
      }
      if (t.type === "open" && VOID_SKIP.has(t.name)) {
        warnings.push(`Stripped unsafe inline <${t.name}>.`);
        take();
        skipUntilClose(t.name);
        continue;
      }
      if (t.type === "open" && (t.name === "strong" || t.name === "b")) {
        const tag = t.name;
        take();
        const kids = parseInlines(tag);
        expectClose(tag);
        for (const kid of kids) {
          if (kid.kind === "text") out.push({...kid, bold: true});
          else out.push(kid);
        }
        continue;
      }
      if (t.type === "open" && (t.name === "em" || t.name === "i")) {
        const tag = t.name;
        take();
        const kids = parseInlines(tag);
        expectClose(tag);
        for (const kid of kids) {
          if (kid.kind === "text") out.push({...kid, italic: true});
          else out.push(kid);
        }
        continue;
      }
      if (t.type === "open" && t.name === "a") {
        const href = sanitizeHref(t.attrs.href);
        take();
        const children = parseInlines("a");
        expectClose("a");
        if (href) out.push({kind: "link", href, children});
        else {
          warnings.push("Dropped hyperlink with unsafe or missing href.");
          out.push(...children);
        }
        continue;
      }
      if (t.type === "open" && t.name === "span") {
        take();
        out.push(...parseInlines("span"));
        expectClose("span");
        continue;
      }
      if (t.type === "open" && BLOCK_TAGS.has(t.name)) break;
      if (t.type === "open" || t.type === "self") {
        warnings.push(`Stripped unsupported inline <${t.name}>.`);
        const tag = t.name;
        take();
        if (t.type === "open") {
          skipUntilClose(tag);
        }
        continue;
      }
      take();
    }
    return mergeAdjacentText(out);
  }

  function expectClose(name: string) {
    const t = peek();
    if (t?.type === "close" && t.name === name) take();
  }

  const blocks = parseBlocks();
  return {blocks, warnings};
}

function mergeAdjacentText(inlines: DocxInline[]): DocxInline[] {
  const out: DocxInline[] = [];
  for (const node of inlines) {
    const prev = out[out.length - 1];
    if (
      node.kind === "text" &&
      prev?.kind === "text" &&
      Boolean(prev.bold) === Boolean(node.bold) &&
      Boolean(prev.italic) === Boolean(node.italic)
    ) {
      prev.text += node.text;
    } else out.push(node);
  }
  return out;
}

function sanitizeHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const href = decodeEntities(raw).trim();
  if (!href) return null;
  if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href) || /^\s*vbscript:/i.test(href)) return null;
  if (/^https?:\/\//i.test(href) || href.startsWith("#") || href.startsWith("mailto:")) return href;
  return null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, "\u00a0")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].startsWith("<!--")) continue;
    if (m[1]) {
      const name = m[1].toLowerCase();
      const rawAttrs = m[2] ?? "";
      const isClose = m[0].startsWith("</");
      const selfClosing = /\/\s*>$/.test(m[0]) || name === "br" || name === "img";
      if (isClose) {
        tokens.push({type: "close", name});
      } else {
        const attrs = parseAttrs(rawAttrs);
        for (const key of Object.keys(attrs)) {
          if (key.startsWith("on") || key === "style" || key === "src") delete attrs[key];
        }
        if (selfClosing && (name === "br" || name === "img")) {
          if (name === "br") tokens.push({type: "self", name, attrs});
          // img dropped entirely
        } else {
          tokens.push({type: "open", name, attrs});
        }
      }
    } else if (m[3] != null) {
      tokens.push({type: "text", value: m[3]});
    }
  }
  return tokens;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return attrs;
}
