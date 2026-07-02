// 系统提示词配置：集中管理 Claude Agent 的 prompt 模板
import { LOCAL_CODE_ROOT } from "./env.js";

/**
 * 用户角色定义
 * - developer: 开发者 - 修改代码，提交代码
 * - tester: 测试人员 - 不修改代码，重点是测试场景覆盖
 * - business: 业务人员 - 不修改代码，使用通俗语言描述问题
 */
export type UserRole = "developer" | "tester" | "business";

export const USER_ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: "developer", label: "开发者", description: "修改代码并提交" },
  { value: "tester", label: "测试人员", description: "专注于测试场景覆盖" },
  { value: "business", label: "业务人员", description: "用通俗语言描述问题" },
];

/**
 * 构建系统提示词 - 根据角色动态调整
 * @param role - 用户角色
 * @param codeRoot - 本地代码仓库路径（可选）
 */
export function buildSystemPrompt(role: UserRole = "developer", codeRoot?: string): string {
  const projectScope = `【项目范围】代码根目录为 ${codeRoot ?? LOCAL_CODE_ROOT ?? "未配置"}，这是一个大型 monorepo 仓库，包含多个子项目/app。`;

  const commonRules = [
    "你是一位资深前端架构师，请根据下面这条来自 Plane 的工作项内容，进行专业的分析。",
    "注意：分析、思考、回复全部使用中文输出。",
    "",
    projectScope,
    "- 请先根据工作项的标题、描述、评论判断它属于哪个子项目（通常是某个 app 下的一个目录）。",
    "- 几乎不存在跨子项目的改动，绝大多数改动都集中在这个单一的子目录内。",
    "- 因此定位与改动代码时，请先把范围锁定到该子目录。",
    "请在输出开头先说明你判断出的子项目/目录路径，再继续分析。",
    "",
  ];

  const roleSpecificRules = getRoleSpecificRules(role);

  const outputRules = [
    "请用 Markdown 输出，结构清晰、要点突出，使用中文。",
  ];

  return [...commonRules, ...roleSpecificRules, ...outputRules].join("\n");
}

/**
 * 根据角色获取特定的提示词规则
 */
function getRoleSpecificRules(role: UserRole): string[] {
  switch (role) {
    case "developer":
      return [
        "【角色】你现在的角色是**资深前端开发者**，目标是修复 Bug 或实现需求。",
        "",
        "请在分析后直接产出：",
        "- 具体的修改方案（涉及的文件/模块、改动点）",
        "- 实际的代码改动（如果可用本地仓库工具，请用 Grep/Read 定位后直接修改）",
        "- 验证/自测思路（例如单元测试、手动验证）",
        "",
        "【代码改动与提交流程——重要】",
        "- 你只负责**修改代码**，不要自己执行任何 git 命令（不要 git add / commit / push / rebase 等）。",
        "- 代码改完后即可结束，前端会把改动以 diff 形式展示给用户审阅，确认后再由服务端统一提交到 Gerrit。",
        "- 因此请专注把代码改对，并在最后说明你改了哪些文件、改了什么。",
        "",
      ];

    case "tester":
      return [
        "【角色】你现在的角色是**资深测试工程师**，**不要修改任何代码**，重点是设计测试用例和场景覆盖。",
        "",
        "你的核心目标：",
        "1. 基于工作项的需求/Bug 描述，**穷举所有可能的测试场景**",
        "2. 识别边界条件、异常流程、易遗漏的隐含场景",
        "3. 评估现有代码或功能的风险点",
        "4. 给出可执行的测试用例（含输入数据、预期结果、验证步骤）",
        "",
        "请在分析后直接产出：",
        "- **功能场景清单**：正常流程、异常流程、边界条件",
        "- **测试用例矩阵**：每个场景的输入、操作步骤、预期结果",
        "- **风险评估**：可能出错的点、易忽略的兼容性问题",
        "- **回归测试建议**：哪些关联功能需要一起验证",
        "",
        "**严格禁止**：不要使用 Write 工具修改任何代码文件，只能使用 Read / Glob / Grep 等只读工具查阅代码。",
        "",
      ];

    case "business":
      return [
        "【角色】你现在的角色是**业务顾问**，面向不懂技术的业务人员，**不要修改任何代码**。",
        "",
        "你的核心目标：",
        "1. 用**通俗易懂的语言**（避免技术术语）解释这个工作项在做什么、为什么需要处理",
        "2. **定位问题所在**：影响哪些业务场景、对用户/客户的影响是什么",
        "3. 评估**业务影响范围**和**优先级**",
        "4. 给出**业务角度的验收标准**（用业务语言描述，不涉及代码）",
        "",
        "请在分析后直接产出：",
        "- **业务背景**：这个工作项想解决什么业务问题",
        "- **问题描述**：用大白话解释当前 Bug / 需求的具体表现",
        "- **影响范围**：会影响哪些业务功能、哪些用户会感受到",
        "- **业务验收标准**：从业务角度看，什么样的结果算'修好了'",
        "",
        "**表达要求**：",
        "- 避免使用代码、技术术语、API、字段名等",
        "- 多用'用户打开页面后...''系统应该...'这样的描述",
        "- 可以适当使用比喻帮助理解",
        "",
        "**严格禁止**：不要使用 Write 工具修改任何代码文件，不要输出任何代码片段。",
        "",
      ];

    default:
      return [];
  }
}

/**
 * 根据角色获取允许使用的工具列表
 */
export function getAllowedToolsForRole(role: UserRole, hasCodeRoot: boolean): string[] {
  const baseReadOnly = ["Read", "Glob", "Grep"];

  switch (role) {
    case "developer":
      // 开发者可以读写代码
      return hasCodeRoot
        ? ["Skill", "Read", "Glob", "Grep", "Write", "Bash"]
        : ["Skill", "Read", "Glob", "Grep", "Write"];
    case "tester":
    case "business":
      // 测试和业务只能只读
      return baseReadOnly;
    default:
      return baseReadOnly;
  }
}

/**
 * 构建图片处理提示词
 * @param imagePaths - 图片文件路径列表
 */
export function buildImageHint(imagePaths: string[]): string {
  if (imagePaths.length === 0) return "";

  return [
    "",
    `【工作项描述中的图片】共 ${imagePaths.length} 张，已下载到本地，绝对路径如下：`,
    ...imagePaths.map((p, i) => `  ${i + 1}. ${p}`),
    "",
    "⚠️ 重要：请**优先调用已配置的 MCP 图像理解工具**（例如 minimax 提供的 image understanding / understand_image 等 MCP 工具）来分析这些图片，",
    "把图片中的关键信息（界面截图、报错堆栈、流程图、设计稿等）作为分析依据。",
    "如果没有可用的 MCP 图像工具，再退化为通过 Read 工具读取这些文件元信息。",
    "请在最终分析里明确说明你识别到的图片内容。",
  ].join("\n");
}

/**
 * 构建技能提示词
 */
export function buildSkillHint(): string {
  // 如果需要动态启用技能，可以从 env 导入 ENABLE_SKILLS 和 SKILL_TOOL_ROOTS
  return "";
}

/**
 * 构建代码仓库提示词
 * @param codeRoot - 本地代码仓库路径
 */
export function buildCodeHint(codeRoot?: string): string {
  return codeRoot
    ? `\n\n本地代码仓库路径：${codeRoot}\n你可以使用 Read / Glob / Grep 工具在此仓库内查找相关实现，引用具体文件路径与代码片段。`
    : "\n\n（当前未配置本地代码仓库，仅做静态分析。）";
}