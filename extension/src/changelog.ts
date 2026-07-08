/**
 * 应用版本号 + 更新日志（集中维护，发版时在这里和 manifest.json 同步改）
 *
 * 发版流程：
 *  1. 同步修改本文件 APP_VERSION 与 manifest.json 的 version
 *  2. 在 CHANGELOG 顶部插入新条目
 *  3. TopBar 顶栏右侧版本号会读取 APP_VERSION，点击弹框读取 CHANGELOG
 */

export const APP_VERSION = '0.7.0'

export interface ChangelogEntry {
  /** 版本号，遵循 semver */
  version: string
  /** 发布日期（YYYY-MM-DD） */
  date: string
  /** 改动条目，按重要性从高到低排列 */
  items: string[]
}

/**
 * 更新日志：时间倒序，第一条为最新版本。
 *
 * 当前条目（0.4.0）的 items 会同步渲染到"分析结果 tab"无结果时也会展示。
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.7.0',
    date: '2026-07-09',
    items: [
      '新增：插件底部常驻「接着追问」输入栏（ChatBar），仅 developer 角色可见，分析进行中自动禁用',
      '输入栏支持图片上传：点击📎附件按钮选择文件 / Ctrl+V 粘贴截图，图片 base64 落盘到 temp 并告知 agent 路径',
      '追问过程中的分析步骤实时同步到「过程分析」tab，文本累积到「分析结果」tab，代码改动自动刷新「代码改动」tab',
      '后端 /chat 接口新增 images 字段支持 + 对话结束后自动计算 git diff 推送 changes 事件',
      '修复：追问完成后输入框仍然禁用的 bug（chat store 流结束后未重置 phase 为 idle）',
      '修复：「确认合并并提交」提示未识别到 Plane issue 链接（现从 analysisStore.issue 回退解析，不再依赖当前 tab URL）',
      '移除代码改动 tab 中的弹窗式「接着追问」按钮，改为底部常驻输入栏',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-07-08',
    items: [
      '新增：「接着追问」多轮对话按钮，位于代码改动 tab 「确认合并并提交」与「取消并恢复」中间',
      '该能力只在 developer 角色下可见，使用与初始代码改动流程一致的 Claude Agent SDK 调用（可读写代码、跑 bash）',
      '对话上下文在同一 analysis_id 下复用同一个 chat_session，所有消息落库 SQLite（chat_sessions / chat_messages 两张新表）',
      '后端新增 POST /chat SSE 流式接口 + GET /chat/:sessionId 拉历史接口；prompt = 系统提示 + 当前 issue 摘要 + 同一会话历史消息 + 最新问题',
      '前端新增 ChatDialog 模态弹框（消息气泡 + 流式光标 + ESC/Shift+Enter 快捷键 + 停止按钮）和 chat Pinia store',
      '每轮 user 消息立即落库，assistant 完整回复在 finally 里一次性入库——中途崩溃历史也保留',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-07-07',
    items: [
      '新增：分析历史记录功能 —— 每次分析自动落库到本地 SQLite，TopBar「历史」入口可查看/回看/删除',
      '回看时完整还原当时的全过程（过程步骤 + 结果正文 + 代码改动），数据存服务端，刷新 Side Panel 不丢',
      '历史列表展示 issue 标识/标题/角色/状态/相对时间/耗时/成本/轮数，支持二次确认删除',
      '服务端新增 SQLite 持久化（better-sqlite3，WAL 模式）+ 历史接口（GET /history 列表 / GET /history/:id 详情 / DELETE 删除）',
      '远端后端的历史接口同样走 host 权限授权，与 analyze 流程一致',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-07-03',
    items: [
      '新增：分析结果支持导出为 Markdown 文件，按钮在 OutputPane 顶部',
      '导出文件带 Issue 元信息头（identifier / 标题 / 链接 / 状态 / 标签 / 导出时间）+ 完整正文',
      '文件名：<identifier>_<时间戳>.md，自动剔除 Windows 非法字符',
      '带 UTF-8 BOM，Windows 记事本打开不乱码',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-07-03',
    items: [
      '服务端默认监听 0.0.0.0，移除硬编码 IP（HOST/PORT 仍可通过环境变量覆盖）',
      '前端 serverUrl 默认空字符串，由 placeholder 提示用户填写，不再写死 10.10.10.67',
      'manifest 加 optional_host_permissions + 新建 utils/permissions.ts，按需弹窗授权远端 origin',
      '任意开发机部署无需再手动改 manifest，Chrome 弹窗授权一次后持久化',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-07-03',
    items: [
      '客户端默认角色从 developer 改为 business，避免同事首次打开误选到代码改动入口',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-07-02',
    items: [
      '隐藏「开发者」角色与「代码改动」tab，仅对外保留「测试人员 / 业务人员」两档',
      '同步清理 App.vue 中的 ChangesPane 引用与自动切 tab 逻辑，避免死代码',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-07-02',
    items: [
      '初版发布：Plane 工作项解析（url → workspace/identifier）',
      'Claude Agent SDK 流式分析（SSE 三步流程：issue-detail → proxy-image → analyze）',
      '三个用户角色（开发者 / 测试人员 / 业务人员），不同提示词模板与工具权限',
      '评论图片下载（Playwright 单例登录态）',
      '支持把分析结果写回 Plane 评论 / 描述',
    ],
  },
]
