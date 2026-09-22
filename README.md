# CJK Search _(CJK-Search / cjk-search)_

Unicode and OpenCC character equivalence for native Obsidian search

在 Obsidian 原生全库搜索、Markdown Find 和 Open file 中互搜简繁、地区异体及兼容字符，保留输入原文、原生结果和高亮。当前为 **0.3.0 本地测试版**；为升级已有测试安装，插件 ID 暂用 `cjk-search-probe`，界面名称为 **CJK Search**。

## 安装

需要 Obsidian **1.13.7 或更新版本**。最低版本不等于所有后续版本均已验证；插件使用内部搜索接口。请先用独立测试库，不要直接安装到重要笔记库。

已安装并更新至 **0.3.0** 的测试库位于：

```text
experiments/native-search-spike/manual-test-vault/
```

在 Obsidian 库管理器中选择“打开本地仓库”，打开上面的文件夹；设置 → 第三方插件 → 允许第三方插件 → 启用 **CJK Search**。无需到社区商店搜索，本插件尚未发布。

更新插件文件后，关闭再启用插件，然后打开本插件设置检查四个英文开关。新版不再显示加载成功通知；若仍是旧名称或旧设置页，请关闭并重新打开这个测试库，刷新宿主缓存。

若手动安装到另一个可丢弃测试库，将 `dist/` 中以下文件复制到测试库的插件目录：

```text
.obsidian/plugins/cjk-search-probe/
├── main.js
├── manifest.json
├── THIRD_PARTY_NOTICES.md
└── LICENSES/
    ├── Unicode-LICENSE.txt
    └── OpenCC-LICENSE.txt
```

更新时保留现有 `data.json`；笔记不用转换或重写。本次安装已核对 5 个产物与实测版本一致，13 个非产物文件保持不变。英文设置、验收和安装回执见 [0.3.0 验证报告](docs/research/user-settings.md)；新入口细节及 iOS 复测清单见 [0.2.0 验证报告](docs/research/find-open-file.md)；[0.1.0 历史报告](docs/research/full-character-data.md)保留原结论。

## 使用

```text
⌘⇧F → 原生全库搜索
⌘F  → 当前 Markdown 笔记 Find（编辑／实时预览／阅读）
⌘O  → Open file（文件名／路径／别名，保留原生模糊匹配）
Windows/Linux 对应使用 Ctrl；以宿主实际快捷键设置为准。
体 → 也匹配 體
发 → 也匹配 發、髮
弁 → 也匹配 瓣、辨、辯、辩
⺅ → 也匹配 亻
株式会社 → 也匹配 ㍿
```

现有测试笔记可直接验证 `体／體`、`真／眞` 和标点。测试其他字符时，请自己新建含对应文字的笔记；更新程序不会覆盖或添加你的笔记。

设置 → **CJK Search**：

- **Search**：全库搜索增强。
- **Find**：当前 Markdown 笔记查找增强。
- **Quick switcher**：文件名、路径及别名增强。
- **Compatibility characters**：额外匹配 `①／1`、`²／2`、`Ａ／A`、`ﬃ／ffi` 等，可能增加结果。

四项默认开启，已保存的 true／false 保持不变。前三项独立控制，关闭后该入口保持原生行为。改变设置后重新输入查询。若原生 Search 或 Quick switcher 本身未启用，请在 **Core plugins** 中开启；本插件不会代为更改核心配置。界面目前仅英语，后续再支持 i18n。

关闭全量只移除插件新增关系，不禁用原生固有能力。例如原生编辑 Find 本来就可能匹配 `①／1`。**替换仍完全使用原生匹配，不扩大替换范围。**

### 开发命令

安装后的插件不需要 Node、Python 或网络。只有构建／自动化开发需要 Node 22、Python 3.12；桌面自动化还需要本机 Obsidian 与 Playwright。

```sh
npm ci --ignore-scripts
npm run data:build     # 验证已锁定输入，离线重建字表
npm test
npm run build
npm run test:native    # 全库；独立 macOS 临时实例
npm run test:surfaces  # Find／Open file；独立临时实例
npm run test:settings  # 英文设置／独立开关，并执行 Find／Open file 回归
npm run install:test   # 仅更新上面已有测试库的插件产物；旧文件备份在 .pi/plugin-backups/
```

只有缺少官方输入快照时才运行 `python3 scripts/build_data.py --fetch`，需要联网及已认证的 `gh`。已有锁不会自动更新；错误哈希会停止构建。

## 覆盖与边界

- Unicode **18.0.0**、OpenCC **1.4.2**。东亚模式含 **17,584** 个映射字符；默认开启的全量模式 **22,110** 个。这是表内字符数，不是全部地区标准覆盖率。
- 多义关系按批准的跨地区宽搜合并；例如 `发／發／髮`、`弁／瓣／辨／辯`，也可能通过所选关系连通其他不同义项。分组及来源见 [数据报告](data/report.json)。
- 排除地区词汇转换、形似混淆、专门语义关系及未经审核的一般语义关系。`鼠标／鼠標` 可互搜，不转换成 `滑鼠`。
- 全库只增强连续普通字面文本；空白、`path:`／`file:`、引号、括号、否定或正则等复杂查询整条保持原生。Find 的空格与斜杠按原生字面规则处理；Open file 保留原生模糊／简单匹配。
- Find 仅覆盖顶层 Markdown，不增强 PDF、Canvas、Bases、网页或嵌入编辑器。Open file 不为未解析链接或非文件书签追加等价匹配。
- Graph View 搜索／过滤尚未增强，后续实现后再提供开关。
- 不提供 IVS 忽略，不删除变体选择符，不承诺实现完整 NFKC 算法。
- 输入超过 256 个码位、展开超过 65,536 个 UTF-16 单元或 4,096 个分支节点时，明确回退原生，不截断候选。
- macOS / Obsidian 1.13.7 已实测；iOS 新入口等待用户复测，Android／Windows／Linux 未验收。不宣称真实大库或跨版本兼容已全部验证。完整验证状态见 [项目进度](TODO.md)。

## 诊断与隐私

macOS 按 **⌘⌥I**，Windows/Linux 按 **Ctrl+Shift+I** 打开开发者工具，在 Console 开启 **Info** 级别并筛选 `[CJK-Probe]`。命令面板执行 **CJK Search: Print diagnostics**。

重点查看 `loaded`、`attached`、`expanded`／`skipped`／`native-fallback`、`diagnostics`。全库／Find 的 `expanded` 表示安装或计算了增强匹配，Open file 会记录追加数量；`attached` 仅表示挂钩，不代表命中。`surface` 区分新入口，诊断数量只是当时的快照。接口不兼容或字表异常时保留原生搜索并提示。

运行时不联网，不上传日志；日志不输出搜索原文、笔记内容或路径，也不写入笔记。

## 贡献

目前是本地开发与测试项目，没有公开仓库或 PR 入口。请向项目维护者反馈可复现的查询、预期字符关系、Obsidian 版本和已脱敏日志；发布及贡献流程尚未制定。

## 许可

项目自有代码尚未指定开源许可（**UNLICENSED**），版权归相应作者；这不改变上游数据的许可。

Unicode 数据 © 1991–2026 Unicode, Inc.，采用 **Unicode-3.0**；OpenCC 数据采用 **Apache-2.0**。完整声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [LICENSES/](LICENSES/)。分发插件时须保留这些文件。
