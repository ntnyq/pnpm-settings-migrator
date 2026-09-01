# pnpm v11 / v12 最近版本对设置迁移器的影响

> 研究时点：2026-09-01 10:36（UTC+08:00）
> 范围：pnpm v11 和 v12 各自最近 5 个已发布版本；只使用 pnpm 官方
> GitHub releases/changelog、pnpm 官方文档和 npm registry。

## 审查结论（实施前）

当前项目的 v10 → v11 主干迁移基本正确：把 `package.json#pnpm` 与
`.npmrc` 的非 auth/registry 设置移入 `pnpm-workspace.yaml`，并处理
`allowBuilds`、`pmOnFail`、`allowUnusedPatches` 和 Node.js runtime。
v12 不需要另一套完全独立的设置表；官方明确说明 v12 虽是 Rust 重写，但
v11 的 commands、flags、settings 和 lockfile format 整体延续。
[pnpm 12 官方发布文](https://pnpm.io/blog/releases/12.0)

需要补充的工作按优先级排列：

1. **P0：对 v11/v12 输出做目标 schema 校验。** 当前
   `readMigratableNpmrc()` 只排除 auth/registry，会把任意其他键写进
   workspace。pnpm 12 在项目 pin 与当前版本匹配时，会对未知 workspace
   键直接报 `ERR_PNPM_UNRECOGNIZED_WORKSPACE_SETTINGS`。
   [pnpm 12.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.0.0)
2. **P0：拦截机器级设置。** 至少包括 `bin`、`configDir`、`dir`、
   `globalBinDir`、`globalDir`、`npmrcAuthFile`、`pnpmHomeDir`、
   `stateDir`、`userconfig`、`workspaceDir`；还应包括 11.25/12.1 明确
   禁止出现在项目配置中的 `scope`。这些值应保留并警告用户移到全局
   `config.yaml`、环境变量或 CLI，不能写入 workspace 后再从来源删除。
   [pnpm 设置文档](https://pnpm.io/settings)
3. **P0：只清理真正完成迁移的 `package.json#pnpm` 子键。** 当前实现会
   把整个对象展开进 workspace，再删除整个 `pnpm` 字段。pnpm 上游特意只
   识别已知迁移键，以免破坏借用该命名空间的第三方工具；本项目也应保留
   未识别或无法自动迁移的子键，避免既生成 v12 未知 workspace 设置，又
   丢失原始数据。
   [pnpm v11 config reader](https://github.com/pnpm/pnpm/blob/v11.25.0/pnpm11/config/reader/src/index.ts)
4. **P1：在 `--replace-deprecated` 下增加规范化。** 包括
   `enableGlobalVirtualStore` → `virtualStoreType`、
   `auditLevel` / `auditConfig` → `audit`、`updateConfig` → `update`；
   可选把 `namedRegistries` 合并到新 `registries` 声明，并把旧
   `sideEffectsCache` 组合转成对象形式。旧写法目前仍兼容，不宜无条件改写。
   [pnpm 11.23 release](https://github.com/pnpm/pnpm/releases/tag/v11.23.0)
5. **P1：给新 schema 增加回归测试。** 至少覆盖
   `minimumReleaseAgeExcludePrune`、`audit.ignorePrune`、`tasks`、
   `registries`、对象形式 `sideEffectsCache`、`virtualStoreType`，以及
   v12-only 的 `globalShims`。当前 `@pnpm/types@1102.1.0` 已包含主要新
   类型，缺口主要是目标版本行为验证。
6. **P1：更新 README。** v12 已稳定发布，当前最新 v12 是 12.2.1；
   “目前是 release candidate”已经过时。保留
   `pnpm install --resolution-only` 需改为 `pnpm peers check` 的提醒。
   [What's different in pnpm 12](https://pnpm.io/blog/whats-different-in-pnpm-12)
7. **P2：增加真实 CLI 矩阵。** 对 v11.25.0 和 v12.2.1 分别迁移后运行
   `pnpm config list` 与 `pnpm install --lockfile-only` / frozen install，
   直接捕获未知键、lockfile 与 engine 行为差异。

## 实施结果

上述建议已在同日全部落地：

- v10、v11、v12 使用分版本 workspace setting allowlist；v11/v12 另外拦截
  上游定义的 project-refused 设置。
- `.npmrc` 与 `package.json#pnpm` 的未知、拒绝、跨版本和目标不支持字段均
  保留在原处并给出警告；`package.json` 只删除实际迁移的 `pnpm` 子键。
- `--replace-deprecated` 已覆盖 `audit`、`update`、`catalogPrune`、
  `virtualStoreType`、对象形式 `sideEffectsCache` 和无冲突的新版
  `registries` 声明。
- v11 会把子项目 `.npmrc` 中 pnpm 实际支持的 5 个 project config 字段迁入
  `packageConfigs`；v12 因不支持 `packageConfigs` 而保留源文件并提示。
- 类型和回归测试已覆盖 `minimumReleaseAgeExcludePrune`、`tasks`、对象形式
  `sideEffectsCache`、`confirmModulesPurge` 与 v12-only `globalShims`。
- CI 新增 pnpm 11.25.0 / 12.2.1 矩阵，逐一执行 `config list`、lockfile-only
  install 和 frozen install。

## 版本边界与真实性

“最近”按 npm registry 的 `time` 倒序，截止上述研究时点。版本同时核对
npm registry 元数据与 pnpm 官方 GitHub release。带 `-rc.*` 的 SemVer
记为 prerelease；GitHub 也把 `12.0.0-rc.11` 标为 Pre-release。

当时 dist-tags 为 `latest=11.25.0`、`latest-11=next-11=11.25.0`、
`latest-12=next-12=12.2.1`。
[npm registry dist-tags](https://registry.npmjs.org/-/package/pnpm/dist-tags)

### v11 最近 5 个版本

| 版本    | npm 发布时间（UTC） | 状态   | 一手来源                                                                                                            |
| ------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| 11.25.0 | 2026-08-29 14:17:49 | stable | [release](https://github.com/pnpm/pnpm/releases/tag/v11.25.0) · [registry](https://registry.npmjs.org/pnpm/11.25.0) |
| 11.24.0 | 2026-08-24 14:56:01 | stable | [release](https://github.com/pnpm/pnpm/releases/tag/v11.24.0) · [registry](https://registry.npmjs.org/pnpm/11.24.0) |
| 11.23.0 | 2026-08-23 14:56:00 | stable | [release](https://github.com/pnpm/pnpm/releases/tag/v11.23.0) · [registry](https://registry.npmjs.org/pnpm/11.23.0) |
| 11.22.0 | 2026-08-15 17:15:57 | stable | [release](https://github.com/pnpm/pnpm/releases/tag/v11.22.0) · [registry](https://registry.npmjs.org/pnpm/11.22.0) |
| 11.21.0 | 2026-08-09 14:24:58 | stable | [release](https://github.com/pnpm/pnpm/releases/tag/v11.21.0) · [registry](https://registry.npmjs.org/pnpm/11.21.0) |

### v12 最近 5 个已发布版本

截止研究时点，v12 **只有 4 个 stable 版本**，所以第 5 个是
`12.0.0-rc.11`，不能把它当成稳定版。

| 版本         | npm 发布时间（UTC） | 状态       | 一手来源                                                                                                                         |
| ------------ | ------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 12.2.1       | 2026-09-01 00:56:13 | stable     | [release](https://github.com/pnpm/pnpm/releases/tag/v12.2.1) · [registry](https://registry.npmjs.org/pnpm/12.2.1)                |
| 12.2.0       | 2026-08-31 23:59:46 | stable     | [release](https://github.com/pnpm/pnpm/releases/tag/v12.2.0) · [registry](https://registry.npmjs.org/pnpm/12.2.0)                |
| 12.1.0       | 2026-08-29 14:17:53 | stable     | [release](https://github.com/pnpm/pnpm/releases/tag/v12.1.0) · [registry](https://registry.npmjs.org/pnpm/12.1.0)                |
| 12.0.0       | 2026-08-26 15:12:06 | stable     | [release](https://github.com/pnpm/pnpm/releases/tag/v12.0.0) · [registry](https://registry.npmjs.org/pnpm/12.0.0)                |
| 12.0.0-rc.11 | 2026-08-24 23:11:09 | prerelease | [prerelease](https://github.com/pnpm/pnpm/releases/tag/v12.0.0-rc.11) · [registry](https://registry.npmjs.org/pnpm/12.0.0-rc.11) |

时间字段来自 pnpm npm packument。
[npm registry packument](https://registry.npmjs.org/pnpm)

## v11 逐版影响

### 11.25.0

- 新增 `audit.ignorePrune`。
- 新增 workspace `tasks` 任务图与 `tasks.<name>.concurrency`。
- 新增 `remoteSideEffectsCache`，且 `sideEffectsCache` 支持
  `{ read, write, remote }`；旧 boolean、`sideEffectsCacheReadonly`、
  `remoteSideEffectsCache` 和 `organization` 写法仍有效，新写法优先。
- 项目 workspace 中的 `scope` 被忽略并警告；应使用 `--scope`、
  `PNPM_CONFIG_SCOPE` 或全局配置。
- `devEngines.packageManager` 范围 pin 在当前 pnpm 已满足时，也会记录到
  lockfile 的 `packageManagerDependencies`。

含义：新嵌套对象从 `package.json#pnpm` 迁移时可以原样保留，但需要回归
测试；`scope` 必须加入禁止写入 workspace 的集合。

来源：[pnpm 11.25 release](https://github.com/pnpm/pnpm/releases/tag/v11.25.0)

### 11.24.0

- 全局 build approvals 不是本工具应迁入 workspace 的项目设置。
- 修复 v11 错把 workspace 的 `confirmModulesPurge` 当成未知键。
- 修复 pnpm version pin 与 Git branch lockfile merge 相关 frozen install。

没有新转换；smoke test 应包含 `confirmModulesPurge` 与 frozen lockfile，避免
迁移器自己误判合法键。

来源：[pnpm 11.24 release](https://github.com/pnpm/pnpm/releases/tag/v11.24.0)

### 11.23.0

这是最需要补设置规范化的版本：

- 新 `registries` 以 registry URL 为 key，在条目中定义 `serverType`、
  `scopes`、`prefix` 和 `supportsTimeField`。旧 `<scope>: <url>` 形状仍
  可用；`namedRegistries` 已废弃但仍读取。凭据必须留在 `.npmrc`。
- 新增 `virtualStoreType: global | project`，作为
  `enableGlobalVirtualStore` 的规范写法；旧键仍有效，新键优先。
- `pnpm config get/list` 改以文档名称显示 `audit`、`update`；
  `auditConfig`、`auditLevel`、`updateConfig` 成为废弃内部写法。
- 未知键与 workspace 中的非 camelCase 键开始显式警告；v11 会提示某键
  属于哪个版本，例如 `globalShims` 是 v12 设置。
- `pnpm approve-builds` 写入 `allowBuilds` 时会清理 v10 旧 build 设置，
  与本项目现有转换方向一致。

建议把前三类规范写法纳入 `--replace-deprecated`。registry URL 中的凭据
不能迁入 workspace；项目 registry URL 也不会展开 `${...}`，动态 URL 应
留在可信全局配置中。

来源：[pnpm 11.23 release](https://github.com/pnpm/pnpm/releases/tag/v11.23.0) ·
[registries 文档](https://pnpm.io/settings/dependency-resolution#registries) ·
[virtualStoreType 文档](https://pnpm.io/settings/node-modules#virtualstoretype)

### 11.22.0

- 新增 `minimumReleaseAgeExcludePrune`。
- 项目 workspace 不再允许选择凭据、pnpm 安装位置和机器级状态：
  `bin`、`configDir`、`dir`、`globalBinDir`、`globalDir`、
  `npmrcAuthFile`、`pnpmHomeDir`、`stateDir`、`userconfig`、
  `workspaceDir` 被忽略并警告；`cacheDir`、`storeDir` 不受影响。
- 修复 `minimumReleaseAge` 下 `resolutionMode: lowest-direct/time-based`
  被忽略的问题。

当前 v11/v12 `.npmrc` 路径会误迁上述机器键。v10 白名单还显式包含
`globalBinDir`、`globalDir`、`stateDir`；v10 模式可保持原行为，v11/v12
目标必须分流。

来源：[pnpm 11.22 release](https://github.com/pnpm/pnpm/releases/tag/v11.22.0) ·
[pnpm 设置文档](https://pnpm.io/settings)

### 11.21.0

- `sudo` 下修改全局安装开始警告，并预告 v12 将失败。
- 修复多项 lockfile 快速更新、catalog、patch、`minimumReleaseAge`、
  `ignoredOptionalDependencies` 与自动 pnpm version switch 行为。
- 没有新的必做设置转换。

含义主要是验证而非改写：迁移后 lockfile 操作应在 CI/offline、catalog、
patch 与 package-manager pin 场景保持稳定。

来源：[pnpm 11.21 release](https://github.com/pnpm/pnpm/releases/tag/v11.21.0)

## v12 逐版影响

### 12.2.1

只修复 POSIX 上缺少无扩展名 `pnpm` 可执行目标导致的自升级失败，无设置
迁移补充项。

来源：[pnpm 12.2.1 release](https://github.com/pnpm/pnpm/releases/tag/v12.2.1)

### 12.2.0

- Catalog 可通过 `workspace:` protocol 解析 workspace dependency。
- install 不再把全局 `minimumReleaseAgeExclude` 泄漏到项目 workspace。
- 再次明确 `globalDir` / `globalBinDir` 不能由项目 workspace 设置。
- 修复对象形式 `sideEffectsCache` 与 CLI override、非 ASCII 配置值、
  `--fix-lockfile`、catalog peer 与 workspace discovery。

无新转换，但加强了机器级分流和 Unicode 值保真测试的必要性。

来源：[pnpm 12.2.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.2.0)

### 12.1.0

- `scope` 在项目 workspace 中被忽略，只应来自 CLI、环境或全局配置。
- 新 `tasks` 和对象形式 `sideEffectsCache` 也同步发布在 v11.25，应作为
  v11/v12 共享 schema，不要复制两套实现。
- `devEngines.packageManager` 范围 pin 也记录到 lockfile。
- `--fix-lockfile`、`patchedDependencies`、override 与 frozen install 有
  多项修复。

来源：[pnpm 12.1.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.1.0)

### 12.0.0

v12 复用 v11 设置迁移是正确基线，但需处理或文档化这些差异：

- 未知 workspace 键会报告，项目 pin 匹配时直接失败。
- 已有 lockfile 可由 frozen install 原样消费；只有依赖图重解析时，循环
  依赖的 peer variant 才会一次性重写。
- Linux 的 `packageImportMethod: auto` 改为 hardlink-first；无需改配置。
- `engineStrict` 对 optional subtree 内的普通 dependency edge 也会失败；
  应保留值并在升级检查清单中提醒行为变化。
- v12-only `globalShims` 控制 project-aware global bins；迁往 v11 时必须
  警告，迁往 v12 时应被 schema 接受。
- `pnpm install --resolution-only` 被移除，改用 `pnpm peers check`。
- `pnpmfile hooks.filterLog` 被忽略并废弃，适合作为文档检查项，不应由
  settings migrator 擅自改写。

来源：[pnpm 12.0 release](https://github.com/pnpm/pnpm/releases/tag/v12.0.0) ·
[pnpm 12 官方发布文](https://pnpm.io/blog/releases/12.0) ·
[What's different in pnpm 12](https://pnpm.io/blog/whats-different-in-pnpm-12)

### 12.0.0-rc.11（prerelease）

该 RC 只有 staged publish 批量 approval、Bit root-component isolated
linker 修复和更新通知修复。无配置迁移规则；仅因 v12 不足 5 个 stable
版本而作为“最近 5 个已发布版本”的边界。

来源：[pnpm 12.0.0-rc.11](https://github.com/pnpm/pnpm/releases/tag/v12.0.0-rc.11)

## 审查时与代码的具体对照（实施前）

已经正确的部分：

- `CompatibilityTarget` 已有 v10/v11/v12，`auto` 会读 `packageManager`
  与 `devEngines.packageManager`。
- v11/v12 已把 auth/registry 留在 `.npmrc`，并执行 v11 的主要重命名与
  build/runtime 转换。
- v12 重用 v11 schema 符合上游设计；lockfile migration 保持在工具范围外
  也合理。

会产生错误或失效配置的缺口：

1. v11/v12 没有验证 `.npmrc` 键是否为目标版本合法 workspace 设置。
2. 机器级键会被误写入 workspace；`scope` 当前也未被 auth/registry 判断
   排除。
3. `package.json#pnpm` 未按子键筛选，未知键会被迁入 workspace，随后整个
   原字段被删除。
4. 尚未处理 v11.23 后的规范名：`virtualStoreType`、`audit`、`update`、
   新 `registries` 声明等。
5. 项目只读根 `.npmrc`。官方 v11 迁移还要求把子项目 `.npmrc` 收敛到
   `packageConfigs["<project-name>"]`；这不是最近版本的新变化，但仍是现有
   v11 覆盖缺口。[官方 migration guide](https://pnpm.io/migration)

## 建议验收

- v12 pin 匹配时，结果通过 `pnpm config list`，无未知 workspace 键。
- `scope` 和机器级设置不出现在 workspace，原始值不被静默丢失。
- `package.json#pnpm` 中未迁移的第三方或未知子键原样保留。
- auth token、registry credential、URL 内嵌凭据永不进入 workspace。
- v11.25.0 与 v12.2.1 都能消费共享 schema；v12-only `globalShims` 在
  v11 目标被警告、v12 目标被接受。
- 覆盖新旧键并存时的优先级，以及 merge/discard/overwrite 三种策略。
- 真实 v12 首次重解析允许预期的一次性 lockfile diff，随后 frozen install
  稳定通过。
