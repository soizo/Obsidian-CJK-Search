# CJK Search Full Character Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本项目未授权子代理；默认主会话执行和自审，不自动派发实现者或审查者。

**Goal:** 将批准的完整 Unicode／OpenCC 字符数据接入原生全库搜索，并更新用户已经会使用的独立测试库。

**Architecture:** 构建期下载并锁定官方数据，生成默认／全量两个模式的紧凑字符与序列索引。纯 JavaScript 查询编译器将普通字面文本展开为原生正则；Obsidian 适配层保留输入、历史和原生结果流程。旧探针代码继续保留为基线。

**Tech Stack:** Python 3.12 标准库处理 ZIP／文本及数据生成；Node.js 22、`node:test` 与 `assert` 做运行时检查；开发期 esbuild 0.28.2 打包，Obsidian 为外部依赖；现有 Playwright 做本机桌面验证。

**Spec:** `docs/superpowers/specs/2026-09-21-full-character-data-design.md`（用户已批准）。

**Status:** 用户已审阅并选择“直接执行”，由主会话实施，不使用子代理。五项任务已完成并安全安装至已有测试库（0.1.0）。实际结果、限制及证据见 `../../research/full-character-data.md`，执行历史及变更裁定见 `.pi/full-character-data-progress.md`。

## Global Constraints

- Unicode：固定 **18.0.0**。
- OpenCC：固定官方 **ver.1.4.2**，提交 `025f371dc76b598d77384fbdab90c937471844d8`。
- 仅使用 Unicode 官方数据与 OpenCC 官方字符字典，不转换地区词汇，不翻译。
- 优先召回，默认对称互搜，包括 `发／發／髮`、`弁／瓣／辨／辯` 这类多义合并。
- 默认限定东亚文字及标点兼容；全量兼容开关默认关闭。
- 初始保护上限：输入 256 个 Unicode 码位，展开正则 65,536 个 UTF-16 单元，展开过程 4,096 个分支节点。
- 插件的暂用 ID 保持 `cjk-search-probe`，最低版本保持 1.13.7。
- 运行时只用 JavaScript 和 Obsidian，不依赖 Node、Electron 或联网服务。
- 不改变搜索输入、近期历史或笔记，不建立另一套笔记索引。
- 无映射／不支持语法／接口缺失／数据错误／展开超限：保持原生行为，并区分日志原因。
- 保留现有诊断前缀 `[CJK-Probe]` 与 `print-diagnostics` 命令，日志不含查询、笔记内容或路径。
- 仅更新手动测试库的插件产物，保留笔记和 `data.json`；不操控用户当前 Obsidian 实例。
- 不新建 Git 仓库、分支、提交或推送；不使用子代理。
- 移动端由用户测试；本轮自动化结论仅适用于 macOS / Obsidian 1.13.7。

## Review Focus

1. 非 BMP 字符与正则无 `u` 标志：必须命中完整代理对，原文 UTF-16 偏移正确。Task 2 单测、Task 4 原生测试。
2. 混合简繁＋重叠多字符分解：不能只选最长分段，也不能指数展开后再检查上限。Task 2 合成图和真实数据测试。
3. 大小写不敏感查询中的兼容序列，例如 `FFI` 查 `ﬃ`：候选发现阶段也必须遵循大小写模式，不能只给最终正则加 `i`。Task 2／4。
4. 延迟 layout-ready、后开搜索面板及另一插件替换钩子：卸载后不得重新挂载、重复包裹或覆盖他人方法。Task 3 生命周期检查。
5. 重建失败与更新安装时的数据安全：坏输入不覆盖最后成功产物；复制插件不得覆盖用户笔记和设置。Task 1／5 的临时目录测试。

## 文件与接口

| 文件 | 职责 |
| --- | --- |
| `scripts/build_data.py` | 官方文件取得、锁定验证、字段解析、分组、兼容序列、确定性生成及审计报告 |
| `data/sources.lock.json` | URL、版本／提交、SHA-256、字节数及许可文件锁定 |
| `data/upstream/` | 官方输入快照，构建时核对完整性，不读网络作为离线构建回退 |
| `data/character-data.json` | 可打包的模式索引及数据版本 |
| `data/relations.jsonl`、`data/report.json` | 全关系溯源、纳入／排除统计、日文差异、最大组和反例路径 |
| `src/matcher.js` | 无 Obsidian 依赖的纯查询展开器和上限检查 |
| `src/main.js` | 原生钩子、加载／卸载、唯一设置开关和诊断 |
| `manifest.json` | 暂用 ID、0.1.0 测试版、最低 Obsidian 版本及移动可加载声明 |
| `scripts/build.cjs` | esbuild 打包及复制许可，不自动部署 |
| `scripts/install-test.cjs` | 只安装到批准的手动测试库，备份旧产物并验证复制 |
| `tests/test_build_data.py` | 标准库 unittest：解析、策略、锁定、确定性及失败不覆盖 |
| `tests/matcher.test.cjs` | node:test：纯逻辑、全关系检查、大小写、序列和保护上限 |
| `tests/plugin.test.cjs` | VM／最小 Obsidian 生命周期替身，验证钩子所有权、回退、设置和隐私 |
| `tests/install-test.test.cjs` | 临时目录中的安全安装测试 |
| `experiments/native-search-spike/run.cjs` | 复用隔离启动器；新增 dist 产物及全量测试模式 |
| `LICENSES/`、`THIRD_PARTY_NOTICES.md` | 保留上游许可与来源说明 |
| `README.md`、`TODO.md` | 用户使用方法与真实完成状态 |

不修改旧探针 `experiments/native-search-spike/main.js`／`manifest.json`。源码目录下发现用户新增的 `.obsidian/`、`测试.md`，也不清理或覆盖。

### 固定的数据合同

```js
// data/character-data.json
// schema === 1；每个 entries 条目是 [单个 Unicode 标量, 非空规范键字符串]。
// 规范键用固定数据分解和同组代表生成，不调用宿主 normalize()。
// entries 包含受影响的同组代表本身，以便反向索引发现所有候选。
// 每个模式独立生成，不在运行时将 full 直接并入 eastAsian。
{
  schema: 1,
  unicodeVersion: '18.0.0',
  openccVersion: '1.4.2',
  openccCommit: '025f371dc76b598d77384fbdab90c937471844d8',
  modes: {
    eastAsian: { entries: [['体', '体'], ['體', '体']] },
    full: { entries: [['体', '体'], ['體', '体'], ['ﬃ', 'ffi']] }
  }
}
```

上例只说明 schema，不是可交付数据。完整产物由 Task 1 自动生成。SHA-256 放在外部报告和构建元数据中，避免文件哈希自引用。

---

## Task 1：固定官方输入并生成完整数据

**Files:** 创建 `scripts/build_data.py`、`tests/test_build_data.py`、`data/` 上述文件及 `LICENSES/`、`THIRD_PARTY_NOTICES.md`。

**Interfaces:**
- `parse_unihan(text: str, source: str) -> list[dict]`：记录字段 `source`、`target`、`field`、`file`、`included`；source/target 为字符，不含 Unihan 注记。
- `parse_opencc(text: str, source: str) -> list[dict]`：同合同；多候选分别记录，拒绝词组条目。
- `build_modes(relations: list[dict], decompositions: dict[str,str], east_asian_sources: set[str]) -> dict`：返回两个模式对象，结构见上文。
- `verify_file(path, expected_sha256: str) -> bytes`：缺失／校验失败抛异常。
- CLI `python3 scripts/build_data.py --fetch`：仅在初次建锁时取得批准来源；已有锁必须遵循其哈希，不自动改锁。
- CLI `python3 scripts/build_data.py --output-dir PATH`：默认离线构建，缺输入失败；不因缺输入偷偷联网。

- [x] **1.1 写解析和策略失败测试。** 首批测试如下，按实际官方字段另加文件头、范围行、注释、多候选和错误码位测试：

```python
import unittest
from scripts.build_data import parse_unihan, parse_opencc, build_modes

class DataTests(unittest.TestCase):
    def test_typed_unihan(self):
        rows = parse_unihan(
            'U+767C\tkSimplifiedVariant\tU+53D1\n'
            'U+771E\tkSemanticVariant\tU+771F<kLau,kMatthews\n',
            'Unihan_Variants.txt')
        self.assertEqual(rows[0]['target'], '发')
        self.assertTrue(rows[0]['included'])
        self.assertEqual(rows[1]['target'], '真')
        self.assertFalse(rows[1]['included'])

    def test_opencc_candidates_and_phrase_rejection(self):
        rows = parse_opencc('发\t發 髮\n', 'STCharacters.txt')
        self.assertEqual({r['target'] for r in rows}, {'發', '髮'})
        with self.assertRaises(ValueError):
            parse_opencc('鼠标\t滑鼠\n', 'STCharacters.txt')

    def test_modes_do_not_leak(self):
        rows = parse_opencc('体\t體\n', 'STCharacters.txt')
        modes = build_modes(rows, {'①': '1', '㍿': '株式会社'}, {'㍿'})
        east = dict(modes['eastAsian']['entries'])
        full = dict(modes['full']['entries'])
        self.assertEqual(east['体'], east['體'])
        self.assertNotIn('①', east)
        self.assertEqual(full['①'], '1')
        self.assertEqual(east['㍿'], '株式会社')
```

- [x] **1.2 运行红灯。** `python3 -m unittest discover -s tests -p 'test_build_data.py' -v`；确认因未实现导入器失败，不是 Python 环境错误。

- [x] **1.3 下载及锁定。** Unicode 基地址 `https://www.unicode.org/Public/18.0.0/ucd/`；文件为 `Unihan.zip`、`UnicodeData.txt`、`EquivalentUnifiedIdeograph.txt`、`Scripts.txt`、`Blocks.txt`。Unihan ZIP 与已保存证据的 SHA-256 `4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e` 对照。OpenCC 通过 `gh api repos/BYVoid/OpenCC/contents/<path>?ref=025f371dc76b598d77384fbdab90c937471844d8` 取得并解码官方内容；不取第三方镜像。保存 Unicode license 和 OpenCC LICENSE，检查同提交是否有 NOTICE 并记录结果。

锁定与临时输出的核心操作使用标准库：

```python
from hashlib import sha256
from pathlib import Path
import os

def verify_file(path, expected_sha256):
    content = Path(path).read_bytes()
    if sha256(content).hexdigest() != expected_sha256:
        raise ValueError('upstream-checksum-mismatch')
    return content

def write_verified_output(path, content):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_bytes(content)
    os.replace(temporary, path)
```

所有解析及验收先完成，再发布新产物；上例的单文件替换不代替整批产物验证。报错含来源与行号，不吞掉 malformed 行。源码无版本头的文件靠固定版本 URL／提交及锁定哈希，不编造不存在的头信息。

- [x] **1.4 生成两个模式。** 解析脚本和区块的范围，按 spec §5 选择默认源；递归分解的终端若包含拉丁／希腊／西里尔字母或数字，该兼容关系仅进入 full。官方字符分类使用 UnicodeData，不依赖本机 Python Unicode 版本。按允许关系和该模式单字符分解做连通分组，代表固定取最小码位；多字符分解递归转成代表序列，建立每个源字符的规范键。

对于递归环或同一单字符组得到互不等价的多个终端序列，构建失败并输出源路径，不能随便选第一个；如真实输入触发此阻塞，回到设计审查，不擅自改变批准语义。JP 字典先与 Unicode 日文字段覆盖对比，补充候选有独立计数。

- [x] **1.5 加入锁定和失败安全测试。** 使用 `tempfile.TemporaryDirectory()` 生成已知字节、计算哈希，再改一字节，断言 `verify_file` 抛错。构建入口在损坏副本上运行，断言非零退出且旧 `character-data.json` 字节未变。

- [x] **1.6 绿灯及完整构建。** 运行 unittest 和完整离线构建；审查所有排除计数、最大分组、日文新增边、三组反例的连通性。生成内容按码位／字段固定排序，不放时间戳。

```sh
python3 -m unittest discover -s tests -p 'test_build_data.py' -v
python3 scripts/build_data.py --output-dir /tmp/cjk-data-build-a
python3 scripts/build_data.py --output-dir /tmp/cjk-data-build-b
cmp /tmp/cjk-data-build-a/character-data.json /tmp/cjk-data-build-b/character-data.json
cmp /tmp/cjk-data-build-a/report.json /tmp/cjk-data-build-b/report.json
```

实际执行使用新建临时目录，避免覆盖已有同名路径。产物含完整版本和所需许可才可进入下一任务。

## Task 2：完整字符与序列查询展开

**Files:** 创建 `src/matcher.js`、`tests/matcher.test.cjs`。

**Interfaces:**
- `createExpander(data)`：验证 schema、两个模式、标量／序列和版本字段，失败抛类型明确的错误；返回 `{ expand }`。
- `expand(query, { fullCompatibility = false, caseSensitive = false } = {})`：返回 `{ status, reason, source, nodes }`。
- `status` 为 `expanded`／`unchanged`／`fallback`；`source` 只有 expanded 时是正则源码，不含 `/` 分隔符，否则为 `null`。
- `reason` 固定枚举：`mapped`、`empty-query`、`unsupported-syntax`、`no-mapping`、`input-limit`、`pattern-limit`、`branch-limit`。

- [x] **2.1 写模式、序列及反例红灯测试。** 使用 Task 1 完整数据，不回退四组样例；小型构造数据仅用于重叠分段和保护上限。

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { createExpander } = require('../src/matcher.js');
const data = require('../data/character-data.json');
const expander = createExpander(data);
function matches(query, content, options = {}) {
  const result = expander.expand(query, options);
  assert.notEqual(result.status, 'fallback');
  const escape = text => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`^(?:${result.source ?? escape(query)})$`,
    options.caseSensitive ? '' : 'i').test(content);
}

test('approved groups are symmetric', () => {
  for (const group of ['体體', '真眞', '发發髮', '弁瓣辨辯辩', '⺅亻', '、､﹑'])
    for (const left of group) for (const right of group)
      assert(matches(left, right), `${left}/${right}`);
});
test('modes, sequences and negative controls', () => {
  for (const [a, b] of [['①','1'], ['²','2'], ['Ａ','A'], ['ﬃ','ffi']]) {
    assert(!matches(a, b));
    assert(matches(a, b, {fullCompatibility:true}));
    assert(matches(b, a, {fullCompatibility:true}));
  }
  assert(matches('㍿', '株式會社'));
  assert(matches('株式會社', '㍿'));
  for (const [a,b] of [['土','士'], ['未','末'], ['丼','井'], ['鼠标','滑鼠']])
    assert(!matches(a,b));
  assert(matches('鼠标','鼠標'));
  assert(matches('FFI','ﬃ',{fullCompatibility:true,caseSensitive:false}));
  assert(!matches('FFI','ﬃ',{fullCompatibility:true,caseSensitive:true}));
});
test('syntax and input bounds', () => {
  for (const query of ['path:a 体', '/体/', '"体"', '-体', '体 OR 真'])
    assert.equal(expander.expand(query).reason, 'unsupported-syntax');
  assert.equal(expander.expand('体'.repeat(257)).reason, 'input-limit');
});
```

- [x] **2.2 运行红灯。** `node --test tests/matcher.test.cjs`，确认缺少展开器／能力导致失败。

- [x] **2.3 实现反向序列索引与有界编译。** 每模式构造源标量→规范键映射；规范键→候选标量建立前缀索引。查询按码位展开为规范键串，从每个位置枚举所有可消费的完整键；相同结束位置的候选先合并，再拼接该位置的后缀。采用从后往前的迭代动态规划，不递归枚举完整查询的笛卡尔积。

关键代码合同：

```js
const LIMITS = Object.freeze({ input: 256, pattern: 65536, branches: 4096 });
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const unchanged = reason => ({status:'unchanged', reason, source:null, nodes:0});
const fallback = (reason, nodes) => ({status:'fallback', reason, source:null, nodes});
// alternatives: 非空已转义源码；此处不使用字符类，代理对保持整体。
const alternate = alternatives => alternatives.length === 1
  ? alternatives[0] : `(?:${alternatives.join('|')})`;
```

构造每个新分支前计数；拼接前通过各段 `.length` 的和检查上限，禁止先分配超大字符串再判断。所有分支消费至少一个码位，不生成空匹配、循环量词、回溯引用；允许 literal 文本中的正则元字符时必须逐项转义。规范键展开和索引遍历同样计入保护预算。

大小写不敏感时，前缀匹配必须考虑当前 JS 正则 `i` 能识别的等价标量；候选别名需用同引擎的锚定 `i` 测试校验，不能无条件把 Unicode 多字符大小写展开当成原生大小写等价。规范分解仍只用固定数据，不调用 `normalize()`。

- [x] **2.4 补齐 Review Focus 单测。** 构造 `①→ab`、`②→bc`、`③→abc` 的小索引，查询 `abc` 应同时接受 `①c`、`a②`、`③`、`abc`。用 `𠀀／一` 的合成单字组检查无 `u` 正则：文本 `前𠀀后` 的 index 为 1、match 长度为 2，不能匹配孤立高／低代理。构造多条相交序列触发 branch-limit，以及一个大单组触发 pattern-limit；断言 source 为 null，不返回截断匹配器。

```js
test('overlapping sequence alternatives are not greedy', () => {
  const mode = {entries:[['①','ab'],['②','bc'],['③','abc']]};
  const custom = createExpander({...data,modes:{eastAsian:mode,full:mode}});
  const result = custom.expand('abc',{caseSensitive:true});
  const regex = new RegExp(`^(?:${result.source})$`);
  for (const text of ['①c','a②','③','abc']) assert(regex.test(text));
});
test('damaged schema is rejected', () => {
  assert.throws(() => createExpander({...data,schema:99}));
  const mode = {entries:[['\uD800','一']]};
  assert.throws(() => createExpander({...data,modes:{eastAsian:mode,full:mode}}));
});
```

- [x] **2.5 完整数据绿灯。** 对 `relations.jsonl` 中每条 included 关系验证对应模式下双向锚定匹配；原生语法保留字符的纯模式验证使用生成 entries 和已转义目标，而不绕过产品输入语法宣称支持操作符。记录明确不能经用户字面入口提交的关系，不把 skip 当成匹配成功。对真实模式全部 entries 检查规范键与源字符互搜，加入默认／全量相互独立的测试。

运行 `node --test tests/matcher.test.cjs`，记录生成大小和代表性长查询耗时。若反例或复杂度失败，修生成规则／算法，不删除测试。

## Task 3：接入 Obsidian、设置与诊断

**Files:** 创建 `src/main.js`、`tests/plugin.test.cjs`、`manifest.json`、`package.json`、`package-lock.json`、`scripts/build.cjs`。

**Interfaces:**
- 导出 `class CjkSearchPlugin extends Plugin`，沿用原插件 ID。
- `settings = { fullCompatibility: false }`；`setFullCompatibility(enabled): Promise<void>` 严格接收布尔值、持久化，影响下一查询。
- `printDiagnostics()` 输出只含版本、模式、计数、耗时、状态的 JSON 快照。
- 使用 Task 2 的 `createExpander(data).expand(query, options)`，禁止重新实现一套字符转换。

- [x] **3.1 先建立生命周期红灯。** `tests/plugin.test.cjs` 使用 `node:vm` 注入最小 `obsidian` 模块、真实 matcher 与小数据，记录 `register`／`registerEvent`／`registerDomEvent` 的清理函数；假 view 的原方法保存调用参数并返回 sentinel。断言原方法的 this、参数与返回值保持一致。

测试中的钩子场景必须包含：

```js
// 此段置于上述 VM fixture 已返回 plugin/view/workspace 的测试体内。
const original = view.renderSearchInfo;
plugin.attachViews('test');
const first = view.renderSearchInfo;
plugin.attachViews('test-again');
assert.equal(view.renderSearchInfo, first);
const otherPluginWrapper = function () {};
view.renderSearchInfo = otherPluginWrapper;
plugin.unload();
assert.equal(view.renderSearchInfo, otherPluginWrapper);
assert.notEqual(first, original);
// workspace 保存 onLayoutReady 回调；在卸载后触发应保持方法不变。
workspace.fireLayoutReady();
assert.equal(view.renderSearchInfo, otherPluginWrapper);
```

另测 constructor 抛错、matcher 缺失、无 searchComponent、getMatchCount 不是函数、数据 schema 损坏、后开面板，以及无原文日志。所有替身只模拟本测试用到的公共生命周期及已确认内部接口，不伪造真实 E2E 通过。

- [x] **3.2 运行红灯。** `node --test tests/plugin.test.cjs`。

- [x] **3.3 最小迁移探针。** 以 `experiments/native-search-spike/main.js` 为参考创建新入口，移除手写 groups，保留已验证 matcher 介入点。读取设置时只接受 `fullCompatibility === true`；非法旧值退为 false 并记录设置修复原因。校验数据失败时记录错误并保持原生，不挂入一个半初始化的 matcher。

关键接入调用：

```js
const result = plugin.expander.expand(query.query, {
  fullCompatibility: plugin.settings.fullCompatibility,
  caseSensitive: query.caseSensitive,
});
if (result.status === 'expanded') {
  const replacement = new query.constructor(this.app, `/${result.source}/`, query.caseSensitive);
  if (!replacement.matcher || typeof replacement.matcher.match !== 'function')
    throw new Error('Native matcher unavailable');
  query.matcher = replacement.matcher;
  query.requiredInputs = replacement.requiredInputs;
}
```

保存原 matcher／requiredInputs；出现替换失败时还原，继续原方法，不吞掉原生自身抛出的错误。保护版面回调：onload 设置 active，卸载先设 inactive，onLayoutReady 和 attachViews 检查 active。已关闭面板移出注册集合并释放监听器；卸载只恢复仍由本插件拥有的方法。

唯一设置使用 Obsidian `PluginSettingTab`／`Setting` 的原生 toggle，文案「全量兼容匹配」，描述包含 `①／1`、`Ａ／A`、多字符兼容和“修改后重新输入搜索”。记录保存失败并提示，不宣称已保存。

- [x] **3.4 设置与隐私绿灯。** 设置真值写入后重新构造插件验证恢复；检查关闭还原 default。输入独特私密 sentinel，捕获所有插件日志，断言不出现 sentinel 或笔记路径。超限／接口失效 Notice 适度去重，诊断必须说明本次未增强。

- [x] **3.5 打包。** 采用真实已查到的开发依赖 esbuild 0.28.2，固定版本和 npm lock，不复制宿主目录中的依赖。

```sh
npm install --save-dev --save-exact esbuild@0.28.2
```

`package.json` 为私有项目，脚本包含 `test`、`build`、`data:build`、`test:native`、`install:test`；正式测试包版本 0.1.0，最低 Obsidian 1.13.7，`isDesktopOnly:false` 仍不代表手机已通过。

```js
// scripts/build.cjs 核心打包调用；先检查生成文件／报告哈希和许可证。
await require('esbuild').build({
  entryPoints:['src/main.js'], outfile:'dist/main.js', bundle:true,
  platform:'browser', format:'cjs', target:'es2018', external:['obsidian'],
  sourcemap:false, minify:false, metafile:true,
});
```

`src/main.js` 用普通 CommonJS 引用 `./matcher.js` 与 `../data/character-data.json`。检查 metafile：运行时外部依赖只能是 obsidian；复制 manifest、许可与通知。构建不得下载字表。运行 `node --check dist/main.js`，再跑两份 Node 单测。

## Task 4：用实际 Obsidian 验证完整产物

**Files:** 修改 `experiments/native-search-spike/run.cjs`；证据写入 `docs/research/evidence/full-character-data/`。

**Interfaces:** 保留无参数旧探针路径及 `--baseline`；增加 `--plugin-dir dist --full-data`。启动、profile、mock-keychain、vault realpath 检查和关闭自己进程的流程不变。

- [x] **4.1 先扩展红灯场景。** 仍用当前旧探针运行新增完整数据断言，首先应因 `发／發／髮` 无法互搜失败，不因文件缺失或应用启动失败而冒充红灯。

full-data 模式在新的临时库加入合成笔记，不修改手动测试库：

```js
const extraFixtures = {
  'variants-a.md':'发\n弁\n⺅\n①\n㍿\nﬃ\n',
  'variants-b.md':'發\n辨\n亻\n1\n株式会社\nffi\n',
  'variants-c.md':'髮\n瓣\n辯\n²\nＡ\n',
  'negative-a.md':'土\n未\n丼\n鼠标\n',
  'negative-b.md':'士\n末\n井\n滑鼠\n鼠標\n',
};
```

原九组断言保留。文件就绪检查用夹具数，不再硬编码 3。隐私 sentinel 实际改为 `PRIVATEQUERYSENTINELxyz`（纯字母），避免完整字表将旧 sentinel 的“漢”或下划线合法展开；跳过原因兼容旧 `no-sample-mapping` 与新 `no-mapping`，两版预期分别明确记录。

- [x] **4.2 连接 dist 并跑绿灯。** 每条查询先确认当前 query 是本次值，再等 `!working` 和结果，避免复用上次相同数量的陈旧结果。

```js
await page.waitForFunction(query =>
  probeView.searchQuery?.query === query && !probeView.dom.working, currentQuery);
```

断言所有预期文件列表和匹配范围，不只断言数量。测试全量模式关闭时 `①` 不额外匹配 `1`，设置开关后下一次查询双向匹配；切换后禁用／启用插件，验证设置持久化；最终关闭再次搜索恢复 default。

- [x] **4.3 真实交互与错位检查。** 输入 `株式会社` 点击 `variants-a.md` 的 `㍿` 命中，验证原文高亮仅一个字符及 native 点击；反方向匹配四字符范围。补充平面用实际数据报告选取的一条关系生成夹具，精确断言 2 个 UTF-16 单元，而不是任选一个不存在的汉字对应。

设置 UI 必须实际打开、点击 toggle 并检查持久化，不能只通过调用 setFullCompatibility 声称界面可用。加测后开第二面板、同一查询两个面板、卸载后的输入监听移除；输出截图并读取检查。

- [x] **4.4 故障与保护证据。** 在临时实例模拟一个不兼容 view 和 replacement 构造失败，确认有诊断、原生原词仍可搜索。对长查询检查明确回退、不写入扩展输入；确认 `pageErrors` 为空，否则解释并处理，不能只凭 exit 0。

```sh
node experiments/native-search-spike/run.cjs --plugin-dir dist --full-data
```

记录数据哈希、构建哈希、查询展开耗时、产物大小、每项结果及截图，不写“所有平台通过”。长时间命令用 bg_run，不轮询等待。

## Task 5：安全更新用户测试库及交付

**Files:** 创建 `scripts/install-test.cjs`、`tests/install-test.test.cjs`、`README.md`；更新 `TODO.md`、设计状态及实际结果文档。

**Interfaces:**
- `installTestPlugin(sourceDir, vaultDir) -> Promise<{files, backupDir}>` 导出供临时目录测试。
- 直接运行时只允许目标 `experiments/native-search-spike/manual-test-vault`，不自动寻找或安装到真实库。
- 安装白名单仅 `main.js`、`manifest.json`、`LICENSES/`、`THIRD_PARTY_NOTICES.md`；不复制／覆盖 `data.json`、workspace、core-plugins、community-plugins 或 Markdown 笔记。

- [x] **5.1 红灯安全测试。** 建立临时 source 和 vault，预放笔记、`data.json`、旧 main.js，记录字节；调用安装函数，检查新 main／manifest 相同、旧文件备份存在，其他文件不变。错误插件 ID、丢失许可、源目录与目标重合、目标插件目录是符号链接均拒绝且不修改文件。

```js
const beforeNote = await fs.readFile(path.join(vault, 'user-note.md'));
const beforeSettings = await fs.readFile(path.join(pluginDir, 'data.json'));
const result = await installTestPlugin(source, vault);
assert.deepEqual(await fs.readFile(path.join(vault,'user-note.md')), beforeNote);
assert.deepEqual(await fs.readFile(path.join(pluginDir,'data.json')), beforeSettings);
assert.deepEqual(await fs.readFile(path.join(pluginDir,'main.js')),
  await fs.readFile(path.join(source,'main.js')));
assert(result.backupDir);
```

- [x] **5.2 实现安全安装并绿灯。** 先核对完整来源和目标 realpath、拒绝受影响路径上的符号链接，再备份白名单旧产物到仓库 `.pi/` 下新建目录；在目标目录写临时文件并逐个 rename。失败时恢复本次已替换产物，只操作安装白名单，保留备份并报告。绝不递归删除整个插件目录。

运行 `node --test tests/install-test.test.cjs`；通过前不安装到用户测试库。

- [x] **5.3 总体验证后部署。**

```sh
python3 -m unittest discover -s tests -p 'test_build_data.py' -v
node --test tests/matcher.test.cjs tests/plugin.test.cjs tests/install-test.test.cjs
node scripts/build.cjs
node experiments/native-search-spike/run.cjs --plugin-dir dist --full-data
node scripts/install-test.cjs
```

只在前面的检查通过后执行最后一行。用户当前 Obsidian 不由脚本关闭／重启／操控；告知关闭再启用插件以加载新产物。

- [x] **5.4 完成文档与自审。** 根 README 写清手动测试库已有插件、全量兼容开关、普通字面查询边界、诊断命令、来源和许可证。更新 TODO 为实际结果；没有通过的移动端／其他平台不打勾。检查交付清单和哈希，说明数据规模来自生成报告，不猜测数字。

## 计划自审与执行交接

- Spec §1–5 → Task 1–2；§6–7 → Task 2–3；§8 → Task 1／2 全数据检查、Task 4 实际应用、Task 5 安全安装；§9 → 本计划的授权边界。
- 五项 Review Focus 均有任务及明确测试，不以编译通过代替真实 UI 或手机测试。
- 数据合同、`createExpander`／`expand`、设置方法和安装函数在消费前均定义。
- 不引入地区转换、复杂语法解析、额外 UI 框架、完整 NFKC 算法或手机自动化。
- 若官方数据触发多序列冲突、禁用关系间接合并、内部引擎不支持所需正则或明显性能问题，停在可复现证据处，不偷偷缩小覆盖或重写架构。

推荐主会话直接执行这五个紧密衔接的任务，每步红→绿后再继续。计划审阅确认前不运行安装、构建或实现代码；此文件中的代码块是实施说明，不是已实现产物。
