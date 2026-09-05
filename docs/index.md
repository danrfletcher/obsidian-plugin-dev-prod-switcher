---
title: Dev-Prod Switcher
description: Link an installed Obsidian plugin to a local dev build, flip between them with hot reload, and control the dev server — all from Obsidian's settings.
---

# Dev-Prod Switcher

An [Obsidian](https://obsidian.md) plugin for **plugin developers**. Register
a plugin you already have installed, link it to your local dev build, and
flip between the live "Prod" version and your "Dev" build with one click —
the flip triggers a hot reload, and you can run/kill/restart the dev build's
own `npm run dev` right from Obsidian's settings.

Desktop only. Requires [Hot Reload](https://github.com/pjeby/hot-reload).

→ See the [README](https://github.com/danrfletcher/obsidian-plugin-dev-prod-switcher#readme)
for install instructions, usage, and how it works under the hood.

## Why

Obsidian plugin devs already juggle two copies of a plugin — the published
one installed from the Community Marketplace or [BRAT](https://github.com/TfTHacker/obsidian42-brat),
and a local working copy. The usual workflow is cloning the repo straight
into `.obsidian/plugins/<id>/` and using Hot Reload for the reload part —
which works, but there's no clean way back to the published build without
manually deleting/re-cloning, and it only ever handles one plugin at a time.

This plugin adds:

- A settings-panel **registry** of which installed plugins have a linked dev
  build.
- A **one-click Dev-Prod toggle** that hot-reloads via Hot Reload — this
  plugin doesn't reimplement any file-watching or reload logic itself.
- **Dev-server lifecycle controls** (run / kill / restart, live logs) per
  linked plugin.
- A **git branch dropdown** for the linked dev folder — switch local/remote
  branches, pull, right there in the settings row.

## Screenshots

*(coming with the first tagged release)*

## License

MIT. See the [repo](https://github.com/danrfletcher/obsidian-plugin-dev-prod-switcher)
for the license and full credits, including [Hot Reload](https://github.com/pjeby/hot-reload)
by pjeby, which this plugin's whole toggle feature is built on top of.
