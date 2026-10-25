# 准备一次统一发行

当前只接通本地组合、签名、验签与 Draft 命令。创建远端仓库、推送、上传资产、发布和切换频道需要另行授权。
本指南中的 GitHub 命令在远端仓库准备好之后使用；`draft` 默认只打印操作计划。

## 1. 冻结源码，收集构建输出

在各源码仓库选择完整的已提交 commit，运行原有构建器与组件测试。两个原生平台必须使用同一组件版本和 commit。

| 组件 | 当前构建归属 | 本轮清单要求 |
| --- | --- | --- |
| `vani-desktop` | `vani/apps/shell` | macOS arm64 ZIP，DMG 可选 |
| `vani-daemon` | `vani/scripts/build-daemon-release.mjs` | macOS arm64 + Linux x64 portable tar.gz |
| `resume` | `vani/scripts/build-cli-artifacts.mjs` + `vani-resume` | macOS arm64 + Linux x64 binary |
| `vault` | `vani/scripts/build-vault-release.mjs` + `vani-vault` | 通用 Node tar.gz |
| `tasks` | `vani/scripts/build-cli-artifacts.mjs` + `vani-tasks` | macOS arm64 + Linux x64 binary |

这里不复制构建器。Linux glibc 基线沿用 Debian bookworm；daemon 包须使用 `--include-node` 构建。
Vault 通用包仍需 Node，示例记录最低 22.22.2。声明平台与包内运行时由构建及真机验收负责。
现有 Shell 打包器仅生成本机 `.app`；ZIP/DMG、Apple Developer ID 签名、公证及 updater 尚待实现。
本地 `.app` 不能直接作为合格的正式发行物。

每个平台可以提供独立 `release-input.json`，也接受已有合并器生成的完整组件输入。结构沿用现有构建器：

```json
{
  "component": "resume",
  "version": "0.1.0-preview.20261025.1",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "artifacts": [
    {
      "path": "artifacts/resume-0.1.0-preview.20261025.1-linux-x64",
      "platform": "linux-x64",
      "kind": "binary"
    }
  ]
}
```

这段是结构示例，commit 必须替换为实际构建来源。`path` 相对于该输入文件，资产 basename 必须以组件名加 `-` 开头，且全局唯一。
只接受普通文件，拒绝符号链接；每个资产非空且小于 2 GiB。旧流程的 `staged:true` 输入必须先取回真实文件再转换为此结构。
不要把包含工作区未提交修改的紧急构建标为某个干净 commit 的正式发行。

## 2. 记录产品组合

按 [示例计划](../examples/release-plan.example.json) 把真实产物收集到被 Git 忽略的 `inputs/`。
可在 `examples/` 新建本次计划，保持示例的相对输入路径；同组件可以引用多个平台输入。
每次发布还应记录已经验收的组件组合和发布说明，作为发行 tag 对应的版本化记录。

计划中的 `compatibility` 是发布者声明并需要集成验收的契约：

- `hostProtocol.major/minor`：这套 daemon/Shell 的 Host 协议版本。
- `nodeMinimum`：需要外部 Node 的组件所需最低版本。
- `tasksProjectSchema`：Tasks 项目快照版本。

脚本检查契约的字段类型；实际兼容性需要完整组合的集成测试。
新增清单格式是 **`vani-release-v1`**，与旧下载服务的 **`vani-cli-release-v1`** 分开。
旧客户端需要实现新格式、下载策略及升级逻辑后才能消费它。

## 3. 本地签名与校验

以下命令在本仓库根目录执行。环境变量由操作者设置为真实输入；`VANI_RELEASE_OUTPUT` 的父目录必须存在，输出目录必须尚不存在。

```sh
node scripts/release.mjs prepare \
  --plan "$VANI_RELEASE_PLAN" \
  --output "$VANI_RELEASE_OUTPUT" \
  --credentials "$VANI_RELEASE_CREDENTIALS"

node scripts/release.mjs verify --input "$VANI_RELEASE_OUTPUT"
```

继续使用既有凭据文件的 `privateKey` PEM。正式私钥只留在本机，凭据权限保持 `0600` 并保留加密备份；不要复制到本仓库、公共 CI 或 Release。
脚本没有初始化密钥、改写凭据或上传 token 的操作。本仓库只保存现有 Ed25519 公钥。
`--public-key` 可为隔离测试指定测试公钥；正式发布和验收使用默认固定公钥，安装器也必须独立钉住可信公钥。

生成的目录是平铺资产集合：

- `release-manifest.json`：发行版本、频道、兼容性、每个组件的独立版本／完整 commit，以及资产文件名／平台／格式／大小／SHA-256。
- `release-manifest.sig`：对 JSON 原始字节（包括末尾换行）的 64 字节 Ed25519 detached signature。
- 所有组件资产。hash 和大小从**复制到输出目录的文件**计算，不采用输入自报值。

`verify` 核对签名、五组件平台矩阵、每个文件大小和内容 hash；缺文件、多文件、符号链接和路径穿越都会失败。
输出目录已存在时直接拒绝；准备失败只清理这次新建的输出，不修改构建输入。
签名验证解决清单可信与字节完整性；构建来源、Apple 签名、公证、授权与真实兼容性分别验收。

## 4. 预演 GitHub Draft Release

远端仓库创建并推送分发仓库 commit 后，设置 `VANI_RELEASE_REPOSITORY`（例如 `Nichengjin/vani-releases`）和 `VANI_RELEASE_TARGET`（该仓库的完整 commit）：

```sh
node scripts/release.mjs draft \
  --input "$VANI_RELEASE_OUTPUT" \
  --repo "$VANI_RELEASE_REPOSITORY" \
  --target "$VANI_RELEASE_TARGET"
```

这一步先重新验签及核对全部资产，再输出 `gh release create` 的参数 JSON；没有网络或写操作。
获得上传授权后，在同一命令末尾加 `--execute`，通过已登录的 GitHub CLI 创建 **Draft** 并上传资产。
新 tag 指向给定分发仓库 commit，源码 commit 保留在清单内。版本 tag 若已存在，应先核对其指向；不要移动已发布 tag。
执行固定携带 `--draft --latest=false`，preview 还携带 `--prerelease`；没有自动公开发布、自动推广或自动回滚。
上传中断时先查看远端 Draft 和实际资产，避免直接重复创建或覆盖。

## 5. 正式公开前的验收门槛

1. 在 macOS 和 Linux 隔离 HOME/bin/data 中，验证下载、固定公钥验签、安装及各 CLI 健康检查。
2. 真实 SSH 建立 Host 连接，验证 Resume 项目、Vault 目录／会话、Tasks 项目 schema 和 PTY。
3. 验证旧组件升级、不支持版本的明确拒绝、失败回滚和活跃 daemon 保护；不改用户任务数据。
4. Shell ZIP/DMG 完成目标机启动、Apple 签名／公证，以及旧版到新版更新验收。
5. 公共资产只含可分发文件与许可证；复核包内凭据、私有源码、个人路径、依赖许可证、SBOM/provenance。当前脚本不扫描归档内部。
6. 安装器及更新器切换到新来源，并验证 GitHub HTTPS 重定向、下载 host 白名单、资产大小和 hash、离线／失败路径。
7. 明确实现签名的 preview/stable 频道索引及切换／回滚流程，然后公开发行、更新对应频道。

本地验签测试、GitHub Draft、正式公开、客户端启用是四个独立交付状态，逐项记录。
