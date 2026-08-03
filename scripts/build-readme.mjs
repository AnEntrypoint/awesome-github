#!/usr/bin/env node
// Regenerates README.md from data/tree.json so the README always reflects
// what the scraper last found -- never hand-edited, always derived.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TREE_PATH = path.join(__dirname, '..', 'data', 'tree.json');
const README_PATH = path.join(__dirname, '..', 'README.md');

function sortedLanguages(tree) {
  return Object.keys(tree).sort((a, b) =>
    Object.keys(tree[b]).length - Object.keys(tree[a]).length);
}

function sortedRepos(bucket) {
  return Object.entries(bucket).sort((a, b) => b[1].stars - a[1].stars);
}

export function renderReadme(tree, { generatedAt } = {}) {
  const langs = sortedLanguages(tree);
  const totalRepos = langs.reduce((n, l) => n + Object.keys(tree[l]).length, 0);

  const lines = [];
  lines.push('# 🌳 awesome-github');
  lines.push('');
  lines.push('[![Stars](https://img.shields.io/github/stars/AnEntrypoint/awesome-github?style=social)](https://github.com/AnEntrypoint/awesome-github/stargazers)');
  lines.push('[![Last updated](https://img.shields.io/badge/updated-every%206%20hours-blue)](https://github.com/AnEntrypoint/awesome-github/actions/workflows/update.yml)');
  lines.push('[![Live site](https://img.shields.io/badge/live-flatspace%20tree-brightgreen)](https://anentrypoint.github.io/awesome-github/)');
  lines.push('');
  lines.push('**The best of GitHub, always up to date, zero manual curation.**');
  lines.push('');
  lines.push(`Every day this tree pulls what's trending across ${langs.length} languages and grows -- ` +
    'nothing is ever removed, only refreshed. No stale awesome-list, no dead links, no PRs to review.');
  lines.push('');
  lines.push('### 👉 [**Browse the live tree**](https://anentrypoint.github.io/awesome-github/) 👈');
  lines.push('');
  lines.push(`_${totalRepos} repos across ${langs.length} languages · last updated ${generatedAt}_`);
  lines.push('');
  lines.push('If this is useful, a ⭐ on the repo helps more people find it.');
  lines.push('');
  lines.push('## Table of contents');
  lines.push('');
  for (const lang of langs) {
    const count = Object.keys(tree[lang]).length;
    const anchor = lang.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${lang}](#${anchor}) (${count})`);
  }
  lines.push('');

  for (const lang of langs) {
    lines.push(`## ${lang}`);
    lines.push('');
    lines.push('| Repository | Description | Stars |');
    lines.push('| --- | --- | --- |');
    for (const [fullName, r] of sortedRepos(tree[lang])) {
      const desc = (r.description || '').replace(/\|/g, '\\|');
      lines.push(`| [${fullName}](${r.url}) | ${desc} | ${r.stars.toLocaleString()} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('This README is generated automatically by CI from `data/tree.json`. Do not edit it by hand -- edits will be overwritten on the next run.');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const tree = JSON.parse(await readFile(TREE_PATH, 'utf8'));
  const generatedAt = new Date().toISOString();
  const readme = renderReadme(tree, { generatedAt });
  await writeFile(README_PATH, readme, 'utf8');
  console.log(`README.md regenerated (${Object.keys(tree).length} languages).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
