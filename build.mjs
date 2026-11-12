/* build.mjs — Markdown とサイト設定から単一 HTML を生成する CLI */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { Marked, Renderer } from "./vendor/marked.mjs";

const { values: options } = parseArgs({ options: {
  config: { type: "string", default: "wiki.json" },
  check: { type: "boolean" },
  python: { type: "string", default: "python" },
} });
const configPath = resolve(options.config);
const configDir = dirname(configPath);
const readText = path => readFileSync(path, "utf8").replace(/^\uFEFF/, "");
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);
const fragment = id => "#" + encodeURIComponent(id);
const isId = value => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const isText = value => typeof value === "string" && value.trim().length > 0;
const hasItems = value => Array.isArray(value) && value.length > 0;

function requireInput(condition, message) {
  if (!condition) throw new Error(message);
}

function readConfig() {
  const extension = extname(configPath).toLowerCase();
  if (extension === ".json") return JSON.parse(readText(configPath));
  requireInput(extension === ".yaml" || extension === ".yml", "設定の拡張子は .json、.yaml、.yml のいずれかを指定してください。");
  return JSON.parse(execFileSync(options.python, [
    "-X", "utf8", "-c",
    "import json, sys, yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1], encoding='utf-8-sig'))))",
    configPath,
  ], { encoding: "utf8" }));
}

function relativeHref(from, to) {
  const path = relative(from, to);
  return isAbsolute(path) ? pathToFileURL(to).href : path.split(sep).map(encodeURIComponent).join("/");
}

function localPath(root, name, context) {
  requireInput(isText(name) && !isAbsolute(name) && !/^[a-z][a-z\d+.-]*:/i.test(name), `相対パスが必要です: ${context}`);
  const path = resolve(root, name);
  const fromRoot = relative(root, path);
  requireInput(fromRoot !== ".." && !fromRoot.startsWith(".." + sep), `ルートの範囲外です: ${context}`);
  return path;
}

function build() {
  const config = readConfig();
  requireInput(config?.version === 1 && isText(config.title) && isId(config.home) &&
    hasItems(config.pages) && hasItems(config.nav), "version、title、home、pages、nav を確認してください。");
  requireInput(config.output?.mode === "single" && isText(config.output.path) && extname(config.output.path).toLowerCase() === ".html",
    "output.mode に single、output.path に HTML ファイルを指定してください。");
  requireInput(config.palette === undefined && config.aliases === undefined, "この版で利用できる設定は wiki.schema.json を確認してください。");
  const root = resolve(configDir, config.root ?? ".");
  const output = localPath(configDir, config.output.path, "output.path");
  const markdown = new Marked({ gfm: true });
  const documents = new Map();
  const byPath = new Map();
  const pageIds = new Set();
  const warnings = new Set();

  const pages = config.pages.map(page => {
    requireInput(isId(page?.id) && !pageIds.has(page.id) && hasItems(page.documents),
      `ページの ID または documents が不正です: ${page?.id}`);
    requireInput(page.documents.length === 1 || isText(page.title), `結合ページに title が必要です: ${page.id}`);
    pageIds.add(page.id);
    const entries = page.documents.map(entry => {
      requireInput(isId(entry?.id) && !documents.has(entry.id) && isText(entry.source) && entry.source.endsWith(".md"),
        `文書の ID または source が不正です: ${entry?.id}`);
      const path = localPath(root, entry.source, entry.source);
      requireInput(!byPath.has(path), `文書が重複しています: ${entry.source}`);
      const document = indexDocument(entry, path, markdown);
      documents.set(entry.id, document);
      byPath.set(path, document);
      return document;
    });
    return { ...page, documents: entries };
  });
  const home = pages.find(page => page.id === config.home);
  requireInput(home, `開始ページが見つかりません: ${config.home}`);

  function link(document, href, label) {
    if (/^(https?:\/\/|mailto:)/i.test(href)) return `<a href="${escapeHtml(href)}">${label}</a>`;
    requireInput(!/^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(href), `未対応のリンク: ${document.source} → ${href}`);
    const [name, local] = href.split("#", 2).map(decodeURIComponent);
    const path = name ? resolve(dirname(document.path), name) : document.path;
    const target = byPath.get(path);
    if (target) return `<a href="${lookupAnchor(target, local)}">${label}</a>`;
    if (!existsSync(path)) {
      warnings.add(`${document.source} → ${href}`);
      return `<span title="参照先のファイルが見つかりません">${label}</span>`;
    }
    const url = relativeHref(dirname(output), path) + (local ? fragment(local) : "");
    return `<a href="${escapeHtml(url)}" title="ローカルファイル">${label}</a>`;
  }

  function renderDocument(document) {
    const renderer = new Renderer();
    renderer.heading = function (token) {
      return `<h${token.depth} id="${escapeHtml(token.wikiAnchor)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    };
    renderer.link = function (token) {
      return link(document, token.href, this.parser.parseInline(token.tokens));
    };
    renderer.html = token => escapeHtml(token.text);
    renderer.image = token => {
      const name = decodeURIComponent(token.href);
      requireInput(!isAbsolute(name) && !/^[a-z][a-z\d+.-]*:/i.test(name), `画像は相対パスを指定してください: ${document.source} → ${name}`);
      const path = localPath(root, relative(root, resolve(dirname(document.path), name)), name);
      return embedImage(path, token.text);
    };
    renderer.paragraph = function (token) {
      if (token.tokens.length !== 1 || token.tokens[0].type !== "image") {
        return Renderer.prototype.paragraph.call(this, token);
      }
      return `<figure>${renderer.image(token.tokens[0])}<figcaption><button type="button" class="zoom-figure" hidden>拡大</button></figcaption></figure>\n`;
    };
    renderer.table = function (token) {
      return `<div class="table-scroll" role="region" tabindex="0" aria-label="表">${Renderer.prototype.table.call(this, token)}</div>`;
    };
    const body = new Marked({ gfm: true, renderer }).parser(document.tokens);
    return `<article aria-labelledby="${document.anchor}">${body}</article>`;
  }

  const title = escapeHtml(config.title);
  const homeHref = fragment(home.documents[0].anchor);
  const pageHtml = pages.map(page => {
    const name = escapeHtml(page.title ?? page.documents[0].title);
    const breadcrumbs = page === home ? "" :
      `<nav class="breadcrumbs" aria-label="パンくず"><a href="${homeHref}">ホーム</a><span aria-hidden="true">/</span><span>${name}</span></nav>`;
    return `<section class="wiki-page" data-title="${name}"${page === home ? " data-home" : ""}>
  ${breadcrumbs}
  ${page.documents.map(renderDocument).join("\n")}
</section>`;
  }).join("\n");
  const values = {
    TITLE: title,
    HOME: homeHref,
    NAV: renderNavigation(config.nav, documents),
    PAGES: pageHtml,
    CSS: readText(new URL("./assets/wiki.css", import.meta.url)),
    SCRIPT: readText(new URL("./assets/wiki.js", import.meta.url)),
  };
  const template = readText(new URL("./templates/page.html", import.meta.url));
  const html = template.replace(/\{\{([A-Z]+)\}\}/g, (_, key) => values[key]);
  if (options.check) {
    requireInput(existsSync(output) && readFileSync(output, "utf8") === html, `生成済み HTML に差分があります: ${output}`);
  } else {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, html);
  }
  for (const warning of warnings) console.warn(`参照先のファイルが見つかりません: ${warning}`);
  console.log(`${pages.length} ページ / ${documents.size} 文書 — ${output}`);
}

const plainText = tokens => tokens.map(token => token.tokens ? plainText(token.tokens) : token.text ?? "").join("");
const slug = title => title.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");

function indexDocument(entry, path, markdown) {
  const document = { ...entry, path, anchor: `doc--${entry.id}`, anchors: new Map() };
  document.tokens = markdown.lexer(readText(path));
  const firstHeading = document.tokens.find(token => token.type === "heading");
  requireInput(firstHeading?.depth === 1, `文書の先頭見出しを H1 にしてください: ${entry.source}`);
  document.title = plainText(firstHeading.tokens);
  markdown.walkTokens(document.tokens, token => {
    if (token.type !== "heading") return;
    const base = slug(plainText(token.tokens)) || "heading";
    let local = base;
    for (let number = 1; document.anchors.has(local); number++) local = `${base}-${number}`;
    token.wikiAnchor = token === firstHeading ? document.anchor : `${document.anchor}--${local}`;
    document.anchors.set(local, token.wikiAnchor);
  });
  return document;
}

function lookupAnchor(document, local) {
  const id = local ? document.anchors.get(local) : document.anchor;
  requireInput(id, `見出しが見つかりません: ${document.source}#${local}`);
  return fragment(id);
}

function embedImage(path, alt) {
  const mime = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[extname(path).toLowerCase()];
  requireInput(mime, `未対応の画像形式です: ${path}`);
  const data = readFileSync(path);
  const externalOrActive = /<(?:script|foreignObject)\b|\son\w+\s*=|(?:href\s*=\s*["']|url\(\s*["']?)(?!#)|@import/i;
  requireInput(mime !== "image/svg+xml" || !externalOrActive.test(data.toString("utf8")), `外部参照または実行可能な要素を含む SVG: ${path}`);
  return `<img src="data:${mime};base64,${data.toString("base64")}" alt="${escapeHtml(alt)}">`;
}

function renderNavigation(sections, documents) {
  function tree(items) {
    requireInput(hasItems(items), "ナビの items は空にできません。");
    return `<ul class="tree">${items.map(item => {
      if (item?.type === "tree") {
        requireInput(isText(item.label) && [undefined, "open", "closed"].includes(item.fold), "ツリーの label または fold が不正です。");
        const label = escapeHtml(item.label);
        const children = tree(item.items);
        return item.fold
          ? `<li><details${item.fold === "open" ? " open" : ""}><summary>${label}</summary>${children}</details></li>`
          : `<li class="bullet">${label}${children}</li>`;
      }
      const document = documents.get(item?.document);
      requireInput(item?.type === "link" && document, `ナビの項目または文書が不正です: ${item?.document}`);
      return `<li class="bullet"><a href="${lookupAnchor(document, item.anchor)}">${escapeHtml(item.label ?? document.title)}</a></li>`;
    }).join("")}</ul>`;
  }

  return sections.map(section => {
    requireInput(isText(section?.title) && hasItems(section.items), "ナビの title または items が不正です。");
    const content = [`<h2 class="sidebar-heading">${escapeHtml(section.title)}</h2>`];
    let links = [];
    for (const item of section.items) {
      if (item?.type !== "heading") {
        links.push(item);
        continue;
      }
      if (links.length) content.push(tree(links));
      links = [];
      requireInput(isText(item.title), "ナビの小見出しに title が必要です。");
      content.push(`<h3 class="sidebar-subheading">${escapeHtml(item.title)}</h3>`, tree(item.items));
    }
    if (links.length) content.push(tree(links));
    return content.join("\n");
  }).join("\n");
}

try {
  build();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
