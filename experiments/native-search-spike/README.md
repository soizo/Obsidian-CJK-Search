# Native search feasibility probe — THROWAWAY

This is an experiment, not the production CJK Search plugin. It tests whether native search can use an expanded matcher without writing expanded text into its input.

## Scope

Only these hand-selected sample groups are included:

- `体／體`
- `真／眞`
- `人／⼈`
- `、／､／﹑`

Sources are documented in `../../docs/research/variant-data-sources.md` and the Unicode evidence files. The full Unicode/OpenCC datasets are **not** bundled or implemented here.

Only plain literal queries are expanded. Complex operators, quoted phrases, regex queries, full compatibility mode, general IVS handling, IME behavior, and performance on large vaults are not established by this experiment.

## 手动安装与查看日志（0.0.2）

**仅用可丢弃测试库。直接在 Obsidian 打开源码目录，不会自动加载插件。**

1. 把本目录最新的 **`main.js` 和 `manifest.json` 两个文件**复制到测试库的 `.obsidian/plugins/cjk-search-probe/`。若你更改过配置文件夹名称，用实际配置目录替代 `.obsidian`。
2. 在设置 → 第三方插件中允许第三方插件，刷新列表，启用 **CJK Search Feasibility Probe**。更新文件后关闭再启用插件；如果列表不刷新，重启测试库。
3. 应出现 **「CJK 探针 0.0.2 已加载」**通知。最低版本仍为 Obsidian **1.13.7**；低于它可能无法启用，不建议直接删掉版本限制。
4. 桌面打开开发者工具：macOS `Cmd+Option+I`，Windows/Linux `Ctrl+Shift+I`。到 **Console**，确认启用了 **Info** 日志级别，清除其他筛选，再筛选 `[CJK-Probe]`。
5. 打开原生**全库搜索**（`Cmd/Ctrl+Shift+F`，不是当前笔记内查找），输入 `体`，然后换成 `體`。请先创建分别含 `前体后`、`前體后` 的两篇测试笔记。启用插件不会自动重新执行已经显示的旧查询，需改动输入再搜索。
6. 命令面板搜索 **「打印诊断状态」**，执行本插件命令。把 `[CJK-Probe]` 日志复制回来，尤其是 `loaded`、`attached`、`expanded`／`skipped`、`diagnostics`。

日志仅输出到本机 Console，不写入笔记、不上传。默认**不记录搜索原文、展开原文、笔记内容、文件名或路径**；查询仅记录长度。构建标识应为 `probe-0.0.2-logs`，用于发现旧 `main.js` 未替换的问题。

| 事件 | 含义／排查方向 |
| --- | --- |
| `module-evaluated` | 新版 `main.js` 已被执行。完全没有：检查安装位置、是否启用、版本限制及 Console 筛选；也查看 Obsidian 自身的加载错误。 |
| `loaded` | 插件初始化开始，列出版本、平台及四组样例。还需看到后续 `attached` 才能确认搜索挂载。 |
| `layout-ready` / `scan-views` | 工作区准备完成／扫描现有原生搜索面板；`found` 是面板数量。 |
| `waiting-for-search` | 暂未发现原生全库搜索面板，打开全库搜索后再试。 |
| `attached` | 一个搜索面板挂载完成，`view` 用于关联该面板后续事件。 |
| `input` / `compositionstart` / `compositionend` | 搜索框收到输入／输入法组合事件；不代表已完成搜索。 |
| `expanded` | 样例 matcher 已安装，接下来由原生扫描；**不代表已找到结果**。`inputStillOriginal` 应为 `true`。 |
| `skipped` | `no-sample-mapping`：不含四组样例字符；`unsupported-syntax`：探针不展开该语法；`empty-query`：空查询。保留原生搜索。 |
| `native-fallback` | 编译增强 matcher 失败，保留原生 matcher；输出失败阶段和异常类型，不输出可能含查询的异常原文。 |
| `incompatible-view` | 预期内部方法缺失，无法挂载；保留原生搜索。 |
| `diagnostics` | 当前面板、接口、累计输入／编译／展开／跳过／回退次数、最后处理结果。`hookStillOwned: false` 表示当前方法不再是我们的包装；命中数只是执行命令时的快照。 |
| `unloaded` | 插件卸载及恢复的方法数量。 |

若有 `input` 却一直没有 `expanded` 或 `skipped`，执行诊断命令，检查是否挂载、接口是否改变，或原生尚未编译查询。**不要把当前日志当成已解决所有手动使用问题的证明**；它用于定位失败环节。

## Run on this development machine

Requires Node.js, the locally installed `playwright` package, and `/Applications/Obsidian.app`.

```sh
node experiments/native-search-spike/run.cjs
```

A new temporary profile and synthetic vault are created on each run. The runner connects to the installed app's renderer CDP endpoint, verifies the actual vault path, runs assertions, closes its own process, and leaves `evidence.json` (including captured `[CJK-Probe]` logs) and (when reached) `native-results.png` / `native-opened.png` in the printed temporary directory. It does not open the user's real vault.

The runner uses `--use-mock-keychain` **only for this disposable, credential-free test profile**. Never sign into an account or store real secrets in this profile. The option is not part of the plugin and must not be used as a production security configuration.

To reproduce the expected failing native baseline:

```sh
node experiments/native-search-spike/run.cjs --baseline
```

That run should fail because literal native search for `體` finds only one fixture, rather than both `体` and `體` fixtures. Startup or connection failures are not valid red evidence.

## Experimental mechanism

`main.js` patches each native search view's internal `renderSearchInfo` call. In the observed desktop version, this call occurs after the native query object is created but before file scanning begins. The probe replaces only that query object's matcher and required inputs, preserving the raw query and input component. Original source content, matching offsets and rendering remain native.

This is an **unsupported internal hook**, not a public Obsidian API. The experiment does not establish compatibility with other versions or other plugins. Disabling restores the method; the next search uses native behavior again.

## Mobile handoff

The user will test iOS and Android. No mobile pass is claimed. The probe has no Node/Electron runtime dependency and has `isDesktopOnly: false`, but these facts alone do not establish mobile compatibility.

For a disposable mobile test vault, copy `main.js` and `manifest.json` into `.obsidian/plugins/cjk-search-probe/`, enable community plugins and this probe, then create notes containing the sample groups. Search both directions and check that the original input, results and highlights remain correct. Disable the probe and repeat a search to verify native behavior returns. Do not use the probe in a real vault containing important notes.

Minimum Obsidian version in the manifest reflects the desktop version targeted by this experiment, not a proven compatibility matrix.
