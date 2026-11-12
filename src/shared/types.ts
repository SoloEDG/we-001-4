export type Terrain = "plain" | "forest" | "water" | "ridge" | "wall";
export type Profession = "guard" | "ranger" | "mage" | "medic";
export interface Point {
  x: number;
  y: number;
}
export interface Tile extends Point {
  terrain: Terrain;
}
export interface Status {
  kind: "slow" | "burn" | "guard";
  turns: number;
}
export interface Unit extends Point {
  id: string;
  name: string;
  job: Profession;
  team: "azure" | "ember";
  hp: number;
  maxHp: number;
  power: number;
  armor: number;
  speed: number;
  move: number;
  statuses: Status[];
  moved: boolean;
  acted: boolean;
}
/** 机关效果类别：改地形 / 加状态 / 推动 / 伤害 */
export type TrapEffectKind = "terrain" | "status" | "push" | "damage";
export type PushDir = "up" | "down" | "left" | "right";
export interface TrapEffect {
  kind: TrapEffectKind;
  /** terrain：目标地形；status：施加状态；push 不用 */
  terrain?: Terrain;
  status?: Status["kind"];
  /** push：推动方向；damage：忽略，由 power 决定 */
  dir?: PushDir;
  /** 作用半径（曼哈顿距离，0 仅自身格）；push 时忽略 */
  radius?: number;
  /** damage：伤害值；status：持续回合（默认 2） */
  power?: number;
}
/** 压力机关：部署在空地，角色进入所在格时触发，触发后一次性消耗 */
export interface Trap extends Point {
  id: string;
  name: string;
  effects: TrapEffect[];
  spent: boolean;
}
/** 单次连锁中的一步结算，用于回放展示来源 */
export interface ChainStep {
  /** 触发的机关 id（第一步为角色直接踩中的机关） */
  trapId: string;
  /** 触发者角色 id */
  unitId: string;
  /** 触发位置（机关所在格） */
  at: Point;
  /** 由哪一步触发（第一步为 null，之后为上一步的 trapId） */
  sourceTrapId: string | null;
  /** 触发前触发者坐标，便于回放高亮 */
  unitFrom: Point;
  /** 触发后触发者坐标（被推动后可能变化） */
  unitTo: Point;
  /** 被改变的地形格 */
  terrainChanges: { at: Point; from: Terrain; to: Terrain }[];
  /** 被施加状态的角色 */
  statusApplied: { unitId: string; kind: Status["kind"]; turns: number }[];
  /** 受到伤害的角色（包含触发者自己） */
  damageDealt: { unitId: string; amount: number; hp: number }[];
  /** 推动结果；未推动为 null */
  push: {
    dir: PushDir;
    from: Point;
    to: Point;
    blocked: boolean;
  } | null;
  /** 触发后触发者是否死亡 */
  died: boolean;
}
export interface Battle {
  tiles: Tile[];
  units: Unit[];
  traps: Trap[];
  round: number;
  queue: string[];
  active: string;
  ended: string | null;
}
export type EventKind = "move" | "skill" | "wait" | "terrain" | "trap-deploy";
export interface BattleEvent {
  id: number;
  kind: EventKind;
  actor: string;
  label: string;
  path: Point[];
  before: Battle;
  after: Battle;
  /** 本次行动内完整连锁的逐步结算；整条连锁只存这一条事件 */
  chain?: ChainStep[];
}
export interface Session {
  initial: Battle;
  live: Battle;
  events: BattleEvent[];
}
export interface Skill {
  id: string;
  name: string;
  range: number;
  power: number;
  target: "enemy" | "ally" | "self";
  status?: Status["kind"];
  description: string;
}
