# CJK Search

让 Obsidian 搜索同时匹配简繁体、异体字和兼容字符，无需转换笔记。

[English](README.md)

在 Obsidian 原生搜索、Find、Open file、Graph view 及标签／双链补全中匹配简繁、地区异体及兼容字符，保留输入原文和原生界面。插件 ID 为 `cjk-search-probe`，界面名称为 **CJK Search**。

## 安装

需要 Obsidian 1.13.7 或更新版本。插件依赖 Obsidian 的内部接口，建议先在测试库中试用。

1. 在 [Releases](https://github.com/soizo/Obsidian-CJK-Search/releases) 下载 `cjk-search-v<版本>.zip`。
2. 在仓库中创建 `.obsidian/plugins/cjk-search-probe/`，将 ZIP 解压到这个目录。不要再套一层文件夹：

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

3. 重启 Obsidian，在「设置 → 第三方插件」中启用 CJK Search。

更新时先禁用插件，用新版本覆盖上述文件，再重新启用。保留目录中已有的 `data.json`，它保存了你的设置。

## 使用

```text
⌘⇧F → 原生全库搜索
⌘F  → 当前 Markdown 笔记 Find（编辑／实时预览／阅读）
⌘O  → Open file（文件名／路径／别名，保留原生模糊匹配）
```

Windows/Linux 对应使用 Ctrl；以宿主实际快捷键设置为准。

搜索 `体` 可以找到 `體`，搜索 `发` 可以找到 `發` 和 `髮`。插件不需要另开搜索窗口，也不会改写笔记。

设置 → **CJK Search**：

- **Language**：跟随 Obsidian 或手动选择九种语言。繁体中文（大陆）按指定的《通用规范汉字表》规范繁体方案生成；台湾、香港版本由 OpenCC 1.4.2 转换生成。
- **Search**：全库搜索增强。
- **Find**：当前 Markdown 笔记查找增强。
- **Quick switcher**：文件名、路径及别名增强。
- **Graph view**：全局／局部图谱的 Filters 和 Groups 增强。
- **Advanced graph queries**：仅为图谱增强 `path:`、`file:`、`tag:` 及原生逻辑组合，默认关闭。
- **Tags**：Markdown 编辑器输入 `#` 时的标签补全增强。
- **Internal links**：输入 `[[` 时，增强文件名、路径和别名补全。
- **Compatibility characters**：额外匹配 `①／1`、`²／2`、`Ａ／A`、`ﬃ／ffi` 等。

除 Advanced graph queries 外均默认开启，已保存的 true／false 保持不变。各入口独立控制；关闭 Graph view 后，高级选项保留偏好但不生效。若原生 Search、Quick switcher 或 Graph view 未启用，请在 **Core plugins** 中开启。

关闭全量只移除插件新增关系，不禁用原生固有能力。替换仍完全使用原生匹配，不扩大替换范围。

## 已知限制

- Unicode 18.0.0、OpenCC 1.4.2。东亚模式含 17,584 个映射字符；全量模式 22,110 个。
- 不增强 PDF、Canvas、Bases、网页或嵌入编辑器。Find 仅覆盖顶层 Markdown。
- 复杂全库查询、正则、属性条件和部分 Graph 子树查询会保持原生规则；未知结构或超限时整条查询回退原生。
- 标签／双链仅增强顶层 Markdown 编辑器的 `#` 和 `[[` 原生补全。
- 输入超过 256 个码位、展开超过 65,536 个 UTF-16 单元或 4,096 个分支节点时回退原生。
- macOS / Obsidian 1.13.7 已实测；iOS 新入口等待复测，Android、Windows、Linux 未完成验收。

详细记录见[验证报告](docs/research/user-settings.md)、[编辑器补全报告](docs/research/editor-suggestions.md)、[图谱报告](docs/research/graph-view.md)、[数据报告](data/report.json)和[项目进度](TODO.md)。

## 隐私与问题反馈

插件运行时不联网，不上传搜索内容或日志，也不会改写笔记。默认仅记录警告和错误；诊断日志需手动触发，不包含搜索原文、笔记内容或路径。

遇到问题时，可以在命令面板运行 `CJK Search: Print diagnostics`，然后在开发者工具的 Console 中筛选 `[CJK-Probe]`。提交日志前仍请检查并移除私人信息。

欢迎通过 [Issues](https://github.com/soizo/Obsidian-CJK-Search/issues) 反馈问题或建议。报告问题时请提供 Obsidian 版本、操作系统、出问题的功能，以及能复现问题的最小示例和预期结果。

## 从源码构建

需要 Node.js 22、npm 和 Python 3。在项目目录中运行：

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

构建产物在 `dist/`，将其中所有文件复制到上面的插件目录即可。仓库已包含生成好的字符数据，普通构建不需要重新生成。

## 许可

代码采用 [MIT](LICENSE) 许可，版权归 CJK Search contributors 所有。

随插件分发的数据另受上游许可约束：Unicode 使用 Unicode License V3，OpenCC 使用 Apache License 2.0。构建后的 `main.js` 内嵌 MIT、Unicode、OpenCC 许可证全文与第三方声明，确保社区安装不会遗漏。分发插件时请保留这些注释；ZIP 包同时附带 [LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md)及 [LICENSES/](LICENSES/) 中的独立副本。
