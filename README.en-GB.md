# CJK Search _(CJK-Search / cjk-search)_

Match Simplified, Traditional, regional variant and compatibility characters in Obsidian's native Search, Find and Open file without changing your notes.

CJK Search is an Obsidian plugin that preserves your original input, native results and highlighting while expanding character-equivalence matching.

## Features

- **Search**: match equivalent CJK characters across your vault.
- **Find**: match equivalent characters in the current Markdown note; replacements still use native matching only.
- **Quick switcher / Open file**: match equivalent characters in file names, paths and aliases while retaining native fuzzy search.
- **Compatibility characters**: optionally match characters such as `①／1`, `²／2`, `Ａ／A` and `ﬃ／ffi`.
- Does not modify notes, upload search content or require a runtime network connection.

For example, searching for `体` can also find `體`; searching for `发` can also find `發` and `髮`.

## Installation

The current version requires Obsidian **1.13.7 or later**. The plugin uses Obsidian's internal search interfaces, so a disposable test vault is recommended.

### Manual installation

1. Build the plugin, or obtain an existing build from `dist/`.
2. Create `.obsidian/plugins/cjk-search-probe/` in the target vault.
3. Copy the following files into that directory:

   ```text
   main.js
   manifest.json
   THIRD_PARTY_NOTICES.md
   LICENSES/
   ├── Unicode-LICENSE.txt
   └── OpenCC-LICENSE.txt
   ```

4. Enable the plugin in **Settings → Community plugins**.
5. Open **Settings → CJK Search** and enable the features you want.

Keep the existing `data.json` when updating the plugin. Your notes do not need to be converted or rewritten.

## Usage

```text
⌘⇧F       Native vault Search
⌘F        Find in the current Markdown note
⌘O        Open file
```

Use the corresponding `Ctrl` shortcuts on Windows/Linux; the actual shortcuts are controlled by Obsidian.

The four plugin settings are independent:

- **Search**: enhance vault Search.
- **Find**: enhance Find in the current Markdown note.
- **Quick switcher**: enhance file names, paths and aliases.
- **Compatibility characters**: additionally match compatibility characters.

Disabling any of the first three restores native behaviour for that entry point. Enter the query again after changing a setting. If Search or Quick switcher is not enabled under Obsidian's Core plugins, enable it first; this plugin does not change core settings for you.

## Limitations

- Verified on macOS / Obsidian 1.13.7; the new iOS entry points still require user re-testing, and Android, Windows and Linux have not completed acceptance testing.
- Does not enhance Graph View search/filtering, PDF, Canvas, Bases, web pages or embedded editors.
- Does not perform regional phrase conversion, look-alike matching or complete NFKC normalisation.
- Complex Search queries such as `path:`, `file:`, quotes, brackets, negation and regular expressions retain native behaviour.
- Uses filtered data from Unicode **18.0.0** and OpenCC **1.4.2**; this does not claim coverage of every regional standard or all variant characters.

For full verification results, data sources and known limitations, see:

- [Verification report](docs/research/user-settings.md)
- [Data report](data/report.json)
- [Project status](TODO.md)
- [Third-party data notices](THIRD_PARTY_NOTICES.md)

## Privacy and diagnostics

The plugin does not connect to the network at runtime, upload logs, read note contents or rewrite notes. Diagnostic logs do not contain search text, note contents or paths.

For troubleshooting, open Obsidian's developer-tool Console and filter for `[CJK-Probe]`, or run **CJK Search: Print diagnostics** from the command palette. When reporting an issue, include the Obsidian version, platform, a reproducible query and redacted diagnostics.

## Contributing

Reproducible issues, character-equivalence suggestions and code improvements are welcome. Please include:

- Obsidian version and operating system;
- the entry point used (Search, Find or Open file);
- the smallest reproducing text and expected result;
- redacted diagnostic information.

Implementation details, data generation and automated verification are documented in `docs/` and the project scripts. Preserve the Unicode and OpenCC notices and licence files when contributing.

## Licence

The project code is released under the [MIT License](LICENSE), SPDX identifier `MIT`. Copyright belongs to CJK Search contributors.

Derived data bundled with the plugin remains subject to its upstream licences: Unicode data uses Unicode License V3, and OpenCC data uses the Apache License 2.0. When distributing the plugin, retain [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the files in [LICENSES/](LICENSES/).
