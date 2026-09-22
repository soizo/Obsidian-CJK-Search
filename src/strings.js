'use strict';

const locales = {
  'zh-Hans': require('./locales/zh-Hans.json'),
  'zh-Hant-CN': require('./locales/zh-Hant-CN.json'),
  'zh-Hant-TW': require('./locales/zh-Hant-TW.json'),
  'zh-Hant-HK': require('./locales/zh-Hant-HK.json'),
  'en-GB': require('./locales/en-GB.json'),
  ja: require('./locales/ja.json'),
  'ko-KR': require('./locales/ko-KR.json'),
  'ko-KP': require('./locales/ko-KP.json'),
  vi: require('./locales/vi.json'),
};
const localeIds = Object.keys(locales);
function resolveLocale(choice = 'auto', host = 'en') {
  if (choice !== 'auto' && Object.prototype.hasOwnProperty.call(locales, choice)) return choice;
  if (typeof host !== 'string') return 'en-GB';
  const normalized = host.replace(/_/g, '-').toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-hans') || /zh-(cn|sg|my)/.test(normalized)) return 'zh-Hans';
  if (normalized.includes('zh-hant-cn')) return 'zh-Hant-CN';
  if (normalized.includes('zh-hant-hk') || /zh-(hk|mo)/.test(normalized)) return 'zh-Hant-HK';
  if (normalized.startsWith('zh-hant') || /zh-(tw)/.test(normalized)) return 'zh-Hant-TW';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('ko-kp')) return 'ko-KP';
  if (normalized.startsWith('ko')) return 'ko-KR';
  if (normalized.startsWith('vi')) return 'vi';
  return 'en-GB';
}

function getStrings(choice = 'auto', host = 'en') {
  return locales[resolveLocale(choice, host)];
}

module.exports = { locales, localeIds, resolveLocale, getStrings };
