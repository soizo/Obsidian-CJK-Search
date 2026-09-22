# CJK Search

让 Obsidian 搜索同时匹配简繁体、异体字和兼容字符，无需转换笔记。

[English](README.en-GB.md)

搜索 `体` 可以找到 `體`，搜索 `发` 可以找到 `發` 和 `髮`。插件直接扩展 Obsidian 原有的搜索、当前笔记查找和快速切换功能，不需要另开搜索窗口，也不会改写笔记。

## 安装

需要 Obsidian 1.13.7 或更新版本。插件依赖 Obsidian 的内部接口，建议先在测试库中试用。

1. 在 [Releases](https://github.com/soizo/Obsidian-CJK-Search/releases) 下载 `cjk-search-v<版本>.zip`。如果还没有发布版本，可以按下方说明从源码构建。
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

照常使用 Obsidian 的搜索功能即可：

```text
⌘⇧F    搜索整个仓库
⌘F     在当前 Markdown 笔记中查找
⌘O     快速切换文件
```

Windows 和 Linux 对应使用 `Ctrl`；如果你改过快捷键，以 Obsidian 的设置为准。

在「设置 → CJK Search」中可以分别开关以下功能：

| 设置 | 作用 |
| --- | --- |
| Search | 在全库搜索中匹配等价字符 |
| Find | 在当前笔记中匹配等价字符；替换仍使用 Obsidian 原有规则 |
| Quick switcher | 在文件名、路径和别名中匹配等价字符，保留原有模糊搜索 |
| Compatibility characters | 额外匹配 `① / 1`、`² / 2`、`Ａ / A`、`ﬃ / ffi` 等兼容字符 |

这些开关互不影响。关闭某个搜索入口的增强后，该入口恢复原有行为。修改设置后，请重新输入查询。Search 和 Quick switcher 还需要在 Obsidian 的核心插件中启用。

## 已知限制

- 目前已在 macOS / Obsidian 1.13.7 上验证。iOS 的查找和快速切换功能仍待复测，Android、Windows 和 Linux 尚未完成验证。
- 不增强关系图搜索与过滤，也不支持 PDF、Canvas、Bases、网页或嵌入编辑器。
- 带有 `path:`、`file:`、引号、括号、否定或正则表达式的复杂全库查询，仍按 Obsidian 原有规则处理。
- 只处理字符等价关系，不做地区词汇转换、形似字匹配或完整的 NFKC 规范化。
- 字符数据筛选自 Unicode 18.0.0 和 OpenCC 1.4.2，并不覆盖所有异体字或地区标准。

详细记录见[验证报告](docs/research/user-settings.md)、[数据报告](data/report.json)和[项目进度](TODO.md)。

## 隐私与问题反馈

插件运行时不联网，不上传搜索内容或日志，也不会改写笔记。默认仅记录警告和错误；诊断日志需手动触发，不包含搜索原文、笔记内容或路径。

遇到问题时，可以在命令面板运行 `CJK Search: Print diagnostics`，然后在开发者工具的 Console 中筛选 `[CJK-Probe]`。提交日志前仍请检查并移除私人信息。

欢迎通过 [Issues](https://github.com/soizo/Obsidian-CJK-Search/issues) 反馈问题或建议，或提交 Pull Request。报告问题时请提供 Obsidian 版本、操作系统、出问题的功能，以及能复现问题的最小示例和预期结果。

## 从源码构建

需要 Node.js 22、npm 和 Python 3。在项目目录中运行：

```sh
npm ci
npm test
npm run build
```

构建产物在 `dist/`，将其中所有文件复制到上面的插件目录即可。仓库已包含生成好的字符数据，普通构建不需要重新生成。

## 许可

代码采用 [MIT](LICENSE) 许可，版权归 CJK Search contributors 所有。

随插件分发的数据另受上游许可约束：Unicode 使用 Unicode License V3，OpenCC 使用 Apache License 2.0。构建后的 `main.js` 内嵌 MIT、Unicode、OpenCC 许可证全文与第三方声明，确保社区安装不会遗漏。分发插件时请保留这些注释；ZIP 包同时附带 [LICENSE](LICENSE)、[第三方声明](THIRD_PARTY_NOTICES.md)及 [LICENSES/](LICENSES/) 中的独立副本。
