const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createExpander, mapRanges } = require('../src/matcher.js');
const data = require('../data/character-data.json');
const expander = createExpander(data);
const escape = value => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
function matches(query, text, options = {}) {
  const result = expander.expand(query, options);
  assert.notEqual(result.status, 'fallback', `${query}: ${result.reason}`);
  return new RegExp(`^(?:${result.source ?? escape(query)})$`, options.caseSensitive ? '' : 'i').test(text);
}
function custom(entries) {
  const mode = { entries };
  return createExpander({ ...data, modes: { eastAsian: mode, full: mode } });
}

test('approved groups match symmetrically; excluded relationships stay distinct', () => {
  for (const group of ['体體', '真眞', '发發髮', '国國', '弁瓣辨辯辩', '⼈人', '⺅亻', '、､﹑'])
    for (const a of group) for (const b of group) assert(matches(a, b), `${a}/${b}`);
  for (const [a,b] of [['土','士'], ['未','末'], ['丼','井'], ['鼠标','滑鼠']]) assert(!matches(a,b));
  assert(matches('鼠标','鼠標'));
});
test('default and full compatibility modes are independent', () => {
  for (const [a,b] of [['①','1'], ['²','2'], ['Ａ','A'], ['ﬃ','ffi']]) {
    assert(!matches(a,b));
    assert(matches(a,b,{fullCompatibility:true}));
    assert(matches(b,a,{fullCompatibility:true}));
    assert(!matches(a,b));
  }
  assert(matches('㍿','株式會社'));
  assert(matches('株式會社','㍿'));
  assert(matches('ｶﾞ','ガ'));
  assert(matches('ガ','ｶﾞ'));
});
test('sequence candidates obey native case sensitivity', () => {
  assert(matches('FFI','ﬃ',{fullCompatibility:true,caseSensitive:false}));
  assert(!matches('FFI','ﬃ',{fullCompatibility:true,caseSensitive:true}));
  assert(matches('ﬃ','FFI',{fullCompatibility:true,caseSensitive:false}));
});
test('unsupported syntax stays native; regular expression metacharacters remain literal', () => {
  for (const query of ['path:a 体', '/体/', '"体"', '-体', '体 OR 真', '[体]', '体\\真'])
    assert.equal(expander.expand(query).reason, 'unsupported-syntax');
  assert.equal(expander.expand('').reason, 'empty-query');
  assert.equal(expander.expand('PRIVATEQUERYSENTINELxyz').reason, 'no-mapping');
  for (const c of ['.', '+', '*', '?', '$', '^', '|', '-']) {
    assert(matches(`体${c}`, `體${c}`));
    assert(!matches(`体${c}`, '體x'));
  }
});
test('overlapping sequences include every complete segmentation', () => {
  const result = custom([['①','ab'],['②','bc'],['③','abc']]).expand('abc',{caseSensitive:true});
  assert.equal(result.status,'expanded');
  const regex = new RegExp(`^(?:${result.source})$`);
  for (const value of ['①c','a②','③','abc']) assert(regex.test(value), value);
});
test('non-BMP ranges stay whole without the u flag', () => {
  const result = custom([['𠀀','一'],['一','一']]).expand('一');
  const regex = new RegExp(result.source, 'g');
  const match = regex.exec('前𠀀后');
  assert.equal(match.index,1);
  assert.equal(match[0].length,2);
  regex.lastIndex = 0;
  assert.equal(regex.exec('\ud840'),null);
  assert.equal(regex.exec('\udc00'),null);
});
test('input, pattern and branch budgets return no partial matcher', () => {
  assert.equal(expander.expand('体'.repeat(257)).reason, 'input-limit');
  const enormous = Array.from({length:15000}, (_,i) => [String.fromCodePoint(0x20000+i),'一']);
  const result = custom(enormous).expand('一');
  assert.equal(result.status,'fallback');
  assert.equal(result.reason,'branch-limit');
  assert.equal(result.nodes,4097);
  assert.equal(result.source,null);
  const overlapping = Array.from({length:64}, (_,i) => [String.fromCodePoint(0x3400+i),'a'.repeat(i+1)]);
  const bounded = custom(overlapping).expand('a'.repeat(200));
  assert.equal(bounded.status,'fallback');
  assert.equal(bounded.reason,'pattern-limit');
  assert.equal(bounded.source,null);
});
test('malformed data is rejected rather than silently repaired', () => {
  assert.throws(() => createExpander({...data,schema:99}));
  for (const entries of [[['\ud800','一']], [['a','']], [['ab','c']], [['a','b'],['a','c']], [['a','b'],['b','a']]])
    assert.throws(() => custom(entries));
});
test('literal entry accepts spaces and slash punctuation without changing vault syntax', () => {
  assert.equal(typeof expander.expandLiteral, 'function', 'Find needs a literal expansion entry');
  for (const query of ['体 / 真','-体','[体]','体\\真','体 体']) {
    assert.equal(expander.expand(query).reason, 'unsupported-syntax');
    const expanded = expander.expandLiteral(query, {caseSensitive:true});
    assert.equal(expanded.status, 'expanded');
    const target = query.replaceAll('体','體').replaceAll('真','眞');
    assert(new RegExp(`^(?:${expanded.source})$`).test(target));
  }
  assert.equal(expander.expandLiteral('体'.repeat(257)).reason, 'input-limit');
  assert.equal(expander.expandLiteral('\ud800').source, null);
  assert.equal(expander.expandLiteral('').reason, 'empty-query');
});
test('canonical strings map each expanded unit to original UTF-16 spans', () => {
  assert.equal(typeof expander.canonicalize, 'function');
  const mapped = expander.canonicalize('前ﬃ后', {fullCompatibility:true});
  assert.equal(mapped.text, '前ffi后');
  assert.deepEqual(mapped.spans, [[0,1],[1,2],[1,2],[1,2],[2,3]]);
  assert.deepEqual(mapRanges(mapped.spans, [[1,3],[3,4]]), [[1,2]]);
  const sequence = expander.canonicalize('㍿', {fullCompatibility:true});
  // The approved table chooses U+3291/U+3293 as class representatives, not display text.
  assert.equal(sequence.text, '㊑式会㊓');
  assert.equal(expander.canonicalize('株式会社',{fullCompatibility:true}).text, '㊑式会㊓');
  assert.deepEqual(sequence.spans, [[0,1],[0,1],[0,1],[0,1]]);
  const unicode = custom([['𠀀','𠀀']]).canonicalize('前𠀀后');
  assert.deepEqual(unicode.spans, [[0,1],[1,3],[1,3],[3,4]]);
  assert.deepEqual(mapRanges(unicode.spans, [[2,3]]), [[1,3]]);
  assert.deepEqual(custom([['𠀀','一']]).canonicalize('𠀀').spans, [[0,2]]);
  assert.equal(expander.canonicalize('①').text, '①');
  assert.equal(expander.canonicalize('①',{fullCompatibility:true}).text, '1');
  assert.equal(expander.canonicalize('FFI').text, 'FFI', 'Native matcher owns case semantics');
});
test('canonical budgets and invalid ranges fail without partial output', () => {
  assert.equal(typeof expander.canonicalize, 'function');
  for (const text of ['a'.repeat(65537), '\ud800']) {
    const mapped = expander.canonicalize(text);
    assert.equal(mapped.status, 'fallback');
    assert.equal(mapped.text, null); assert.equal(mapped.spans, null);
  }
  const expanding = custom([['①','a'.repeat(256)]]).canonicalize('①'.repeat(257));
  assert.equal(expanding.status,'fallback'); assert.equal(expanding.spans,null);
  assert.equal(expander.canonicalize('a'.repeat(65536)).text.length,65536);
  assert.deepEqual(mapRanges([[0,1],[1,2],[2,3]],[[2,3],[0,1],[1,2]]), [[0,3]]);
  for (const range of [[-1,1],[0,2],[0.1,1],[0,0],[NaN,1]])
    assert.throws(()=>mapRanges([[0,1]],[range]));
  assert.deepEqual(mapRanges([],[]),[]);
});

test('all generated entries and included relations match in both directions where syntax permits', t => {
  let checked = 0, syntaxSkipped = 0;
  const check = (a,b,options) => {
    const result = expander.expand(a,options);
    if (result.reason === 'unsupported-syntax' || result.reason === 'empty-query') { syntaxSkipped++; return; }
    assert.notEqual(result.status,'fallback', JSON.stringify({a,b,reason:result.reason}));
    const regex = new RegExp(`^(?:${result.source ?? escape(a)})$`);
    assert(regex.test(b), JSON.stringify({a,b,options}));
    checked++;
  };
  for (const [mode, {entries}] of Object.entries(data.modes)) {
    const options = {fullCompatibility:mode==='full',caseSensitive:true};
    for (const [a,b] of entries) { check(a,b,options); check(b,a,options); }
  }
  for (const line of fs.readFileSync('data/relations.jsonl','utf8').trim().split('\n')) {
    const row = JSON.parse(line);
    if (!row.included) continue;
    for (const mode of row.modes ?? ['eastAsian','full']) {
      const options = {fullCompatibility:mode==='full',caseSensitive:true};
      check(row.source,row.target,options); check(row.target,row.source,options);
    }
  }
  assert(checked>100000);
  t.diagnostic(JSON.stringify({checked,syntaxSkipped}));
});
