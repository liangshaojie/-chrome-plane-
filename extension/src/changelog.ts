/**
 * 应用版本号 + 更新日志（集中维护，发版时在这里和 manifest.json 同步改）
 *
 * 发版流程：
 *  1. 同步修改本文件 APP_VERSION 与 manifest.json 的 version
 *  2. 在 CHANGELOG 顶部插入新条目
 *  3. TopBar 顶栏右侧版本号会读取 APP_VERSION，点击弹框读取 CHANGELOG
 */

export const APP_VERSION = '0.4.0'

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
