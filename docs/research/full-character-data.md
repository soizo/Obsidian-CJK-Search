# 完整字符数据实现与桌面验证

日期：2026-09-21。版本：0.1.0 本地测试版，插件 ID 仍为 `cjk-search-probe`。

状态：完整测试、离线构建和实际应用验证通过；补充检查 `bf120890d` 退出 0。已安全更新用户已有测试库至 0.1.0，8 个非插件产物文件保持不变。

## 数据与产物

| 项目 | 固定值 |
| --- | --- |
| Unicode | 18.0.0 |
| OpenCC | ver.1.4.2，`025f371dc76b598d77384fbdab90c937471844d8` |
| 官方输入文件 | 12，含许可；固定 OpenCC 提交无 NOTICE |
| 默认模式 | 17,584 字符、8,279 规范键、243 序列键 |
| 全量兼容模式 | 22,110 字符、10,480 规范键、1,997 序列键 |
| character-data.json | 2,164,390 字节 |
| dist/main.js | 3,103,585 字节；唯一运行时外部依赖 obsidian |

数据 SHA-256：`617738b285d30c78044f538f08ea6e2c5fbb6c8cd897306f64213df902f40eca`。

构建 SHA-256：`58482a31aa51d4424c5a31f726bde59b85dbb3d5c5a818db56a90668d8aeb575`。

明细和来源见 [data/report.json](../../data/report.json)、[data/sources.lock.json](../../data/sources.lock.json)、[data/relations.jsonl](../../data/relations.jsonl) 与 [第三方声明](../../THIRD_PARTY_NOTICES.md)。这不是全语言覆盖率或完整 NFKC 算法的声明。

## 验证证据

- `be83e966b`：`npm test && npm run data:build && npm run build && npm run test:native`，退出 0。
- 最终 `bf120890d`：`npm test && npm run test:native`，退出 0；[完整日志](evidence/full-character-data/verification.log)、[原生断言与日志](evidence/full-character-data/evidence.json)、[设置截图](evidence/full-character-data/full-compatibility-setting.png)、[序列定位截图](evidence/full-character-data/sequence-opened.png)。确认 `pageErrors: []`，构建哈希与实际测试副本一致。
- 10 个 Python 测试通过：解析、字段策略、锁定哈希、两次离线构建一致、损坏输入不覆盖成功产物。
- 19 个 Node 测试通过：展开器、插件生命周期及设置、安全安装。数据级双向检查 **197,228** 次；**730** 个方向因原生保留语法明确跳过，不计作匹配成功。
- 构造数据分别验证 257 码位回退、4,097 节点触发 branch-limit、重叠序列触发 pattern-limit，均不返回部分 matcher。
- 实际应用仅为 **macOS / Obsidian 1.13.7**。每轮使用临时库、独立 HOME／profile、随机 CDP 端口及测试用 mock-keychain；未向用户正在使用的实例发送控制命令。

已通过的真实应用行为：

1. 原生基线仅命中字面；旧四组探针面对完整数据的红灯确实缺少 `發／髮` 结果。
2. `体／體`、`真／眞`、`发／發／髮`、`弁／瓣／辨／辯`、偏旁、兼容标点互搜；`土／士`、`未／末`、`丼／井` 不混合；`鼠标` 匹配 `鼠標`，不转换 `滑鼠`。
3. 默认 `①` 不命中 `1`；实际点击设置开关后互搜，禁用／启用插件保留设置，关闭开关恢复默认。
4. 全量模式下 `²／2`、混合字符串 `前A后／前Ａ后`、`FFI／ﬃ`；原生大小写开关开启时 `FFI` 不匹配小写合字，`ffi` 仍匹配。
5. `株式会社／㍿` 双向查询及点击；原文范围为四字符／单字符，反向点击光标为第 5 行起点。实际补充平面关系在原文占 2 个 UTF-16 单元，偏移为 `[1,3]`。
6. 真实输入事件、原输入／历史／状态、原生结果高亮、点击文件和短暂闪烁；没有把正则写入输入框，也没有把原生定位误报成编辑器选区。
7. 后开搜索面板自动增强；两个面板同时搜索 `发`，文件列表一致。临时隐藏另一面板的内部入口，确认拒绝挂钩；恢复该入口后未增强的原生 `体` 仍仅命中字面文件。长输入明确回退；模拟 replacement 构造失败后原生原词仍命中，恢复后再次增强。
8. 禁用后下一条查询恢复原生；输入监听移除；测试笔记逐字节不变。`pageErrors` 必须为空。

插件日志的 `expandMs` 只测查询编译，不是全库搜索延迟。上述本机运行首次默认索引约 18.5 ms、首次全量索引约 14.6 ms；随后样例通常 0–0.2 ms。样本库不能推导大库性能。

另在 Node 22 中热身后测 31 轮：[编译器基准](evidence/full-character-data/compiler-benchmark.json)。256 个汉字展开成 1,792 个 UTF-16 单元，耗时中位数 0.287 ms；192 个含兼容序列的混合字符触发 pattern-limit，完整回退，中位数 0.158 ms。这是保护预算的实际行为，不把回退统计为增强成功。

## 自审发现与修正

- Blocks.txt 包含合法代理区间：属性范围解析允许这些区间，但映射输入仍拒绝代理码位。
- 搜索建议弹层可能遮挡结果：自动化先 Escape，再点击真实结果，不使用 force click 掩盖遮挡。
- Obsidian 1.13.7 的设置是独立窗口：监听新 page，再在该窗口选择插件与开关；主窗口中找控件会超时，并非插件设置未注册。
- 实际 Component 先清理子组件再调用父 onunload。生命周期替身现按真实顺序执行；卸载日志改为统计已经成功恢复的记录，避免实际恢复成功却报告 0。
- 修复坏数据为 null 时，校验失败后的元信息日志再次抛错的问题。
- 隐私 sentinel 使用纯拉丁字母：下划线本身存在官方东亚标点关系，不能用带下划线的 sentinel 宣称“无映射”。

按批准的字段连通闭包会出现 `炼煉錬鍊鏈链煉鍊𫔀𲇷`、`⾥哩裏裡里裏裡里` 等跨义项分组。已审查报告；这些来自选定关系的传递闭包，不是额外纳入一般语义或混淆字段。其较宽召回符合本轮约定，但不是无歧义的文字转换。

## 限制与尚未完成的验证

- 只支持连续普通字面查询；复杂原生语法整条保持原生。输入、模式长度和工作节点预算均有上限。
- iOS／Android 由用户实测；Windows／Linux、其他 Obsidian 版本、大库性能及 IME 真机输入尚未验证。
- 内部接口可能随 Obsidian 升级改变；故障注入只能证明当前防护分支，不能证明未来版本兼容。
- 当前桌面截图为浅色；原生设置组件未单独做暗色、移动触控及完整键盘流程验收，不宣称生产就绪。
- 本轮是作者自审，按用户选择未使用独立子代理审查。
- 静态检查不作全绿声明：JS 主语言服务返回 clean 状态不确定；Python 语言服务仍报两个 `scripts.build_data` 导入问题，尽管实际 Python 测试与离线构建成功。新增 pyrightconfig.json 明确项目路径，但当前会话的语言服务未据此消除报告。
- 安装包的五处 unused catch binding 提示已按生成代码误报处理：源码是 `catch {}`，esbuild 为 ES2018 目标生成必需的 `catch (e)`。错误本身有明确回退／日志处理；不手改生成物或官方字表来满足源代码风格与拼写建议。
- Python AST 工具有四处“未捕获 JSON 解析异常”报告；这些构建期边界意在拒绝坏输入并中止，不吞掉异常。已审查其失败传播与损坏输入回归，仍如实保留静态工具报告。

## 安装约束

只允许更新 `experiments/native-search-spike/manual-test-vault/.obsidian/plugins/cjk-search-probe/` 的 main、manifest、许可与声明。先备份旧产物；复制失败回滚已替换的白名单文件。`data.json`、笔记、workspace 和插件启用列表不由安装器修改。安装验证已完成：[安装回执](evidence/full-character-data/installation.json)。5 个安装文件与通过实测的 dist 字节相同，8 个非产物文件前后校验一致；旧文件保留在 `.pi/plugin-backups/before-install-vZSNcC/`。未操控用户当前实例；用户须关闭再启用插件，必要时重新打开测试库。
