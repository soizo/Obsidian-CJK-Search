# CJK Search

Match Simplified, Traditional, regional variant, and compatibility characters in Obsidian without converting your notes.

[简体中文](README.zh-CN.md)

CJK Search enhances Obsidian's native Search, Find, Open file, Graph view, tag completion, and internal-link completion while preserving your original input and Obsidian's native interface. The plugin ID is `cjk-search-probe`, and its display name is **CJK Search**.

## Installation

Requires Obsidian 1.13.7 or later. The plugin relies on Obsidian's internal interfaces, so try it in a test vault first.

1. Download `cjk-search-v<version>.zip` from [Releases](https://github.com/soizo/Obsidian-CJK-Search/releases).
2. Create `.obsidian/plugins/cjk-search-probe/` inside your vault and extract the ZIP there. Do not add an extra enclosing folder:

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

3. Restart Obsidian and enable CJK Search under **Settings → Community plugins**.

To update, disable the plugin, replace the files listed above, then enable it again. Keep any existing `data.json` in the plugin directory because it contains your settings.

## Usage

```text
⌘⇧F → Search the vault
⌘F  → Find in the current Markdown note (Editing, Live Preview, and Reading views)
⌘O  → Open file (file names, paths, and aliases, with native fuzzy matching)
```

Use `Ctrl` on Windows and Linux. If you changed these shortcuts, use those configured in Obsidian.

Searching for `体` also finds `體`; searching for `发` also finds `發` and `髮`. The plugin does not add a separate search window or rewrite your notes.

Under **Settings → CJK Search**:

- **Language**: Follow Obsidian or choose one of nine languages. Simplified and Traditional Chinese (Mainland China) follow the specified *Table of General Standard Chinese Characters* scheme; the Taiwan and Hong Kong translations are generated with OpenCC 1.4.2.
- **Search**: Enhance vault-wide search.
- **Find**: Enhance Find in the current Markdown note.
- **Quick switcher**: Enhance file-name, path, and alias matching.
- **Graph view**: Enhance Filters and Groups in global and local Graph views.
- **Advanced graph queries**: Extend Graph view with `path:`, `file:`, `tag:`, and native logical combinations. Disabled by default.
- **Tags**: Enhance native tag completion after typing `#` in the Markdown editor.
- **Internal links**: Enhance file-name, path, and alias completion after typing `[[`.
- **Compatibility characters**: Also match pairs such as `① / 1`, `² / 2`, `Ａ / A`, and `ﬃ / ffi`.

All options except **Advanced graph queries** are enabled by default. Existing saved `true` and `false` values are preserved. Each entry point is controlled independently. Disabling Graph view preserves the advanced-query preference but prevents it from taking effect. Enable the native Search, Quick switcher, or Graph view under **Core plugins** when required.

Disabling full compatibility removes only relationships added by CJK Search; it does not disable Obsidian's native matching. Replace operations always use native matching and never receive the plugin's expanded match range.

## Known limitations

- Character data comes from Unicode 18.0.0 and OpenCC 1.4.2. East Asian mode contains 17,584 mapped characters; full compatibility mode contains 22,110.
- PDF, Canvas, Bases, web pages, and embedded editors are not enhanced. Find supports only top-level Markdown views.
- Complex vault queries, regular expressions, property conditions, and some Graph query subtrees retain native behaviour. Unknown structures or limit overruns fall back for the entire query.
- Tag and internal-link completion enhance only native `#` and `[[` completion in top-level Markdown editors.
- Input over 256 code points, expansion over 65,536 UTF-16 code units, or more than 4,096 branch nodes falls back to native behaviour.
- Tested on macOS with Obsidian 1.13.7. The new entry points still need re-testing on iOS; Android, Windows, and Linux have not completed acceptance testing.

See the [verification report](docs/research/user-settings.md), [editor completion report](docs/research/editor-suggestions.md), [Graph view report](docs/research/graph-view.md), [data report](data/report.json), and [project status](TODO.md) for details.

## Privacy and reporting issues

The plugin does not connect to the network at runtime, upload search content or logs, or rewrite notes. Only warnings and errors are logged by default. Diagnostics run only on request and do not include search text, note contents, or paths.

For diagnostics, run `CJK Search: Print diagnostics` from the command palette, then filter for `[CJK-Probe]` in the developer-tools Console. Check for private information before sharing logs.

Questions, bug reports, and suggestions are welcome in [Issues](https://github.com/soizo/Obsidian-CJK-Search/issues). Include your Obsidian version, operating system, affected feature, and a minimal example showing the problem and expected result.

## Building from source

You need Node.js 22, npm, and Python 3. Run these commands in the project directory:

```sh
npm ci
npm test
npm run build
npm run test:native
npm run test:surfaces
npm run test:settings
npm run test:graph
npm run test:completions
```

The build is written to `dist/`. Copy all its contents into the plugin directory shown above. Generated character data is already included in the repository; a normal build does not regenerate it.

## Licence

The code is released under the [MIT](LICENSE) licence. Copyright belongs to CJK Search contributors.

Bundled data is subject to its upstream licences: Unicode uses Unicode License V3, and OpenCC uses Apache License 2.0. The built `main.js` embeds the full MIT, Unicode, and OpenCC licence texts and third-party notices so community installations retain them. Keep these comments when distributing the plugin. ZIP packages also include standalone copies of [LICENSE](LICENSE), the [third-party notices](THIRD_PARTY_NOTICES.md), and [LICENSES/](LICENSES/).
