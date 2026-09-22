const test = require('node:test');
const assert = require('node:assert/strict');
const i18n = require('../src/strings.js');

// Wrong script/region precedence would silently show the wrong Chinese or Korean variant.
test('automatic locale mapping respects scripts, regions, host aliases and safe fallback', () => {
  assert.equal(typeof i18n.resolveLocale, 'function');
  for (const [host, expected] of [
    ['zh', 'zh-Hans'], ['zh-CN', 'zh-Hans'], ['zh_SG', 'zh-Hans'],
    ['zh-TW', 'zh-Hant-TW'], ['zh-HK', 'zh-Hant-HK'], ['zh-MO', 'zh-Hant-HK'],
    ['zh-Hant', 'zh-Hant-TW'], ['zh-Hant-CN', 'zh-Hant-CN'],
    ['zh-Hans-TW', 'zh-Hans'], ['ZH_hant_hk', 'zh-Hant-HK'],
    ['en', 'en-GB'], ['en-US', 'en-GB'], ['en-GB', 'en-GB'],
    ['ja-JP', 'ja'], ['ko', 'ko-KR'], ['ko-KP', 'ko-KP'], ['ko_KR', 'ko-KR'],
    ['vi-VN', 'vi'], ['de', 'en-GB'], ['', 'en-GB'], [null, 'en-GB'],
    [{}, 'en-GB'], ['constructor', 'en-GB'], ['zh-invalid', 'en-GB'],
  ]) assert.equal(i18n.resolveLocale('auto', host), expected, String(host));
  assert.equal(i18n.resolveLocale('ko-KP', 'zh'), 'ko-KP');
  assert.equal(i18n.resolveLocale('__proto__', 'ja'), 'ja');
});

// Missing/empty translated leaves must fail here, not appear as undefined in a notice.
test('all nine dictionaries cover every setting, command and notice, preserving literal examples', () => {
  assert.equal(typeof i18n.getStrings, 'function');
  const ids = ['zh-Hans','zh-Hant-CN','zh-Hant-TW','zh-Hant-HK','en-GB','ja','ko-KR','ko-KP','vi'];
  assert.deepEqual(Object.keys(i18n.locales).sort(), ids.sort());
  function leaves(value, prefix = '') {
    return Object.entries(value).flatMap(([key, item]) => typeof item === 'string'
      ? [[prefix + key, item]] : leaves(item, prefix + key + '.'));
  }
  const base = leaves(i18n.getStrings('en-GB'));
  for (const id of ids) {
    const strings = i18n.getStrings(id);
    const translated = leaves(strings);
    assert.deepEqual(translated.map(([key]) => key).sort(), base.map(([key]) => key).sort(), id);
    assert(translated.every(([,value]) => value.trim().length > 0), id);
    for (const token of ['path:', 'file:', 'tag:']) assert(strings.settings.graphAdvancedQueries.description.includes(token), id);
    for (const token of ['①', '1', 'Ａ', 'A', 'ﬃ', 'ffi']) assert(strings.settings.fullCompatibility.description.includes(token), id);
    assert(strings.settings.internalLinksEnabled.description.includes('[['), id);
    assert(strings.settings.tagsEnabled.description.includes('#'), id);
    assert(strings.diagnosticsPrinted.includes('[CJK-Probe]'), id);
  }
  assert.notDeepEqual(i18n.getStrings('ko-KR'), i18n.getStrings('ko-KP'));
  assert.notDeepEqual(i18n.getStrings('zh-Hant-CN'), i18n.getStrings('zh-Hant-TW'));
  assert.notDeepEqual(i18n.getStrings('zh-Hant-HK'), i18n.getStrings('zh-Hant-TW'));
});
