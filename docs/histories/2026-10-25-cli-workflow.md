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
- 四个组件均在 GitHub Linux runner 的 Debian bookworm 容器中首次构建成功，镜像、私有源码 checkout、组件测试、候选收集与上传全部通过。
- Resume：17 个内部测试包通过；Tasks：51 项测试及实际 release binary 的 project-v2／Review／MCP 持久化 smoke 通过；Vault：34 项测试及 CLI/TUI/update help smoke 通过；daemon：42 项测试及内置 Node 的生命周期／PTY smoke 通过。
- 四份最终候选均已下载，在本机独立重算大小／SHA-256，与冻结源码和来源记录逐项一致。Resume/Tasks 的 ELF64 x86-64 头及两个 tar 包的入口／许可证检查通过；本机未执行 Linux binary、未安装或更换任何入口。

## 首次真实 Linux 候选

workflow 来自[分发提交](https://github.com/Nichengjin/vani-releases/commit/be90a2322c50b8153668ea372ad44ada6ccaa66c)，构建器与 daemon 来自[冻结工具提交](https://github.com/Nichengjin/vani/commit/9f9f6d322044a296df3b1667a89e039773a9cff6)。
构建耗时约 5 分钟，未使用 autodl2 的计算资源。

| 组件 / 成功记录 | 候选版本 | 平台 | 文件字节数 |
| --- | --- | --- | --- |
| [Resume](https://github.com/Nichengjin/vani-releases/actions/runs/40215561275) | `0.1.0-preview.g614142f.40215561275.1` | linux-x64 | 9715760 |
| [Tasks](https://github.com/Nichengjin/vani-releases/actions/runs/40215567437) | `0.1.0-preview.gae18444.40215567437.1` | linux-x64 | 14350776 |
| [Vault](https://github.com/Nichengjin/vani-releases/actions/runs/40215573155) | `0.1.0-preview.g81e4916.40215573155.1` | node | 1964213 |
| [vani-daemon](https://github.com/Nichengjin/vani-releases/actions/runs/40215583490) | `0.1.0-preview.g9f9f6d3.40215583490.1` | linux-x64 | 48597928 |

独立下载核验的 SHA-256：

```text
resume       e06a36aad280ad90a7141c38cb97d92b015cebed06d6749745e7a2fc081c57cd
tasks        fc17a5e4058f17a4c766c025c069268f46a81d7528ff878db05c85bc72d3ff8e
vault        0a75196863dc6e2ea5c1d9fc157c1d441cc8dac70bb067a63287f0bec436d970
vani-daemon  6881d731aecf68bf86c3c193a70b54ad1b8b8f37d6ef7215e6ea004ff4534433
```

本地副本保存在被 Git 忽略的 `inputs/linux-20261025/<component>/candidate-*/`；每份包含实际制品、`release-input.json` 和 `build-provenance.json`。Actions 候选只保留 14 天，本地副本继续保留供后续签名／分发使用。

## 实际交付状态

workflow、CLI-only 规则与配套文档已经提交并推送；四个真实 Linux 候选均构建成功、下载并完成字节核验。
源码 remote、候选提交与只读访问已准备；本轮没有公开 Release、上传签名私钥或变更客户端安装／更新来源。
当前产物是未签名候选。正式签名／Release、Linux-only 发行契约及安装／更新器迁移继续单独推进；macOS 构建暂缓。

执行上下文：Amp coding agent，本地 macOS / Node 22.22.2。
