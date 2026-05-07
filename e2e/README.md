# E2E 测试

基于 Playwright 搭建的端到端测试框架，支持录制功能。

## 快速开始

确保 server 已运行：
```bash
cd server && npm run dev
```

安装依赖：
```bash
npm install
npx playwright install chromium
```

## 录制新测试

```bash
npm run record
```

Playwright codegen 会启动一个交互式窗口，选择目标 URL 即可开始录制。录制完成后自动生成测试文件到 `tests/` 目录。

## 运行测试

```bash
# 无头模式
npm test

# 有头模式（可见浏览器）
npm run test:headed

# 查看 HTML 报告
npm run show-report
```

## 目录结构

```
e2e/
├── tests/               # 测试用例（录制生成或手动编写）
├── playwright.config.ts # Playwright 配置
└── package.json
```
