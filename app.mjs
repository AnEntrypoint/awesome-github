// Buildless vanilla-JS site: no bundler, no npm install. Pulls the
// anentrypoint-design SDK (webjsx-based) straight from a CDN and mounts a
// TreeView over data/tree.json -- the same JSON the CI scraper maintains.
// Search/shell layout follows the SDK's own search kit pattern:
// https://anentrypoint.github.io/design/ui_kits/search/
import ds, { initTheme, onThemeChange } from 'https://unpkg.com/anentrypoint-design@latest/dist/247420.js';
import { buildIndex, search } from './search.mjs';

const { h, mount, loadCss, components } = ds;
const { AppShell, Topbar, Side, SearchInput, RowLink, Panel, TreeView, TreeItem } = components;

await loadCss();
onThemeChange(({ resolved }) => {
  document.documentElement.setAttribute('data-theme', resolved);
});
initTheme();

const state = {
  tree: {},
  searchIndex: null,
  expanded: new Set(),
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
    if (state.expanded.has(lang)) state.expanded.delete(lang);
    else state.expanded.add(lang);
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
            sub: r.description || '',
            href: r.url,
            target: '_blank',
          })
        ),
      });
    }

    const isExpanded = state.expanded.has(lang);
    const repoNodes = repos.map(([fullName, r]) =>
      TreeItem({
        label: h('a', {
          class: 'repo-link',
          href: r.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, `${fullName} `, h('span', { class: 'repo-desc' }, r.description || '')),
        tag: `${r.stars.toLocaleString()} stars`,
        depth: 1,
      })
    );

    return TreeItem({
      label: lang,
      tag: `${repos.length}`,
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
    status: h('footer', { class: 'site-footer' },
      'Source: GitHub Trending (daily). Data refreshed automatically by CI. Tree only grows -- entries are updated, never deleted, when they re-trend.'
    ),
  });
}

await loadTree();
mount(document.getElementById('app'), (rerender) => view(rerender));
