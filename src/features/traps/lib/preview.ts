import type { Battle, Point, Trap } from "../../../shared/types";
import { distance, key } from "../../../shared/document";
import { pushDestination } from "./engine";
import { findUnit } from "../../../shared/document";

export interface DangerCell {
  kind: "trap" | "zone";
  trapId: string;
  marker: string;
}

/**
 * 危险预览：未消耗机关所在格（压板）+ 各效果的作用范围。
 * 与结算共用同一套距离/推动规则，保证预览与实际结果一致。
 */
export function dangerPreview(b: Battle): Map<string, DangerCell[]> {
  const map = new Map<string, DangerCell[]>();
  const add = (p: Point, cell: DangerCell) => {
    const k = key(p);
    const list = map.get(k) ?? [];
    list.push(cell);
    map.set(k, list);
  };

  for (const trap of b.traps) {
    if (trap.spent) continue;
    add(trap, { kind: "trap", trapId: trap.id, marker: "trap" });
    for (const eff of trap.effects) {
      if (eff.kind === "push" && eff.dir) {
        // 用任意假设单位估算推动走廊（以机关格为起点）
        const probe = findUnit(b, b.active);
        const ghost = { ...probe, x: trap.x, y: trap.y };
        const { to } = pushDestination(b, ghost, eff.dir, eff.power ?? 3);
        const dx = Math.sign(to.x - trap.x);
        const dy = Math.sign(to.y - trap.y);
        let cur: Point = { x: trap.x, y: trap.y };
        while (cur.x !== to.x || cur.y !== to.y) {
          cur = { x: cur.x + dx, y: cur.y + dy };
          add(cur, { kind: "zone", trapId: trap.id, marker: "push" });
        }
      } else {
        const radius = eff.radius ?? 0;
        for (const tile of b.tiles) {
          if (tile.terrain !== "wall" && distance(tile, trap) <= radius) {
            add(tile, {
              kind: "zone",
              trapId: trap.id,
              marker: eff.kind,
            });
          }
        }
      }
    }
  }
  return map;
}
