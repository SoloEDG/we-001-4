import type { Battle, Point, Unit } from "./types";
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const key = (p: Point) => `${p.x},${p.y}`;
export const distance = (a: Point, b: Point) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const living = (b: Battle) => b.units.filter((u) => u.hp > 0);
export const findUnit = (b: Battle, id: string): Unit => {
  const u = b.units.find((u) => u.id === id);
  if (!u) throw new Error("角色不存在");
  return u;
};
/** 兼容旧存档：补齐机关字段 */
export function migrate(b: Battle): Battle {
  if (!Array.isArray(b.traps)) b.traps = [];
  for (const t of b.traps) if (typeof t.spent !== "boolean") t.spent = false;
  return b;
}
export function assertBattle(b: Battle) {
  if (b.tiles.length !== 96 || new Set(b.tiles.map(key)).size !== 96)
    throw new Error("地图数据不完整");
  if (
    !b.units.length ||
    new Set(b.units.map((u) => u.id)).size !== b.units.length
  )
    throw new Error("角色数据不完整");
  if (!Array.isArray(b.traps)) throw new Error("机关数据不完整");
  const tileKeys = new Set(b.tiles.map(key));
  for (const t of b.traps) {
    if (!tileKeys.has(key(t))) throw new Error("机关位于地图外");
    if (
      b.tiles.find((v) => key(v) === key(t))!.terrain === "wall" ||
      b.units.some((u) => u.hp > 0 && key(u) === key(t))
    )
      throw new Error("机关部署位置非法");
  }
  if (new Set(b.traps.map(key)).size !== b.traps.length)
    throw new Error("同一格存在重复机关");
}
