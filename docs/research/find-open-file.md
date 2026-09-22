# Find / Open file 实现与验证

## 状态

0.2.0 的完整桌面回归与文件名边界补验已通过，已安全安装到批准测试库。全量兼容默认开启，保留已有布尔设置；新增 Markdown Find 与原生 Open file。Unicode／OpenCC 字表未变。

主会话直接实现和作者自审，无子代理或 Git 操作。iOS 新入口尚需用户复测；0.1.0 的 iOS 全库验收不代表本轮两个新入口也通过。

## 原生基线与红灯

在独立 HOME／profile／人工笔记库运行，仅关闭自动化自己启动的进程，不操作用户当前实例。

- 编辑 Find 接受字符串而非 RegExp；`/体/` 是字面查询。原生 `体` 不匹配 `體`，但 `1` 已匹配 `①`、`株式会社` 已匹配 `㍿`。关闭全量不能移除这些固有能力。
- 阅读 Find 使用渲染文本节点的 UTF-16 范围，不是 Markdown 源码坐标。原生 `1` 不匹配 `①`；查找范围包括内联标题。
- 原生 Open file 的 `体育`／`体研` 不匹配 `體育研究.md`，`发型` 不匹配 `髮型指南`。默认显示已注册附件，不能假设默认只显示 Markdown。
- 无结果时 chooser.values 可以为空；采集计数必须等待原生 debounce 和选中范围同步。
- [初始基线](evidence/find-open-file/native-baseline.json)中的编辑 count 曾过早采集，不作为最终 UI 计数证据；[最终完整证据](evidence/find-open-file/surfaces.json)包含重新采集的基线。
- [0.1.0 功能 RED](evidence/find-open-file/0.1.0-red.json)：正确加载旧插件后，Find 首行仍只有 1 处，新增要求为 3 处。不是定位器或启动失败。

纯函数、游标、适配器、默认设置依次观察缺功能断言失败后实现。自审另发现新窗口的绑定 opener 漏接、只读 core.onOpen 赋值抛错；分别复现 RED 后修复。执行细节见项目本地 `.pi/find-open-file-progress.md`。

## 实现边界

- `expandLiteral` 复用原有有界算法；全库 `expand` 仍保留复杂语法的原生路径。
- `canonicalize`／`mapRanges` 只生成临时规范串与原文范围，不写入文件或元数据。`㍿` 与 `株式会社` 的内部共同键是 `㊑式会㊓`，不能将它当文件名或显示文本。
- Find 在目标组件合并原生命中和新增范围；编辑游标只读，旧游标引用也不能替换。Find→Replace 重建原生游标。阅读模式仍由原生负责高亮、上下条和计数。
- Open file 原生结果先生成，保留其对象、分值及实际 TFile；仅追加等价文件／原始别名，使用原生 fuzzy／simple matcher。原路径先拆 basename，再规范化，避免全宽斜杠变成目录边界。
- `documents.js` 为两个适配器共享文档发现和清理逻辑，处理构造时已绑定的回调；不修改全局 String、RegExp、Editor 或建议框原型。
- 超限、映射失败或接口不符整次回退原生；日志只记入口、数量、版本、状态、耗时及安全失败类别。

## 验证证据

最终任务 `bbebe691f` 完整执行并退出 0（包括收尾卸载修正；此前 `b82f5fb79` 为首轮验收）：

```sh
npm test
npm run build
node --check dist/main.js
npm run test:surfaces
npm run test:native
```

- **10 Python＋37 Node 测试通过**；197,228 次关系检查，730 个全库语法保留方向仍明确跳过。
- **macOS / Obsidian 1.13.7 两套真实应用验收通过**，均 `pageErrors: []`；预期故障注入会产生安全 fallback 日志，不表示 Console 完全无 warning。
- Find 编辑／阅读共 28 组匹配、反例、空格、字面斜杠、变长序列与补充平面范围；实际输入、计数、上下条按钮、开关和超限回退。
- 真实 Find→Replace 得到且只得到 `體 X 體\n`；保存后旧增强游标拒绝写入，原生 undo 后再次保存，恢复精确原文。
- 真实双面板各有 6 处结果；故障注入后恢复、模式和文件切换、已保存 false 重载、禁用后恢复原生。
- Open file 真实输入 `体研`，原文件名中的 `體`、`研` 两段高亮，并从另一文件点击打开原路径；别名、类型过滤、原生分值保留、最近文件和原名创建亦有运行时断言。
- 文件名补验 `bd9d8cd1c` 退出 0；收尾修正后又在 `bbebe691f` 全部重跑通过：文件名的 `体／發／弁` 组及反例、`株式会社` 对原文件名 `㍿` 的 `[0,1]` 高亮、补充平面字符完整 `[1,3]` 范围通过。见 [补验日志](evidence/find-open-file/boundary-verification.log)；最终新入口证据包含 8 组正向 Open file 记录。
- 路径评分、忽略降权、不同别名、变长／非 BMP 映射、10,000 候选切换、外来钩子与不透明原生行保留另有单元测试。非文件书签／未解析链接的保留没有独立真实 UI 专项验收，不宣称做过。
- 实际按字节核对原有临时笔记不变；创建行为与类型过滤仅额外创建隔离库内的人工文件。

证据：[完整日志](evidence/find-open-file/verification.log)、[新入口](evidence/find-open-file/surfaces.json)、[全库回归](evidence/find-open-file/vault-search.json)。已读取检查 [编辑 Find](evidence/find-open-file/find-source.png)、[阅读 Find](evidence/find-open-file/find-preview.png)、[模糊文件名](evidence/find-open-file/open-file-fuzzy.png)截图：输入保留原文，原生计数及活动高亮可见，文件名未变。字体对部分补充字符的字形展示仍取决于宿主。

验证过的产物 SHA-256：

| 产物 | SHA-256 |
| --- | --- |
| main.js | `02e24e79a27bcb66240c5327850ab559fbc5218f6f68d6c721cb4817f8bc3760` |
| manifest.json | `3801a9a64c722495294877f1034143d51c90a17537939b456b8877af5da135c3` |
| character-data.json | `617738b285d30c78044f538f08ea6e2c5fbb6c8cd897306f64213df902f40eca` |

## 合成候选基准

在真实 Obsidian 中使用原生 matcher 和单独的合成 receiver，不替换真实 app.vault／metadataCache。每档 1 次预热、3 次测量，中位数如下：

| 候选数 | 原生 ms | 增强 ms | 完整新增结果数 |
| ---: | ---: | ---: | ---: |
| 100 | 0.10 | 0.40 | 100 |
| 1,000 | 0.50 | 2.20 | 1,000 |
| 10,000 | 3.10 | 17.60 | 10,000 |

这只测候选生成，不包含真实大库磁盘、索引、插件竞争、UI 列表绘制或手机性能，不能外推成大库保证。10,000 档按原生规则使用 simple matcher。

## 自审与剩余限制

逐项对照设计 §1–9：设置解析、只读替换、原生并集、原文身份／范围、候选资格、生命周期、故障回退、日志隐私均有相应源码和测试证据；本次只有作者自审，没有独立评审。收尾时另发现：外来插件留存的阅读包装在卸载后仍可使原生缓存失效。新增测试先观察重复刷新 RED，再用入口禁用守卫修复；完整回归后重新安装最终产物，首轮记录另存 `*-before-unload-fix.*`。

- iOS 新入口、Android、Windows/Linux、其他 Obsidian 版本、真实超大笔记／大库、完整 IME／主题／无障碍矩阵未验收。新窗口发现有行为单测，未宣称完成真实弹出窗口矩阵。
- 主动 LSP 检查 9 文件未返回错误，但仅 2 文件确认 clean，7 文件因 push-only 服务无法确认。辅助静态规则仍有动态正则、测试 CDP／输出等提示。
- 原 0.1.0 部署的五处 unused catch 绑定已 deferred；0.2.0 的 ES2018 生成包仍有同类风格告警，捕获处已有恢复／安全诊断逻辑。未为清告警手改任何已验收产物，不宣称所有静态检查全绿。
- 使用私有原生接口，最低版本仍为 1.13.7，不能保证未来版本不变。

## 安全安装

安装器 4 项测试再次通过后，复用原安装白名单，仅替换 5 个插件产物；全部与两套真实验收的哈希一致。**12 个非产物文件字节哈希完全不变**，包含已有 `data.json`；没有重启／操控用户当前实例。

最终替换前备份：`.pi/plugin-backups/before-install-D8tG3N/`；原 0.1.0 备份仍保留在 `.pi/plugin-backups/before-install-RPsoPL/`。记录：[最终安装回执](evidence/find-open-file/installation.json)、[最终安装前哈希](evidence/find-open-file/pre-install-hashes-final.json)。两次安装均核对 12 个非产物文件不变。旧 false 设置未被强制开启，用户须重新启用插件加载新文件。

## iOS 新入口复测清单

在可丢弃测试笔记中：

1. 重新启用插件，确认提示 **0.2.0**；旧设置保存过关闭时保持关闭，可手动开启。
2. 在当前 Markdown 笔记 Find 输入 `体`，编辑与阅读分别检查 `體 体 體`、计数、前后切换与原文不变。
3. Open file 输入简体文件名或不连续字符，确认找到繁体原文件；别名也能命中，打开的是原文件。
4. 开／关全量后重新输入 `①／1`、`㍿／株式会社`。关闭只移除插件新增关系，原生已有兼容能力可能仍在。
5. 在可丢弃笔记里从 Find 切入替换，重新输入 `体` 替换成 `X`，只应修改原生应匹配的位置。
6. 复查全库搜索；若异常，仅反馈入口、系统／Obsidian 版本、预期关系及脱敏诊断，不发送私密笔记或原始错误内容。
