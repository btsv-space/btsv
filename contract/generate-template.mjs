// @ts-check
import { jsonSchemaToZod } from "json-schema-to-zod";
import prettier from "prettier";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(
  fs.readFileSync(path.join(__dirname, "frontmatter.schema.json"), "utf8"),
);

const outputDir = path.join(
  __dirname,
  "..",
  "builder-templates",
  "btsv-template-astro",
);

let zod = jsonSchemaToZod(schema, { module: "esm", name: "postsSchema" });

// Post-process: json-schema-to-zod outputs a few things we need to adjust.
// 1. Import from 'astro:content' instead of 'zod'
zod = zod.replace('from "zod"', "from 'astro:content'");

// 2. .strict() → .passthrough() (Astro content collections need this)
zod = zod.replace(".strict()", ".passthrough()");

// 3. z.string().date() → z.coerce.date() for fields with format: "date"
const dateFields = Object.entries(schema.properties)
  .filter(([, p]) => p.format === "date")
  .map(([name]) => name);

for (const field of dateFields) {
  zod = zod.replace(new RegExp(`"${field}": z\\.string\\(\\)\\.date\\(\\)`, "g"), `"${field}": z.coerce.date()`);
}

// 4. Add header comment
const header =
  "// This file is generated. Do not edit.\n" +
  "// Run `pnpm generate-template` in contract/ to regenerate.\n\n";

const unformatted = header + zod + "\n";

const formatted = await prettier.format(unformatted, { parser: "typescript" });

const outPath = path.join(outputDir, "src", "posts.schema.generated.ts");
fs.writeFileSync(outPath, formatted);
console.log(`✓ Wrote ${outPath}`);
