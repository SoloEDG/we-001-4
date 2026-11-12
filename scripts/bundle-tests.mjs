// 仅用于 node 环境测试：把 .vue 组件导入替换为空对象（测试只覆盖 TS 逻辑）
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/verify-workspace.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "/tmp/verify-workspace.mjs",
  logLevel: "info",
  plugins: [
    {
      name: "stub-vue",
      setup(b) {
        b.onResolve({ filter: /\.vue$/ }, (args) => ({
          path: args.path,
          namespace: "vue-stub",
        }));
        b.onLoad({ filter: /.*/, namespace: "vue-stub" }, () => ({
          contents: "export default {};",
          loader: "js",
        }));
      },
    },
  ],
});
