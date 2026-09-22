# 0.3.0 英文设置与独立入口开关

用户批准的简约设置方案已实现并安装到批准测试库。采用 Obsidian 原生 Setting，不增加组件依赖、样式系统或 i18n 框架。仅作者自审，无子代理或 Git 操作。

## 用户行为

- **Search / Find / Quick switcher** 独立启停插件增强；关闭不禁用宿主原生功能，也不影响其他入口。
- **Compatibility characters** 保留原有布尔值；新安装及缺失／无效值默认开启，不写入加载迁移。
- 改动应用到下一次搜索；替换仍为原生匹配。
- 核心 Search／Quick switcher 未启用时给出 Core plugins 指引，不自动启用。
- 界面名称为 CJK Search，移除成功加载通知；英文文案集中在 `src/strings.js`，诊断仍在命令面板 **Print diagnostics**。
- Graph View 搜索／过滤尚未增强；后续实现后才增加对应开关。英语之外的界面翻译尚未实现。

## 实现与回归

设置保存串行执行，避免不同开关快速操作时覆盖彼此；失败回滚控件，保留当前生效选择及无关字段。Find／Quick switcher 在关闭时拆除自身适配器，重新开启时重新安装；workspace 事件由每次安装的清理函数解除，不累积监听。全库退役 wrapper 始终保持原生转发，外来钩子保留它也不会在重新开启时复活。

新增测试先观察 4 项预期 RED，再实现；相关测试 26/26 GREEN。最终任务 `ba1b0a97c` exit 0：

```sh
npm install --package-lock-only --ignore-scripts
npm test
npm run build
node --check dist/main.js
npm run test:settings
npm run test:native
```

- **10 Python＋42 Node** 测试全部通过。
- macOS / Obsidian 1.13.7 两套真实应用验证通过，均 `pageErrors: []`。
- `test:settings` 包含四个实际控件、独立入口切换、编辑／阅读 Find、关闭状态重载、核心插件未启用提示、Space 键切换，并继续执行完整 Find／Open file 回归。全库禁用时原生命中 4，重新启用后等价字符命中 14。
- 浅色／深色 CSS 主题、1000px 桌面与 600px 窄窗截图已目视检查：分组与说明清楚、控件对齐、文本完整换行，无水平溢出。核心关闭提示正常。沿用宿主原生控件，不另行创造控件视觉。
- Impeccable 机械检测返回空列表；不代替实际 UI 验证。
- 五个变更文件的 LSP 查询返回零错误，但 **0 confirmed clean / 5 inconclusive**（push-only 服务），不是静态检查全绿。已有生成 bundle 的未使用 catch 绑定等诊断仍保留，不手改实测产物来消除风格告警。

原始证据、日志和截图：[`evidence/user-settings/`](evidence/user-settings/)。[0.2.0 报告](find-open-file.md)与更早证据保留历史版本，不改写。

## 安全安装

安装目标：`experiments/native-search-spike/manual-test-vault/.obsidian/plugins/cjk-search-probe/`。

- 只替换 allowlist 中 **5** 个插件产物；安装结果与两份真实应用证据的 SHA-256 一致。
- 安装前重新快照，不复用旧版本快照：**13 个非产物文件全部保持不变**，含已有设置、笔记和核心配置。
- 备份：`.pi/plugin-backups/before-install-E9MRiL/`。旧版本备份继续保留。
- 回执：[`installation.json`](evidence/user-settings/installation.json)。
- `main.js`: `b9f11420f181e41e30592f05acc8f9e77b7b111c1ab9ae065d1e9a60654eb4fd`
- `manifest.json`: `cd4226e117180df7434d155bffc49e1d22b93c976e45544c853a1b5827a99808`

没有控制或重启用户运行中的 Obsidian。请用户关闭再启用插件；若名称仍是旧测试名称，重开测试库刷新宿主缓存。新版正常加载不再弹出测试通知。

## 未验证边界

桌面窄窗不是 iOS WebKit；新设置和新入口仍需要明确的 iOS 真机复测。Android／Windows／Linux、其他 Obsidian 版本、真实大库性能、完整 popout／IME／主题／无障碍矩阵未验证。0.2.0 的宽泛用户成功反馈未标明设备，不自动升级这些验证结论。
