# 🔥 Tired of Laggy Whiteboards? Draw 100k Paths Smooth at 60FPS with FastDraw!

Imagine this: an edtech platform, students going wild on infinite whiteboards… and every open-source canvas chokes after 1k doodles. Paid options? Insane cash grab. Déjà vu? That’s exactly what sparked **FastDraw**.

**Heads up:** Alpha v0.4.8 – rock-solid drawing paths, silky 60FPS, tiny memory footprint. More tools coming soon.

---

## The Origin Story

Big edtech client: *“We need infinite boards for students to annotate notes and images – fast.”*

Open-source? Stutters after 1k objects. Paid? Pricey as hell.

Started as an SVG vector drawer. Needed notes + speed? Not enough.

Dove into **Pixi.js WebGL sorcery**. FastDraw was born:

* 100k+ objects
* Smooth 60FPS
* Tiny memory footprint

Built for my daily grind. **MIT licensed**, community-driven – bugs, PRs, donations welcome.

---

## Your Daily Nightmare

* 📉 **FPS Meltdown** – Pan/zoom with 1k+ objects? Stutter city.
* 🧠 **Memory Hog** – Boards bloat memory like crazy.
* 🔒 **Framework Lock-in** – React or Vue? Pick one, or fight to integrate.
* ⏳ **Boilerplate Hell** – Undo/redo, selection, LOD – rewrite over and over.
* 💸 **Paywall Perf** – Smoothness behind enterprise walls.

Sound familiar? FastDraw fixes all of it.

---

## FastDraw to the Rescue

**WebGL-powered infinite canvas via Pixi.js.**

* ✅ **100k+ paths** drawn smooth as butter
* ✅ **Infinite zoom/pan** with automatic LOD
* ✅ **React & Vue adapters** – drop-in ready
* ✅ **Undo/redo** baked in
* ✅ **Quadtree hits** for lightning-fast selection
* ✅ **Tiny footprint** – core ~50KB gzipped

![Demo FastDraw Optimized Speed - GIF of 50k paths zoom incoming](./../assets/demo.gif)

**Current star:** Drawing mode optimized to hell. No lags, ever.

---

## Alpha Perks – What You Get Now

* **God-Tier Performance** – Chunk rendering + quadtree. 100k paths? Chill.
* **LOD Smarts** – Crisp close-up, optimized zoom-out. Auto.
* **React/Vue Hooks** – `<FastDraw />` just works.
* **Undo/Redo History** – Command pattern FTW.
* **TypeScript Native** – Types on point.
* **MIT Free** – Yours to hack.

---

## Proof in the Pudding

* Forged in real edtech chaos – handles hundreds of students simultaneously
* Battle-tested v0.4.8 alpha: Perf-first, drawing locked
* Dev feedback: *“Smoothest whiteboard I’ve ever touched. Waiting for eraser!”*

---

## Get Started – 60-Second Setup

**React/Next.js:**

```bash
npm i fastdraw
```

```tsx
'use client';
import FastDraw from 'fastdraw/react';
import 'fastdraw/react/style.css';

export default function Home() {
  return <FastDraw open={true} />;
}
```

**Vue 3:**

```bash
npm i fastdraw
```

```vue
<script setup>
import FastDraw from 'fastdraw/vue';
import 'fastdraw/vue/style.css';
</script>

<template>
  <FastDraw />
</template>
```

Demos: [Next.js](examples/nextjs), [Vue](examples/vue). Draw away!

---

## Roadmap & Daily Driver

FastDraw started as an image annotation tool, now evolving into a full whiteboard engine.

**Current (v0.4.8):** Drawing paths, extreme perf focus (FPS + memory).

**Next Up:**

* Eraser tool
* Text objects
* Image drops on canvas
* Custom objects (buttons, etc.)
* Full design customization

Contribute PRs, join collab. CRDT multiplayer coming later. Daily driver – won’t abandon.

---

## 🚀 Grab FastDraw Alpha – Ditch the Lag

```bash
npm i fastdraw
```

* Draw 100k paths, grin.
* Star the repo, test examples, report bugs/PRs.
* Join the fastest whiteboard revolution.

**Battle-Tested Alpha:** months in startups, 50+ dev feedback loops. Pixi + quadtree + LOD = perf unbeatable. Drawing’s dialed. Rest is incoming.

---

[fastdraw npm](https://www.npmjs.com/package/fastdraw) | [GitHub](.) | MIT