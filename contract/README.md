# btsv Content Contract

The canonical contract between the editor and all builder templates. This is the
single source of truth for what frontmatter fields a post has.

## Files

| File | Purpose |
|---|---|
| `frontmatter.schema.json` | [JSON Schema](https://json-schema.org/) defining the frontmatter shape |
| `generate-template.mjs` | Generates the Astro template's Zod schema from the JSON Schema |
| `package.json` | Tooling: `pnpm generate-template` runs the generator |

## Template generation

The Astro template's `src/content.config.ts` imports a generated Zod schema
(`posts.schema.generated.ts`) rather than maintaining one by hand.

Run from `contract/`:
```sh
pnpm generate-template
```

This reads `frontmatter.schema.json` and writes:
- `../builder-templates/btsv-template-astro/src/posts.schema.generated.ts`

## Post format

Posts are `.mdx` files stored in `src/content/posts/`. Each post has two sections:

1. **Frontmatter** — YAML between `---` delimiters at the top of the file
2. **Body** — GitHub-flavored Markdown with optional MDX components

### Core frontmatter fields

Defined in `frontmatter.schema.json`. These fields have dedicated editor UI and are
validated by the template's Zod schema:

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Post title |
| `dateCreated` | `date` | yes | Original creation date (`YYYY-MM-DD`) |
| `dateUpdated` | `date` | yes | Last modification date (`YYYY-MM-DD`) |
| `datePublished` | `date` | no | Publication date (`YYYY-MM-DD`) |
| `description` | `string` | no | SEO/social preview |
| `tags` | `string[]` | no | Tag list |
| `draft` | `boolean` | no | Exclude from production builds |
| `id` | `string` | no | Internal identifier (auto-generated) |
| `slug` | `string` | no | Custom URL slug |
| `page` | `boolean` | no | Standalone page (About, Contact), excluded from listings/RSS |

### Custom fields (escape hatch)

Fields not listed in the schema pass through the editor untouched and are
available in builder templates via `extra`:

```yaml
---
title: 'My Post'
dateCreated: 2025-06-01
dateUpdated: 2025-06-01
series: 'Deep Dives'       # ← custom field
readingTime: 12            # ← custom field
---
```

The editor preserves custom fields when saving. Builder templates can read them
from the frontmatter `extra` record.


## Consuming this schema

### In the Astro template

`src/content.config.ts` imports the generated schema:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { postsSchema } from './posts.schema.generated';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: postsSchema,
});

export const collections = { posts };
```

### In the editor (apps/web)

`apps/web/package.json` `generate` script runs `json2ts` over
`frontmatter.schema.json` to produce typed TypeScript interfaces.

## Adding a new core field

1. Add it to `contract/frontmatter.schema.json`
2. Run `pnpm generate-template` from `contract/`
3. Run `pnpm generate` from `apps/web/`
4. Update editor UI and parser in `apps/web/` to handle the new field
5. Run `pnpm check` from `apps/web/` to verify type correctness

Steps 1–3 handle the contract and template. Step 4 is manual (future work may make the editor UI dynamic from template contracts).
