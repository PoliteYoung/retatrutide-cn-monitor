## retatrutide-cn-monitor

每周三 18:30（北京时间）定时检查 **retatrutide/瑞他鲁肽 是否在中国获批/上市** 的公开信息，并将简报推送到钉钉 webhook（通过 GitHub Actions 运行）。

> 重要：webhook URL、token、Authorization 等凭证 **不要写进仓库**。请使用 GitHub Actions Secrets 注入。

### 目录结构

```
.
├── .github/workflows/weekly-report.yml   # 定时任务（UTC 10:30 = 北京时间周三 18:30）
├── src/index.js                          # 主入口：抓取 -> 判定 -> 推送
├── package.json
└── .gitignore
```

### 本地运行（可选）

```bash
export DINGTALK_WEBHOOK="https://oapi.dingtalk.com/robot/send?access_token=***"
node ./src/index.js
```

只生成报告、不推送 webhook：

```bash
DINGTALK_DRY_RUN=1 node ./src/index.js
```

### GitHub Actions 配置（必须）

1) 创建 public 仓库并推送代码。

2) 设置 Actions Secret：

- Secret 名：`DINGTALK_WEBHOOK`
- Secret 值：你的钉钉自定义机器人 webhook 完整 URL（包含 access_token）
可用 gh-cli（在你的电脑上执行）：

```bash
# 进入仓库目录后执行
gh secret set DINGTALK_WEBHOOK
# 然后按提示粘贴 secret 值（不会显示在命令行中）
```

3) 去 GitHub 仓库的 Actions 页面观察定时任务运行情况；也可以手动触发（workflow_dispatch）。

### 监测说明

- 优先检查 NMPA/CDE 官方入口和官方域名搜索结果。
- 辅助检查公开网页与礼来投资者新闻搜索。
- 若官方站点触发访问验证，报告会标记为不可解析；这类情况不自动视为“无上市”，只说明本次自动抓取没有得到可确认线索。
- 结论是线索监测，不等同于药品注册结论；最终请以 NMPA/CDE 数据库、公告及企业官方披露为准。
