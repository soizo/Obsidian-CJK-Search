'use strict';

const LIMITS = Object.freeze({ input: 256, pattern: 65536, branches: 4096 });
const unsupported = /[\s/()[\]{}:"\\]|^-/;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const isScalar = value => typeof value === 'string' && [...value].length === 1 && !/[\uD800-\uDFFF]/u.test(value);
const result = (status, reason, source = null, nodes = 0) => ({ status, reason, source, nodes });

function createExpander(data) {
  if (data?.schema !== 1 || data.unicodeVersion !== '18.0.0' || data.openccVersion !== '1.4.2' ||
      data.openccCommit !== '025f371dc76b598d77384fbdab90c937471844d8') throw new Error('Invalid character data version');
  const modes = new Map();
  for (const name of ['eastAsian', 'full']) {
    const entries = data.modes?.[name]?.entries;
    if (!Array.isArray(entries) || entries.length > 100000) throw new Error('Invalid character data entries');
    const canonical = new Map();
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid mapping entry');
      const [source, key] = entry;
      if (!isScalar(source) || typeof key !== 'string' || !key || [...key].length > 256 ||
          ![...key].every(isScalar) || canonical.has(source)) throw new Error('Invalid mapping scalar or sequence');
      canonical.set(source, key);
    }
    for (const key of canonical.values()) {
      if ([...key].some(c => canonical.has(c) && canonical.get(c) !== c)) throw new Error('Nonterminal canonical sequence');
    }
    modes.set(name, { canonical, indexes: new Map() });
  }
  // Respect the host's *native regex i* semantics, not full Unicode case folding.
  // In particular, multi-character uppercase expansions are not scalar aliases.
  const folded = new Map();
  function fold(c) {
    if (!folded.has(c)) {
      const candidate = c.toUpperCase().toLowerCase();
      folded.set(c, isScalar(candidate) && new RegExp(`^${escapeRegex(c)}$`, 'i').test(candidate) ? candidate : c);
    }
    return folded.get(c);
  }
  function indexFor(mode, caseSensitive) {
    if (mode.indexes.has(caseSensitive)) return mode.indexes.get(caseSensitive);
    const root = new Map();
    for (const [source, key] of mode.canonical) {
      let node = root;
      for (const c of key) {
        const token = caseSensitive ? c : fold(c);
        if (!node.has(token)) node.set(token, new Map());
        node = node.get(token);
      }
      if (!node.has(null)) node.set(null, []);
      node.get(null).push(source);
    }
    mode.indexes.set(caseSensitive, root);
    return root;
  }

  function expand(query, options) {
    if (typeof query !== 'string') throw new TypeError('Query must be a string');
    if (unsupported.test(query)) return result('unchanged', 'unsupported-syntax');
    return expandLiteral(query, options);
  }

  function expandLiteral(query, { fullCompatibility = false, caseSensitive = false } = {}) {
    if (typeof query !== 'string') throw new TypeError('Query must be a string');
    if (!query) return result('unchanged', 'empty-query');
    if (query.length > LIMITS.input * 2) return result('fallback', 'input-limit');
    const input = [...query];
    if (input.length > LIMITS.input) return result('fallback', 'input-limit');
    if (!input.every(isScalar)) return result('unchanged', 'unsupported-syntax');
    const mode = modes.get(fullCompatibility ? 'full' : 'eastAsian');
    const tokens = [];
    for (const c of input) {
      for (const token of mode.canonical.get(c) ?? c) {
        if (tokens.length >= LIMITS.branches) return result('fallback', 'branch-limit', null, tokens.length);
        tokens.push(caseSensitive ? token : fold(token));
      }
    }
    const root = indexFor(mode, caseSensitive);
    const suffixes = new Array(tokens.length + 1);
    suffixes[tokens.length] = '';
    let nodes = 0;
    for (let start = tokens.length - 1; start >= 0; start--) {
      const ends = new Map([[start + 1, new Set([tokens[start]])]]);
      let node = root;
      for (let end = start; end < tokens.length; end++) {
        node = node.get(tokens[end]);
        if (!node) break;
        if (++nodes > LIMITS.branches) return result('fallback', 'branch-limit', null, nodes);
        const candidates = node.get(null);
        if (candidates) {
          if (!ends.has(end + 1)) ends.set(end + 1, new Set());
          for (const c of candidates) {
            if (++nodes > LIMITS.branches) return result('fallback', 'branch-limit', null, nodes);
            ends.get(end + 1).add(c);
          }
        }
      }
      const branches = [];
      let total = 0;
      // Prefer longer consumed sequences without discarding shorter alternatives.
      for (const [end, candidates] of [...ends].sort((a, b) => b[0] - a[0])) {
        const atoms = [...candidates].sort().map(escapeRegex);
        const atomLength = atoms.reduce((n, atom) => n + atom.length, 0) + (atoms.length > 1 ? atoms.length - 1 + 4 : 0);
        const length = atomLength + suffixes[end].length;
        if (length > LIMITS.pattern || total + length + branches.length + 4 > LIMITS.pattern)
          return result('fallback', 'pattern-limit', null, nodes);
        const atom = atoms.length === 1 ? atoms[0] : `(?:${atoms.join('|')})`;
        branches.push(atom + suffixes[end]);
        total += length;
      }
      suffixes[start] = branches.length === 1 ? branches[0] : `(?:${branches.join('|')})`;
    }
    // A plain case-only change does not need a replacement matcher.
    const literal = escapeRegex(caseSensitive ? query : input.map(fold).join(''));
    if (suffixes[0] === literal) return result('unchanged', 'no-mapping');
    return result('expanded', 'mapped', suffixes[0], nodes);
  }
  function canonicalize(text, { fullCompatibility = false } = {}) {
    if (typeof text !== 'string') throw new TypeError('Text must be a string');
    const fallback = reason => ({ status: 'fallback', reason, text: null, spans: null });
    if (text.length > LIMITS.pattern) return fallback('input-limit');
    const mode = modes.get(fullCompatibility ? 'full' : 'eastAsian');
    const parts = [], spans = [];
    let offset = 0;
    for (const character of text) {
      if (!isScalar(character)) return fallback('invalid-scalar');
      const key = mode.canonical.get(character) ?? character;
      if (spans.length + key.length > LIMITS.pattern) return fallback('pattern-limit');
      parts.push(key);
      for (let unit = 0; unit < key.length; unit++) spans.push([offset, offset + character.length]);
      offset += character.length;
    }
    const canonicalText = parts.join('');
    const changed = canonicalText !== text;
    return { status: changed ? 'mapped' : 'unchanged', reason: changed ? 'mapped' : 'no-mapping', text: canonicalText, spans };
  }
  return { expand, expandLiteral, canonicalize };
}

function mapRanges(spans, ranges) {
  if (!Array.isArray(spans) || !Array.isArray(ranges)) throw new TypeError('Invalid match ranges');
  const mapped = ranges.map(range => {
    if (!Array.isArray(range) || range.length !== 2) throw new TypeError('Invalid match range');
    const [start, end] = range;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > spans.length)
      throw new RangeError('Match range out of bounds');
    const from = spans[start]?.[0], to = spans[end - 1]?.[1];
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from)
      throw new RangeError('Invalid source span');
    return [from, to];
  }).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const range of mapped) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push(range);
  }
  return merged;
}

module.exports = { createExpander, mapRanges, LIMITS };
