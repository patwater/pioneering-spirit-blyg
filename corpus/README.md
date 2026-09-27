# The corpus

This folder is the library you write in dialogue with. Nothing here is published automatically. A passage enters the blyg only when you quote it into a fragment with `npm run blyg -- quote`, and from then on it can be transcluded into threads with `![[id]]` and used as a source for AI generation inside a `[TK]...[/TK]` scope.

The one exception is `paragraph/`, which also feeds the static archive at pioneeringspirit.xyz/<slug>/ so that every old link keeps working after the move off Paragraph.

## Layout

| Folder | What goes here | How it gets here |
|---|---|---|
| `paragraph/` | Every post published on Paragraph before the cutover | `npm run export-paragraph`, or the *Export Paragraph archive* GitHub Action |
| `book/` | *A New California Dream*, one file per chapter | Paste or convert the manuscript by hand |
| `stag-hunt/` | Stag Hunt salons and related writing | By hand |
| `other/` | Anything else you want to argue with: talks, op-eds, CV Weekly columns, notes | By hand |

## File format

Each file is Markdown with a small front-matter block. Only `title` is needed, but `date` and `url` make quoted fragments carry a proper attribution line.

```markdown
---
title: "Chapter 3: The Aqueduct and the Commons"
date: 2019-01-01
url: "https://example.com/where-the-book-can-be-bought"
---

The chapter text, as plain Markdown.
```

Quoted values should use double quotes whenever they contain a colon or a `#`.

## Quoting a passage

Fragments are capped at 1,000 characters, so pick a span of a paragraph or two.

```bash
# by the first words of the passage (runs to the end of that paragraph)
npm run blyg -- quote corpus/book/03-aqueduct.md --from "The aqueduct was never"

# from one phrase to another, across paragraphs
npm run blyg -- quote corpus/book/03-aqueduct.md --from "The aqueduct was never" --to "belonged to everyone."

# by line numbers in the file, and publish immediately
npm run blyg -- quote corpus/paragraph/2021-06-01-granaries.md --lines 12-15 --publish
```

Each quote becomes a draft in `drafts/quotes/`. Publishing it gives it a permanent id that any thread can then transclude.
