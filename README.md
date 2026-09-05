# Dev/Prod Plugin Switcher

An [Obsidian](https://obsidian.md) plugin for **plugin developers**. Register a
plugin you already have installed, link it to your local dev build, and flip
between the live "Prod" version and your "Dev" build with one click — the
flip triggers a hot reload, and you can run/kill/restart the dev build's own
`npm run dev` (or whatever your build command is) right from Obsidian's
settings.

This is a developer-tooling plugin, not a note-taking feature plugin. It will
never have a Dataview- or Templater-scale install base, because the whole
addressable audience is people actively building an Obsidian plugin. That's
fine — it's a real, previously-unmet need inside a smaller audience.

**Desktop only.** Dev-server control and git branch tooling need Node's
`child_process`, which doesn't exist on mobile. The plugin registry still
shows on mobile, just without those controls.

## Requires Hot Reload

This plugin **depends on** [pjeby's Hot Reload](https://github.com/pjeby/hot-reload)
(MIT licensed) and does not work without it. Hot Reload already does the hard
part — watching a plugin folder and disabling/re-enabling it moments after
`main.js`/`styles.css`/`manifest.json` change — so this plugin doesn't
reimplement any of that. Its job is narrower: make sure Hot Reload has
something real to watch (see [How it works](#how-it-works)) and give you a
one-click way to flip which build is live.

If Hot Reload isn't installed and enabled, this plugin's settings tab hides
the Dev/Prod toggle and dev-server controls entirely and shows a banner
explaining why, with a link to Hot Reload's repo. It won't let you register a
plugin for dev mode that nothing will ever reload.

## Install

Not yet on the Community Plugins list (submission pending). Until then:
[BRAT](https://github.com/TfTHacker/obsidian42-brat) → "Add a beta plugin" →
`danrfletcher/obsidian-plugin-dev-prod-switcher`.

You'll also need Hot Reload installed and enabled — same way, or from its own
[GitHub releases](https://github.com/pjeby/hot-reload/releases).

## Usage

1. Open **Settings → Dev/Prod Plugin Switcher**.
2. Under **Link a plugin**, pick one of your installed plugins and click
   **Link…**. Point it at the local folder where that plugin's dev build
   outputs `main.js` (usually your plugin's repo root) and set the command
   that runs your dev build (default `npm run dev`).
3. The plugin now shows up under **Managed plugins** with:
   - A **Dev / Prod** badge and toggle button.
   - **Run Dev Server** / **Kill** / **Restart**, a status indicator, and a
     collapsible log panel.
   - If the dev folder is a git repo: a branch dropdown (local branches and
     `origin/...` remotes), **Pull**, and **Refresh**.
   - **Unlink**, which removes the wrapper it created (see below) without
     touching your dev folder or the real plugin's files.

Switching to Dev when that plugin's dev server isn't running asks for
confirmation once, since the build might be stale or empty. Switching to Prod
stops that plugin's dev server automatically (if it's running) — see
[How it works](#how-it-works) for why.

## How it works

Obsidian keys installed plugins by the folder name under
`.obsidian/plugins/`, which is also the plugin's `id`. That means a "dev" and
"prod" build of the same plugin can't both be loaded from the same folder at
once. This plugin uses a second id: linking `your-plugin` creates
`.obsidian/plugins/your-plugin-dev/`, and the toggle is just Obsidian's own
`enablePlugin`/`disablePlugin` between the two ids — it never touches the
real plugin's files.

That `your-plugin-dev` folder is real, not a symlink, and holds:

- A generated `manifest.json` (id `your-plugin-dev`, name suffixed "(Dev)"),
  so it can coexist with the real plugin without editing your repo's own
  manifest.
- A **copy** of your dev build's `main.js`/`styles.css`/`data.json`, kept in
  sync by a small file watcher whenever your dev build changes — whether
  that's from this plugin's own "Run Dev Server" or a terminal you started
  yourself. (Copies, not symlinks: Hot Reload watches this folder, and in
  testing, symlinked files inside an otherwise-real folder didn't reliably
  forward change events the way a real file write does.)
- A `.hotreload` marker file, so Hot Reload watches it.

Switching to Prod stops that plugin's dev server if it's running, rather than
leaving it running in the background. If the dev folder is a live git repo,
Hot Reload watches *any* plugin folder with a `.git` directory, and a
background build that keeps touching files could otherwise flip Dev back on
underneath you after you'd switched to Prod.

Settings (dev folder path, dev-server command, last-known mode) persist in
this plugin's own `data.json`. Dev-server process state does not — every
registered plugin's dev server shows as "stopped" after an Obsidian restart,
regardless of what it was before, rather than trying to reconnect to a PID
that may no longer exist.

## What this plugin will never do

- Touch, enable, or disable any plugin you haven't explicitly linked.
- Make network calls beyond what you explicitly trigger (Pull/Refresh on a
  linked git repo). No telemetry, no background requests.
- Work on mobile for the dev-server or git-branch features — there's no
  `child_process` there.

## Compatibility notes

The Dev/Prod toggle and Hot Reload's install/enabled check use Obsidian's
internal (undocumented) `app.plugins` plugin manager — the same surface BRAT
and Hot Reload itself rely on. Specifically: `enablePlugin()`/
`disablePlugin()` update the live plugin instance but were found (tested live
against Obsidian 1.13.7) *not* to persist to `community-plugins.json`, so
this plugin uses `enablePluginAndSave()`/`disablePluginAndSave()` instead
wherever a switch needs to survive a restart. If this drifts in a future
Obsidian release, `src/toggle.ts` and `src/obsidian-internal.d.ts` are the
two files to check.

## Contributing / developing this plugin (recursion intended)

```bash
npm install
npm run dev     # esbuild --watch
npm run build   # typecheck + production build
```

Yes, developing this plugin with this plugin works: link
`dev-prod-plugin-switcher` to its own repo checkout once it's installed
normally, same as any other plugin.

## Credits

- [Hot Reload](https://github.com/pjeby/hot-reload) by pjeby (MIT) — the
  actual reload mechanism this plugin is built on top of.
- Inspired by the gap between [BRAT](https://github.com/TfTHacker/obsidian42-brat),
  Hot Reload, and the many small dev-loop plugins in this space — none of
  which combine a dev/prod registry, a one-click toggle, and dev-server
  control in one place.

## License

MIT — see [LICENSE](LICENSE).
