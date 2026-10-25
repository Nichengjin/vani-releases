# vani-releases

统一分发仓库，不存放产品源码、私钥或构建缓存。

- 先读 `README.md`、`docs/RELEASING.md` 和 `docs/PLAN.md`。
- 修改 Actions 或构建流程前读 `docs/CD.md`；Desktop 包由外部提供，不加入 CLI 构建矩阵。
- 检查：`npm run check`。不需要安装依赖。
- 构建逻辑继续由各源码仓库拥有；这里组合、校验和签名发行物。
- 发布、推送、配置 GitHub secrets 和修改频道都需要用户明确授权。
- 完成的流程变更同步文档及 `docs/histories/`。
