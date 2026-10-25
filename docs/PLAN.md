# 从 Zeabur 迁移到 GitHub Releases

日期：2026-10-25。目标：用独立分发仓库集中交付 Shell 和组件，取消对常驻下载服务的依赖。

## 已确定的边界

- 源码各自维护；本仓库保存发布工具、规范、固定公钥、组合和发布记录。
- GitHub Release 保存二进制，不把二进制纳入 Git 历史。
- CLI 发行版本固定四个 CLI 组合，组件版本独立；未变组件可以复用已验收资产。Desktop 包可选，由 App 流程另行提供。
- 沿用现有 Ed25519 公钥与本机私钥；不在公共构建工作流中暴露私钥和私有源码 token。
- 自动化默认只验证；远端写入、上传与公开发行分开授权。

## M0：本地分发工具

- [x] 新建 `vani-releases` Git 仓库；骨架首次提交并推送到公开的 GitHub 分发仓库。
- [x] 接收现有 `release-input.json`，检查完整 CLI 套件与 macOS/Linux 平台矩阵；Desktop 可选。
- [x] 从实际复制字节计算 hash／大小，签名并独立验签，保留组件来源 commit。
- [x] 提供离线 Draft 预演；显式执行也只创建 Draft。
- [x] 零依赖测试、只读 CI 工作流、操作规范与历史记录。

基础 [GitHub CI](https://github.com/Nichengjin/vani-releases/actions/runs/40212533262) 已通过。
本地测试使用合成资产，不验证真实产品运行。

## M0.1：GitHub runner CLI 构建候选

- [x] 本地编写手动触发 workflow，逐个构建 CLI；App 不参与。
- [x] 按本轮要求原生 CLI 只构建 Linux x64；Vault 构建一次通用 Node 包；macOS 暂缓。
- [x] 冻结源码与工具完整 SHA，复用原构建／测试／合并器，daemon 包含 Node。
- [x] 合并平台后计算资产 hash 与来源记录，保存未签名候选 Actions artifact。
- [x] 本地 actionlint 和合成输入验证；CLI-only 签名／验签回归通过。
- [x] 获得后续提交／推送及 Linux 构建授权；配置每个私有源仓库的只读 deploy key。
- [ ] 上传 workflow 并完成四个组件的首次真实 Linux runner 构建。

候选构建是 CD 的制品阶段；本机签名、Release 上传／公开及频道推广仍独立执行。操作见 [CD 指南](CD.md)。

## M1：准备可复现的真实制品

- [x] Resume/Tasks 所选 CLI 变更在隔离副本冻结为候选提交，排除桌面 UI 在途修改；原工作区保持原状。
- [x] 建立 Resume/Tasks 私有源码 remote；四个组件使用私有候选分支提供不可变来源。
- [ ] 在 Debian bookworm Linux x64 运行现有构建器和测试，不使用 autodl2 用户计算任务的资源；macOS 留待后续。
- [ ] 后续 App 流程提供 Shell ZIP/DMG；签名／公证、更新元数据与更新客户端另行推进，不阻塞 CLI。
- [ ] 收齐许可证、SBOM/provenance 与每个平台的构建／集成验收记录，再组合首个真实发行。

## M2：GitHub 分发与客户端迁移

- [x] 创建公开 GitHub 分发仓库，提交并推送本地骨架；基础检查 workflow 已执行通过。
- [ ] 选择真实发行版本，创建 Draft，公网下载资产后按固定公钥验签。
- [ ] 实现签名 preview/stable 索引和显式提升／回滚，固定不可变 tag 的来源。
- [ ] 修改旧安装器、自更新器及 Shell 远端准备：支持新清单、受限 HTTPS 重定向，增加已安装旧版本的升级路径。
- [ ] 真实 macOS/Linux 首装与升级、SSH、失败回滚及 Shell 更新验收。
- [ ] 经用户授权公开发行、切换客户端来源，保留旧版本资产及迁移说明。

旧 `vani/scripts/release-download.mjs` 使用 Zeabur origin/path，并拒绝重定向；直接换一个下载域名不能完成迁移。
原 `vani/.github/workflows/cli-releases.yml` 仍是旧服务发布器，尚未改为 GitHub Releases。

## 后续按实际需要推进

本轮在分发仓库编排受信的手动 Linux CLI 构建；私有源码通过每仓库独立的只读 SSH deploy key checkout，不在 PR 自动触发构建。
私钥保留本机，签名与公开发布单独审批。新增 Windows/Linux arm64 或组件独立发行时再扩展矩阵与格式。
