# Fixing the orange highlight boxes

Every tutorial has a **visual box editor** — no code, no setup. Use it whenever a
box doesn't sit right over the button or panel it's pointing at.

## How to fix a box

1. **Open the editor** for the tutorial:

   `https://cv-tutorials.github.io/tutorial-manager/<partner>/<flow>/editor.html`

   For example:
   - https://cv-tutorials.github.io/tutorial-manager/cv/getting-started/editor.html
   - https://cv-tutorials.github.io/tutorial-manager/cv/reporting/editor.html

2. **Pick the step** in the left sidebar. Steps marked *"no box (full view)"* have no
   highlight on purpose — nothing to fix there.

3. **Move the box**
   - **Drag** the middle of the box to move it
   - **Drag a corner** to resize it
   - **Arrow keys** nudge it a little (hold **Shift** for bigger steps)

   Aim to wrap the whole element — a button and its label, or a full panel with its
   heading — with a little breathing room, not tight against the edge.

4. Repeat for every step that needs it.

5. Click **⬇ Download config.json** (top right). It downloads the whole tutorial's
   settings with your new box positions.

6. **Send that file back** (Slack it to Felipe, or drop it in the repo at
   `tutorials/<partner>/<flow>/config.json`, replacing the existing one).

That's it. Once the file is back in the repo, the tutorial rebuilds with the corrected
boxes — both the interactive version and the written article.

## Good to know

- Your changes only live in the browser until you download. Refreshing loses them.
- Only box positions change. Titles, descriptions and screenshots are untouched.
- If a screenshot itself is wrong or outdated, that's a separate fix — flag it instead
  of trying to work around it with the box.
