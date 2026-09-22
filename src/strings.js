'use strict';

// English only for now. Keep complete user-facing messages together for future i18n.
module.exports = {
  enhancements: 'Search enhancements',
  introduction: 'Match equivalent characters without changing your text.',
  matching: 'Character matching',
  nextSearch: 'Changes apply to your next search.',
  settings: {
    searchEnabled: {
      name: 'Search', description: 'Search across your vault.',
      unavailable: 'Search is disabled. Enable Search in Core plugins to use this feature.',
    },
    findEnabled: {
      name: 'Find', description: 'Search within the current Markdown note. Replacements stay unchanged.',
    },
    quickSwitcherEnabled: {
      name: 'Quick switcher', description: 'Match file names, paths, and aliases.',
      unavailable: 'Quick switcher is disabled. Enable Quick switcher in Core plugins to use this feature.',
    },
    fullCompatibility: {
      name: 'Compatibility characters',
      description: 'Also match forms such as ① / 1, Ａ / A, and ﬃ / ffi. Turning this off keeps built-in matching unchanged.',
    },
  },
  diagnostics: 'Print diagnostics',
  diagnosticsPrinted: 'Diagnostics written to the console. Filter by [CJK-Probe].',
  errors: {
    settingsLoad: 'Could not load settings. Defaults are used for this session; your settings file has not been changed.',
    settingsSave: 'Could not save this setting. Your previous choice is still active. Check vault access and try again.',
    dataInvalid: 'Character data could not be loaded. Built-in search is unchanged. Reload CJK Search to try again.',
    incompatible: 'This search interface is not supported. Built-in search is unchanged. Use Print diagnostics to help troubleshoot.',
    limit: 'This query exceeds the enhancement limit. Built-in search is used for this query.',
    nativeInterface: 'Search could not be enhanced. Built-in search is used instead. Use Print diagnostics to help troubleshoot.',
    enhancementUpdate: 'Could not update search enhancements. Reload CJK Search to try again.',
  },
};
