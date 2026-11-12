import type {
  Battle,
  ChainStep,
  Point,
  PushDir,
  Status,
  Trap,
  TrapEffect,
  Unit,
} from "../../../shared/types";
import { distance, findUnit, key } from "../../../shared/document";

const DIRS: Record<PushDir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export function trapAt(b: Battle, p: Point): Trap | undefined {
  return b.traps.find((t) => !t.spent && key(t) === key(p));
}

function tileAt(b: Battle, p: Point) {
  return b.tiles.find((t) => key(t) === key(p));
}

function unitAt(b: Battle, p: Point, exclude?: string) {
  return b.units.find(
    (u) => u.hp > 0 && u.id !== exclude && key(u) === key(p),
  );
}

/** 格是否阻挡推动：地图外 / 断崖 / 被其他存活角色占据 */
export function blockedForPush(b: Battle, p: Point, moverId: string): boolean {
  const tile = tileAt(b, p);
  if (!tile || tile.terrain === "wall") return true;
  return !!unitAt(b, p, moverId);
}

/** 计算推动落点：遇阻挡停在最后一个合法格（零格可推则原地不动） */
export function pushDestination(
  b: Battle,
  u: Unit,
  dir: PushDir,
  maxSteps = 3,
): { to: Point; blocked: boolean } {
  const d = DIRS[dir];
  let cur: Point = { x: u.x, y: u.y };
  let blocked = false;
  for (let i = 0; i < maxSteps; i++) {
    const next = { x: cur.x + d.x, y: cur.y + d.y };
    if (blockedForPush(b, next, u.id)) {
      blocked = true;
      break;
    }
    cur = next;
  }
  return { to: cur, blocked };
}

function effectTargets(b: Battle, center: Point, radius: number): Unit[] {
  return b.units.filter((u) => u.hp > 0 && distance(u, center) <= radius);
}

/**
 * 结算一次机关触发，并沿推动结果递归结算连锁。
 * fired 保证“一次行动内每个机关最多触发一次”，从而两机关互触发时自然停止循环。
 * 触发者死亡（伤害/灼烧等）立即中止后续结算。
 */
export function fireTrap(
  b: Battle,
  trap: Trap,
  unitId: string,
  fired: Set<string>,
  sourceTrapId: string | null,
): ChainStep[] {
  if (fired.has(trap.id) || trap.spent) return [];
  fired.add(trap.id);
  trap.spent = true;

  const trigger = findUnit(b, unitId);
  const unitFrom: Point = { x: trigger.x, y: trigger.y };
  const step: ChainStep = {
    trapId: trap.id,
    unitId,
    at: { x: trap.x, y: trap.y },
    sourceTrapId,
    unitFrom,
    unitTo: unitFrom,
    terrainChanges: [],
    statusApplied: [],
    damageDealt: [],
    push: null,
    died: false,
  };
  const steps: ChainStep[] = [step];

  for (const eff of trap.effects) {
    if (trigger.hp <= 0) break; // 死亡中止剩余效果与连锁
    applyEffect(b, eff, trap, trigger, step);
  }

  step.unitTo = { x: trigger.x, y: trigger.y };
  if (trigger.hp <= 0) {
    step.died = true;
    return steps;
  }

  // 推动落点（或原格）上若有未消耗机关，则继续连锁
  const next = trapAt(b, trigger);
  if (next && !fired.has(next.id)) {
    steps.push(...fireTrap(b, next, trigger.id, fired, trap.id));
  }
  return steps;
}

function applyEffect(
  b: Battle,
  eff: TrapEffect,
  origin: Trap,
  trigger: Unit,
  step: ChainStep,
) {
  if (eff.kind === "terrain" && eff.terrain) {
    const radius = eff.radius ?? 0;
    for (const tile of b.tiles) {
      if (
        tile.terrain !== "wall" &&
        distance(tile, origin) <= radius
      ) {
        if (tile.terrain !== eff.terrain) {
          step.terrainChanges.push({
            at: { x: tile.x, y: tile.y },
            from: tile.terrain,
            to: eff.terrain,
          });
          tile.terrain = eff.terrain;
        }
      }
    }
    return;
  }

  if (eff.kind === "status" && eff.status) {
    const turns = eff.power ?? 2;
    for (const v of effectTargets(b, origin, eff.radius ?? 0)) {
      v.statuses = v.statuses.filter((s) => s.kind !== eff.status);
      v.statuses.push({ kind: eff.status, turns } as Status);
      step.statusApplied.push({ unitId: v.id, kind: eff.status, turns });
    }
    return;
  }

  if (eff.kind === "damage") {
    const amount = eff.power ?? 0;
    for (const v of effectTargets(b, origin, eff.radius ?? 0)) {
      v.hp = Math.max(0, v.hp - amount);
      step.damageDealt.push({ unitId: v.id, amount, hp: v.hp });
      if (v.hp <= 0) v.statuses = [];
    }
    return;
  }

  if (eff.kind === "push" && eff.dir) {
    const { to, blocked } = pushDestination(b, trigger, eff.dir, eff.power ?? 3);
    step.push = {
      dir: eff.dir,
      from: { x: trigger.x, y: trigger.y },
      to: { ...to },
      blocked,
    };
    Object.assign(trigger, to);
  }
}

/** 沿移动路径逐格移动并触发机关；死亡时中止剩余路程 */
export function moveWithTraps(
  b: Battle,
  id: string,
  path: Point[],
): ChainStep[] {
  const u = findUnit(b, id);
  const chain: ChainStep[] = [];
  const fired = new Set<string>();
  for (const cell of path) {
    if (u.hp <= 0) break;
    Object.assign(u, cell);
    const trap = trapAt(b, cell);
    if (trap && !fired.has(trap.id)) {
      chain.push(...fireTrap(b, trap, id, fired, null));
    }
  }
  u.moved = true;
  return chain;
}

/** 机关模板（可配置预设），面板可在此基础上调整参数 */
export const trapTemplates: {
  type: string;
  name: string;
  glyph: string;
  desc: string;
  effects: TrapEffect[];
}[] = [
  {
    type: "terrain",
    name: "地脉机关",
    glyph: "▤",
    desc: "踩下后把自身及邻格草原变为密林",
    effects: [
      { kind: "terrain", terrain: "forest", radius: 1 },
    ],
  },
  {
    type: "status",
    name: "寒雾机关",
    glyph: "❄",
    desc: "对自身及邻格施加迟缓 2 回合",
    effects: [{ kind: "status", status: "slow", radius: 1, power: 2 }],
  },
  {
    type: "push",
    name: "推力机关",
    glyph: "➤",
    desc: "把触发者沿指定方向最多推 3 格",
    effects: [{ kind: "push", dir: "right" }],
  },
  {
    type: "damage",
    name: "尖刺机关",
    glyph: "✸",
    desc: "对自身格造成 6 点伤害",
    effects: [{ kind: "damage", radius: 0, power: 6 }],
  },
  {
    type: "combo",
    name: "连锁陷阱",
    glyph: "✦",
    desc: "先灼烧再向右推，便于触发下一块压板",
    effects: [
      { kind: "status", status: "burn", radius: 0, power: 2 },
      { kind: "push", dir: "right" },
    ],
  },
];
