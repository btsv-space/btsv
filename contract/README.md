# btsv Content Contract

The canonical contract between the editor and all builder templates. This is the
single source of truth for what a post file looks like.

## Files

| File | Purpose |
|---|---|
| `frontmatter.schema.json` | [JSON Schema](https://json-schema.org/) defining the frontmatter shape |

## Post format

Posts are `.mdx` files stored in `src/content/posts/`. Each post has two sections:

1. **Frontmatter** — YAML between `---` delimiters at the top of the file
2. **Body** — GitHub-flavored Markdown with optional MDX components

### Core frontmatter fields

Defined in `frontmatter.schema.json`. These fields have dedicated editor UI and are
validated by all builder templates:

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Post title |
| `date` | `date` | yes | Publication date (`YYYY-MM-DD`) |
| `description` | `string` | no | SEO/social preview |
| `tags` | `string[]` | no | Tag list |
| `draft` | `boolean` | no | Exclude from production builds |
| `slug` | `string` | no | Custom URL slug |
| `updated` | `date` | no | Last modified date (`YYYY-MM-DD`) |

### Custom fields (escape hatch)

The schema uses `additionalProperties: true`, meaning you can add **any extra fields**
to your frontmatter. They pass through the editor untouched and are available in
builder templates for custom use.

```yaml
---
title: 'My Post'
date: 2025-06-01
series: 'Deep Dives'       # ← custom field
readingTime: 12            # ← custom field
---
```

The editor won't provide UI for custom fields, but it will preserve them when saving.
Builder templates can read them from the frontmatter data:

```astro
---
// Access in Astro
const { series, readingTime } = post.data;
---
```

## Markdown+ features

### Editor-only comments

Lines starting with `@@` are stripped from the published output:

```
@@ This text appears in your editor but
@@ never reaches the published page.
@@@
```

### MDX components

Builder templates ship with these components. Posts can use them by name:

| Component | Usage |
|---|---|
| `<Callout type="info\|warning\|tip">` | Styled callout boxes |
| `<Figure src="..." alt="..." caption="...">` | Captioned images |

## Consuming this schema

### In the Astro template

`src/content.config.ts` uses Zod with `.passthrough()`:

```ts
import { z } from 'astro/zod';

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    slug: z.string().optional(),
    updated: z.date().optional(),
  }).passthrough(),  // ← allows custom fields
});
```

### In Hugo

Hugo can validate frontmatter against the JSON Schema using a build script or
pre-commit hook. Custom fields are accessible via `.Params.customFieldName`.

### In the editor

The editor reads `contract/frontmatter.schema.json` to know which fields to provide
UI for. Unknown fields are preserved but not displayed in the editor sidebar.

## Adding a new core field

When a field graduates from "custom" to "core" (meaning it gets dedicated UI):

1. Add it to `contract/frontmatter.schema.json`
2. Update each builder template's schema config
3. Add editor UI for the new field

Custom fields can always be used immediately without waiting for core field approval.
