# 原生搜索可行性探针结果

日期：2026-09-21。

## 结论

**已在本机 macOS、Obsidian 1.13.7 上实测通过小字表探针：可以不把展开查询写入搜索框，同时让原生全库搜索完成匹配、列表渲染、高亮和点击定位。**

这是针对四组样例字符的机制验证，不是正式插件完成，也不证明完整 Unicode/OpenCC 字表、复杂语法、所有触发入口或所有桌面版本兼容。iOS／Android 按用户要求交由用户测试，当前没有移动端通过结论。

## 验证命令与结果

```sh
node experiments/native-search-spike/run.cjs --baseline
# 预期 exit 1：原生搜索「體」只命中 b-variants.md，未命中含「体」的 a-simplified.md。

node experiments/native-search-spike/run.cjs
# 完整验证 exit 0。

node --check experiments/native-search-spike/main.js
node --check experiments/native-search-spike/run.cjs
# 均 exit 0。
```

运行的是本机实际 Obsidian 应用，不是仿写的搜索引擎或 mock 搜索对象。Playwright 只负责连接独立测试实例、输入、点击和断言。

| 检查项 | 结果 |
| --- | --- |
| `体`、`體` 两个方向 | 各命中两份原始笔记 |
| `真`、`眞` 两个方向 | 各命中两份原始笔记 |
| `人`、`⼈` 两个方向 | 各命中两份原始笔记 |
| `甲、乙`、`甲､乙`、`甲﹑乙` | 三种查询各命中三种原文标点 |
| 输入框值写入监测 | 九个程序调用查询没有任何展开串写入；实际输入事件路径也未写入展开串 |
| 原始查询、视图状态与近期搜索 | 九个查询均保持原文 |
| 原生匹配偏移 | 六个单字查询的 content 范围与源文件字符位置一致 |
| 实际输入事件 | 输入 `前体后`，保持原输入并命中 `前体后`、`前體后` |
| 原生结果列表高亮 | 两份原始文字均正确显示和高亮，截图已检查 |
| 点击繁体结果 | 打开 `b-variants.md`，光标到匹配起点，原生短暂高亮 `前體后` |
| 视图状态恢复入口 | `setState()` 恢复查询 `眞` 后仍命中两份文件，输入保持 `眞` |
| 禁用后下一次搜索 | 搜索 `體` 恢复为仅命中 `b-variants.md` |
| 笔记完整性 | 三份夹具文件逐字节不变 |
| 页面运行异常 | 成功运行的 `pageErrors` 数组为空 |

不能由“两个入口通过”推断所有第三方程序调用、URI、书签、工作区重启恢复均已覆盖。保存当前历史值已验证，跨进程历史恢复尚未验证。

## 实际机制

1. 原生搜索仍从原始输入创建查询对象。
2. 在原生 `renderSearchInfo` 的顶层调用处，探针介入；此时尚未启动本次文件扫描。
3. 用同一个内部查询构造器编译小范围正则，例如 `体` 对应 `/[体體]/`。
4. 只替换本次查询对象的 `matcher` 与 `requiredInputs`，保留其 `query` 原文。
5. 文件读取、取消机制、原文匹配偏移、结果列表与点击处理继续由原生代码执行。
6. 卸载时恢复原方法；下一次搜索恢复原生行为。

这是未公开接口，正式实现仍需要兼容检查、生命周期处理和升级回退方案。探针不复制原生搜索实现，也不通过输入框暂存扩展串。

探针的“解释搜索”仍使用原始查询树；其正式呈现方式、是否显示增强说明没有做产品决策。

## 隔离与调试过程

- 每次运行创建全新的临时 profile 和仅含三篇合成笔记的 vault，运行时核对打开的 vault 路径。
- 未打开或修改用户真实 vault，未给真实库安装插件。
- 隔离 `HOME` 是为了避免测试实例与正常实例共享 CLI socket，但最初导致 macOS 的 Keychain Not Found 弹窗；这解释了之前的初始化超时，并不是搜索失败。
- 最终测试仅对无账号、无密钥的临时实例使用 `--use-mock-keychain`，没有重置用户钥匙串。该启动选项不属于插件，也不能用于存储真实凭证。
- 打包版应用没有暴露测试工具要求的主进程调试入口，最终改用实际提供的 renderer CDP。
- UI 测试先后纠正了两个测试自身的假设：多个搜索面板需要明确定位；点击原生结果是移动光标及短暂高亮，而非文本选择。
- 成功运行日志仍有隔离 profile 初次创建时缺少窗口状态文件等 Ignored 提示，以及关闭时 beforeunload 提示被 Chromium 阻止。不能把“exit 0”写成“控制台完全无警告”；这些提示未导致该组断言失败。
- 自建 Android 环境在调试授权阶段阻塞，按用户要求停止模拟器和专用调试服务，没有把它计作手机测试。

## 尚未验证

- 完整字表构建、一般异体筛选及跨来源分组。
- `file:`／`path:`／`tag:`／属性、否定、OR、括号、引号、正则等完整原生语法。
- 全量 Unicode 兼容开关、一对多字符映射、IVS。
- IME 组合输入、撤销、光标选区、长查询与大库性能。
- 多搜索面板并发、启动时创建新面板、其他插件冲突、接口变化后的回退。
- 禁用时已显示结果是否立即重算（本轮只验证下一次查询恢复）。
- Windows、Linux、其他 Obsidian 版本；iOS／Android 由用户后续测试。

## 交付与证据

- 可丢弃探针：[experiments/native-search-spike/](../../experiments/native-search-spike/)
- [完整运行证据](evidence/native-search-spike/evidence.json)
- [原生预期失败基线](evidence/native-search-spike/baseline-expected-failure.json)
- [结果列表截图](evidence/native-search-spike/native-results.png)
- [点击后的原生高亮截图](evidence/native-search-spike/native-opened.png)
- [探针文件校验值](evidence/native-search-spike/probe-file-hashes.json)

可供手机测试的文件为探针目录中的 `main.js` 和 `manifest.json`，只建议放入可丢弃测试库。完整产品仍需继续需求澄清与设计确认。
