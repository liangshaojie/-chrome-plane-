// 必须作为最早被 import 的模块——先把 .env 注入 process.env，
// 再让 plane.ts / agent.ts 等模块的顶层读取到正确的环境变量。
// override:true 让 .env 优先级高于 shell 里已导出的同名变量。
import dotenv from "dotenv";
dotenv.config({ override: true });

export const ENABLE_SKILLS = process.env.ENABLE_SKILLS === "true";
export const SKILL_TOOL_ROOTS = (process.env.SKILL_TOOL_ROOTS || "~/.claude/skills")
  .split(",")
  .map((p) => p.trim());
