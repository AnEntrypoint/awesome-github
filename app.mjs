// Buildless vanilla-JS site: no bundler, no npm install. Pulls the
// anentrypoint-design SDK (webjsx-based) straight from a CDN and mounts a
// TreeView over data/tree.json -- the same JSON the CI scraper maintains.
// Search/shell layout follows the SDK's own search kit pattern:
// https://anentrypoint.github.io/design/ui_kits/search/
// raw.githack.com, not unpkg: unpkg's npm-package resolution went stale
// once anentrypoint-design npm publishing stopped, and jsDelivr's GitHub-
// source equivalent caches a @main branch reference for up to 12h
// regardless of purge. githack fetches straight from GitHub with a 60s
// max-age instead.
import ds, { initTheme, onThemeChange } from 'https://raw.githack.com/AnEntrypoint/design/main/dist/247420.js';
import { buildIndex, search } from './search.mjs';

const { h, mount, loadCss, components } = ds;
const { AppShell, Topbar, Side, SearchInput, RowLink, Panel, TreeView, TreeItem, Status } = components;

await loadCss();
onThemeChange(({ resolved }) => {
  document.documentElement.setAttribute('data-theme', resolved);
});
initTheme();

const state = {
  tree: {},
  searchIndex: null,
  // Languages default expanded: main is content (actual repos), not a second
  // collapsed language+count summary that just repeats the sidebar's own nav
  // list until something is clicked open. `collapsed` (not `expanded`) so a
  // freshly-scraped language starts open without needing to be added here.
  collapsed: new Set(),
  filter: '',
  activeLang: '',
};

async function loadTree() {
  const res = await fetch('./data/tree.json', { cache: 'no-store' });
  const data = await res.json();
  state.tree = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  state.searchIndex = buildIndex(state.tree);
}

function sortedLanguages(tree) {
  return Object.keys(tree).sort((a, b) =>
    Object.keys(tree[b]).length - Object.keys(tree[a]).length);
}

function lastSeenKey(r) {
  return r.lastSeenAt || r.addedAt || '';
}

function sortedRepos(bucket) {
  return Object.entries(bucket).sort((a, b) =>
    lastSeenKey(b[1]).localeCompare(lastSeenKey(a[1])) || b[1].stars - a[1].stars);
}

// The design SDK's tree-row label uses CSS text-overflow:ellipsis, which by
// spec cuts at the character boundary, never a word boundary -- long
// descriptions were hard-cut mid-word. Truncating here at a word boundary
// before render means CSS ellipsis (still present as a fallback) rarely
// fires at all, and when it does the text already ends cleanly.
function truncateAtWord(text, maxLen) {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function searchResultsByLang(index, filter) {
  const hits = search(index, filter);
  if (hits === null) return null;
  const byLang = new Map();
  for (const { doc } of hits) {
    if (!byLang.has(doc.lang)) byLang.set(doc.lang, []);
    byLang.get(doc.lang).push([doc.fullName, doc.repo]);
  }
  return byLang;
}

function view(rerender) {
  const langs = sortedLanguages(state.tree);
  const totalRepos = langs.reduce((n, l) => n + Object.keys(state.tree[l]).length, 0);
  const filterActive = state.filter.trim().length > 0;
  const resultsByLang = filterActive ? searchResultsByLang(state.searchIndex, state.filter) : null;

  const setFilter = (value) => { state.filter = value; rerender(); };
  const toggleLang = (lang) => {
    if (state.collapsed.has(lang)) state.collapsed.delete(lang);
    else state.collapsed.add(lang);
    rerender();
  };
  const setActiveLang = (lang) => {
    state.activeLang = state.activeLang === lang ? '' : lang;
    rerender();
  };

  const visibleLangs = state.activeLang ? langs.filter((l) => l === state.activeLang) : langs;

  let totalMatched = 0;
  const langRows = visibleLangs.map((lang) => {
    const bucket = state.tree[lang];
    const repos = filterActive
      ? (resultsByLang.get(lang) || [])
      : sortedRepos(bucket);
    if (filterActive && repos.length === 0) return null;
    totalMatched += repos.length;

    if (filterActive) {
      return Panel({
        title: lang,
        count: repos.length,
        children: repos.map(([fullName, r]) =>
          RowLink({
            code: `${r.stars.toLocaleString()} stars`,
            title: fullName,
            sub: truncateAtWord(r.description || '', 160),
            href: r.url,
            target: '_blank',
          })
        ),
      });
    }

    const isExpanded = !state.collapsed.has(lang);
    const repoNodes = repos.map(([fullName, r]) =>
      TreeItem({
        label: h('a', {
          class: 'repo-link',
          href: r.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, `${fullName} `, h('span', { class: 'repo-desc' }, truncateAtWord(r.description || '', 100))),
        tag: `${r.stars.toLocaleString()} stars`,
        depth: 1,
      })
    );

    return TreeItem({
      label: lang,
      // Only shown collapsed: expanded, the same count sat pinned at the far
      // right with nothing else filling that space while the repos below
      // already carry their own star-count tags -- a plain repeat.
      tag: isExpanded ? null : `${repos.length}`,
      depth: 0,
      expanded: isExpanded,
      hasChildren: true,
      onToggle: () => toggleLang(lang),
      children: repoNodes,
    });
  }).filter(Boolean);

  const mainContent = filterActive && totalMatched === 0
    ? h('div', { class: 'empty' }, `no repos match "${state.filter}"`)
    : filterActive
      ? langRows
      : TreeView({ children: langRows });

  const sideSections = [{
    group: 'language',
    items: langs.map((lang) => ({
      label: lang,
      count: Object.keys(state.tree[lang]).length,
      active: state.activeLang === lang,
      onClick: (e) => { e.preventDefault(); setActiveLang(lang); },
    })),
  }];

  const topbar = Topbar({
    brand: 'awesome-github',
    search: SearchInput({
      value: state.filter,
      placeholder: 'Filter by name or description…',
      label: 'repositories',
      onInput: setFilter,
      resultCount: filterActive ? `${totalMatched} results` : `${totalRepos} repos across ${langs.length} languages`,
    }),
    items: [['Star on GitHub', 'https://github.com/AnEntrypoint/awesome-github']],
    themeToggle: true,
  });

  return AppShell({
    topbar,
    side: Side({ sections: sideSections }),
    main: mainContent,
    status: Status({
      left: ['Source: GitHub Trending (daily)', 'Data refreshed automatically by CI', 'Tree only grows -- entries are updated, never deleted, when they re-trend'],
    }),
  });
}

await loadTree();
mount(document.getElementById('app'), (rerender) => view(rerender));
