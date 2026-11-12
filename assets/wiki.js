/* wiki.js — ページ切り替え、文書ナビ、検索、図の拡大 */

const pages = [...document.querySelectorAll(".wiki-page")];
const home = document.querySelector(".wiki-page[data-home]");
const sidebar = document.querySelector("#wiki-nav");
const menuButton = document.querySelector(".sidebar-toggle");
const wikiTitle = document.title;
const sidebarLinks = new Map([...sidebar.querySelectorAll("a")].map(link => [link.hash, link]));
let activePage;
let linkedHeadings = [];
let currentLink;
let navigationPosition;
let scrollFrame;

function markCurrent(heading) {
  const link = heading ? sidebarLinks.get("#" + encodeURIComponent(heading.id)) : undefined;
  if (link === currentLink) return;
  currentLink?.removeAttribute("aria-current");
  currentLink = link;
  if (!currentLink) return;
  currentLink.setAttribute("aria-current", "location");
  for (let branch = link.closest("details"); branch; branch = branch.parentElement.closest("details")) {
    branch.open = true;
  }
}

function followFragment() {
  const target = document.querySelector(":target");
  const page = target?.closest(".wiki-page");
  if (target && !page && activePage) return;
  activePage = page ?? home;
  for (const page of pages) page.hidden = page !== activePage;
  document.title = activePage.dataset.title + " | " + wikiTitle;
  linkedHeadings = [...activePage.querySelectorAll("article :is(h1,h2,h3,h4,h5,h6)[id]")]
    .filter(heading => sidebarLinks.has("#" + encodeURIComponent(heading.id)));
  const current = target ? linkedHeadings.findLast(heading =>
    heading === target || heading.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING) : undefined;
  markCurrent(current ?? linkedHeadings[0]);
  if (target) target.scrollIntoView();
  navigationPosition = window.scrollY;
}

window.addEventListener("hashchange", followFragment);
window.addEventListener("load", followFragment, { once: true });
window.addEventListener("scroll", () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (window.scrollY === navigationPosition) return;
    navigationPosition = undefined;
    const root = document.documentElement;
    const atBottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= root.scrollHeight - 1;
    markCurrent(atBottom ? linkedHeadings.at(-1) : linkedHeadings.findLast(heading => heading.getBoundingClientRect().top <= 8) ?? linkedHeadings[0]);
  });
}, { passive: true });

menuButton.hidden = false;
menuButton.addEventListener("click", () => {
  const expanded = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!expanded));
});
sidebar.addEventListener("click", event => {
  if (event.target.closest("a")) menuButton.setAttribute("aria-expanded", "false");
});

const searchInput = document.querySelector("#wiki-search");
const searchResults = document.querySelector("#search-results");
const searchStatus = document.querySelector("#search-status");
const searchMatches = document.querySelector("#search-matches");
const normalize = text => text.normalize("NFKC").toLowerCase();
const documents = [...document.querySelectorAll(".wiki-page article")].map(article => ({
  heading: article.querySelector("h1"),
  text: normalize(article.textContent),
}));

function search() {
  const query = normalize(searchInput.value.trim());
  searchResults.hidden = !query;
  searchMatches.replaceChildren();
  if (!query) return;

  const words = query.split(/\s+/);
  const matches = documents.filter(document => words.every(word => document.text.includes(word)));
  searchStatus.textContent = matches.length ? matches.length + " 件" : "一致する文書がありません";
  for (const match of matches) {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = "#" + encodeURIComponent(match.heading.id);
    link.textContent = match.heading.textContent;
    row.append(link);
    searchMatches.append(row);
  }
}

searchInput.disabled = false;
searchInput.addEventListener("input", search);
searchInput.form.addEventListener("submit", event => {
  event.preventDefault();
  searchMatches.querySelector("a")?.focus();
});
searchMatches.addEventListener("click", event => {
  if (event.target.closest("a")) searchResults.hidden = true;
});

const dialog = document.querySelector("#figure-dialog");
let zoomTrigger;
for (const button of document.querySelectorAll(".zoom-figure")) {
  button.hidden = false;
  button.addEventListener("click", () => {
    const image = button.closest("figure").querySelector("img");
    zoomTrigger = button;
    document.querySelector("#figure-title").textContent = image.alt;
    document.querySelector("#enlarged-figure").replaceChildren(image.cloneNode());
    dialog.showModal();
  });
}
dialog.addEventListener("close", () => zoomTrigger?.focus());

followFragment();
