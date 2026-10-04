# 移动文件的文件夹搜索

## 范围与实现

用户批准增强 Files 右键「移动文件」的「搜索文件夹」，并增加默认开启、独立于 Quick switcher 的 Folder search 设置。九种语言均有对应文案；已保存的布尔值保持不变。

- `src/folder-search.js` 复用 `createMappedSearch` 与原生 fuzzy scorer，合并原生结果与新增等价字符结果；保留原始 TFolder、原生分值、UTF-16 高亮范围和排序方法。
- 候选只来自弹窗的 `getItems()`，不自行遍历 vault。原生会过滤待移动文件夹自身及后代；移动、同名冲突处理、空查询及 Shift+Enter 新建均仍由 Obsidian 负责。
- Obsidian 1.13.7 未提供可用的活动移动弹窗引用。本入口使用 `FuzzySuggestModal.prototype.getSuggestions` 的受限包装，不沿用 Quick switcher 的实例发现方式。仅对同一 app、直接子类且符合移动弹窗结构的对象增强，并验证候选为 TFolder；其他弹窗或未知结构返回原生结果。
- 禁用时恢复仍由本插件持有的方法；外来包装保留，退休引用不再增强。超限或接口异常整次回退原生，日志不包含查询、目录名或路径。

## 验证

命令：`npm test`、`npm run build`、`npm run test:folders`。其他入口使用原有 `test:settings`（包含 Find/Open file）、`test:native`、`test:graph`、`test:completions`。

- 设置默认值和适配器单元测试观察到预期 RED 后实现，再转 GREEN。
- 第一轮：10 Python＋71 Node 测试通过，构建通过；真实 macOS / Obsidian 1.13.7 文件夹测试通过。
- 真实测试从 Files 右键启动移动弹窗，覆盖简繁、路径、不连续 fuzzy、兼容字符、原文高亮、实际移动与字节不变、自身／后代排除、独立开关、超限回退和卸载。已读取检查截图：输入 `体研`，原路径 `檔案/體育研究` 保留并高亮 `體`／`研`。
- 隔离测试的辅助插件仅将系统菜单切为 Obsidian HTML 菜单，以便 Playwright 点击同一右键动作；另记录弹窗实例用于断言。生产代码不依赖测试插件或全局测试变量。
- 文件夹补验通过：Shift+Enter 按输入原文创建 `新字體` 并移动原文件，关闭设置后重载插件仍保持关闭，再启用及卸载均恢复预期行为。所有人工笔记最终逐字节不变，`pageErrors: []`。
- 旧入口最终复验通过：设置（9 个开关）、独立 Find/Open file、全库搜索、图谱及编辑器补全均退出 0，`pageErrors: []`，使用与文件夹测试相同的构建哈希。
- 保留异常记录：含设置操作的测试曾两次在 `surfaces.cjs:307` 卸载后阅读 Find 检查失败（预期 2，实际 0）。未修改 Find 或其测试；HEAD 对照和当前构建独立复跑均通过，最后当前构建的设置整条流程也通过。根因未证实，不把复跑成功表述为已修复该间歇问题。

本地证据：[文件夹结果](evidence/folder-search/folders.json)、[截图](evidence/folder-search/folder-search.png)、[运行日志](evidence/folder-search/folders.log)、[最终设置回归](evidence/folder-search/settings.json)、[Find/Open file](evidence/folder-search/surfaces.json)、[全库](evidence/folder-search/native.json)、[图谱](evidence/folder-search/graph.json)、[补全](evidence/folder-search/completions.json)、[保留的 Find 失败](evidence/folder-search/settings-first-failure.json)。已验收 `main.js` SHA-256：`0b01b13bfde09387dbb59060205a3b4b293d8ac818508296d4f08365a44f2a85`。

## 边界

本轮不更新版本号，不安装到真实库，不提交或推送。构建产物位于 `dist/`。私有接口可能随宿主升级改变；iOS、Android、Windows、Linux、弹出窗口、IME 和真实大库尚未完成本入口验收。共享原型包装有结构识别边界，不承诺兼容模仿相同私有结构的第三方弹窗。

主动 LSP 检查未返回错误，但 16 个文件中只有 10 个被确认 clean、6 个无法确认；不宣称所有静态诊断全绿。
