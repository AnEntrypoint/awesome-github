#!/usr/bin/env node
// Scrapes github.com/trending/{language}?since=daily for a curated language
// set and upserts results into data/tree.json. Never deletes: an entry only
// disappears from trending, it never becomes wrong, so re-appearing later
// just refreshes stars/lastSeenAt on the same record.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TREE_PATH = path.join(__dirname, '..', 'data', 'tree.json');

// Curated ~40 major languages, using GitHub's trending URL slugs.
export const LANGUAGES = [
  'javascript', 'typescript', 'python', 'go', 'rust', 'java', 'c', 'c++', 'c#',
  'ruby', 'php', 'swift', 'kotlin', 'shell', 'html', 'css', 'dart', 'scala',
  'elixir', 'haskell', 'lua', 'r', 'julia', 'zig', 'objective-c', 'perl',
  'clojure', 'erlang', 'vim-script', 'dockerfile', 'jupyter-notebook', 'vue',
  'svelte', 'assembly', 'nim', 'crystal', 'ocaml', 'f#', 'powershell', 'solidity',
];

const UA = 'Mozilla/5.0 (compatible; awesome-github-tree-bot/1.0)';

async function fetchTrending(lang, since = 'daily') {
  const url = `https://github.com/trending/${encodeURIComponent(lang)}?since=${since}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

// Parses one github.com/trending page's HTML into repo records. Deliberately
// regex-based (no HTML parser dependency) since the trending page markup is
// small and stable: each entry is one <article class="Box-row"> block.
export function parseTrendingHtml(html, language) {
  const repos = [];
  const rows = html.split('<article class="Box-row">').slice(1);
  for (const row of rows) {
    const hrefMatch = row.match(/<h2[^>]*>[\s\S]*?href="\/([^"/]+)\/([^"/]+)"/);
    if (!hrefMatch) continue;
    const [, owner, name] = hrefMatch;
    const fullName = `${owner}/${name}`;

    const descMatch = row.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/);
    const description = descMatch ? decodeHtml(descMatch[1].trim()) : '';

    const starsMatch = row.match(/href="\/[^"]+\/stargazers"[^>]*>[\s\S]*?<\/svg>\s*([\d,]+)/);
    const stars = starsMatch ? parseInt(starsMatch[1].replace(/,/g, ''), 10) : 0;

    const todayMatch = row.match(/([\d,]+)\s+stars? today/);
    const starsToday = todayMatch ? parseInt(todayMatch[1].replace(/,/g, ''), 10) : 0;

    repos.push({
      fullName, owner, name, description, stars, starsToday,
      language,
      url: `https://github.com/${fullName}`,
    });
  }
  return repos;
}

// GitHub's description <p> can embed real markup (e.g. a docs-link <a> tag
// inside the text) -- stripped before entity-decoding so a literal <a
// href=...>text</a> never leaks into the display string, and so descriptions
// don't later get truncated mid-tag by CSS ellipsis, which is what produced
// the stray unmatched-bracket fragments users saw.
function stripTags(s) {
  return s.replace(/<[^>]*>/g, '');
}

function decodeHtml(s) {
  return stripTags(s)
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

async function loadTree() {
  try {
    return JSON.parse(await readFile(TREE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveTree(tree) {
  await writeFile(TREE_PATH, JSON.stringify(tree, null, 2) + '\n', 'utf8');
}

// Upserts a repo into tree[language][fullName]. New entries get addedAt;
// re-appearing entries keep their original addedAt but refresh stars/lastSeenAt.
function upsert(tree, repo, now) {
  const bucket = (tree[repo.language] ??= {});
  const existing = bucket[repo.fullName];
  bucket[repo.fullName] = {
    name: repo.name,
    owner: repo.owner,
    url: repo.url,
    description: repo.description,
    stars: repo.stars,
    starsToday: repo.starsToday,
    addedAt: existing?.addedAt ?? now,
    lastSeenAt: now,
  };
  return existing ? 'updated' : 'added';
}

async function main() {
  const now = new Date().toISOString();
  const tree = await loadTree();
  let added = 0, updated = 0, failed = 0;

  for (const lang of LANGUAGES) {
    try {
      const html = await fetchTrending(lang, 'daily');
      const repos = parseTrendingHtml(html, lang);
      for (const repo of repos) {
        const outcome = upsert(tree, repo, now);
        if (outcome === 'added') added++; else updated++;
      }
      console.log(`${lang}: ${repos.length} repos`);
    } catch (err) {
      failed++;
      console.error(`${lang}: FAILED - ${err.message}`);
    }
    // Be polite to GitHub's edge, avoid tripping abuse detection.
    await new Promise((r) => setTimeout(r, 400));
  }

  await saveTree(tree);
  console.log(`\nDone. added=${added} updated=${updated} failed=${failed}`);
}

import { pathToFileURL } from 'node:url';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
