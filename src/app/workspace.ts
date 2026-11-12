import { computed, reactive, ref } from "vue";
import type {
  Battle,
  ChainStep,
  Point,
  Terrain,
  TrapEffect,
} from "../shared/types";
import { clone, findUnit, key } from "../shared/document";
import { reachable, terrainRules, paintTile } from "../features/terrain";
import { moveBudget, armorValue, tickStatuses } from "../features/roster";
import {
  getSkill,
  legalTargets,
  castSkill,
  previewDamage,
} from "../features/tactics";
import { finishTurn } from "../features/initiative";
import {
  record,
  frame,
  loadArchive,
  saveArchive,
  usePlayback,
} from "../features/replay";
import {
  moveWithTraps,
  deployTrap,
  removeTrap,
  dangerPreview,
  chainSummary,
} from "../features/traps";
import { newSession } from "./session";

export interface TrapBrush {
  mode: "deploy" | "erase";
  name: string;
  effects: TrapEffect[];
}

export function useWorkspace() {
  const session = reactive(loadArchive() ?? newSession());
  const cursor = ref(-1),
    selected = ref(session.live.active),
    skill = ref(""),
    brush = ref<Terrain | null>(null),
    trapBrush = ref<TrapBrush | null>(null),
    notice = ref("选择蓝色格移动，或选择技能指定目标。");
  const playback = usePlayback(
    () => session.events.length,
    (n) => {
      cursor.value = n;
    },
  );
  const battle = computed(() => frame(session, cursor.value));
  const actor = computed(() => findUnit(battle.value, battle.value.active));
  const locked = computed(() => cursor.value >= 0 || !!session.live.ended);
  const routes = computed(() =>
    locked.value || actor.value.moved || actor.value.acted
      ? new Map()
      : reachable(session.live, actor.value, moveBudget(actor.value)),
  );
  const targets = computed(() => {
    const s = getSkill(actor.value.job, skill.value);
    return s ? legalTargets(battle.value, actor.value, s) : [];
  });
  /** 危险预览随结算结果（机关消耗/地形变化）自动更新；回放时隐藏 */
  const danger = computed(() =>
    cursor.value >= 0 ? new Map() : dangerPreview(session.live),
  );

  /**
   * 把一次行动（含整条连锁）当作不可拆分的原子提交：
   * 先在草稿上完整结算，成功后才覆盖 live；存档失败则整体回滚，
   * 避免存储失败时留下半条连锁。注意必须逐字段深替换，
   * 因为 tiles/units/traps 是嵌套数组，浅合并会让 live 与 draft 共享引用。
   */
  function replaceLive(source: Battle) {
    const snapshot = clone(source);
    for (const k of Object.keys(session.live) as (keyof Battle)[]) {
      ;(session.live as Record<string, unknown>)[k] = snapshot[k];
    }
  }
  function commit(
    kind: Parameters<typeof record>[2],
    label: string | ((chain: ChainStep[]) => string),
    path: Point[] = [],
    mutate?: (draft: Battle) => ChainStep[] | void,
  ): ChainStep[] {
    const before = clone(session.live);
    const eventsBefore = session.events.length;
    const draft = clone(session.live);
    const chain = mutate?.(draft) ?? [];
    try {
      replaceLive(draft);
      record(
        session,
        before,
        kind,
        typeof label === "function" ? label(chain) : label,
        path,
        chain,
      );
      saveArchive(session);
    } catch (e) {
      // 深回滚战斗与事件日志，保证失败行动不留任何痕迹
      replaceLive(before);
      session.events.length = eventsBefore;
      throw e;
    }
    return chain;
  }

  function cell(p: Point) {
    try {
      if (locked.value) throw new Error("回放只读，请返回实战");
      if (trapBrush.value) return handleTrapBrush(p);
      const u = actor.value;
      if (brush.value) {
        const terrain = brush.value;
        commit("terrain", `地形调整为${terrainRules[terrain].name}`, [], (d) => {
          paintTile(d, p, terrain);
        });
      } else if (skill.value) {
        const s = getSkill(u.job, skill.value)!;
        const t = session.live.units.find(
          (v) => v.hp > 0 && key(v) === key(p),
        );
        if (!t) throw new Error("请点击合法角色");
        const ground = session.live.tiles.find((v) => key(v) === key(t))!;
        const high =
          session.live.tiles.find((v) => key(v) === key(u))!.terrain ===
          "ridge";
        const value = previewDamage(
          u,
          t,
          s,
          armorValue(t),
          terrainRules[ground.terrain].cover,
          high,
        );
        commit("skill", `${u.name} → ${t.name} · ${s.name} ${value}`, [], (d) => {
          const target = d.units.find((v) => v.id === t.id)!;
          castSkill(
            d,
            u.id,
            target.id,
            s,
            armorValue(target),
            terrainRules[ground.terrain].cover,
            high,
          );
        });
        skill.value = "";
      } else {
        const route = routes.value.get(key(p));
        if (!route?.path.length)
          throw new Error("此格不可达，请检查地形与占位");
        commit(
          "move",
          (chain) =>
            chain.length
              ? `${u.name}移动触发 · ${chainSummary(chain)}`
              : `${u.name}移动 · 消耗${route.cost}`,
          route.path,
          (d) => moveWithTraps(d, u.id, route.path),
        );
      }
      notice.value = session.events.at(-1)?.label ?? "行动完成";
    } catch (e) {
      notice.value = (e as Error).message;
    }
  }

  function handleTrapBrush(p: Point) {
    const tb = trapBrush.value!;
    if (tb.mode === "erase") {
      commit("trap-deploy", "拆除机关", [], (d) => {
        removeTrap(d, p);
      });
    } else {
      commit("trap-deploy", `部署${tb.name}`, [], (d) => {
        deployTrap(d, p, tb.name, tb.effects);
      });
    }
    notice.value = session.events.at(-1)!.label;
  }

  /** 地图格右键快速拆除 */
  function eraseAt(p: Point) {
    if (locked.value) return;
    try {
      commit("trap-deploy", "拆除机关", [], (d) => {
        removeTrap(d, p);
      });
      notice.value = session.events.at(-1)!.label;
    } catch (e) {
      notice.value = (e as Error).message;
    }
  }

  function setTrapBrush(payload: TrapBrush | null) {
    trapBrush.value = payload;
    if (payload) brush.value = null;
    skill.value = "";
  }

  function wait() {
    if (locked.value) return;
    commit("wait", `${findUnit(session.live, session.live.active).name}结束行动`, [], (d) => {
      finishTurn(d, tickStatuses);
    });
    selected.value = session.live.active;
    skill.value = "";
    notice.value = session.events.at(-1)!.label;
  }
  function seek(n: number) {
    playback.stop();
    cursor.value = n;
    skill.value = "";
    brush.value = null;
    trapBrush.value = null;
  }
  function reset() {
    playback.stop();
    Object.assign(session, newSession());
    cursor.value = -1;
    selected.value = session.live.active;
    skill.value = "";
    brush.value = null;
    trapBrush.value = null;
    saveArchive(session);
    notice.value = "新战斗已就绪";
  }
  const path = computed(() =>
    cursor.value > 0 ? (session.events[cursor.value - 1]?.path ?? []) : [],
  );
  /** 回放时当前事件涉及的机关格，用于高亮每次连锁来源 */
  const chainFocus = computed(() => {
    if (cursor.value <= 0) return new Set<string>();
    const ev = session.events[cursor.value - 1];
    return new Set((ev?.chain ?? []).map((s) => key(s.at)));
  });
  return {
    session,
    cursor,
    selected,
    skill,
    brush,
    trapBrush,
    notice,
    battle,
    actor,
    locked,
    routes,
    targets,
    danger,
    chainFocus,
    path,
    playback,
    cell,
    eraseAt,
    setTrapBrush,
    wait,
    seek,
    reset,
  };
}
