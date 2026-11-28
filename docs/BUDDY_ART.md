# Making gym buddy art (ChatGPT / Canva)

The app draws the buddy from stacked layers on one canvas. You can replace any **item** (outfit, shoes, hat, glasses, hand item, bag/cape, background, hair style) with your own artwork without changing the code.

## The rules
1. **Canvas: 800 × 880 px** (same 10:11 shape as the app's 200 × 220), **transparent PNG**.
2. **Only the item** goes in the image (e.g. just the cap), drawn **exactly where it sits on the buddy**. Use the reference images in this folder as a bottom layer, then hide that layer before exporting:
   - `buddy-reference-round.png`, `buddy-reference-tall.png`, `buddy-reference-chunky.png`: the base buddy in each body shape
   - `buddy-template-zones.png`: where hair/hats, face items, outfits, hand items and shoes go
3. Design for the **round** shape. Hats and glasses line up on all three shapes. Outfits are the exception: their position changes per shape (see "Limits" below).
4. Keep the style **flat and cute**: thick dark outline (about 8–10 px at this size), no realistic shading, 2–3 colours per item.

## Workflow
**ChatGPT (image generation):** best for *ideas and style*, less reliable at exact placement.
- Prompt example: *"Flat vector cartoon sticker of a [red baseball cap] for a round blob mascot character, thick dark outline, simple cel colours, transparent background, front view, no character, just the item."*
- Then place and size it over the reference image in Canva.

**Canva:** best for *assembling and exporting*.
1. Create a custom design, 800 × 880 px.
2. Upload `buddy-reference-round.png` and lock it in place at 0,0, full size.
3. Add or position the item on top so it fits the buddy.
4. Hide the reference layer and export as a **PNG with transparent background** (a Canva Pro feature).

## Installing an item
1. Name the file after the item id, e.g. `cap.png`, `hoodie-purple.png`, `bg-beach.png`. Item ids are listed in `js/buddy.js` → `RAW`.
2. Put it in `img/buddy/`.
3. In `js/buddy.js`, add `img: true` to that item, e.g.
   `['cap', 'head', 'Cap', 80, 2, { c: '#1C7ED6', img: true }],`
4. Ask Claude to do steps 2–3 and push. It can also add new items with your art.

## Limits of the image approach (v1)
- **Outfits on Tall and Chunky:** an image outfit is a fixed picture, so it fits one body shape best. The built-in vector outfits re-fit every shape automatically. If you make image outfits, Claude can switch them to per-shape files (`hoodie-purple-tall.png`, etc.).
- **Strength muscle lines and arms** stay vector, so they keep growing with your training.
- **Body colour, eyes, mouth and moods** (happy / excited / sleepy) also stay vector.
