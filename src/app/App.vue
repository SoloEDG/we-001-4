<script setup lang="ts">
import { computed } from "vue";
import { BattleMap, TerrainPanel } from "../features/terrain";
import { RosterPanel } from "../features/roster";
import { ActionPanel } from "../features/tactics";
import { TurnOrder } from "../features/initiative";
import { ReplayPanel, downloadArchive } from "../features/replay";
import { TrapPanel, ChainTrace } from "../features/traps";
import { key } from "../shared/document";
import { useWorkspace } from "./workspace";
const {
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
} = useWorkspace();

const currentEvent = computed(() =>
  cursor.value > 0 ? session.events[cursor.value - 1] : null,
);
</script>
<template>
  <main>
    <header>
      <a class="brand" href="./"
        ><span class="brand-mark">⌘</span>
        <div>灰烬渡口<small>ASHEN CROSSING / TACTICS LAB</small></div></a
      >
      <nav>
        <span class="nav-active">战术指挥台</span><span>本地演练 / 07</span>
      </nav>
      <button @click="reset">↻ 重新部署</button>
    </header>
    <div class="mission">
      <div>
        <div class="eyebrow">OPERATION 001 / 北境战役</div>
        <h1>在河岸，决定下一步。</h1>
        <p>利用地形与压力机关，掌握先机。每一次连锁，都有迹可循。</p>
      </div>
      <div class="live-badge">
        <i />{{ cursor < 0 ? "实战指挥" : "历史回放 · 只读"
        }}<small>消灭敌方所有角色获胜</small>
      </div>
    </div>
    <TurnOrder :battle="battle" />
    <div class="workspace">
      <aside>
        <RosterPanel
          :units="battle.units"
          :selected="selected"
          :active="battle.active"
          @select="selected = $event"
        /><TerrainPanel
          :brush="brush"
          :locked="locked"
          @paint="
            brush = $event;
            skill = '';
            setTrapBrush(null);
          "
        />
        <TrapPanel
          :locked="locked"
          :trap-count="session.live.traps.length"
          :erase-mode="trapBrush?.mode === 'erase'"
          @deploy="
            setTrapBrush({ mode: 'deploy', name: $event.name, effects: $event.effects });
          "
          @erase-mode="
            setTrapBrush(
              $event ? { mode: 'erase', name: '', effects: [] } : null,
            );
          "
        />
      </aside>
      <div class="center">
        <BattleMap
          :battle="battle"
          :selected="selected"
          :routes="[...routes.keys()]"
          :targets="targets.map(key)"
          :path="path"
          :danger="danger"
          :chain-focus="chainFocus"
          @cell="cell"
          @erase="eraseAt"
        />
        <div v-if="currentEvent?.chain?.length" class="chain-box">
          <ChainTrace :event="currentEvent" :battle="battle" />
        </div>
        <div class="field-note">
          <span>✦ 战场提示</span>
          <p>
            机关在角色进入压板时触发，整条连锁按一次行动原子提交；
            每个机关在一次行动内最多触发一次，推到阻挡格停在最后合法格，
            角色死亡即中止剩余路程，重载后机关保持已消耗状态。
          </p>
        </div>
      </div>
      <aside>
        <ActionPanel
          :unit="actor"
          :skill="skill"
          :locked="locked"
          :notice="notice"
          @skill="
            skill = $event;
            brush = null;
            setTrapBrush(null);
          "
          @wait="wait"
        /><ReplayPanel
          :events="session.events"
          :cursor="cursor"
          :playing="playback.playing.value"
          @seek="seek"
          @play="playback.play(cursor)"
          @stop="playback.stop"
          @download="downloadArchive(session)"
        />
      </aside>
    </div>
    <footer>
      <span>WE–001 / TURN-BASED TACTICS</span
      ><span>自动保存于当前浏览器　·　全部运算在本地完成</span
      ><span>苍蓝军 <b>VS</b> 余烬军</span>
    </footer>
  </main>
</template>
