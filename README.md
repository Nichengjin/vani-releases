# Vani releases

Vani Constellation 的统一发行仓库：产品源码各自维护，Shell 和组件制品集中通过 GitHub Releases 分发。

**当前状态：[GitHub 分发仓库](https://github.com/Nichengjin/vani-releases) 已创建，首个骨架提交已推送，基础 CI 已通过。**
CLI 候选构建 workflow 以手动触发方式构建 Linux x64，macOS 暂缓；私有源码仓库与只读访问已配置，真实构建结果见 [CD 记录](docs/histories/2026-10-25-cli-workflow.md)。正式发行尚未创建，安装器、CLI 自更新和 Shell 远端准备仍使用原发布协议，迁移进度见 [执行计划](docs/PLAN.md)。

## 先检查本地工具

需要 Node.js >=22.22.2，无第三方 npm 依赖，不需要运行安装或开发服务器：

```sh
npm run check
```

测试使用临时生成的 Ed25519 密钥与合成文件，覆盖组合、签名、篡改拒绝和离线 Draft 预演；不读取正式凭据、不联网、不构建产品。

## 仓库边界

| 留在源码仓库 | 留在这个仓库 | 放在 GitHub Release assets |
| --- | --- | --- |
| Shell、daemon、Resume、Vault、Tasks 源码 | 发布脚本、组合计划示例、固定公钥、规范与 CI | ZIP/DMG、CLI binary、portable tar.gz |
| 构建器、锁文件、组件测试 | 版本与兼容性组合规则、发布记录 | 签名发行清单及 detached signature |

源码仓库可以保持私有。分发仓库建议公开，远端安装就不需要 GitHub 私有仓库 token。
不把源码归档、`node_modules`、签名私钥或构建缓存提交进来。GitHub 提供存储与下载，不再要求运行 Zeabur 下载服务；产品构建依旧需要 macOS/Linux 环境。

## 版本策略

- GitHub tag `v<发行版本>` 表示一套完整、经过验收的产品组合。
- 组件保留独立版本和完整源码 commit；修一个 CLI 时可复用其余未变的已验收制品，不必重建所有组件。
- CLI 套件清单必须齐备四个 CLI 及所需平台，避免发布一次后 Linux 入口消失。Desktop 包可选，后续由 App 流程另行提供，不阻塞 CLI 发版。
- 已发布版本、tag、资产字节不可覆盖。修复、补平台和重新构建使用新版本。
- `preview` 使用 GitHub prerelease；`stable` 使用正式版本。频道索引与回滚尚待接入，禁止把 GitHub 全局 `latest` 当作两个频道。

## 入口

- [操作指南与清单契约](docs/RELEASING.md)：准备输入、签名、验签、预演 Draft。
- [CLI 构建 workflow](docs/CD.md)：GitHub runner 上的单组件构建、平台矩阵、源代码权限与候选资产。
- [执行计划](docs/PLAN.md)：首个真实发行的前置条件与迁移步骤。
- [CLI 计划示例](examples/cli-release-plan.example.json)；[包含 Desktop 的计划示例](examples/release-plan.example.json)。
- [本次实现记录](docs/histories/2026-10-25-bootstrap.md)。
