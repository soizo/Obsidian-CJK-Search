# 汉字异体与编码兼容数据源调查

调研日期：2026-09-21。

范围：为 CJK Search 寻找可追溯、可离线使用、许可适合分发的汉字异体和编码兼容对应数据。用户已授权精简来源，下述选型记录此次收敛；尚未批准插件实现方案，也没有验证 Obsidian 原生搜索的接入。

## 结论

推荐以 **Unicode UCD／Unihan 为基础，OpenCC 字符级字典补充地区写法**。先不要把大量社区表、网页字典和日本行政缩退表混成一张无类型的大表。

Unicode 提供的不只是 NFKC：它还提供汉字异体、简繁、日本新旧字形、部首对应，以及汉字变体序列等不同数据。它们的语义和成熟度并不相同，必须分类使用。

- `真／眞` 已有 Unicode 官方可查的异体关系，不需要凭形似手工猜测。
- 康熙部首、部分补充部首与统一汉字有官方对应表，覆盖范围不止 NFKC。
- 台湾教育部和韩国古典翻译院可作为核查资料，但目前不能据此承诺允许将其字表打包再分发。
- 日本 MJ 缩退表可下载、许可明确，但它是有损的行政字符转换候选表，不是无条件的“同一个字”证明。
- 尚未找到一套同时具有完整五地覆盖、简单可再分发许可、无歧义等价语义的数据；不应宣传完整覆盖所有地方标准。

## 收敛后的来源选择

按用户授权，首版仅保留 **Unicode 官方数据、OpenCC 官方字符字典** 两个来源体系。目标是覆盖已约定的字符关系，而不是堆叠字表或承诺五地全部汉字标准无遗漏。

| 保留项 | 用途与边界 |
| --- | --- |
| Unicode 18.0 UCD／Unihan | 简繁、日本新旧字体、Z 异体、经筛选的一般异体，以及兼容汉字和标点分解 |
| Unicode `EquivalentUnifiedIdeograph.txt` | 补足康熙部首和补充部首对应，按已确认的部首范围选取；不自动扩大到所有笔画或偏旁变形 |
| Unicode `StandardizedVariants.txt`／IVD | 保留为汉字变体序列的官方依据；是否默认忽略字形选择差别仍需产品确认，不据此引入字体包或其他集合外部资料 |
| OpenCC 字符级字典 | 补足港台地区异体和简繁对应；日文表仅在差异核验显示有必要时补充，不默认重复叠加；排除地区词汇转换 |

首版不引入：MJ 缩退数据、台湾教育部字典导出、韩国古典翻译院字表、CJKVI 及其他社区镜像。下文调查记录保留作溯源，不作为待接入清单；只有出现可复现的覆盖缺口，才重新评估额外来源。

即使来源保留，也不全量使用所有关系：排除 `kSpoofingVariant`，默认排除 `kSpecializedSemanticVariant`；`kSemanticVariant` 作为有来源的候选，筛选后使用。具体筛选及跨表合并规则须在实现方案中明确，不能把“官方收录”当作无条件语义等价。

保留来源不等于必须安装其完整运行时：可在构建时提取、去重并生成必要的搜索数据，保留版本与许可；最终打包方式待原生搜索可行性调研后确定。

## 1. Unicode UCD／Unihan：首选基础

### 1.1 数据入口与版本

- [Unihan 18.0.0 数据包](https://www.unicode.org/Public/18.0.0/ucd/Unihan.zip)
- [UCD 18.0.0 目录](https://www.unicode.org/Public/18.0.0/ucd/)
- [UAX #38，Unicode 18.0.0，Revision 41](https://www.unicode.org/reports/tr38/tr38-41.html)
- [Unicode License V3](https://www.unicode.org/license.txt)

本轮读取的 UAX #38 是已发布的 Unicode 18.0.0 文档，日期为 2026-09-01；不要把新增字段误认为 Unicode 17 或更早版本已有。

Unicode License V3 允许使用、复制、修改、合并、分发和出售数据，但须在副本或相关文档中保留版权及许可声明。实际采用时仍需固定数据版本，保存随附声明；许可结论不自动扩展到外链字典、PDF、字体或第三方图片。

### 1.2 应按关系类型选择字段

| 数据／字段 | 表达的关系 | 对本插件的建议 |
| --- | --- | --- |
| `kSimplifiedVariant`、`kTraditionalVariant` | 简繁对应，一对多可能存在 | 候选基础，与 OpenCC 字符表交叉核查；符合已确认的宽搜方向 |
| `kJapaneseNewVariant`、`kJapaneseOldVariant` | 日文新字体／旧字体 | Unicode 18.0 新增；优先核查以补日文覆盖 |
| `kZVariant` | 同一抽象字形重复编码等关系 | 高相关候选，但不是跨地区完整异体总表 |
| `kSemanticVariant` | 通常可互相替用、意义相近或相同的异体，可能带来源及关系注记 | 可用作一般异体候选；保留来源并审核，不能全量无差别传递合并 |
| `kSpecializedSemanticVariant` | 特定义项／用法中相通 | 默认不采用，例如 `丼／井` 不应普遍当作同一个字 |
| `kSpoofingVariant` | 视觉混淆，服务于安全检测 | 排除；`土／士`、`未／末` 形似不等于异体互搜 |
| `kCompatibilityVariant` | CJK 兼容汉字的规范分解对应，由 UnicodeData 派生 | 编码兼容层使用；不要因字段名含 compatibility 就以为只受 NFKC 影响 |

来源：[UAX #38 §3.7 及各字段定义](https://www.unicode.org/reports/tr38/tr38-41.html#Variants)。上述多个异体字段的状态是 **Provisional**，不是对任意上下文都成立的规范等价公理；`kCompatibilityVariant` 则是 Normative。

关系带来源标签时，导入器须解析 `U+771F<kLau,kMatthews` 这类语法，不能直接将整串当作码位。数据之间存在重叠不代表它们可以无条件合并。

### 1.3 「真／眞」的具体证据

[Unicode 官方 U+771E 页面](https://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint=771E) 实际显示：

```text
眞 U+771E
kSemanticVariant       U+771F<kLau,kMatthews
kJapaneseNewVariant    U+771F
kJinmeiyoKanji          2010:U+771F
kKoreanEducationHanja   2007
kIRG_JSource           J0-6243
kIRG_KPSource          KP0-EBAA
kIRG_KSource           K0-7258
```

结论：`眞／真` 有明确异体关系，也有日本及朝鲜半岛的来源信息。不能把 `眞` 描述成“只属于朝鲜半岛”；日本人名及旧字体场景同样涉及它。

`kIRG_KSource` 和 `kIRG_KPSource` 分别记录韩国和朝鲜的提交来源／编码对应，不是两份“韩国字→中国字”转换表。`kKoreanEducationHanja`、`kKoreanName` 是教育／人名字符集合信息，也不直接表示异体关系。

此外，UAX #38 当前对 `kKoreanName` 明示部分较新的人名汉字增补尚未更新到该字段，因此不能用它证明韩国人名用字的完整覆盖。

## 2. 部首、兼容汉字与标点：不应全交给 OpenCC

### 2.1 部首专表

[EquivalentUnifiedIdeograph.txt（18.0.0）](https://www.unicode.org/Public/18.0.0/ucd/EquivalentUnifiedIdeograph.txt) 明确给出 CJK 部首及笔画与视觉相同或近似的统一汉字对应。

例如：

```text
⼈ U+2F08 → 人 U+4EBA
⺅ U+2E85 → 亻 U+4EBB
```

康熙部首 `⼈` 的对应也可由 NFKC 得到；但不能假设所有补充部首都受 NFKC 覆盖。这张专表能补上这一类遗漏。

限定：它描述的是部首／笔画符号与合理对应汉字，不是一般字符形似表。把 `⺅` 对应到 `亻`，不等于已决定进一步把所有偏旁变形（如 `亻／人`）一概合并；后者是另一个产品规则。

### 2.2 UnicodeData 的分解映射

[UnicodeData.txt](https://www.unicode.org/Public/18.0.0/ucd/UnicodeData.txt) 与 [UAX #15](https://www.unicode.org/reports/tr15/) 是规范等价和兼容等价的来源。

- `､` U+FF64 和 `﹑` U+FE51 均有指向 `、` U+3001 的兼容分解。
- 通常中文顿号和日语读点本来就使用同一码位 U+3001；字体显示差异不需要增加字符映射。
- `真／眞` 不会被 NFC／NFKC 合并，要用异体关系。
- 全量 NFKC 还会合并 `①／1`、`²／2` 等；这与用户已选择的“默认限定、可开启全量”相吻合，但具体匹配实现尚未确定。
- 分解可能是一对多字符，不只是一个字符变成另一个字符；不能把全量模式等同于逐字正则字符类。

默认模式应挑选已确认的东亚文字范围，而不是对整条搜索语法直接执行 NFKC。归一化仅用于匹配语义，不写回笔记或输入框。

## 3. Unicode IVD：日、韩人名中的字形序列

[Ideographic Variation Database](https://www.unicode.org/ivd/) 注册“汉字基字 + 变体选择符”的序列，与“两个独立汉字码位”的异体表不是一回事。

相关集合包括 Adobe-Japan1、Hanyo-Denshi、Moji_Joho 和 [KRName](https://www.unicode.org/ivd/krname/)。KRName 官方页面说明其覆盖韩国人名用汉字中的一小部分异体，共 36 个已注册序列，并非完整韩国／朝鲜异体表。

另有 [StandardizedVariants.txt](https://www.unicode.org/Public/18.0.0/ucd/StandardizedVariants.txt) 记录标准化变体序列，包括一些 CJK 兼容汉字对应的字形序列。

建议：把 IVS／标准化变体序列列为独立的覆盖检查，不以 NFKC 已处理为前提。是否默认忽略汉字字形选择差别仍需产品确认。即使决定忽略，也只处理相关汉字序列，不能全局删掉变体选择符而破坏 emoji 等内容。IVD 数据和参与集合中的字体、字形图及外部资料须分别核对许可。

## 4. OpenCC：适合作为补充，避免借用词组转换语义

来源：[官方仓库](https://github.com/BYVoid/OpenCC)、[Apache-2.0 许可](https://github.com/BYVoid/OpenCC/blob/master/LICENSE)。本轮查询到 HEAD 为 `e02cb540b9f98b2da7868b4e8f7b43f88bacadc5`；正式采用时应锁定版本，而非持续读取 HEAD。

优先核查：`STCharacters.txt`、`TSCharacters.txt`、`TWVariants.txt`、`HKVariants.txt`、`JPShinjitaiCharacters.txt`。

本轮直接读到 `JPShinjitaiCharacters.txt` 包含 `真\t眞`；文件中键值方向不应靠名称猜测，须结合配置使用。正式转换输出与“搜索应找到的所有候选”也不是同一个接口。

既然用户排除了地区词汇，不应直接采用会将 `鼠标` 改成 `滑鼠` 的地区词组配置。即使只用字符表，也要验证多候选、反向关系和跨表合并。

先前核查的上游 README 将日文转换列为有限／探索性支持。Unicode 的日文新旧字段提供了另一条权威数据来源，但两者都不自动保证全量日文人名和历史字形覆盖。

## 5. 日本 MJ 字符信息与缩退表：可用但不是首选全量导入

官方来源：[文字情報技術促進協議会 MJ 縮退マップ](https://moji.or.jp/mojikiban/map/)。

- 可下载 JSON／XML，页面列出版本 1.2.0。
- 将约六万 MJ 字形与约一万 JIS X 0213 字符建立对应候选，保留字典、告示等依据。
- 官方明确可能一对多或无对应，选择具体结果需考虑语境。
- 许可为 **CC BY-SA 2.1 Japan**，要求标明 IPA 著作物。若制作派生数据，要处理署名及相同方式共享要求；不要误用生成程序的 MIT 许可来替代数据许可。

建议：当 Unicode／OpenCC 在日文人名或行政字形上出现具体缺口时，再按对应依据引入所需关系。它不是可以直接当作对称、传递等价关系使用的“同字全集”。

## 6. 台湾教育部《异体字字典》：权威参考，不直接打包

来源：[字典官网](https://dict.variants.moe.edu.tw/)；[教育部字辞典官方 FAQ「综合 Q2／Q3」](https://dict.revised.moe.edu.tw/qa.jsp)。

FAQ 明确区分：其他四部字辞典有公众授权资料；《异体字字典》只说明部分资料可为学术研究、教育推广等非商业用途申请，须说明用途并经审核。FAQ 对 App 在线解析及 API 授权另有明确限制。

因此不能因为其他教育部字典开放、或社区有导出的 `twedu` 文件，就认定《异体字字典》全量资料可自由改编再分发。

建议：作为逐字考证来源；若希望批量纳入，需要单独核查并取得满足插件分发方式的授权。不自动爬取或导入第三方镜像。

## 7. 韩国古典翻译院：有专业资料，授权和编码覆盖需继续核实

[韩国古典综合 DB 异体字信息](https://db.itkc.or.kr/dch/) 本轮页面显示 14,016 条，分类有代表字、异体字、异形字，部分记录以字形图片而不是 Unicode 文本呈现。

这对考证韩国古籍异体很有价值，但本轮没有核实可直接下载、可改编再分发的全量机器可读字表。其[版权政策页面](https://www.itkc.or.kr/content/contents.do?menuId=112)直接抓取未成功，不据搜索摘要下完整法律结论。

建议：目前列作参考和授权待核查来源，不纳入插件数据。图片字形或未编码字也不能仅靠文本搜索插件解决。

朝鲜方面，当前可靠可用入口仍是 Unihan 的来源记录与已收录异体关系。本轮未找到可证明完整覆盖且具清晰开放许可的朝鲜独立异体转换表；这属于调研缺口，不是断言此类数据不存在。

## 8. 社区 CJKVI：可发现候选，不能直接相信“variant”标签

通过 GitHub API 读取 [cjkvi/cjkvi-variants](https://github.com/cjkvi/cjkvi-variants) 的目录及 `cjkvi-variants.txt`、`jp-old-style.txt`、`twedu-variants.txt` 文件头和示例。

该仓库有日本新旧字、部首、台湾教育部来源等多种表，但：

- 本轮根目录未见 README／LICENSE；部分文件头只有版权或参考资料信息。尚未建立可覆盖所有文件的分发许可链。
- `twedu-variants.txt` 实际出现 `丈→支`、`上→二` 等关系，证明这些条目不能一律解释成任意语境下的同字等价。
- `jp-old-style.txt` 含 IVS，不能当作纯单码位两列表处理。

建议：只作为候选线索，不采用。若未来引入，先追到原始来源、逐项核查许可与关系类型，并按项目规则获得用户批准。

## 9. 数据处理原则与后续验证

这是数据选型建议，尚不是批准的架构：

1. 每条关系保留来源、版本、关系类型与方向，最终生成搜索数据时仍能追溯。
2. 同义词、借音通假、仅形似、语境限定关系不因“优先召回”而自动纳入。用户批准 `发／發／髮` 宽搜，不等于批准 `土／士` 误搜。
3. 不对所有来源直接求传递闭包。检查合并后的大组及组内跨义项关系，避免一条弱关系连接大量不同字。
4. 区分同码位不同字体、独立异体码位、兼容字符、IVS，以及没有 Unicode 编码的图片字形。
5. 固定 Unicode 数据版本，并核对 Obsidian 桌面／移动运行时的 Unicode 支持；不能假设宿主 `normalize()` 与下载的最新字表版本一致。
6. 小型验收集至少包含 `体／體`、`真／眞`、`发／發／髮`、`国／國`、`⼈／人`、`⺅／亻`、`、／､／﹑`；反例含 `土／士`、`未／末`、`丼／井`；全量开关单独覆盖 `①／1`、`²／2` 和一对多字符分解。
7. 数据关系核验与 Obsidian 原生搜索集成是两项不同验证；本轮只调查前者。

## 证据状态

已直接读取官方规范、Unicode 字符查询页、许可全文、MJ 下载说明、教育部 FAQ、韩国异体字列表及部分 OpenCC／CJKVI 源文件。

Unicode 17.0.0 基线下载核验已完成（退出码 0）：直接解析 `Unihan.zip`、`EquivalentUnifiedIdeograph.txt`、`UnicodeData.txt`、`StandardizedVariants.txt`。条目摘录、字段数量、文件 URL 与 SHA-256 保存在 [unicode-17.json](evidence/unicode-17.json)。

核验要点：

- `真／眞`、`高／髙` 的双向 `kSemanticVariant` 均在实际数据中。
- `⺅` U+2E85 没有 UnicodeData 分解映射，但专表明确给出 U+4EBB `亻`；证实仅靠 NFKC 会遗漏这种部首对应。
- `､／﹑` 分别有 `<narrow> 3001`、`<small> 3001` 分解。
- `神` 的标准化变体序列 `795E FE00` 对应兼容汉字 U+FA19；`真／眞` 也各有对应的标准化变体序列。码位异体、规范分解和变体序列需要分层处理。
- 实际数据也有 `体→軆`、`辨↔辯` 等语义异体关系。这进一步说明不能把 `kSemanticVariant` 当成现代跨地区无条件等价表。

Unicode 17 异体文件中的“码位－属性记录行数”如下（不是独立字数、关系边数或覆盖率）：简体字段 6,929，繁体字段 6,475，一般语义异体 3,538，专门语义异体 525，形似混淆 349，Z 异体 149。部首专表有 341 条映射行，部分为范围，不能直接当成 341 个字符。

Unicode 18.0.0 异体数据包的独立下载核验已完成（退出码 0）。原始头信息、URL、SHA-256、字段记录数及选定条目保存在 [unicode-18-variants.json](evidence/unicode-18-variants.json)。

- 新增日文旧字体字段 `kJapaneseOldVariant` 有 362 条码位－属性记录，新字体字段 `kJapaneseNewVariant` 有 364 条；记录可含多个目标，不能直接解读为 726 组独立对应，也不代表日文异体的全部覆盖。
- 实际数据确认 `真↔眞`、`体↔體`、`国↔國` 的日文新旧关系。
- 实际数据还确认 `弁→瓣／辨／辯`，三者各有反向的新字体对应。这属于日文新旧字体合并关系，不是单纯形似；跨地区对称归组会引入不同中文含义的搜索结果，与已讨论的 `发／發／髮` 问题同类，但规模可能扩大。具体跨表闭包及默认行为仍需后续方案确认。
- 18.0 其余字段记录数：简体 7,291，繁体 6,840，一般语义异体 3,563，专门语义异体 525，形似混淆 353，Z 异体 159。

两项下载核验都只确认官方数据可取得、可解析及选定记录真实存在，不构成字表完整性评估、逐项正确性审核或 Obsidian 集成测试。
