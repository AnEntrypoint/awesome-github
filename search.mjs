const FIELD_WEIGHTS = { fullName: 2.5, description: 1 };
const K1 = 1.2;
const B = 0.75;
const PREFIX_MIN_LENGTH = 2;
const PREFIX_WEIGHT = 0.4;

function tokenize(text) {
  if (typeof text !== 'string' || !text) return [];
  return text
    .toLowerCase()
    .normalize('NFKC')
    .match(/\p{L}[\p{L}\p{N}]*(?:[#+]+\p{L}?[\p{L}\p{N}]*)*|\p{N}+/gu) || [];
}

function buildIndex(tree) {
  const docs = [];
  for (const lang of Object.keys(tree)) {
    for (const [fullName, r] of Object.entries(tree[lang])) {
      docs.push({
        lang,
        fullName,
        repo: r,
        tokens: {
          fullName: tokenize(fullName),
          description: tokenize(r.description || ''),
        },
      });
    }
  }

  const postings = new Map();
  const fieldLengths = { fullName: [], description: [] };

  docs.forEach((doc, docIndex) => {
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const toks = doc.tokens[field];
      fieldLengths[field][docIndex] = toks.length;
      const counts = new Map();
      for (const t of toks) counts.set(t, (counts.get(t) || 0) + 1);
      for (const [term, count] of counts) {
        if (!postings.has(term)) postings.set(term, new Map());
        const entry = postings.get(term).get(docIndex) || {};
        entry[field] = count;
        postings.get(term).set(docIndex, entry);
      }
    }
  });

  const avgFieldLength = {};
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    const lens = fieldLengths[field];
    avgFieldLength[field] = lens.length
      ? lens.reduce((a, b) => a + b, 0) / lens.length
      : 0;
  }

  const sortedTerms = [...postings.keys()].sort();

  return { docs, postings, fieldLengths, avgFieldLength, docCount: docs.length, sortedTerms };
}

function prefixRange(sortedTerms, prefix) {
  let lo = 0;
  let hi = sortedTerms.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedTerms[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = sortedTerms.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedTerms[mid].startsWith(prefix)) lo = mid + 1;
    else hi = mid;
  }
  return sortedTerms.slice(start, lo);
}

function idf(index, term) {
  const df = index.postings.get(term)?.size || 0;
  if (df === 0) return 0;
  return Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
}

function scoreTermForDoc(index, docIndex, term, weight) {
  const termPostings = index.postings.get(term);
  if (!termPostings) return 0;
  const entry = termPostings.get(docIndex);
  if (!entry) return 0;
  const termIdf = idf(index, term);
  let score = 0;
  for (const field of Object.keys(FIELD_WEIGHTS)) {
    const tf = entry[field];
    if (!tf) continue;
    const fieldLen = index.fieldLengths[field][docIndex];
    const avgLen = index.avgFieldLength[field] || 1;
    const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (fieldLen / (avgLen || 1))));
    score += termIdf * norm * FIELD_WEIGHTS[field] * weight;
  }
  return score;
}

function expandQueryTerm(index, term) {
  const expansions = [{ term, weight: 1 }];
  if (term.length >= PREFIX_MIN_LENGTH) {
    for (const matched of prefixRange(index.sortedTerms, term)) {
      if (matched !== term) expansions.push({ term: matched, weight: PREFIX_WEIGHT });
    }
  }
  return expansions;
}

function scoreDoc(index, docIndex, expandedTerms) {
  let score = 0;
  for (const { term, weight } of expandedTerms) {
    score += scoreTermForDoc(index, docIndex, term, weight);
  }
  return score;
}

function search(index, query) {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return null;

  const expandedTerms = queryTerms.flatMap((term) => expandQueryTerm(index, term));

  const scored = [];
  for (let docIndex = 0; docIndex < index.docCount; docIndex++) {
    const score = scoreDoc(index, docIndex, expandedTerms);
    if (score > 0) scored.push({ doc: index.docs[docIndex], score });
  }

  scored.sort((a, b) => {
    const aKey = a.doc.repo.lastSeenAt || a.doc.repo.addedAt || '';
    const bKey = b.doc.repo.lastSeenAt || b.doc.repo.addedAt || '';
    return b.score - a.score || bKey.localeCompare(aKey) || b.doc.repo.stars - a.doc.repo.stars;
  });
  return scored;
}

export { buildIndex, search, tokenize };
