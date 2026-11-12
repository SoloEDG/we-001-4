<script setup lang="ts">
import type { Battle, BattleEvent } from "../../../shared/types";
import { describeStep, chainSummary } from "../lib/narrate";
defineProps<{ event: BattleEvent; battle: Battle }>();
</script>

<template>
  <div v-if="event.chain?.length" class="chain-trace">
    <div class="chain-head">
      ⛓ {{ chainSummary(event.chain) }}
      <small>一次行动原子提交 · 每机关最多触发一次</small>
    </div>
    <ol>
      <li
        v-for="(step, i) in event.chain"
        :key="step.trapId + i"
        :class="{ root: !step.sourceTrapId, died: step.died }"
      >
        <span class="chain-no">{{ String(i + 1).padStart(2, "0") }}</span>
        <span class="chain-text">{{ describeStep(battle, step) }}</span>
      </li>
    </ol>
  </div>
</template>
