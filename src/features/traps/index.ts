export { default as TrapPanel } from "./ui/TrapPanel.vue";
export { default as ChainTrace } from "./ui/ChainTrace.vue";
export {
  trapAt,
  blockedForPush,
  pushDestination,
  fireTrap,
  moveWithTraps,
  trapTemplates,
} from "./lib/engine";
export { dangerPreview } from "./lib/preview";
export type { DangerCell } from "./lib/preview";
export { deployTrap, removeTrap, effectLabels } from "./model/deploy";
export { describeStep, chainSummary } from "./lib/narrate";
