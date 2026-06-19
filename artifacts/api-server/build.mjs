import { build } from "esbuild";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pinoPlugin = require("esbuild-plugin-pino");

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  sourcemap: true,
  plugins: [pinoPlugin({ transports: ["pino-pretty"] })],
  external: ["pg-native"],
  conditions: ["node"],
  banner: {
    js: `
import { createRequire as _createRequire } from "module";
import { fileURLToPath as _fileURLToPath } from "url";
import { dirname as _dirname } from "path";
const require = _createRequire(import.meta.url);
const __filename = _fileURLToPath(import.meta.url);
const __dirname = _dirname(__filename);
`.trimStart(),
  },
});
