// 必须作为最早被 import 的模块——先把 .env 注入 process.env，
// 再让 plane.ts / agent.ts 等模块的顶层读取到正确的环境变量。
//
// 按 NODE_ENV 加载对应的环境文件，实现开发/生产配置分离：
//   NODE_ENV=development → .env.development
//   NODE_ENV=production  → .env.production
// 若对应文件不存在则回退到 .env（向后兼容）。
// override:true 让文件内的值优先级高于 shell 里已导出的同名变量。
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const NODE_ENV = process.env.NODE_ENV ?? "development";
const envPath = path.resolve(process.cwd(), `.env.${NODE_ENV}`);
if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
} else {
  dotenv.config({ override: true });
}

/** 当前运行环境（development / production），供 /health 等处暴露 */
export const APP_ENV = NODE_ENV;
export const ENABLE_SKILLS = process.env.ENABLE_SKILLS === "true";
export const SKILL_TOOL_ROOTS = (process.env.SKILL_TOOL_ROOTS || "~/.claude/skills")
  .split(",")
  .map((p) => p.trim());
export const LOCAL_CODE_ROOT = process.env.LOCAL_CODE_ROOT;
