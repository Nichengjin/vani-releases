# 2026-10-25：建立 GitHub 分发仓库与 CLI 候选 workflow

## 诉求与边界

用户批准提交骨架、创建公开分发仓库并推送，随后开始 GitHub runner CLI 构建流程。
App 的 macOS 包后续另行提供，本轮不构建、不要求它阻塞 CLI 套件。后续指令明确 CLI 也只跑 Linux，暂缓 macOS。

## 已交付

- 首个骨架提交已推送到 `Nichengjin/vani-releases`；基础 GitHub CI 成功。
- 增加 `build-cli.yml`：手动输入完整源／工具 SHA，复用已有构建器，原生 CLI Linux x64、Vault 单 Node 包，核对平台后生成未签名候选与来源记录。Tasks 增加实际 release binary 的隔离 project-v2／MCP smoke。
- 本地组合／验签规则改为四个必需 CLI、可选 Desktop；旧的完整五组件组合仍可用。
- 建立私有 Resume/Tasks 源码仓库，在隔离副本冻结 CLI、测试与对应历史，推到候选分支；排除桌面 UI 的在途修改，不改原工作区或索引。
- 配置四个源码仓库独立的只读 deploy key，私钥写入 Actions secret 后删除本地临时文件；正式签名私钥留在本机。
- 规范说明公开日志、候选保留期、本机签名及正式发布边界；Linux-only 候选不能绕过正式组合器的双平台检查。

## 验证

- 基础 CI：https://github.com/Nichengjin/vani-releases/actions/runs/40212533262。
- 本地 `npm run check`：12 项 CLI 回归通过。
- actionlint 1.7.12 校验两个 workflow 通过；三个内嵌 JS 脚本通过语法检查。
- 初版双平台规划／收集验证 36 个合成场景；改为 Linux-only 后重新运行 28 个场景，覆盖四个组件、无效 ref／版本、错误来源、错误平台，以及来源记录的实际大小／hash；临时夹具清理。
- Docker Registry 中 Go／Rust 镜像 manifest 可读取；Node 镜像查询遇到认证端点连接 EOF，未完成该项远端检查。没有运行容器或真实 runner 构建。

## 实际交付状态

骨架已经提交并推送；后续 workflow、CLI-only 规则与配套文档准备提交及首次 Linux runner 构建。
源码 remote、候选提交与只读访问已准备；本轮没有公开 Release、上传签名私钥或变更客户端安装／更新来源。
真实 runner 构建及下载核验的结果在完成后补充；macOS 构建暂缓。

执行上下文：Amp coding agent，本地 macOS / Node 22.22.2。
