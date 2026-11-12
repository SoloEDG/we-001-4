<script setup lang="ts">
import { ref } from "vue";
import type { PushDir, Status, Terrain, TrapEffect } from "../../../shared/types";
import { trapTemplates } from "../lib/engine";
import { effectLabels } from "../model/deploy";

const props = defineProps<{
  locked: boolean;
  trapCount: number;
  eraseMode: boolean;
}>();
const emit = defineEmits<{
  deploy: [payload: { name: string; effects: TrapEffect[] }];
  "erase-mode": [on: boolean];
}>();

const chosen = ref(0);
const dir = ref<PushDir>("right");
const pushSteps = ref(3);
const radius = ref(1);
const statusKind = ref<Status["kind"]>("slow");
const terrain = ref<Terrain>("forest");
const power = ref(6);

const dirs: PushDir[] = ["up", "down", "left", "right"];
const dirText: Record<PushDir, string> = {
  up: "↑ 上",
  down: "↓ 下",
  left: "← 左",
  right: "→ 右",
};
const terrains: Terrain[] = ["plain", "forest", "water", "ridge"];
const terrainText: Record<Terrain, string> = {
  plain: "草原",
  forest: "密林",
  water: "浅滩",
  ridge: "高地",
  wall: "断崖",
};
const statuses: Status["kind"][] = ["slow", "burn", "guard"];
const statusText: Record<Status["kind"], string> = {
  slow: "迟缓",
  burn: "灼烧",
  guard: "防御",
};

function buildEffects(): TrapEffect[] {
  const t = trapTemplates[chosen.value];
  // 以模板为基础，注入面板上的可配置参数
  return t.effects.map((e) => {
    const next = { ...e };
    if (next.kind === "push") {
      next.dir = dir.value;
      next.power = pushSteps.value;
    }
    if (next.kind === "terrain") {
      next.terrain = terrain.value;
      next.radius = radius.value;
    }
    if (next.kind === "status") {
      next.status = statusKind.value;
      next.radius = radius.value;
      next.power = 2;
    }
    if (next.kind === "damage") {
      next.radius = 0;
      next.power = power.value;
    }
    return next;
  });
}

function confirmDeploy() {
  emit("erase-mode", false);
  emit("deploy", {
    name: trapTemplates[chosen.value].name,
    effects: buildEffects(),
  });
}
</script>

<template>
  <section class="panel trap-panel">
    <div class="eyebrow">05 / PRESSURE TRAPS</div>
    <h3>压力机关 <small>已部署 {{ trapCount }} 个 · 一次性消耗</small></h3>
    <div class="trap-templates">
      <button
        v-for="(tpl, i) in trapTemplates"
        :key="tpl.type"
        :disabled="locked"
        :class="{ chosen: chosen === i && !props.eraseMode }"
        @click="chosen = i; emit('erase-mode', false)"
      >
        <b>{{ tpl.glyph }}</b><span>{{ tpl.name }}</span>
      </button>
    </div>
    <p class="trap-desc">{{ trapTemplates[chosen].desc }}</p>

    <div class="trap-config">
      <template v-if="trapTemplates[chosen].effects.some((e) => e.kind === 'push')">
        <label>推动方向
          <select v-model="dir" :disabled="locked">
            <option v-for="d in dirs" :key="d" :value="d">{{ dirText[d] }}</option>
          </select>
        </label>
        <label>推动格数
          <input v-model.number="pushSteps" type="range" min="1" max="4" :disabled="locked" />
          <i>{{ pushSteps }} 格</i>
        </label>
      </template>
      <template v-if="trapTemplates[chosen].effects.some((e) => e.kind === 'terrain')">
        <label>目标地形
          <select v-model="terrain" :disabled="locked">
            <option v-for="t in terrains" :key="t" :value="t">{{ terrainText[t] }}</option>
          </select>
        </label>
        <label>作用半径
          <input v-model.number="radius" type="range" min="0" max="2" :disabled="locked" />
          <i>{{ radius }} 格</i>
        </label>
      </template>
      <template v-if="trapTemplates[chosen].effects.some((e) => e.kind === 'status')">
        <label>状态
          <select v-model="statusKind" :disabled="locked">
            <option v-for="s in statuses" :key="s" :value="s">{{ statusText[s] }}</option>
          </select>
        </label>
        <label>作用半径
          <input v-model.number="radius" type="range" min="0" max="2" :disabled="locked" />
          <i>{{ radius }} 格</i>
        </label>
      </template>
      <template v-if="trapTemplates[chosen].effects.some((e) => e.kind === 'damage')">
        <label>伤害值
          <input v-model.number="power" type="range" min="1" max="12" :disabled="locked" />
          <i>{{ power }}</i>
        </label>
      </template>
    </div>

    <div class="trap-effects">
      <span v-for="(e, i) in trapTemplates[chosen].effects" :key="i" class="chip">
        {{ effectLabels[e.kind] }}
      </span>
    </div>

    <div class="trap-actions">
      <button class="primary" :disabled="locked" @click="confirmDeploy">
        ◈ 部署到空地
      </button>
      <button
        :class="{ chosen: props.eraseMode }"
        :disabled="locked"
        @click="emit('erase-mode', !props.eraseMode)"
      >
        {{ props.eraseMode ? "取消拆除" : "拆除模式" }}
      </button>
    </div>
    <p class="trap-hint">
      {{ props.eraseMode ? "点击地图上的机关将其拆除" : "选好配置后点击空地放置；右键地图格也可快速拆除" }}
    </p>
  </section>
</template>
