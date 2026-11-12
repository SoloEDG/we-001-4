import type { Battle, ChainStep } from "../../../shared/types";
import { findUnit } from "../../../shared/document";
import { effectLabels } from "../model/deploy";

const dirName: Record<string, string> = {
  up: "上",
  down: "下",
  left: "左",
  right: "右",
};

/** 为一步连锁生成人类可读描述，包含来源机关，供回放逐跳展示 */
export function describeStep(b: Battle, step: ChainStep): string {
  const trap = b.traps.find((t) => t.id === step.trapId);
  const unit = findUnit(b, step.unitId);
  const head = `[${trap?.name ?? "机关"}] ${unit.name} 触发`;
  const parts: string[] = [];
  for (const c of step.terrainChanges)
    parts.push(`${c.from}→${c.to} @${c.at.x + 1},${c.at.y + 1}`);
  for (const s of step.statusApplied)
    parts.push(`${findUnit(b, s.unitId).name}获状态${s.kind}${s.turns}`);
  for (const d of step.damageDealt)
    parts.push(
      `${findUnit(b, d.unitId).name}-${d.amount}(${d.hp}血)`,
    );
  if (step.push) {
    parts.push(
      `推${dirName[step.push.dir]}至${step.push.to.x + 1},${step.push.to.y + 1}` +
        (step.push.blocked ? "(阻挡)" : ""),
    );
  }
  if (step.died) parts.push("死亡，连锁中止");
  const prefix = step.sourceTrapId ? "↳ 连锁" : "首发";
  return `${prefix} ${head}${parts.length ? "：" + parts.join("；") : ""}`;
}

export function chainSummary(steps: ChainStep[]): string {
  if (!steps.length) return "";
  const kinds = new Set<string>();
  for (const s of steps) {
    if (s.terrainChanges.length) kinds.add(effectLabels.terrain);
    if (s.statusApplied.length) kinds.add(effectLabels.status);
    if (s.damageDealt.length) kinds.add(effectLabels.damage);
    if (s.push) kinds.add(effectLabels.push);
  }
  return `${steps.length} 跳连锁 · ${[...kinds].join("/")}`;
}

export { effectLabels };
