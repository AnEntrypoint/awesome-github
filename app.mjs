// Buildless vanilla-JS site: no bundler, no npm install. Pulls the
// anentrypoint-design SDK (webjsx-based) straight from a CDN and mounts a
// TreeView over data/tree.json -- the same JSON the CI scraper maintains.
import ds from 'https://unpkg.com/anentrypoint-design@latest/dist/247420.js';
import { buildIndex, search } from './search.mjs';

const { h, mount, loadCss, components } = ds;
const { TreeView, TreeItem } = components;

await loadCss();

const state = {
  tree: {},
  searchIndex: null,
  expanded: new Set(),
  filter: '',
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

function sortedRepos(bucket) {
  return Object.entries(bucket).sort((a, b) => b[1].stars - a[1].stars);
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

  const toggleLang = (lang) => {
    if (state.expanded.has(lang)) state.expanded.delete(lang);
    else state.expanded.add(lang);
    rerender();
  };

  const langNodes = langs.map((lang) => {
    const bucket = state.tree[lang];
    const repos = filterActive
      ? (resultsByLang.get(lang) || [])
      : sortedRepos(bucket);
    if (filterActive && repos.length === 0) return null;

    const isExpanded = state.expanded.has(lang) || filterActive;

    const repoNodes = repos.map(([fullName, r]) =>
      TreeItem({
        label: h('a', {
          class: 'repo-link',
          href: r.url,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, `${fullName} `, h('span', { class: 'repo-desc' }, r.description || '')),
        glyph: '📦',
        tag: `★ ${r.stars.toLocaleString()}`,
        depth: 1,
      })
    );

    return TreeItem({
      label: lang,
      glyph: '📁',
      tag: `${repos.length}`,
      depth: 0,
      expanded: isExpanded,
      hasChildren: true,
      onToggle: () => toggleLang(lang),
      children: repoNodes,
    });
  }).filter(Boolean);

  return h('div', { class: 'app-shell' },
    h('header', { class: 'site-header' },
      h('div', { class: 'site-header-row' },
        h('div', {},
          h('h1', {}, '🌳 awesome-github'),
          h('p', {}, 'A continuously refreshed tree of trending GitHub repositories, organized by language.')
        ),
        h('a', {
          class: 'star-cta',
          href: 'https://github.com/AnEntrypoint/awesome-github',
          target: '_blank',
          rel: 'noopener noreferrer',
        }, '⭐ Star on GitHub')
      )
    ),
    h('div', { class: 'toolbar-row' },
      h('input', {
        type: 'search',
        placeholder: 'Filter by name or description…',
        value: state.filter,
        oninput: (e) => { state.filter = e.target.value; rerender(); },
      }),
      h('span', { class: 'stats' }, `${totalRepos} repos across ${langs.length} languages`)
    ),
    h('main', {}, TreeView({ children: langNodes })),
    h('footer', { class: 'site-footer' },
      'Source: GitHub Trending (daily). Data refreshed automatically by CI. Tree only grows -- entries are updated, never deleted, when they re-trend.'
    )
  );
}

await loadTree();
mount(document.getElementById('app'), (rerender) => view(rerender));
