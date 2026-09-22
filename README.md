# CJK Search _(CJK-Search / cjk-search)_

在 Obsidian 原生搜索、Find 和 Open file 中匹配简繁、地区异体及兼容字符，不改写你的笔记。

[English (British)](README.en-GB.md)

CJK Search 是一个 Obsidian 插件：它保留你输入的原文、原生结果与高亮，同时扩展字符等价匹配。

## 功能

- **Search**：在全库搜索中匹配等价 CJK 字符。
- **Find**：在当前 Markdown 笔记中匹配等价字符；替换仍完全使用原生匹配。
- **Quick switcher / Open file**：在文件名、路径和别名中匹配等价字符，并保留原生模糊搜索。
- **Compatibility characters**：可选匹配 `①／1`、`²／2`、`Ａ／A`、`ﬃ／ffi` 等兼容字符。
- 不修改笔记，不上传搜索内容，不依赖运行时网络连接。

例如，搜索 `体` 也可以找到 `體`，搜索 `发` 也可以找到 `發` 和 `髮`。

## 安装

当前版本需要 Obsidian **1.13.7 或更新版本**。插件使用 Obsidian 的内部搜索接口，建议先在可丢弃的测试库中安装。

### 手动安装

1. 从项目构建插件，或取得已有的 `dist/` 构建产物。
2. 在目标库中创建目录 `.obsidian/plugins/cjk-search-probe/`。
3. 将以下文件复制到该目录：

   ```text
   main.js
   manifest.json
   THIRD_PARTY_NOTICES.md
   LICENSES/
   ├── Unicode-LICENSE.txt
   └── OpenCC-LICENSE.txt
   ```

4. 在 Obsidian 的 **设置 → 第三方插件** 中启用插件。
5. 打开 **设置 → CJK Search**，按需启用各项功能。

更新插件时请保留已有的 `data.json`。笔记不需要转换或重写。

## 使用

```text
⌘⇧F       原生全库搜索
⌘F        当前 Markdown 笔记 Find
⌘O        Open file
```

Windows/Linux 使用对应的 `Ctrl` 快捷键；具体快捷键以 Obsidian 设置为准。

插件设置中的四个开关彼此独立：

- **Search**：全库搜索增强。
- **Find**：当前 Markdown 笔记查找增强。
- **Quick switcher**：文件名、路径及别名增强。
- **Compatibility characters**：额外匹配兼容字符。

前三项关闭后，对应入口恢复原生行为。改变设置后重新输入查询。若 Search 或 Quick switcher 未在 Obsidian 的 Core plugins 中启用，请先启用它们；插件不会代为修改核心配置。

## 限制

- 当前已在 macOS / Obsidian 1.13.7 上验证；iOS 新入口等待用户复测，Android、Windows 和 Linux 尚未完成验收。
- 不增强 Graph View 搜索／过滤、PDF、Canvas、Bases、网页或嵌入编辑器。
- 不进行地区词汇转换、形似混淆匹配或完整 NFKC 规范化。
- 复杂 Search 查询（如 `path:`、`file:`、引号、括号、否定和正则）保持原生行为。
- 使用 Unicode **18.0.0** 和 OpenCC **1.4.2** 的筛选数据；这不代表覆盖所有地区标准或全部异体字。

完整的验证结果、数据来源和已知限制见：

- [验证报告](docs/research/user-settings.md)
- [数据报告](data/report.json)
- [项目进度](TODO.md)
- [第三方数据声明](THIRD_PARTY_NOTICES.md)

## 隐私与诊断

插件运行时不联网，不上传日志，不读取或改写笔记。诊断日志不会输出搜索原文、笔记内容或路径。

如需排查问题，可在 Obsidian 中打开开发者工具的 Console，筛选 `[CJK-Probe]`，或执行命令面板中的 **CJK Search: Print diagnostics**。反馈问题时请附上 Obsidian 版本、平台、可复现查询和脱敏后的诊断信息。

## 贡献

欢迎提交可复现的问题、字符关系建议和代码改进。请先说明：

- Obsidian 版本与操作系统；
- 使用的入口（Search、Find 或 Open file）；
- 最小复现文本与预期结果；
- 脱敏后的诊断信息。

实现细节、数据构建和自动化验证见 `docs/` 与项目脚本。提交贡献时请保留 Unicode 与 OpenCC 的第三方声明及许可证文件。

## 许可

本项目代码采用 [MIT License](LICENSE)，SPDX 标识符为 `MIT`。版权归 CJK Search contributors 所有。

插件中包含的派生数据仍受其上游许可约束：Unicode 数据采用 Unicode License V3，OpenCC 数据采用 Apache License 2.0。分发时请一并保留 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 [LICENSES/](LICENSES/) 中的文件。
