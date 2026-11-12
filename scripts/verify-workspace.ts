import assert from "node:assert/strict";
import { key } from "../src/shared/document";
import type { PushDir, TrapEffect } from "../src/shared/types";

// --- 浏览器全局垫片（Vite/Vue 运行时所需） ---
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};
function makeElement() {
  return {
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    insertBefore: () => {},
    cloneNode: () => makeElement(),
    style: {},
    childNodes: [],
  };
}
const documentMock = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => makeElement(),
  createElementNS: () => makeElement(),
  createTextNode: () => makeElement(),
  createComment: () => makeElement(),
  querySelector: () => null,
  querySelectorAll: () => [],
  documentElement: makeElement(),
  body: makeElement(),
  head: makeElement(),
};
Object.assign(globalThis, {
  localStorage: localStorageMock,
  window: globalThis,
  document: documentMock,
  SVGElement: class {},
});

const { useWorkspace } = await import("../src/app/workspace");

let n = 0;
const test = (name: string, fn: () => void) => {
  n++;
  fn();
  console.log(`  ✓ ${name}`);
};

const ws = useWorkspace();
const findTrap = (x: number, y: number) =>
  ws.session.live.traps.find((t) => key(t) === key({ x, y }));

test("新战斗没有机关且不在回放态", () => {
  assert.equal(ws.session.live.traps.length, 0);
  assert.equal(ws.locked.value, false);
});

// 挑一条直线路径（全程同行或同列），取前两格布置：第一机关推动一格即进第二机关
const actorId = ws.session.live.active;
const reachEntries = [...ws.routes.value.entries()]
  .filter(([, r]) => {
    if (r.path.length < 2) return false;
    const start = r.path[0];
    return (
      r.path.every((p) => p.y === start.y) ||
      r.path.every((p) => p.x === start.x)
    );
  })
  .sort((a, b) => b[1].path.length - a[1].path.length);
assert.ok(reachEntries.length, "测试前置：应存在直线可达路径");
const [, route] = reachEntries[0];
const first = route.path[0];
const second = route.path[1];
const pushDir: PushDir =
  second.x > first.x
    ? "right"
    : second.x < first.x
      ? "left"
      : second.y > first.y
        ? "down"
        : "up";
const backDir: PushDir =
  pushDir === "right"
    ? "left"
    : pushDir === "left"
      ? "right"
      : pushDir === "up"
        ? "down"
        : "up";

test("沿直线路径部署两个机关并持久化", () => {
  ws.setTrapBrush({
    mode: "deploy",
    name: "尖刺机关",
    effects: [
      { kind: "damage", radius: 0, power: 2 },
      { kind: "push", dir: pushDir, power: 1 },
    ],
  });
  ws.cell(first);
  ws.setTrapBrush({
    mode: "deploy",
    name: "推力机关",
    effects: [{ kind: "push", dir: backDir }],
  });
  ws.cell(second);
  assert.ok(findTrap(first.x, first.y) && findTrap(second.x, second.y));
  assert.ok(store.has("we001-session"));
});

test("移动触发连锁只产生一条 move 事件，第二跳来源指向第一机关", () => {
  ws.setTrapBrush(null);
  const beforeEvents = ws.session.events.length;
  const actor = ws.session.live.units.find((u) => u.id === actorId)!;
  const startHp = actor.hp;
  ws.cell(first); // 只走到首格；第二机关靠推动触发
  assert.equal(ws.session.events.length, beforeEvents + 1, "连锁整体只存一条事件");
  const ev = ws.session.events.at(-1)!;
  assert.equal(ev.kind, "move");
  assert.equal(ev.chain?.length, 2, `连锁应为 2 跳，实际 ${ev.chain?.length}`);
  assert.equal(ev.chain[0].sourceTrapId, null, "首跳无来源机关");
  assert.equal(
    ev.chain[1].sourceTrapId,
    ev.chain[0].trapId,
    "第二跳由第一机关推动触发，来源必须标注",
  );
  assert.equal(
    new Set(ev.chain.map((s) => s.trapId)).size,
    ev.chain.length,
    "每机关最多触发一次",
  );
  assert.ok(findTrap(first.x, first.y)!.spent && findTrap(second.x, second.y)!.spent);
  assert.equal(
    ws.session.live.units.find((u) => u.id === actorId)!.hp,
    startHp - 2,
    "吃到尖刺伤害",
  );
});

test("回放逐帧还原：初始帧无机关，末帧机关已消耗且连锁高亮可用", () => {
  ws.seek(0);
  assert.equal(ws.battle.value.traps.length, 0);
  assert.equal(ws.locked.value, true);
  const end = ws.session.events.length;
  ws.seek(end);
  assert.equal(ws.battle.value.traps.filter((t) => t.spent).length, 2);
  assert.equal(ws.chainFocus.value.size, 2, "连锁来源格被高亮");
  ws.seek(-1);
  assert.equal(ws.locked.value, false);
});

test("存档抛错时行动整体回滚，live 与事件均不变", () => {
  // 选一个既非断崖、也无角色、且尚未部署机关的空地
  const occupied = new Set([
    ...ws.session.live.units.filter((u) => u.hp > 0).map((u) => key(u)),
    ...ws.session.live.traps.map((t) => key(t)),
  ]);
  const empty = ws.session.live.tiles.find(
    (t) => t.terrain !== "wall" && !occupied.has(key(t)),
  );
  assert.ok(empty, "测试前置：应存在可用空地");
  const liveSnapshot = JSON.stringify(ws.session.live);
  const eventsLen = ws.session.events.length;
  const original = localStorageMock.setItem.bind(localStorageMock);
  // saveArchive 内部直接调用 localStorage.setItem，须在同一对象上替换
  localStorageMock.setItem = () => {
    throw new Error("配额已满");
  };
  ws.setTrapBrush({
    mode: "deploy",
    name: "回滚机关",
    effects: [{ kind: "push", dir: "right" }] as TrapEffect[],
  });
  ws.cell({ x: empty.x, y: empty.y });
  localStorageMock.setItem = original;
  assert.equal(ws.notice.value, "配额已满");
  assert.equal(ws.session.events.length, eventsLen, "失败事件不得入库");
  assert.equal(JSON.stringify(ws.session.live), liveSnapshot, "live 完全回滚");
  assert.ok(!findTrap(empty.x, empty.y), "回滚后机关不存在");
});

console.log(`\n${n} 组编排层端到端测试全部通过`);
