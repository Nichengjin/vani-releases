# 在 GitHub runner 构建 CLI

本轮按用户要求只构建 Linux x64 候选，不构建 macOS，不公开 Release。分发仓库的基础检查 CI 已运行通过。

[`build-cli.yml`](../.github/workflows/build-cli.yml) 是 **CD 的候选制品阶段**：手动选择一个 CLI，冻结源码，
在 Linux runner 构建／测试，保存候选 artifact。签名私钥继续留在本机，不自动创建或公开 Release。
Desktop 包后续由 App 流程提供；CLI-only 组合不等待 App。

## 为什么要构建两次

平台同时包含操作系统和 CPU 架构。完整发行中的原生组件需要分别构建；本轮暂时只跑 Linux：

| 组件 | 产物 | runner / 构建次数 | 原因 |
| --- | --- | --- | --- |
| Resume | Go binary | Linux x64 一次 | CGO 与 SQLite；Mach-O 和 ELF 不能通用 |
| Tasks | Rust binary | Linux x64 一次 | 系统 ABI 与目标架构不同 |
| vani-daemon | 含 Node 的 portable tar.gz | Linux x64 一次 | Node 可执行文件与 `node-pty` 原生模块分平台 |
| Vault | 通用 Node tar.gz | Linux 一次 | 当前分发内容为 JS／纯 JS 依赖，在目标机 Node 上运行 |

Vault 通用包未来引入原生依赖时需重新审视平台矩阵。当前最低产品运行时基线为 Node 22.22.2；
daemon 自带 Node，Vault 的 Node 发现／安装仍由安装器负责。
构建脚本实际检查 `process.platform/arch`；Linux 在 `ubuntu-24.04` 上使用 Debian bookworm 容器，避免链接到较新的 Ubuntu glibc。
标签依据 [GitHub runner 文档](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)。

## 启用前准备

1. 将本轮 workflow 及配套改动提交并推送到分发仓库。
2. 所选源码 commit 和 Vani 构建器 commit 必须已经存在于各自 GitHub remote。Resume、Tasks 私有源码仓库已建立；首次 CLI 快照在隔离副本提交到 `build/linux-candidate-20261025`，原工作区、索引与桌面 UI 在途修改保留。
3. 每个私有源仓库配置独立的只读 SSH deploy key；私钥存为分发仓库的 Actions secret，本地临时密钥已删除。`vani` 对应 `VANI_TOOLS_SSH_KEY`，Resume、Tasks、Vault 分别对应 `VANI_RESUME_SSH_KEY`、`VANI_TASKS_SSH_KEY`、`VANI_VAULT_SSH_KEY`。没有使用账户级 PAT、正式签名私钥或旧 Zeabur upload token。
4. 公共分发仓库的普通 `GITHUB_TOKEN` 只能访问本仓库及可公开读取的源，不能凭它 checkout 另一个私有仓库。

源码仓库与组件映射固定为 `Nichengjin/vani-resume`、`Nichengjin/vani-tasks`、`Nichengjin/vault` 和 `Nichengjin/vani`，防止混用来源。Vault 原 remote `cc-export-cli` 已迁移，workflow 使用当前仓库名。扩展仓库时同步修改映射及只读密钥。
workflow 只接受 `workflow_dispatch`，没有 PR／外部 fork 触发入口，checkout 后不持久化凭据。
公共 Actions 日志和候选资产可见，触发前需确认所选源码的构建／测试日志和可分发内容适合公开。

## 手动构建一个组件

在 Actions 页面选择 **Build CLI release candidate**，输入：

| 字段 | 内容 |
| --- | --- |
| `component` | `resume` / `tasks` / `vault` / `vani-daemon` |
| `source_repository` | Resume 为 `Nichengjin/vani-resume`，Tasks 为 `Nichengjin/vani-tasks`，daemon 为 `Nichengjin/vani`，Vault 为 `Nichengjin/vault` |
| `source_commit` | 已推送源码的完整 40 位小写 commit，不接受 branch/tag |
| `tools_commit` | `Nichengjin/vani` 中既有构建器及合并器的完整 commit |
| `version` | 可选组件版本；留空生成带源码短 SHA、run ID 和 attempt 的 preview 版本 |

同一个组件的全部平台共用上述冻结输入；每个平台 checkout 后还会检查实际 HEAD。
runner 只读取已提交源码，未提交的修改不会进入制品。
重新编译或重跑使用新版本；显式指定过的版本不可拿来覆盖已有发行。
重跑使用 **Re-run all jobs**。每个 attempt 的资产隔离，不跨 attempt 拼接平台；仅重跑失败平台会因为同轮平台不完整而拒绝收集。

流程为 `resolve → build matrix → collect`：

- Go 1.26.10、Rust 1.91.0、Node 22.22.2、pnpm 10.33.4；Actions 固定完整 commit。
- 复用源码仓库的 `build-cli-artifacts.mjs`、`build-vault-release.mjs` 和 `build-daemon-release.mjs` 及其测试，不重复维护构建实现。
- Resume 开启 CGO；daemon 强制原生编译 `node-pty`，带 Node 与许可证，并运行现有生命周期／PTY smoke。
- Tasks 的实际 release binary 额外验证隔离数据库中的 project-v2、Review 状态持久化与 MCP 工具发现／读取。
- 同组件输入通过原有 `merge-cli-releases.mjs` 收集；版本、commit、Linux（Vault 为 node）平台、资产格式和实际字节大小再校验。
- 只上传明确收集的制品和元数据，不上传整个 checkout、HOME、缓存、凭据或 `build/source`。

源码／工具 SHA 与工具链版本被固定；runner 镜像及 Debian 包仍会更新，不承诺逐字节可复现构建。
现有构建器运行其内置的组件测试；完整产品、跨 Host／SSH 与安装验收继续单独执行。

## 取回候选与本机签名

成功后下载 `candidate-<component>-<version>-attempt-<attempt>` artifact，保留期 14 天，内容为：

- `release-input.json`：本轮 Linux 平台的组件输入；Vault 为通用 Node 输入。
- `artifacts/`：实际平台制品；GitHub artifact 下载后的裸 binary 需恢复执行权限，安装器也应显式 `chmod`。
- `build-provenance.json`：来源仓库／SHA、工具 SHA、分发仓库 SHA、workflow run URL、大小和 SHA-256，明确 `signed: false`。

这是 workflow 自报的来源记录，不是独立签名或 GitHub artifact attestation。
先下载并保存每个组件候选到 `inputs/<component>/`。当前正式组合器仍要求原生 CLI 的 macOS/Linux 两个平台，Linux-only 候选不会被当作完整发行；以后补齐同源码／版本的 macOS 制品，或单独设计经批准的 Linux-only 发行契约，再按 [CLI 计划示例](../examples/cli-release-plan.example.json) 组合四个 CLI。
未变组件可复用已经验收的旧制品。后续按 [发行指南](RELEASING.md) 本机签名、验签、预演／创建 Draft，再做公开下载与安装验收。

正式长期发行必须上传到 Release assets；14 天保留的 Actions artifact 不能作为安装器下载地址。
当前未配置自动签名、Release 上传／公开或频道推广；安装器迁移也尚未执行。
