import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const LINE_ATTR = "data-dv-line";

function isElement(node: Node): node is Element {
  return "tagName" in node;
}

function annotateNode(node: Node): void {
  if (isElement(node)) {
    const line = node.sourceCodeLocation?.startLine;
    if (line != null) node.attrs.push({ name: LINE_ATTR, value: String(line) });
  }
  const children = "content" in node && node.content ? node.content.childNodes : "childNodes" in node ? node.childNodes : [];
  for (const child of children) annotateNode(child);
}

function findHead(document: DefaultTreeAdapterMap["document"]): Element | undefined {
  const html = document.childNodes.find((n): n is Element => isElement(n) && n.tagName === "html");
  return html?.childNodes.find((n): n is Element => isElement(n) && n.tagName === "head");
}

function policy(scripts: boolean, nonce: string): string {
  const scriptSrc = scripts ? "script-src 'unsafe-inline' https:" : `script-src 'nonce-${nonce}'`;
  return [
    "default-src 'none'", scriptSrc, "style-src 'unsafe-inline' https:", "img-src data: https:", "font-src data: https:",
  ].join("; ");
}

/**
 * Runs inside the sandboxed preview iframe. Reports clicks as source lines
 * and, on request from the parent window, outlines changed elements and
 * draws numbered comment markers. Only messages whose source is the parent
 * window are acted on.
 */
export const BRIDGE_SOURCE = `(function () {
  var lastMarkers = [];
  var style = document.createElement("style");
  style.textContent = ".dv-added{outline:2px solid #2da44e;outline-offset:1px}" +
    ".dv-removed{outline:2px solid #cf222e;outline-offset:1px}" +
    ".dv-marker{position:absolute;z-index:2147483647;min-width:18px;height:18px;padding:0 4px;box-sizing:border-box;" +
    "border-radius:9px;background:#0969da;color:#fff;font:600 11px/18px system-ui,sans-serif;text-align:center;cursor:pointer}";
  document.head.appendChild(style);

  function lineOf(el) { return Number(el.getAttribute("data-dv-line")); }

  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, left: r.left + window.scrollX, width: r.width, height: r.height };
  }

  // The page's own height (the root element's box, not the viewport's), so
  // the parent can size the frame to fit it.
  // A page that has not been laid out yet measures 0; try again shortly.
  var heightRetries = 0;
  function reportHeight() {
    var height = Math.ceil(document.documentElement.getBoundingClientRect().height);
    if (height > 0) { parent.postMessage({ type: "dv-height", height: height }, "*"); return; }
    if (heightRetries++ < 50) setTimeout(reportHeight, 100);
  }
  window.addEventListener("load", reportHeight);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(reportHeight).observe(document.documentElement);

  document.addEventListener("click", function (e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var marker = target.closest(".dv-marker");
    if (marker) {
      e.preventDefault();
      parent.postMessage({ type: "dv-marker-click", threadId: marker.getAttribute("data-thread-id"), rect: rectOf(marker) }, "*");
      return;
    }
    var el = target.closest("[data-dv-line]");
    if (!el) return;
    e.preventDefault();
    parent.postMessage({ type: "dv-click", line: lineOf(el), rect: rectOf(el) }, "*");
  }, true);

  function applyChanged(side, lines) {
    var cls = side === "old" ? "dv-removed" : "dv-added";
    var set = {};
    lines.forEach(function (l) { set[l] = true; });
    document.querySelectorAll("[data-dv-line]").forEach(function (el) {
      el.classList.remove("dv-added", "dv-removed");
      if (set[lineOf(el)]) el.classList.add(cls);
    });
  }

  // The element that contains source line L is the last one in document
  // order whose start line is at or before L.
  function elementForLine(line) {
    var best = null;
    var bestLine = -1;
    document.querySelectorAll("[data-dv-line]").forEach(function (el) {
      var l = lineOf(el);
      if (l <= line && l >= bestLine) { best = el; bestLine = l; }
    });
    return best;
  }

  function drawMarkers() {
    document.querySelectorAll(".dv-marker").forEach(function (m) { m.remove(); });
    lastMarkers.forEach(function (m, i) {
      var el = elementForLine(m.line);
      if (!el) return;
      var rect = el.getBoundingClientRect();
      var badge = document.createElement("div");
      badge.className = "dv-marker";
      badge.textContent = String(i + 1);
      badge.setAttribute("data-thread-id", m.threadId);
      badge.style.top = rect.top + window.scrollY + "px";
      badge.style.left = Math.max(0, rect.left + window.scrollX - 10) + "px";
      document.body.appendChild(badge);
    });
  }

  window.addEventListener("resize", drawMarkers);
  window.addEventListener("message", function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "dv-changed") applyChanged(m.side, m.lines || []);
    else if (m.type === "dv-markers") { lastMarkers = m.markers || []; drawMarkers(); }
  });
})();`;

/**
 * Parses `source`, tags every element with `data-dv-line` (its 1-based
 * source start line), and injects — first in `<head>` — a
 * Content-Security-Policy `<meta>` and the bridge script. With `scripts`
 * false the policy lets only the nonced bridge run; with `scripts` true
 * the page's own inline and https scripts run too.
 */
export function annotateHtml(source: string, opts: { scripts: boolean; nonce: string }): string {
  const document = parse(source, { sourceCodeLocationInfo: true });
  annotateNode(document);

  const head = findHead(document);
  if (head) {
    const injected = parseFragment(
      `<meta http-equiv="Content-Security-Policy" content="${policy(opts.scripts, opts.nonce)}">` +
      `<script nonce="${opts.nonce}">${BRIDGE_SOURCE}</script>`,
    );
    for (const node of injected.childNodes) node.parentNode = head;
    head.childNodes.unshift(...injected.childNodes);
  }
  return serialize(document);
}
