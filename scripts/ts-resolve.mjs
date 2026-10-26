// Lets `node --experimental-transform-types` run the app's TypeScript libraries
// in scripts/*.check.ts: maps the "@/" alias to the frontend root and adds the
// ".ts" extension Next.js imports leave out. Usage:
//   node --experimental-transform-types --import ./scripts/ts-resolve.mjs scripts/chat-lib.check.ts
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { pathToFileURL, fileURLToPath } from "node:url";
      import { existsSync } from "node:fs";
      import path from "node:path";
      const root = ${JSON.stringify(new URL("..", import.meta.url).href)};
      export async function resolve(specifier, context, next) {
        let spec = specifier.startsWith("@/") ? new URL(specifier.slice(2), root).href : specifier;
        const isPath = spec.startsWith("file:") || spec.startsWith(".") || spec.startsWith("/");
        if (isPath && !/\\.[cm]?[jt]sx?$/.test(spec)) {
          const base = spec.startsWith("file:") ? fileURLToPath(spec) : path.resolve(path.dirname(fileURLToPath(context.parentURL)), spec);
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            if (existsSync(base + ext)) return next(pathToFileURL(base + ext).href, context);
          }
        }
        return next(spec, context);
      }
    `)
);
