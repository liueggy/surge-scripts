# Surge Network Pro

Surge 网络监控模块：每分钟进行一次 Cloudflare HTTP 采样，保留 30 分钟历史；每五分钟检测 Google、GitHub、OpenAI、Cloudflare。

## 安装

模块 URL：

https://raw.githubusercontent.com/liueggy/surge-scripts/main/network-pro.sgmodule

在 Surge 的模块管理中通过 URL 安装并启用。等待定时任务首次执行后，打开 Surge Network Pro 和网站连通性面板查看数据。

## 文件

- `network-monitor.js`：cron 采样和网站检测，缓存到 `snp_state_v1`
- `panel.js`：主面板，策略、响应、速度、趋势、成功率
- `connectivity-panel.js`：四站检测详情
- `network-pro.sgmodule`：模块入口

## 重要说明

新模块不包含旧 `gh-watch.js`。如果原 Surge 配置中仍有该 cron 任务，请在手机中手动禁用，才能真正停止旧监控通知。

- 检测按 Surge 默认路由执行，并非固定节点的 RTT。
- 收到 HTTP 403/429 仍表示网络可达，但不表示业务正常。
- iOS 后台执行可能受限，历史采样不一定连续。
- 本代码仅经过静态检查，尚未在实际 Surge iOS 设备中验证。
