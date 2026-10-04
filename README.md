# CJK Search

Match equivalent CJK and compatibility characters throughout Obsidian without changing your notes.

CJK Search extends Obsidian’s native Search, Find, Quick switcher, move dialogue, Graph view, and editor suggestions. Searching for `体` can find `體`; searching for `发` can find both `發` and `髮`. The plugin keeps your original query, note text, interface, and native actions unchanged.

## Contents

- [Install](#install)
- [Usage](#usage)
- [Settings](#settings)
- [Known limitations](#known-limitations)
- [Privacy and diagnostics](#privacy-and-diagnostics)
- [Build from source](#build-from-source)
- [Contributing](#contributing)
- [Licence](#licence)

## Install

CJK Search requires Obsidian 1.13.7 or later. It relies on internal Obsidian interfaces, so try it in a test vault before using it with important data.

1. Download `cjk-search-v<version>.zip` from [Releases](https://github.com/soizo/Obsidian-CJK-Search/releases).
2. Create `.obsidian/plugins/cjk-search-probe/` inside your vault.
3. Extract the archive directly into that directory, without an extra enclosing folder:

   ```text
   .obsidian/plugins/cjk-search-probe/
   ├── main.js
   ├── manifest.json
   ├── LICENSE
   ├── THIRD_PARTY_NOTICES.md
   └── LICENSES/
       ├── Unicode-LICENSE.txt
       └── OpenCC-LICENSE.txt
   ```

4. Restart Obsidian, then enable **CJK Search** under **Settings → Community plugins**.

To update, disable the plugin, replace the installed files, and enable it again. Keep the existing `data.json`; it contains your settings.

## Usage

Use Obsidian’s normal commands:

```text
⌘⇧F    Search the vault
⌘F     Find in the current Markdown note
⌘O     Open the Quick switcher
```

Use `Ctrl` on Windows and Linux. If you have customised these shortcuts, use the bindings configured in Obsidian.

The plugin also enhances:

- folder matching in **Files → Move file** and the move-current-file command;
- global and local Graph view filters and groups;
- tag suggestions after `#` in the Markdown editor; and
- internal-link suggestions after `[[`.

CJK Search adds equivalent matches to native results. It does not provide a separate search window, rewrite queries, rename files, convert text, or alter replacement and move operations.

## Settings

Open **Settings → CJK Search**. Each feature can be controlled independently.

| Setting | Behaviour |
| --- | --- |
| Language | Follow Obsidian’s language or use one of nine interface languages |
| Search | Match equivalent characters across the vault |
| Find | Match within the current Markdown note; replacement keeps Obsidian’s original rules |
| Quick switcher | Match file names, paths, and aliases alongside native fuzzy search |
| Folder search | Match folder names and paths while preserving native move restrictions and folder creation |
| Graph view | Match in global and local graph filters and groups |
| Advanced graph queries | Extend `path:`, `file:`, and `tag:` graph filters; disabled by default |
| Tags | Extend native tag suggestions while inserting the original tag |
| Internal links | Extend file-name, path, and alias suggestions while inserting the original target |
| Compatibility characters | Also match forms such as `① / 1`, `² / 2`, `Ａ / A`, and `ﬃ / ffi` |

All settings except **Advanced graph queries** are enabled by default. Existing Boolean preferences are preserved. Disabling an enhancement restores native matching for that feature.

Search, Quick switcher, and Graph view must also be enabled under Obsidian’s **Core plugins**. Disabling Graph view preserves the advanced-query preference but prevents it from taking effect.

## Known limitations

- Character data is selected from Unicode 18.0.0 and OpenCC 1.4.2. East Asian mode contains 17,584 mapped characters; compatibility mode contains 22,110.
- Equivalent characters are matched, but regional phrases, lookalike characters, and full NFKC normalisation are not.
- PDF, Canvas, Bases, web pages, and embedded editors are not enhanced. Find covers top-level Markdown only.
- Complex vault queries, regular expressions, property conditions, and some Graph view query subtrees retain native behaviour. Unknown structures and bounded-expansion failures fall back to native matching.
- Tag and internal-link suggestions cover the native `#` and `[[` completions in top-level Markdown editors.
- Folder search covers Obsidian’s native move dialogue, not third-party folder pickers. Obsidian remains responsible for eligible destinations, folder creation, and the move itself.
- Inputs over 256 code points, expansions over 65,536 UTF-16 code units, or more than 4,096 branch nodes fall back to native behaviour.
- macOS with Obsidian 1.13.7 has been tested. Newer iOS entry points need re-testing; Android, Windows, and Linux have not been fully verified.

Implementation and verification notes are available in [`docs/research/`](docs/research/). Character-source details are recorded in the [data report](data/report.json).

## Privacy and diagnostics

The plugin does not connect to the network at runtime, upload search content or logs, or rewrite notes. It records only warnings and errors by default. On-request diagnostics do not contain query text, note contents, file names, or paths.

To collect diagnostics, run **CJK Search: Print diagnostics** from the command palette, open the developer-tools Console, and filter for `[CJK-Probe]`. Check any output for private information before sharing it.

Report problems through [GitHub Issues](https://github.com/soizo/Obsidian-CJK-Search/issues). Include your Obsidian version, operating system, affected feature, expected result, and the smallest example that reproduces the problem.

## Build from source

Building requires Node.js 22, npm, and Python 3.

```sh
npm ci
npm test
npm run build
```

The build is written to `dist/`. Copy all files from that directory into `.obsidian/plugins/cjk-search-probe/`.

Generated character data is already included, so a normal build does not regenerate it. Desktop integration checks are available separately:

```sh
npm run test:native
npm run test:surfaces
npm run test:folders
npm run test:settings
npm run test:graph
npm run test:completions
```

These checks launch an isolated Obsidian test vault and require the local test environment described by the research notes.

## Contributing

Questions, bug reports, and focused pull requests are welcome. Open an [issue](https://github.com/soizo/Obsidian-CJK-Search/issues) before undertaking a large behavioural change so that its scope and compatibility risks can be agreed first.

Before submitting a pull request, run:

```sh
npm test
npm run build
```

Keep changes focused, preserve native Obsidian behaviour when an enhancement is disabled or unsupported, and update the relevant research note when changing an integration surface or character-data source.

## Licence

The code is released under the [MIT Licence](LICENSE), copyright © 2026 CJK Search contributors.

Bundled data remains subject to its upstream licences: Unicode License V3 and Apache License 2.0 for OpenCC-derived data. See [Third-party data notices](THIRD_PARTY_NOTICES.md) and the standalone texts in [`LICENSES/`](LICENSES/). The build embeds these notices in `main.js`; retain them when distributing the plugin.
