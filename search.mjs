const FIELD_WEIGHTS = { fullName: 2.5, description: 1 };
const K1 = 1.2;
const B = 0.75;

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

  return { docs, postings, fieldLengths, avgFieldLength, docCount: docs.length };
}

function idf(index, term) {
  const df = index.postings.get(term)?.size || 0;
  if (df === 0) return 0;
  return Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
}

function scoreDoc(index, docIndex, queryTerms) {
  let score = 0;
  for (const term of queryTerms) {
    const termPostings = index.postings.get(term);
    if (!termPostings) continue;
    const entry = termPostings.get(docIndex);
    if (!entry) continue;
    const termIdf = idf(index, term);
    for (const field of Object.keys(FIELD_WEIGHTS)) {
      const tf = entry[field];
      if (!tf) continue;
      const fieldLen = index.fieldLengths[field][docIndex];
      const avgLen = index.avgFieldLength[field] || 1;
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (fieldLen / (avgLen || 1))));
      score += termIdf * norm * FIELD_WEIGHTS[field];
    }
  }
  return score;
}

function search(index, query) {
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) return null;

  const scored = [];
  for (let docIndex = 0; docIndex < index.docCount; docIndex++) {
    const score = scoreDoc(index, docIndex, queryTerms);
    if (score > 0) scored.push({ doc: index.docs[docIndex], score });
  }

  scored.sort((a, b) => b.score - a.score || b.doc.repo.stars - a.doc.repo.stars);
  return scored;
}

export { buildIndex, search, tokenize };
