import type { Battle, Point, Trap, TrapEffect } from "../../../shared/types";
import { key } from "../../../shared/document";

let seq = 0;
export function nextTrapId(): string {
  seq += 1;
  return `trap-${Date.now().toString(36)}-${seq}`;
}

/** 部署：仅允许非断崖、无存活角色、且未部署机关的空地 */
export function deployTrap(
  b: Battle,
  p: Point,
  name: string,
  effects: TrapEffect[],
): Trap {
  const tile = b.tiles.find((t) => key(t) === key(p));
  if (!tile) throw new Error("地图外坐标");
  if (tile.terrain === "wall") throw new Error("断崖上不可部署机关");
  if (b.units.some((u) => u.hp > 0 && key(u) === key(p)))
    throw new Error("角色脚下不可部署机关");
  if (b.traps.some((t) => key(t) === key(p)))
    throw new Error("该格已有机关");
  const trap: Trap = {
    id: nextTrapId(),
    x: p.x,
    y: p.y,
    name,
    effects: JSON.parse(JSON.stringify(effects)),
    spent: false,
  };
  b.traps.push(trap);
  return trap;
}

export function removeTrap(b: Battle, p: Point): Trap {
  const i = b.traps.findIndex((t) => key(t) === key(p));
  if (i < 0) throw new Error("该格没有机关");
  return b.traps.splice(i, 1)[0];
}

export const effectLabels: Record<TrapEffect["kind"], string> = {
  terrain: "改地形",
  status: "加状态",
  push: "推动",
  damage: "伤害",
};
