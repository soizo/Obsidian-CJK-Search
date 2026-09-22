# Find / Open file Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 主会话直接实现和自审；不派子代理、不创建 Git 仓库／分支／提交。

**Goal:** 全量兼容默认开启但保留用户旧设置，在原生 Markdown Find 和 Open file 中复用完整字符关系，保留原文、原生行为及替换安全。

**Architecture:** 保持全库搜索适配；扩展现有纯匹配模块的字面展开和规范串／偏移映射能力。Find 在当前笔记的原生查找组件处合并匹配范围；Open file 在原生建议列表上补充文件／别名匹配。生命周期与设置由现有入口管理，无另一套搜索界面或常驻笔记索引。

**Tech Stack:** CommonJS JavaScript、Obsidian 1.13.7、现有 node:test／assert／VM 测试、现有 Python 数据验证、esbuild 0.28.2、现有隔离 Obsidian＋Playwright 工具；不添加依赖。

**Spec:** `docs/superpowers/specs/2026-09-22-find-open-file-design.md`。用户已在书面设计交付后回复“开始实施”，批准设计，并在计划交付后回复“确认开始”。本计划已实施并安全交付 0.2.0。37 个 Node／10 个 Python 测试、两个桌面 suite 通过；具体纯测试／真实 UI 覆盖和未测专项见验证报告，不将全部平台／场景标为通过。

## Global Constraints

- 数据仍为 Unicode **18.0.0**、OpenCC **1.4.2**，提交 `025f371dc76b598d77384fbdab90c937471844d8`；不重抓或变更字表。
- 新安装／未设置／非法值默认 fullCompatibility=true；已保存布尔 true／false 保持不变，其他字段及原文件不因加载而改写。
- Find 只覆盖顶层 Markdown 编辑／实时预览和阅读模式，不增强替换、PDF、网页、Canvas、Bases 或嵌入编辑器。
- Open file 只新增文件名／路径及别名的等价命中；最近文件、未解析链接、非文件书签、创建动作保持原生。
- 关闭全量仅停用插件新增关系，不剥夺原生入口本来已有的匹配。
- 不改变输入、正文、文件名、别名或实际 TFile；不覆盖全局 String／RegExp／Editor 原型，不临时改写 app.vault 或 metadataCache。
- 不复制整套 Obsidian 私有实现、不硬编码压缩构造器名、不新增搜索 UI、依赖或常驻文件索引。
- 现有全库限制保持输入 256 码位、正则 65,536 UTF-16 单元、工作节点 4,096；新入口有界且整次回退，不截断候选冒充成功。
- 日志保留 `[CJK-Probe]`，只有入口、版本、数量、状态、耗时，不记录输入、内容、文件名／路径／别名。
- 最低版本仍 1.13.7，插件 ID 仍 `cjk-search-probe`；候选发布版本 **0.2.0**，通过全部桌面验收前不部署。
- 只更新批准的 manual-test-vault 插件白名单，先备份并核对非产物文件不变；不操控用户当前实例。
- iOS 最终由用户复测；桌面移动布局不算 iOS WebKit 真机验证。Android 不标记通过。

## Review Focus

1. **增强游标泄漏至替换**：Find 选中了异体后进入替换，必须重新建立原生游标；保存过的增强游标本身不得写正文。Task 3／6。
2. **原生已有兼容命中被丢弃**：原生 Find 可能已支持 `1→①`，full=false 不能让它退化；不能靠偷偷使用 full=true 补救。Task 1／3／6。
3. **UTF-16 与变长映射**：非 BMP、`㍿→株式会社`、`ﬃ→ffi`、同义别名不得造成半个代理对、高亮错位或打开规范化后的假文件。Task 2／4／6。
4. **实际使用中的状态变化**：笔记编辑、切换模式／文件、延迟加载、反复打开弹窗、多面板及卸载后旧回调不得使用陈旧匹配或重新挂钩。Task 3／5／6。
5. **候选与语法边界**：空格、路径、类型开关、忽略降权、多别名、最近文件／未解析项不能被全库语法过滤器或自建排序破坏。Task 2／4／6。

## 文件职责与依赖顺序

| 文件 | 职责 |
| --- | --- |
| `src/matcher.js` | 保留 expand，增加普通字面展开、规范串和原文偏移映射 |
| `src/find.js` | 只读查找游标、阅读模式范围生成、目标组件挂载／清理 |
| `src/open-file.js` | 原生建议补充、评分／范围转换、仅快速切换器挂载 |
| `src/main.js` | 默认设置、两适配器启动、按入口诊断，维持全库逻辑 |
| `src/documents.js` | 两入口共用的文档发现／焦点监听与生命周期清理 |
| `tests/matcher.test.cjs` | 字面与规范串／偏移的纯函数回归 |
| `tests/find.test.cjs` | 原生结果并集、导航、陈旧文档、禁止写操作 |
| `tests/open-file.test.cjs` | 结果保留／去重、资格、分值及范围映射 |
| `tests/plugin.test.cjs` | 设置解析、原生生命周期及多监听器替身 |
| `experiments/native-search-spike/surfaces.cjs` | 独立临时实例内的新入口基线和实际交互断言 |
| `experiments/native-search-spike/run.cjs` | 复用隔离启动／关闭，仅增加入口测试开关和夹具 |
| `manifest.json`、`package.json`、`package-lock.json` | 0.2.0 版本与测试命令，无新依赖 |
| `README.md`、`TODO.md`、`docs/research/find-open-file.md` | 使用范围、基线、结果和限制 |

执行顺序：先固定原生基线，再共享纯逻辑 → Find → Open file → 接入与设置 → 真实 UI 验收 → 安全部署。用项目内 `.pi/find-open-file-progress.md` 记录红绿结果、接口核查及裁定，代替 Git 提交记账。

---

## Task 1：固定两个入口的原生基线和可运行红灯

**Files:** 新建 `experiments/native-search-spike/surfaces.cjs`；修改 `experiments/native-search-spike/run.cjs`；记录 `docs/research/find-open-file.md`。

**Interfaces:** 新文件导出 `captureBaseline(page): Promise<object>` 和 `verifySurfaces(page, evidence): Promise<void>`。两者只在启动器已校验 realpath 的临时库运行。新增 `--surface-baseline`（只采集／验证原生合同）和 `--surfaces`（包括新增功能断言）参数；保留旧探针及全库参数。

- [x] **1.1 添加独立夹具及原生 UI 启动步骤。** 仅新参数时启用核心插件 `switcher`，原模式仍只启用 global-search；新增文件如下：

```js
const surfaceFixtures = {
  '體育研究.md': '體 体 體\n① 1\n㍿ 株式会社\nﬃ ffi\n前𠀀后\n',
  '档案/繁體说明.md': '---\naliases:\n  - 髮型指南\n  - 发型说明\n---\n测试正文\n',
  'Find替换夹具.md': '體 体 體\n',
};
// 开始 native Find；选择和输入均由原生控件处理。
await page.evaluate(async () => {
  const file = app.vault.getAbstractFileByPath('體育研究.md');
  await app.workspace.getLeaf(false).openFile(file, {active:true});
  app.commands.executeCommandById('editor:open-search');
});
```

不要把新增夹具加入旧全库断言的库中而不修正预期。新入口模式的完整夹具数、各查询期望文件列表单独管理，避免新增标题造成原九组用例意外多命中。

- [x] **1.2 采集真实方法和状态合同，不以替身猜测。** 编辑对象来自当前 Markdown view 的 editMode.search；阅读对象在切换 preview 并打开 Find 后获得；快速切换器来自 enabled switcher 的 activeModal。记录方法存在性、输入原文、结果范围／分值、组件生命周期，不把原生完整代码复制到仓库。

```js
const contract = await page.evaluate(() => {
  const view = app.workspace.activeLeaf.view;
  const search = view.editMode.search;
  const cursor = search.editor.searchCursor('体');
  return {
    queryType: typeof search.getQuery(),
    isReplace: search.isReplace,
    cursorMethods: Object.keys(cursor).filter(k => typeof cursor[k] === 'function'),
    nativeRanges: cursor.findAll(),
  };
});
assert(contract.cursorMethods.includes('getIndexAndCount'));
assert(contract.cursorMethods.includes('replaceAll'));
```

已静态确认 1.13.7 的编辑 searchCursor 是**字符串查找**，不能直接传 RegExp：其实现使用查询的 length 和文本查找游标。返回合同为 current、findNext、findPrevious、findAll、getIndexAndCount、replace、replaceAll。运行时核对不一致即停止设计相应适配，不虚构新字段。

阅读段文本的原生采集规则是递归拼接全部文本节点；原生高亮也按这些节点的 UTF-16 累计位置定位。用内联粗体／链接、跨文本节点及非 BMP 夹具确认这一合同。

- [x] **1.3 记录插件禁用基线。** 主要查询／最近文件基线已完成；未解析项与非文件书签没有独立 UI 基线，本轮以原生行保留单测和只追加设计覆盖，明确保留为后续专项。 实际输入 `体`、`1`、`株式会社`、包含空格的文本，检查编辑／阅读各自行为；Quick switcher 输入 `体育`、`体研`、`发型`，记录结果及范围。保留最近文件、未解析项和创建行为基线。若当前入口没有正则解析，不将 `/体/` 人为当作正则。

```sh
node experiments/native-search-spike/run.cjs --surface-baseline
```

这一步退出 0 表示基线可运行，不表示新增增强成功。

- [x] **1.4 加入新增行为断言并对 0.1.0 运行红灯。** 搜索 `体` 必须找到异体和简体三个位置，`体育` 必须给出 `體育研究.md`，点击必须打开原路径。

```js
await page.locator('.document-search-input input, input.document-search-input')
  .filter({visible:true}).fill('体');
// 具体 locator 以 1.2 的实际 DOM 为准，必须唯一且可见，不能 force-click。
const actual = await page.evaluate(() =>
  app.workspace.activeLeaf.view.editMode.search.cursor.findAll());
assert.equal(actual.length, 3);
```

运行 `node experiments/native-search-spike/run.cjs --plugin-dir dist --surfaces`。失败必须是新增匹配缺失，而非菜单／选择器／启动出错。步骤 1.2 已确定的选择器写入 harness，不把上面候选 selector 当成经过验证的事实。

## Task 2：共享字面匹配及原文偏移

**Files:** 修改 `src/matcher.js`、`tests/matcher.test.cjs`。

**Interfaces:** `createExpander(data)` 保留 `expand(query, options)`，额外返回：
- `expandLiteral(query, options)`：与 expand 相同状态合同和预算，仅去掉全库专用语法拒绝；仍拒绝非法标量。
- `canonicalize(text, {fullCompatibility=false}={})`：`{status, reason, text, spans}`。status 为 mapped／unchanged／fallback；成功时 spans 与输出 UTF-16 单元一一对应，每项为原输入 `[start,end]`；失败时 text/spans=null。查询长度由入口守卫；候选输入和输出都限制在 65,536 UTF-16 单元。
- 同模块另导出 `mapRanges(spans, ranges)`，将规范串 `[start,end]` 区间转成原文区间，排序并合并重叠／相邻范围。非法范围抛错，交由入口整次回退。

- [x] **2.1 写精确红灯。**

```js
const {createExpander, mapRanges} = require('../src/matcher');
const expander = createExpander(require('../data/character-data.json'));
assert.equal(expander.expand('体 / 真').reason, 'unsupported-syntax');
const literal = expander.expandLiteral('体 / 真');
assert.equal(literal.status, 'expanded');
assert(new RegExp(`^(?:${literal.source})$`).test('體 / 眞'));
const mapped = expander.canonicalize('前ﬃ后', {fullCompatibility:true});
assert.equal(mapped.text, '前ffi后');
assert.deepEqual(mapped.spans, [[0,1],[1,2],[1,2],[1,2],[2,3]]);
assert.deepEqual(mapRanges(mapped.spans, [[1,3],[3,4]]), [[1,2]]);
assert.equal(expander.canonicalize('①',{fullCompatibility:false}).text, '①');
assert.equal(expander.canonicalize('①',{fullCompatibility:true}).text, '1');
```

- [x] **2.2 运行缺方法红灯，然后最小提取。** 不复制整个展开器。把语法检查留在 expand 包装层，原有有界算法成为 expandLiteral 的核心；canonicalize 读取同一个 canonical Map，不建新数据源。

```js
function expand(query, options) {
  if (typeof query !== 'string') throw new TypeError('Query must be a string');
  if (unsupported.test(query)) return result('unchanged', 'unsupported-syntax');
  return expandLiteral(query, options);
}
// 在 canonicalize 的每个输入标量上：
const key = mode.canonical.get(character) ?? character;
for (let unit = 0; unit < key.length; unit++) spans.push([offset, offset + character.length]);
```

拼接／push 前核对预算；禁止先分配超限数组再判断。spans 必须覆盖一个非 BMP 源字符的两个单元；不在这里做宿主 normalize 或大小写折叠，保留原生匹配器自己的语义。

- [x] **2.3 加入长度变化／边界检查。** `㍿` 对 canonicalize('株式会社') 的输出相等；在自映射 `𠀀→𠀀` 的合成模式中，`前𠀀后` 的补充字符两个输出单元均映射完整输入 `[1,3]`；相邻片段合并；非法负值／越界范围拒绝；65,537 单元的候选完整回退；无映射保持原文本。

```js
assert.throws(() => mapRanges([[0,1]], [[0,2]]));
assert.equal(expander.canonicalize('a'.repeat(65537)).status, 'fallback');
assert.equal(expander.expandLiteral('体'.repeat(257)).reason, 'input-limit');
```

- [x] **2.4 运行完整 matcher 回归。** `node --test tests/matcher.test.cjs`。已有 197,228 关系检查和全库语法排除仍通过；不把 730 个保留语法方向伪报成新增全库支持。

## Task 3：Markdown Find，只查找不扩大替换

**Files:** 新建 `src/find.js`、`tests/find.test.cjs`；新增 harness 编辑／阅读验收。

**Interfaces:**
- `collectMatches(text, source, nativeRanges)` 返回排序／去重后的原文 `[start,end]`；nativeRanges 完整保留。新增正则必须消费字符，非 BMP 保持整体。
- `createFindCursor(editor, nativeCursor, source)` 返回与 Task 1 核实一致的七个方法。editor 使用 getValue、getCursor、posToOffset、offsetToPos；此游标只读，replace／replaceAll 明确拒绝写入。
- `installFind(plugin, report): () => void` 安装目标实例适配，返回幂等 cleanup。plugin 提供 app、active、expander、settings、registerEvent；report(event, details, level?) 沿用主模块日志函数。

- [x] **3.1 写纯范围和安全红灯。**

```js
const {collectMatches, createFindCursor} = require('../src/find');
assert.deepEqual(collectMatches('體 体 體', '(?:体|體)', [[2,3]]),
  [[0,1],[2,3],[4,5]]);
assert.deepEqual(collectMatches('① 1', '1', [[0,1],[2,3]]), [[0,1],[2,3]]);
let text = '體 体 體';
const before = text, writes = [];
const pos = ch => ({line:0,ch});
const nativeMatch = () => ({from:pos(2),to:pos(3)});
const editor = {
  getValue:()=>text, getCursor:()=>pos(0),
  posToOffset:p=>p.ch, offsetToPos:pos,
};
const nativeCursor = {
  current:()=>null, findAll:()=>[nativeMatch()],
  findNext:nativeMatch, findPrevious:nativeMatch,
  getIndexAndCount:()=>[0,1],
  replace:(...args)=>writes.push(args),
  replaceAll:(...args)=>writes.push(args),
};
const cursor = createFindCursor(editor, nativeCursor, '(?:体|體)');
assert.throws(() => cursor.replaceAll('X','searchReplace'), /read-only/);
assert.equal(editor.getValue(), before);
assert.equal(writes.length, 0);
```

在同一测试文件定义可编辑文本夹具：getValue 读可变 text；posToOffset／offsetToPos 以行分隔和 UTF-16 求值；getCursor 返回显式选择范围；写调用只做记录。assert 变量在具体 test 里定义，不依赖真实 vault。

- [x] **3.2 实现只读匹配游标。** 保留原生 findAll 范围，与新增原文匹配合并；导航从编辑器当前选择的前／后边界起步并循环，current 返回原生 `{from,to}` 结构，getIndexAndCount 返回 `[index,count]`。getIndexAndCount 的原生上限（9999）不能误作截断全部可导航命中。

文档变更后使旧范围失效，重新取得原生及新增结果；不能持有用户输入前的永久快照。覆盖重叠命中（如 `体体` 对 `體體體`）的 next／previous／findAll，与 Task 1 同动作原生基线对照，不用一个全局正则列表盲猜不同操作的重叠规则。

- [x] **3.3 在原生 Find 对象中使用新游标。** 编辑组件 onSearchInput 先调用原方法，让原生解析、选区和基础结果成立；仅普通查找、非替换且需要扩展时，把组件自己的 cursor 换成只读并集游标，再用原生 highlight／requestUpdateCount 更新显示。不要改变 editor.searchCursor 方法或其原型。保持 getQuery／输入值原样。

```js
const original = search.onSearchInput;
const wrapper = function (...args) {
  const returned = original.apply(this, args);
  // 先核对 this.isActive、!this.isReplace、实际 query 类型，再扩展。
  // enhanced cursor 只写 this.cursor，不写 editor／输入／正文。
  return returned;
};
```

替换入口 show(true) 必须走原生 onSearchInput 创建新游标；replaceCurrentMatch／replaceAll 前若仍发现增强游标，先恢复原生流程，不能调用只读游标写方法。单独测试仅保存旧游标引用也无法修改正文。

- [x] **3.4 阅读模式合并范围。** 包装实际 search.updateQuery：先原生更新，然后按原生全部文本节点规则获取各 section 文本，合并新增范围，仍用 `{section,start,end,active}`。阅读 getQuery 仍返回用户文字，斜杠和空格不自行升级为正则。维护 selectedRange、count、queueRender；不写 DOM textContent。

```js
const nodes = [];
const walker = section.el.ownerDocument.createTreeWalker(section.el, 4);
for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
const text = nodes.map(node => node.textContent ?? '').join('');
```

- [x] **3.5 验证生命周期和安全。** 包括编辑／阅读来回切换、doc 修改、关闭重开、延迟 leaf、外来后装钩子、卸载；跨节点／多段、不连续位置、`㍿`／补充平面、原生 `①` 基线、Find→Replace 后重新输入 `体` 仅替换原生简体位置。接口缺失时 report(surface='find', reason) 并保留原生，不硬加载全部隐藏视图。

运行 `node --test tests/find.test.cjs`，再在临时实例运行新 Find 断言。真实替换测试只改专用 `Find替换夹具.md`，随后核对其精确预期字节，不把有意替换误报为其他笔记被改动。

## Task 4：Open file，保留原生模糊搜索与候选

**Files:** 新建 `src/open-file.js`、`tests/open-file.test.cjs`；扩展 surfaces harness。

**Interfaces:**
- `augmentSuggestions(modal, query, nativeResults, expander, fullCompatibility, api)` 返回建议列表；api 明确提供 Obsidian 的 prepareFuzzySearch、prepareSimpleSearch、parseFrontMatterAliases，避免 VM 中隐式加载另一个 obsidian 模块。
- `installOpenFile(plugin, report, api): () => void` 只安装到 switcher 实例／其创建的 modal，返回幂等 cleanup。不得改写其他共享建议弹窗原型。

- [x] **4.1 建立原生结果保留红灯。** 测试以明确提供的 matcher stub 检查转换和范围，不将 stub 当成真实评分验证；评分另在 Task 6 用真实 Obsidian API 对照。

```js
const original = {type:'file', file, match:{score:42,matches:[[0,1]]}};
const rows = augmentSuggestions(modal,'体',[original],expander,false,api);
assert.equal(rows.find(row => row.type==='file' && row.file===file), original);
assert.deepEqual(augmentSuggestions(modal,'',nativeRecent,expander,false,api), nativeRecent);
// 对追加别名：row.file 必须 === 原 TFile；row.alias 为原字串。
// 两个不同别名即使规范串相同，也不能互相覆盖。
```

构造 modal 夹具显式含 app.vault.getFiles、metadataCache.getFileCache／isUserIgnored、viewRegistry.isExtensionRegistered 和原生类型开关。测试夹具的正文／文件对象冻结，临时改写它们必须导致测试失败。

- [x] **4.2 用同表规范串补充命中。** 原方法先运行、原结果对象与 score 不改；只有文件／别名补充走 canonicalize → 原生 matcher → mapRanges。去重键为 type＋实际文件对象＋原始 alias，不用规范化文件名作为身份。

评分行为已静态核对：原生文件匹配先文件 basename，匹配失败才完整 path（路径命中分值比同 matcher 返回值低 1）；忽略文件降权 10；候选不足 10,000 时使用 fuzzy，达到该规模走 simple。实施时以 Task 1 的实时基线核对这些数字／阈值，再封装在该适配器中，不修改其他入口。

原生支持的文件类型开关及附件注册关系必须保留；别名通过 parseFrontMatterAliases 解析，而不是自行假设 frontmatter.aliases 总是数组。保留全部 nativeResults，包括书签／未解析项；只对新增文件／别名结果排序合并，稳定相同分值次序。

- [x] **4.3 处理回退，不偷偷缩小列表。** 输入超过 256 码位、候选规范化／范围映射失败、原生 API 不可用时返回该次完整 nativeResults 并报告，不能返回已经处理的一半新增列表。

```js
const originalFiles = modal.app.vault.getFiles;
const originalCache = modal.app.metadataCache.getFileCache;
augmentSuggestions(modal,'体',nativeResults,expander,true,api);
assert.equal(modal.app.vault.getFiles, originalFiles);
assert.equal(modal.app.metadataCache.getFileCache, originalCache);
```

只计算临时字符串／映射，不缓存整个笔记库。空查询不做候选枚举或规范化。不得枚举汉字候选组合并多次调用完整原生 getSuggestions。

- [x] **4.4 生命周期挂钩。** 包装 enabled switcher 实例的 onOpen，原生创建 modal 后只包装该 modal 的 getSuggestions；若已有打开的 modal，扫描时也挂载。处理核心插件启停；仅监听实际需要的 workspace 生命周期，不轮询后台。关闭／卸载恢复自己持有的包装，保留后来覆盖的方法。

- [x] **4.5 覆盖模糊、范围与资格。** 文件 `體育研究.md` 被 `体研` 命中；alias `髮型指南` 被 `发型` 命中；`㍿` 名称对四字查询显示原单字高亮；非 BMP 全字符范围；路径命中与 basename 命中评分对照；忽略文件降权；附件选项；不同别名；创建输入保持原文。运行 `node --test tests/open-file.test.cjs`。

## Task 5：默认设置、入口集成与版本

**Files:** 修改 `src/main.js`、`tests/plugin.test.cjs`、manifest/package/lock；更新现有全库 harness 的模式预期。

**Interfaces:** main 导入 Task 3／4 的 install 函数、Task 4 所需公共 Obsidian API；调用 install 后将 cleanup 注册到现有生命周期。report 为现有 log，adapter 传 surface 字段。

- [x] **5.1 写设置红灯并完善替身。** workspace 事件替身允许同事件多个监听器；getLeavesOfType 按 type 返回；缺少 Markdown／switcher 的旧测试不应崩溃。不为了新适配删掉原来的生命周期、隐私和失败回归。

```js
for (const [saved, expected] of [
  [{},true], [{fullCompatibility:true},true],
  [{fullCompatibility:false},false], [{fullCompatibility:'true'},true],
]) {
  const f = fixture({saved:{...saved,keep:'unchanged'}});
  await f.plugin.onload();
  assert.equal(f.plugin.settings.fullCompatibility, expected);
  assert.equal(f.persisted.keep, 'unchanged');
  f.plugin.unload();
}
```

读取失败也默认 true 但不写盘。保存失败测试改为从 true 请求 false，失败后仍 true，防止测试没有真正测试状态变化。

- [x] **5.2 最小实现默认与安装。**

```js
this.settings = {fullCompatibility:true};
const savedMode = this.savedSettings.fullCompatibility;
if (typeof savedMode === 'boolean') this.settings.fullCompatibility = savedMode;
// 非 undefined 的非法值记录类别，不打印值。
this.register(installFind(this, log));
this.register(installOpenFile(this, log, {
  prepareFuzzySearch, prepareSimpleSearch, parseFrontMatterAliases,
}));
```

将设置说明改为“默认开启；关闭后仅停用插件额外的全量兼容关系”，明确原生行为保留。诊断分清 vault／find／open-file，未打开入口属于等待，不冒报成功。

- [x] **5.3 版本保持一致。** 版本改 0.2.0，build 标识同步；用 `npm install --package-lock-only --ignore-scripts` 更新 lock，不升级 esbuild 或添加依赖。旧探针源码／manifest 0.0.2 不改。

ES2018 构建会生成 catch 绑定，已安装 0.1.0 的五个 unused catch 参数告警属于生成代码源级风格问题；不要为清告警手改已验收文件。新代码以源码检查和可重复构建为准，不把这类告警声称为运行异常。

- [x] **5.4 更新全库回归的设置前提。** 首次加载断言 full=true 并测试 `①／1`；再通过真实设置窗口关闭，执行原 default-only 用例，然后开启验证保存及再次关闭。保留一个事先写入 false 的全新临时安装，确认升级／重载不会强开。

运行 `node --test tests/plugin.test.cjs tests/matcher.test.cjs tests/find.test.cjs tests/open-file.test.cjs`、`npm run build` 和 `node --check dist/main.js`；语言检查对源码做主动扫描，不将空缓存当全绿。

## Task 6：完整真实应用验收

**Files:** 完成 surfaces.cjs、run.cjs；证据 `docs/research/evidence/find-open-file/`。

- [x] **6.1 连续执行两套验收。**

```sh
npm test
npm run build
node --check dist/main.js
npm run test:native
node experiments/native-search-spike/run.cjs --plugin-dir dist --surfaces
```

长任务用 bg_run 等原生通知，不轮询。启动器只关闭自己创建的进程；API 页面打开／菜单动作只对已核验临时 vault 的实例操作。

- [x] **6.2 UI 不仅看程序调用。** 编辑／阅读 Find 实际 fill、下一条／上一条、计数和截图；Open file 实际输入、键盘选项、点击打开原路径。输入 value setter 记录不能出现内部正则／规范串；改设置后的下一输入生效；未改动夹具逐字节核对。

```js
await page.evaluate(() => app.commands.executeCommandById('switcher:open'));
const input = page.locator('.prompt-input');
await input.fill('体育');
await page.waitForFunction(() => {
  const modal = app.internalPlugins.getEnabledPluginById('switcher').activeModal;
  return modal?.chooser?.values?.some(row => row?.file?.path==='體育研究.md');
});
assert.equal(await input.inputValue(), '体育');
```

字段必须经 Task 1 验证；不通过设置测试自己的返回结果伪造 native UI 通过。

- [x] **6.3 专用写安全回归。** Find 查询 `体` 能选择 `體`；转入替换后明确重新输入 `体`，替换为 `X`，只得到原生同动作的 `體 X 體\n`。正则若入口支持，按原生基线；其他文档及设置不变。禁用插件后，重新输入各查询恢复各自原生行为。

- [x] **6.4 状态与失败。** 重复开关 Find／快速切换器、修改当前夹具、换文件、编辑阅读切换、后开面板、外来钩子、占位 leaf 和卸载；注入候选映射错误／缺 API，确认原列表完整回退。pageErrors 必须为空，预期故障日志单独列出，不说 Console 没有任何 warning。

- [x] **6.5 基准与证据。** 用纯临时文件元数据测 100／1000／10000 个候选；记录原生与增强耗时、fuzzy→simple 切换，不写用户内容。保存原生 JSON、构建／数据哈希、截图和任务日志；读取截图检查原文高亮和交互，没有手机证据时只标桌面通过。

## Task 7：自审、文档和安全部署

**Files:** 更新 README、TODO、设计／计划状态、新研究报告；复用已有 install-test.cjs，不扩展安装白名单。

- [x] **7.1 自审逐项对照。** 将 spec §1–9 对应到以上任务；重点验证只读游标、原生匹配并集、候选资格和偏移映射。仍为作者自审，无独立子代理结论。

- [x] **7.2 写真实使用文档。** 三入口位置和范围、新默认与旧 false 保留、关闭开关不禁用原生固有匹配、Find 不扩大替换、未验证平台、诊断和回退原因。新增报告明确记录基线和 0.2.0 实测，不改写 0.1.0 历史证据。

- [x] **7.3 验证后安装。** 按旧流程先对测试库非白名单文件建立字节哈希，执行安装，再核对全部非产物文件及源／目标五个产物。只要代码或构建在最后原生验收后变化，就重新验证后再安装。

```sh
node --test tests/install-test.test.cjs
node scripts/install-test.cjs
```

保持原 data.json 不变；若保存过 false，交付说明明确用户手动打开。保存备份路径与安装回执，不关闭／重启用户实例。

- [x] **7.4 交付。** 告知版本、重新启用插件、Find／Open file 的用法和 iOS 复测清单。没有完成真实入口验收时不安装或宣称完成。

## 计划自审

- spec §1／8 默认与生命周期 → Task 5；§5 偏移／共享规则 → Task 2；§6 → Task 1／3／6；§7 → Task 1／4／6；§9 → Task 6／7。
- 原生 searchCursor 只接收字符串，已排除直接塞 RegExp 的错误捷径；新增游标有完整方法合同与显式禁止写入。
- API 注入只为复用公共 matcher 和可测试边界，不引入通用适配器框架；已有数据与安全安装工具不重写。
- 对不确定的私有 UI 合同先有可运行基线任务，不把静态观察当成通过证据；发现合同不成立就停止并记录，不删验收项。
- 每个 Review Focus 均有对应纯测试和真实应用步骤；原生片段仅用于理解，不能整段复制实现。

**执行交接：** 主会话实施及自审完成。最终 bbebe691f exit 0，安装 5 个产物与实测哈希一致，12 个非产物文件不变；原 0.1.0 与首轮 0.2.0 均有备份。没有独立评审、Git 或子代理操作。证据与限定见 [验证报告](../../research/find-open-file.md) 和 `.pi/find-open-file-progress.md`。

- [ ] 用户复测 iOS Find／Open file；其他平台、真实弹出窗口和大型库等未测矩阵不标完成。
- [ ] 非文件书签／未解析链接独立 UI 专项；目前验证为原生行保留的纯测试，不冒称真实 UI 全覆盖。
