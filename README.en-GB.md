# CJK Search

Match Simplified, Traditional, variant and compatibility characters in Obsidian without converting your notes.

[简体中文](README.md)

Searching for `体` also finds `體`; searching for `发` also finds `發` and `髮`. The plugin extends Obsidian's existing Search, Find and Quick switcher. There is no separate search window, and your notes stay unchanged.

## Installation

Requires Obsidian 1.13.7 or later. The plugin relies on Obsidian's internal interfaces, so try it in a test vault first.

1. Download `cjk-search-v<version>.zip` from [Releases](https://github.com/soizo/Obsidian-CJK-Search/releases). If no release is available yet, follow the build instructions below.
2. Create `.obsidian/plugins/cjk-search-probe/` inside your vault and extract the ZIP there. Do not add an extra enclosing folder:

   ```text
   .obsidian/plugins/cjk-search-probe/
   ├── main.js
   ├── manifest.json
   ├── THIRD_PARTY_NOTICES.md
   └── LICENSES/
       ├── Unicode-LICENSE.txt
       └── OpenCC-LICENSE.txt
   ```

3. Restart Obsidian and enable CJK Search under Settings → Community plugins.

To update, disable the plugin, replace the files listed above, then enable it again. Keep any existing `data.json` in the plugin directory: it contains your settings.

## Usage

Use Obsidian's search commands as usual:

```text
⌘⇧F    Search the vault
⌘F     Find in the current Markdown note
⌘O     Open the Quick switcher
```

Use `Ctrl` on Windows and Linux. If you have changed your shortcuts, use those configured in Obsidian.

Under Settings → CJK Search, you can toggle each feature separately:

| Setting | What it does |
| --- | --- |
| Search | Match equivalent characters across the vault |
| Find | Match equivalent characters in the current note; replacements still use Obsidian's original rules |
| Quick switcher | Match equivalent characters in file names, paths and aliases, alongside native fuzzy search |
| Compatibility characters | Also match pairs such as `① / 1`, `² / 2`, `Ａ / A` and `ﬃ / ffi` |

The switches are independent. Turning off an enhancement restores the original behaviour for that search feature. Re-enter your query after changing a setting. Search and Quick switcher must also be enabled in Obsidian's Core plugins.

## Known limitations

- Tested on macOS with Obsidian 1.13.7. Find and Quick switcher on iOS still need re-testing; Android, Windows and Linux have not been fully verified.
- Does not extend Graph view search or filtering, or support PDF, Canvas, Bases, web pages or embedded editors.
- Complex vault queries containing `path:`, `file:`, quotes, brackets, negation or regular expressions follow Obsidian's original rules.
- Matches equivalent characters only. It does not convert regional phrases, match look-alike characters or perform full NFKC normalisation.
- Character data is selected from Unicode 18.0.0 and OpenCC 1.4.2. It does not cover every variant character or regional standard.

See the [verification report](docs/research/user-settings.md), [data report](data/report.json) and [project status](TODO.md) for details.

## Privacy and reporting issues

The plugin does not connect to the network at runtime, upload search content or logs, or rewrite notes. Diagnostic logs do not include search text, note contents or paths.

For diagnostics, run `CJK Search: Print diagnostics` from the command palette, then filter for `[CJK-Probe]` in the developer-tool Console. Check for private information before sharing any logs.

Questions, bug reports and suggestions are welcome in [Issues](https://github.com/soizo/Obsidian-CJK-Search/issues), as are pull requests. For a bug report, include your Obsidian version, operating system, the affected feature, and a small example showing the problem and expected result.

## Building from source

You need Node.js 22, npm and Python 3. Run these commands in the project directory:

```sh
npm ci
npm test
npm run build
```

The build is written to `dist/`. Copy all its contents into the plugin directory shown above. Generated character data is already included in the repository; a normal build does not need to regenerate it.

## Licence

The code is released under the [MIT](LICENSE) licence. Copyright belongs to CJK Search contributors.

Bundled data is subject to its upstream licences: Unicode uses Unicode License V3, and OpenCC uses Apache License 2.0. Retain the [third-party notices](THIRD_PARTY_NOTICES.md) and the licence files in [LICENSES/](LICENSES/) when distributing the plugin.
