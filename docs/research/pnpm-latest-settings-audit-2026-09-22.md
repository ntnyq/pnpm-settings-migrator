# pnpm 近期版本核查与迁移支持更新

核查日期：2026-09-22（Asia/Shanghai）。本次在 2026-09-10 核查及已实现的
12.4 版本能力表基础上，补齐最新版本支持。

## 当前发布渠道

直接读取 npm registry：`latest = latest-12 = next-12 = 12.5.1`，
`latest-11 = next-11 = 11.27.1`，`latest-10 = next-10 = 10.34.5`。
`@pnpm/types` 最新版仍为 `1102.1.0`，因此新增类型由本库补充。
[pnpm dist-tags](https://registry.npmjs.org/-/package/pnpm/dist-tags) ·
[@pnpm/types](https://registry.npmjs.org/@pnpm%2ftypes/latest)

工作区开始时，`package.json` 已有将 `packageManager` 从 12.4.1 改为
12.5.1 的未提交改动，并伴随依赖及 lockfile 升级。本次保留这些改动，
主要更新迁移器能力、类型、兼容性矩阵和文档。

## 近期 changelog 摘要

日期取自 GitHub release 的 `published_at`（UTC），不是 npm 发布时间。
[官方 release API](https://api.github.com/repos/pnpm/pnpm/releases?per_page=12)

| 版本                                                          | 发布日期   | 与本仓库有关的变化                                                                                                                                         |
| ------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [12.5.1](https://github.com/pnpm/pnpm/releases/tag/v12.5.1)   | 2026-09-18 | Python registry `packages` 路由；未知 task 字段在启动切换版本前允许警告，运行的已固定版本仍报错；Python 解释器下载重试与缓存；Cargo 符号链接及重复安装修复 |
| [12.5.0](https://github.com/pnpm/pnpm/releases/tag/v12.5.0)   | 2026-09-18 | 任务并发组、平台列表、registry ecosystem、Python 版本与约束；全局 tools 镜像；Package URL 与保留前缀 pkg；修复同 URL 不同 integrity 的包错误复用 tarball   |
| [12.4.2](https://github.com/pnpm/pnpm/releases/tag/v12.4.2)   | 2026-09-15 | registry 元数据缓存按路径隔离、受支持平台上的 shim 路径修复、安装及 peer resolution 修复；未发现本次需新增的 workspace 键                                  |
| [12.4.1](https://github.com/pnpm/pnpm/releases/tag/v12.4.1)   | 2026-09-10 | 恢复 ignoredOptionalDependencies、修复 linkWorkspacePackages 行为；pipeline 缓存、配置编辑与安装性能修复                                                   |
| [11.27.1](https://github.com/pnpm/pnpm/releases/tag/v11.27.1) | 2026-09-20 | 修复命令 wrapper、exec 子目录、deploy、lockfile/安装行为；workspace YAML 编辑保留 scalar anchors；未发现新增迁移键                                         |
| [11.27.0](https://github.com/pnpm/pnpm/releases/tag/v11.27.0) | 2026-09-12 | 新增 trustPolicyExcludePrune；nodeDownloadMirrors 可从全局配置及环境变量设置；registry 元数据缓存隔离及 runtime 解包安全修复                               |

12.4 系列先前引入的 Python/Cargo、pipelines、packageConfigs 和 task 缓存
字段已由仓库现有能力表覆盖，本次保留其 12.4.0 边界。
[12.4 release](https://github.com/pnpm/pnpm/releases/tag/v12.4.0)

## 已实施的版本能力

不仅核对 release，还比较带版本 tag 的配置解析源码，避免把 main 分支
尚未发布的能力当作当前支持。

| 配置                                            | 最低支持版本              | 本次处理                                                      |
| ----------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| `trustPolicyExcludePrune`                       | v11: 11.27.0；v12: 12.4.0 | 为 v11 增加独立能力项，避免错误开放给旧 v12                   |
| `concurrencyGroups`、`tasks.*.concurrencyGroup` | 12.5.0                    | 增加顶级字段、task 子字段及公开类型                           |
| `supportedArchitectures: string[]`              | 12.5.0                    | 支持平台名和 Rust target triples；原 OS/CPU/libc 对象继续有效 |
| `python.versions`、`overrides`、`constraints`   | 12.5.0                    | 增加类型与嵌套值版本检查                                      |
| `registries.<url>.ecosystem`                    | 12.5.0                    | 扩展 registry 类型；接受 npm、cargo、pypi                     |
| `registries.<url>.packages`                     | 12.5.1                    | 单独设置 patch 边界，旧目标保留整个 registries 对象           |

源码依据：
[12.5.0 settings](https://github.com/pnpm/pnpm/blob/v12.5.0/pnpm/crates/config/src/workspace_yaml/settings.rs) ·
[12.5.0 sections](https://github.com/pnpm/pnpm/blob/v12.5.0/pnpm/crates/config/src/workspace_yaml/sections.rs) ·
[12.5.0 registries](https://github.com/pnpm/pnpm/blob/v12.5.0/pnpm/crates/config/src/workspace_yaml/registries.rs) ·
[12.5.1 registries](https://github.com/pnpm/pnpm/blob/v12.5.1/pnpm/crates/config/src/workspace_yaml/registries.rs) ·
[11.27.1 known settings](https://github.com/pnpm/pnpm/blob/v11.27.1/pnpm11/config/reader/src/unknownSettings.ts)

能力只对同一 major 的已确认稳定版本开放。范围声明、预发布、缺少精确版本
的目标继续采用基础 major schema；不支持的源对象完整保留并警告，已有
workspace 中不兼容的值在写文件之前报错。

公开 `PnpmWorkspace` 类型替换上游旧的 `tasks`、`registries` 和
`supportedArchitectures` 定义，避免与旧类型取交集后排除新值。
新增显式导出 `PnpmRegistryDeclaration`。

## 移除与目的地限制

12.5 的 `PythonSettings` 和 `CargoSettings` 已删除 `indexUrl`，且这两个
结构拒绝未知字段。因此不能继续把 12.4 的同名对象原样写入新版 workspace。
迁移器保留含 `indexUrl` 的源对象并警告；已有 workspace 含这些字段则拒绝
写入。公开类型保留旧字段并标记 deprecated，供 12.4 目标使用。
[12.4 结构](https://github.com/pnpm/pnpm/blob/v12.4.0/pnpm/crates/config/src/workspace_yaml.rs) ·
[12.5 结构](https://github.com/pnpm/pnpm/blob/v12.5.0/pnpm/crates/config/src/workspace_yaml/sections.rs)

用户应明确将索引地址改成 registry 声明。例如以下是手动配置调整示例，
不是本工具自动转换的结果：

```yaml
# 12.4
python:
  enabled: true
  indexUrl: https://pypi.org/simple/
```

```yaml
# 12.5.1
python:
  enabled: true
registries:
  https://pypi.org/simple/:
    ecosystem: pypi
    packages: ['*']
```

另有两项限制：

- `pkg`（不区分大小写）从 12.5 起用于 Package URL，不能作为 registry
  prefix。源 `namedRegistries` 或 URL registry 声明使用它时予以保留。
- `tools` 的下载镜像只从全局 `config.yaml` 或 `PNPM_CONFIG_TOOLS` 读取。
  本工具将其归为 project-refused，提示在全局配置；不写入 workspace。

[12.5 官方说明](https://github.com/pnpm/pnpm/releases/tag/v12.5.0)

12.5.1 对未知 task 字段的启动宽容是为了切换到项目固定的 pnpm 版本，
不意味着目标 pnpm 接受任意 task 字段。迁移器继续严格检查已解析目标的
task 能力，防止输出目标版本无法读取的配置。
[12.5.1 官方说明](https://github.com/pnpm/pnpm/releases/tag/v12.5.1)

## 验证

- `pnpm run release:check`：lint、格式检查、类型检查及 366 个测试通过。
- `pnpm run build`：ESM 库、CLI 和公开声明构建成功。
- 已实测 `pnpm run test:compatibility` 的全部九个版本：迁移、源保留、
  配置读取、依赖安装、lockfile 生成及 frozen install 通过。
- CI 和默认 smoke 矩阵新增 11.27.1、12.4.2、12.5.0、12.5.1，并保留
  11.25.0、11.26.0、12.2.1、12.3.4、12.4.0。

测试覆盖新旧版本边界、未确认及预发布版本、三种合并策略、源清理、写入前
拒绝及公开类型。Python/Cargo 在安装 fixture 中禁用，验证的是其配置能被
pnpm 读取；不表示执行了 Python 包解析或 Cargo 编译。
