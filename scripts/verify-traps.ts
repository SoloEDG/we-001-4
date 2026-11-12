import assert from "node:assert/strict";
import type { Battle, Point, Trap, TrapEffect, Unit } from "../src/shared/types";
import { key } from "../src/shared/document";
import {
  fireTrap,
  moveWithTraps,
  pushDestination,
} from "../src/features/traps/lib/engine";
import { deployTrap, removeTrap } from "../src/features/traps/model/deploy";
import { dangerPreview } from "../src/features/traps/lib/preview";

function makeBattle(width: number, height: number): Battle {
  const tiles = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) tiles.push({ x, y, terrain: "plain" });
  const unit: Unit = {
    id: "u1",
    name: "试作兵",
    job: "guard",
    team: "azure",
    hp: 26,
    maxHp: 26,
    power: 10,
    armor: 4,
    speed: 7,
    move: 4,
    statuses: [],
    moved: false,
    acted: false,
    x: 0,
    y: 0,
  };
  return {
    tiles,
    units: [unit],
    traps: [],
    round: 1,
    queue: ["u1"],
    active: "u1",
    ended: null,
  };
}
let n = 0;
const test = (name: string, fn: () => void) => {
  n++;
  fn();
  console.log(`  ✓ ${name}`);
};

const trap = (
  id: string,
  p: Point,
  effects: TrapEffect[],
  spent = false,
): Trap => ({ id, x: p.x, y: p.y, name: id, effects, spent });

// 1. 互触发循环：A 右推到 B，B 左推回 A；每机关最多一次
test("互触发机关在一次行动内各只触发一次，循环停止", () => {
  const b = makeBattle(5, 1);
  b.traps.push(
    trap("A", { x: 0, y: 0 }, [{ kind: "push", dir: "right" }]),
    trap("B", { x: 3, y: 0 }, [{ kind: "push", dir: "left" }]),
  );
  const chain = fireTrap(b, b.traps[0], "u1", new Set(), null);
  assert.equal(chain.length, 2, "连锁应为 2 跳而非无限循环");
  assert.equal(chain[0].trapId, "A");
  assert.equal(chain[1].trapId, "B");
  assert.equal(chain[1].sourceTrapId, "A", "第二跳来源必须指向 A");
  assert.ok(b.traps.every((t) => t.spent), "两机关均应已消耗");
  const u = b.units[0];
  assert.equal(u.x, 0, "B 推回后落在 A 格(0,0)");
});

// 2. 推到阻挡格停在最后合法格
test("推动遇断崖停在最后合法格", () => {
  const b = makeBattle(5, 1);
  b.tiles.find((t) => key(t) === key({ x: 2, y: 0 }))!.terrain = "wall";
  const u = b.units[0];
  const r = pushDestination(b, u, "right");
  assert.deepEqual(r.to, { x: 1, y: 0 });
  assert.equal(r.blocked, true);
});
test("推动遇角色占位时零格可推则原地不动", () => {
  const b = makeBattle(5, 1);
  b.units.push({
    ...b.units[0],
    id: "u2",
    name: "拦路兵",
    x: 1,
    y: 0,
  });
  const r = pushDestination(b, b.units[0], "right");
  assert.deepEqual(r.to, { x: 0, y: 0 });
  assert.equal(r.blocked, true);
});

// 3. 死亡中止剩余路程与连锁
test("角色死亡立即中止，后续路径上的机关不触发", () => {
  const b = makeBattle(5, 1);
  b.traps.push(
    trap("kill", { x: 1, y: 0 }, [{ kind: "damage", power: 99 }]),
    trap("after", { x: 2, y: 0 }, [{ kind: "damage", power: 1 }]),
  );
  const path = [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
  ];
  const chain = moveWithTraps(b, "u1", path);
  const u = b.units[0];
  assert.equal(u.hp, 0);
  assert.deepEqual({ x: u.x, y: u.y }, { x: 1, y: 0 }, "停在死亡格");
  assert.equal(chain.length, 1);
  assert.equal(chain[0].died, true);
  assert.equal(b.traps[1].spent, false, "死亡后的机关保持未消耗");
  assert.equal(u.moved, true);
});

// 4. 逐格触发 + 消耗态可序列化（重载保持）
test("沿路径逐格触发，消耗状态经 JSON 往返保持", () => {
  const b = makeBattle(5, 1);
  b.traps.push(
    trap("s1", { x: 1, y: 0 }, [
      { kind: "status", status: "slow", radius: 0, power: 2 },
    ]),
    trap("s2", { x: 3, y: 0 }, [
      { kind: "terrain", terrain: "forest", radius: 0 },
    ]),
  );
  const chain = moveWithTraps(b, "u1", [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
  ]);
  assert.equal(chain.length, 2);
  const u = b.units[0];
  assert.ok(u.statuses.some((s) => s.kind === "slow"));
  assert.equal(
    b.tiles.find((t) => key(t) === key({ x: 3, y: 0 }))!.terrain,
    "forest",
  );
  const reloaded: Battle = JSON.parse(JSON.stringify(b));
  assert.ok(reloaded.traps.every((t) => t.spent), "重载后机关仍为已消耗");
});

// 5. 部署校验
test("机关只能部署在合法空地", () => {
  const b = makeBattle(3, 3);
  b.tiles.find((t) => key(t) === key({ x: 2, y: 2 }))!.terrain = "wall";
  assert.throws(() =>
    deployTrap(b, { x: 2, y: 2 }, "t", [{ kind: "damage", power: 1 }]),
  );
  assert.throws(() =>
    deployTrap(b, { x: 0, y: 0 }, "t", [{ kind: "damage", power: 1 }]),
  );
  deployTrap(b, { x: 1, y: 1 }, "t", [{ kind: "damage", power: 1 }]);
  assert.throws(() =>
    deployTrap(b, { x: 1, y: 1 }, "t2", [{ kind: "damage", power: 1 }]),
  );
  assert.equal(removeTrap(b, { x: 1, y: 1 }).name, "t");
});

// 6. 危险预览随消耗状态更新
test("危险预览覆盖压板与作用区，机关消耗后消失", () => {
  const b = makeBattle(5, 1);
  b.traps.push(
    trap("z", { x: 2, y: 0 }, [
      { kind: "status", status: "burn", radius: 1, power: 2 },
    ]),
  );
  const before = dangerPreview(b);
  assert.ok(before.has(key({ x: 2, y: 0 })));
  assert.ok(before.has(key({ x: 1, y: 0 })), "半径 1 的邻格应在预览中");
  b.traps[0].spent = true;
  assert.equal(dangerPreview(b).size, 0, "消耗后不再产生预览");
});

// 7. 地形改变后可达性受影响（结算结果驱动后续移动）
test("机关把邻格变断崖后该格不可再通行", () => {
  const b = makeBattle(4, 1);
  b.traps.push(
    trap("w", { x: 1, y: 0 }, [
      { kind: "terrain", terrain: "wall", radius: 1 },
    ]),
  );
  fireTrap(b, b.traps[0], "u1", new Set(), null);
  const tile2 = b.tiles.find((t) => key(t) === key({ x: 2, y: 0 }))!;
  assert.equal(tile2.terrain, "wall");
  const r = pushDestination(b, b.units[0], "right");
  assert.deepEqual(r.to, { x: 0, y: 0 }, "新断崖立即阻挡推动");
});

console.log(`\n${n} 组机关引擎语义测试全部通过`);
