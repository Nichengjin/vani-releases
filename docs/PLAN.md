# 从 Zeabur 迁移到 GitHub Releases

日期：2026-10-25。目标：用独立分发仓库集中交付 Shell 和组件，取消对常驻下载服务的依赖。

## 已确定的边界

- 源码各自维护；本仓库保存发布工具、规范、固定公钥、组合和发布记录。
- GitHub Release 保存二进制，不把二进制纳入 Git 历史。
- 产品发行版本固定五组件组合，组件版本独立；未变组件可以复用已验收资产。
- 沿用现有 Ed25519 公钥与本机私钥；不在公共构建工作流中暴露私钥和私有源码 token。
- 自动化默认只验证；远端写入、上传与公开发行分开授权。

## M0：本地分发工具

- [x] 新建本地 `vani-releases` Git 仓库，无 remote、无初始提交。
- [x] 接收现有 `release-input.json`，严格检查五组件与 macOS/Linux 平台矩阵。
- [x] 从实际复制字节计算 hash／大小，签名并独立验签，保留组件来源 commit。
- [x] 提供离线 Draft 预演；显式执行也只创建 Draft。
- [x] 零依赖测试、只读 CI 工作流、操作规范与历史记录。

本地 `npm run check` 已通过。CI 尚未上传或在 GitHub 执行；测试使用合成资产，不验证真实产品运行。

## M1：准备可复现的真实制品

- [ ] 将所选产品变更整理成获准提交，冻结每个组件的完整 commit 与独立版本。
- [ ] 补齐 Resume/Tasks 源码 remote，或确定可审计的私有源码交付路径；当前二者没有 Git remote。
- [ ] 在 macOS arm64 与 Debian bookworm Linux x64 原生环境运行现有构建器和测试，不使用 autodl2 用户计算任务的资源。
- [ ] 实现 Shell ZIP/DMG、签名／公证、更新元数据与更新客户端；当前只有本机 `.app` 组装。
- [ ] 收齐许可证、SBOM/provenance 与每个平台的构建／集成验收记录，再组合首个真实发行。

## M2：GitHub 分发与客户端迁移

- [ ] 获得授权后创建 GitHub 分发仓库（建议 public）、提交并推送本地骨架；激活检查工作流。
- [ ] 选择真实发行版本，创建 Draft，公网下载资产后按固定公钥验签。
- [ ] 实现签名 preview/stable 索引和显式提升／回滚，固定不可变 tag 的来源。
- [ ] 修改旧安装器、自更新器及 Shell 远端准备：支持新清单、受限 HTTPS 重定向，增加已安装旧版本的升级路径。
- [ ] 真实 macOS/Linux 首装与升级、SSH、失败回滚及 Shell 更新验收。
- [ ] 经用户授权公开发行、切换客户端来源，保留旧版本资产及迁移说明。

旧 `vani/scripts/release-download.mjs` 使用 Zeabur origin/path，并拒绝重定向；直接换一个下载域名不能完成迁移。
原 `vani/.github/workflows/cli-releases.yml` 仍是旧服务发布器，尚未改为 GitHub Releases。

## 后续按实际需要推进

首版优先本机构建与本机签名，不强制先搭建复杂 CD。需要自动化时，私有源码仓库负责构建，
公共分发仓库只接收验收后的资产；签名与公开发布单独审批。新增 Windows/Linux arm64 或组件独立发行时再扩展矩阵与格式。
