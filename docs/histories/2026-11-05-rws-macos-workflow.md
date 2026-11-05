# 2026-11-05：准备 RWS 与原生 macOS CLI 候选编排

## 范围与授权

用户允许后续组件合并及直接发布 preview，并明确跳过本轮新机 UI／安装验收，优先使用 GitHub runner 避免本机磁盘压力。
本次分工仅修改 `vani-releases`：不推送、不 dispatch、不配置远端源码或 secret，不签名、不上传 Release、不切换频道。
源码构建器、测试与合并器继续由 Vani 拥有；没有修改其他仓库。2026-10-25 的真实 Linux 构建记录不改写为本轮执行结果。

## 改动

- `build-cli.yml` 增加 `rws`，来源固定 `Nichengjin/remote-workspace-backend`，checkout 引用独立只读 deploy key secret `VANI_RWS_SSH_KEY`。
- RWS 复用 `build-cli-artifacts.mjs --component rws`；与 Resume 一起使用 Go 1.26.10。
- Resume／Tasks／RWS／daemon 的矩阵均为 Debian bookworm Linux x64 + `macos-15` arm64 原生构建；macOS 使用空容器镜像值禁用容器，并检查实际架构。
- Tasks 在 macOS 显式安装 Rust 1.91.0，并沿用已有 release binary 的隔离 project-v2／Review／MCP smoke；smoke 标签改为平台中立。
- Vault 保持一次 Linux 构建的通用 Node 包；daemon 继续强制原生 node-pty、包含 Node 和许可证。
- collect 要求同版本／SHA 的完整双平台（Vault 仅 node），RWS 使用 binary kind，继续从实际文件计算大小／SHA-256，输出未签名候选。
- 保留完整源码／工具 SHA 校验、SSH checkout 的 `persist-credentials: false`、只读工作流权限、手动触发及按 attempt 隔离候选；没有自动签名或发布步骤。
- 同步 README、CD／发行指南及计划；新增零依赖 workflow 嵌入脚本回归。

## 本地验证

- `npm run check` 通过：25 项测试（15 个顶层测试及 10 个子测试），0 失败；含原有 12 项发行工具回归。
- 新增检查运行实际 resolve／collect 嵌入 JavaScript：五个组件、双平台／Vault 单平台、错误仓库／SHA／版本／组件拒绝、缺失／重复／错误平台及 kind 拒绝、真实大小／hash 与 `signed: false`。
- 三段嵌入 JavaScript 均通过 `node --check`。collect 测试仅模拟 Vani 合并器输出，不声称验证真实构建器或合并器。
- `git diff --check` 通过；已复核改动差异。
- `actionlint` 在 PATH 与 `/opt/homebrew/bin` 均不可用，未安装依赖或下载工具，故本轮未运行 actionlint。
- 查阅 GitHub runner 官方表，`macos-15` 当前对应标准 arm64 runner。镜像与系统包仍会漂移，不承诺逐字节可复现。

## 待操作者完成与风险

1. 准备并推送含 RWS 构建／测试／合并支持的 Vani 工具 SHA、冻结源码 SHA，以及本仓库 workflow；旧工具提交可能不识别 RWS。
2. 配置 `VANI_RWS_SSH_KEY` 为 RWS 仓库独立只读 deploy key，再手动构建全部平台。缺少密钥会导致私有 checkout 失败。
3. 新增 RWS／macOS job 尚未真实运行；runner 工具链下载、macOS 原生依赖／PTY 行为和实际制品仍需执行后核验。重跑使用 **Re-run all jobs**，不能跨 attempt 拼平台。
4. `scripts/release.mjs` 的统一发行契约仍只支持原有四个 CLI，不接受 RWS。本次只扩展候选编排；RWS 签名发布需走已支持它的源仓库流程或另行扩展统一契约。
5. Actions 日志／候选在公共仓库可见，制品只保留 14 天；执行前确认可分发内容，执行后及时下载保存。裸 binary 下载后需恢复执行权限。
6. 没有进行新机 UI／安装验收（按用户要求跳过），也没有进行发布或公开下载验签；不能把本地回归标作这些验收已通过。
