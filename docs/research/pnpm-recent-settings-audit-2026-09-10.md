# pnpm 最近版本配置字段核查

> 核查日期：2026-09-10（Asia/Shanghai）。
> 本文是 2026-09-01 研究的增量审计，不表示已实施下列建议。
> 使用 pnpm 官方 GitHub release、带版本 tag 的源码、官方文档及 npm registry。

## 结论

仓库自用的 `packageManager: pnpm@12.3.4` 已匹配当前 npm `latest`；
现有 `pnpm-workspace.yaml` 的五个字段无需改名。迁移器的 v11.25 / v12.2.1
基线与当前 `latest-11=11.26.0`、`latest-12=12.3.4` 之间，没有发现新增的
workspace 顶级字段迁移需求。
[npm dist-tags](https://registry.npmjs.org/-/package/pnpm/dist-tags)

**需要准备的是已发布到 `next-12` 的 12.4.0：六个顶级字段、任务配置类型，
以及 `packageConfigs` 从 v11 专有变为 v12.4 可用。** 当前代码仅按 major
选择 schema，不能直接把这些能力开放给全部 v12；否则会误判 v12.0–12.3。
[12.4 release](https://github.com/pnpm/pnpm/releases/tag/v12.4.0) ·
[12.4 WorkspaceSettings](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs) ·
[12.3.4 WorkspaceSettings](https://github.com/pnpm/pnpm/blob/v12.3.4/pnpm/crates/config/src/workspace_yaml.rs)

另有一个较早的遗漏：项目 workspace 不再展开代理字段的 `${...}`，迁移器
应识别此类值，避免迁移后配置失效；这一点已存在于最新 v10 patch 的发布说明。
[10.34.5 release](https://github.com/pnpm/pnpm/releases/tag/v10.34.5)

## 版本边界

实测 dist-tags：`latest=latest-12=12.3.4`、`next-12=12.4.0`、
`latest-11=next-11=11.26.0`、`latest-10=next-10=10.34.5`。
12.4.0 没有 SemVer 预发布后缀，GitHub `prerelease` 为 `false`，但它仍在
`next-12` 渠道，不能说默认安装已经是 12.4.0。
[npm dist-tags](https://registry.npmjs.org/-/package/pnpm/dist-tags) ·
[GitHub release API](https://api.github.com/repos/pnpm/pnpm/releases/tags/v12.4.0)

下表时间来自 npm packument 的 `time`，不是 GitHub release 创建时间。
[npm packument](https://registry.npmjs.org/pnpm)

| 版本    | npm 发布时间（UTC） | 本次核查重点                       |
| ------- | ------------------- | ---------------------------------- |
| 12.4.0  | 2026-09-08 11:26:56 | next-12，新字段及 packageConfigs   |
| 12.3.4  | 2026-09-04 14:20:10 | 当前 latest，CLI boolean flag 修复 |
| 12.3.3  | 2026-09-04 11:12:59 | wrapper、并发及性能修复            |
| 12.3.2  | 2026-09-04 00:23:05 | import、scripts、lockfile 修复     |
| 12.3.1  | 2026-09-03 00:40:13 | global shim 升级修复               |
| 12.3.0  | 2026-09-02 16:27:43 | minimumReleaseAgeStrict 行为修复   |
| 11.26.0 | 2026-09-06 23:52:47 | 最新 v11；无字段表新增             |
| 10.34.5 | 2026-07-10 11:32:36 | 最新 v10；代理插值规则             |

## 12.4.0：明确需要补齐的支持

对比 12.3.4 与 12.4.0 的 `WorkspaceSettings`，新增六个顶级字段，无删除。
[12.3.4 源码](https://github.com/pnpm/pnpm/blob/v12.3.4/pnpm/crates/config/src/workspace_yaml.rs) ·
[12.4.0 源码](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs)

| 字段                      | 上游变化                                                          | 当前仓库缺口                    |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------- |
| `trustPolicyExcludePrune` | 默认关闭；add/update/remove 清理未使用的 trust exclusion          | v12 allowlist 和类型缺失        |
| `python`                  | `python.enabled` 开启 Python dependency 管理                      | v12 allowlist 和类型缺失        |
| `cargo`                   | `cargo.enabled` 开启 Cargo dependency 管理；支持 `cargo.indexUrl` | v12 allowlist 和类型缺失        |
| `pipelines`               | 声明供 `pnpm pipeline` 执行的任务流程                             | v12 allowlist 和类型缺失        |
| `pipelineBase`            | 设置 pipeline 的基准引用                                          | v12 allowlist 和类型缺失        |
| `packageConfigs`          | v12.4 实际读取项目专属配置                                        | 当前被明确排除出所有 v12 schema |

前五项新增字段在现有 workspace 中会被
`assertCompatibleWorkspaceSettings()` 判为 unknown 并阻止迁移；
`packageConfigs` 会被判为其他 major 的字段。来源中的新字段则保留并警告，
不会完成迁移。对应代码在 `src/settings-fields.ts` 和
`src/utils/settings-schema.ts`。

`packageConfigs` 支持对象及带 `match` 的数组形式，支持的五个项目字段与
本工具现有 v11 子集一致：`hoist`、`modulesDir`、`overrides`、`saveExact`、
`savePrefix`。12.4 release 特别说明 `sharedWorkspaceLockfile: false`
时项目配置生效；共享 lockfile 下会报告被忽略项。因此迁移支持必须同时考虑
minor 和 lockfile 模式，不能仅从 v11-only 数组删除一个名字。
[12.4 package_configs.rs](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml/package_configs.rs) ·
[12.4 release](https://github.com/pnpm/pnpm/releases/tag/v12.4.0)

`tasks.<name>` 新增 `outputs`、`inputs`、`env`、`cache`、`cargoTargetDir`。
当前根键 `tasks` 已允许，运行时对象传递不一定受阻；但 `@pnpm/types@1102.1.0`
只提供 `concurrency` / `dependsOn`，库消费者需要新类型。
核查时上游 npm `@pnpm/types` 的 `latest` 仍是 1102.1.0，单纯升级现有依赖
不能解决，需要本地补类型或等待上游发布。
[12.4 TaskSettings](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs) ·
[@pnpm/types registry](https://registry.npmjs.org/@pnpm%2ftypes/latest)

建议先引入明确的版本能力边界：12.4 专属字段仅在确认目标 minor 满足时接受；
保留 12.3.4 兼容测试，并增加 12.4.0 专属场景。README 中“pnpm v12 不支持
packageConfigs”的无条件表述也应收窄到已验证的旧版本。

## 当前 latest 与最近 patch：无需新增迁移键

12.2.1 → 12.3.4 的 `known_settings.rs`、`config_types.rs`、
`workspace_yaml.rs`、`refused_keys.rs` 没有差异。11.25.0 → 11.26.0 的
`unknownSettings.ts`、`types.ts` 也没有差异。最近更新主要改变执行行为，
已有 `trustLockfile`、`trustPolicy`、`minimumReleaseAgeStrict` 等键已在
本工具的 allowlist 中，无需重新命名。
[12.3.4 config 源码目录](https://github.com/pnpm/pnpm/tree/v12.3.4/pnpm/crates/config/src) ·
[12.2.1 config 源码目录](https://github.com/pnpm/pnpm/tree/v12.2.1/pnpm/crates/config/src) ·
[11.26 config reader](https://github.com/pnpm/pnpm/tree/v11.26.0/pnpm11/config/reader/src) ·
[11.25 config reader](https://github.com/pnpm/pnpm/tree/v11.25.0/pnpm11/config/reader/src)

- **12.3.0：** 显式配置 `minimumReleaseAge` 时，
  `minimumReleaseAgeStrict` 默认 `true`；内置 1440 分钟默认值保持非严格。
  迁移器应原样保留显式 strict 值，不应为了复刻旧 bug 自动写入 `false`。
  仓库自用的 `minimumReleaseAge: 0` 没有正数等待窗口，无需新增配置。
  [12.3 release](https://github.com/pnpm/pnpm/releases/tag/v12.3.0)
- **12.3.0 / 11.26.0：** remove/update 新增既有 trust policy 的 CLI flag
  支持；这不是新 workspace 字段。
  [12.3 release](https://github.com/pnpm/pnpm/releases/tag/v12.3.0) ·
  [11.26 release](https://github.com/pnpm/pnpm/releases/tag/v11.26.0)
- **12.3.1–12.3.4：** shim、wrapper、import、lockfile、性能和 CLI flag
  兼容修复，没有发布新的字段重命名或移除规则。
  [12.3.1](https://github.com/pnpm/pnpm/releases/tag/v12.3.1) ·
  [12.3.2](https://github.com/pnpm/pnpm/releases/tag/v12.3.2) ·
  [12.3.3](https://github.com/pnpm/pnpm/releases/tag/v12.3.3) ·
  [12.3.4](https://github.com/pnpm/pnpm/releases/tag/v12.3.4)
- **11.26.0 / 12.4.0：** `scriptShell` 相对路径从 workspace root 解析；
  `sideEffectsCache` CLI override 保留远程配置；相关配置键应保留值。
  [11.26 release](https://github.com/pnpm/pnpm/releases/tag/v11.26.0) ·
  [12.4 release](https://github.com/pnpm/pnpm/releases/tag/v12.4.0)

## 代理动态值：较早版本的遗漏

10.34.5 明确禁止在项目 workspace 的 `httpProxy`、`httpsProxy`、`noProxy`、
`proxy`、`noproxy` 中展开 `${...}`；12.3.4 的 `substitute_env_untrusted()`
也明确将含占位符的这些代理值设为 `None`。
[10.34.5 release](https://github.com/pnpm/pnpm/releases/tag/v10.34.5) ·
[12.3.4 workspace_yaml.rs](https://github.com/pnpm/pnpm/blob/v12.3.4/pnpm/crates/config/src/workspace_yaml.rs#L1802)

当前 `src/utils/settings-schema.ts` 的动态 URL 检查只覆盖 registry 字段；
这些代理键仍在 `src/constants.ts` 的 v10 表中，并进入 v11/v12 allowlist。
`.npmrc` reader 使用 INI parser，不展开环境变量。因此需要补充动态代理值的
目的地检查，保留原始值并提示移往可信全局配置或环境变量。不能把环境变量
展开后直接写进受版本控制的 YAML。

最小复现已确认：环境变量 `PNPM_AUDIT_PROXY_HOST` 设为
`proxy.example.invalid` 时，INI 中的
`https-proxy=http://${PNPM_AUDIT_PROXY_HOST}:8080` 读取后仍是原始字符串；
同值写入临时 workspace 的 `httpsProxy` 后，pnpm 12.3.4
`config list --json` 虽成功退出，解析结果却没有该字段。这验证了值会在
workspace 中丢弃；没有执行实际联网代理请求。

## 验证范围与后续建议

本次仅写入审计报告，没有调整字段表、迁移行为、依赖或项目 pnpm 版本。
仓库已有及并行产生的未提交改动不属于本次审计的实施结果，均予保留。

- 已核对带 tag 的官方源码和 release，避免把 main 分支的新能力当成旧版支持。
- 已在仓库运行 12.3.4 的 `pnpm config list --json`；五个自用 workspace 字段
  均被读取。此验证证明配置可读，不代替完整安装测试。
- CI 和 smoke script 仍验证 11.25.0 / 12.2.1；建议更新当前渠道覆盖至
  11.26.0 / 12.3.4，并为 12.4.0 增加独立能力场景，保留旧 minor 回归。
- 12.4 字段实现需要覆盖：源值保留、已有 workspace、新旧目标版本、
  packageConfigs 的两种形态与 lockfile 模式，以及三种合并策略。
