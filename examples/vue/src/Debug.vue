<script setup lang="ts">
import { ref } from 'vue'
import FastDraw from 'fastdraw/vue'
import { DrawMode, DrawType, type BoardApi, type DrawPath, type Point } from 'fastdraw';

const isWhiteboardOpen = ref(false);

const addBaseImageToWhiteboard = async (board: BoardApi) => {
  console.log('ImageEditor: addBaseImageToWhiteboard called, board:', board);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = '';

  const uuidv4 = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load base image'));
    });

    // Fit and center image in viewport
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    board.addImage(img.src, -w / 2, -h / 2, w, h);

    // Генерируем сложный узор из линий и точек на холсте 10000x10000
    const patterns: DrawPath[] = [];
    const centerX = 0;
    const centerY = 0;
    const worldSize = 5000; // [-5000, 5000]

    // 1. Толстые радиальные линии с плотными points (как реальное рисование)
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) { // 32 луча
      const rayPoints: Point[] = [];
      const numPoints = 80;
      for (let k = 0; k <= numPoints; k++) {
        const frac = k / numPoints;
        const r = frac * worldSize;
        const baseX = centerX + r * Math.cos(angle);
        const baseY = centerY + r * Math.sin(angle);
        const noise = 3;
        rayPoints.push({
          x: baseX + (Math.random() - 0.5) * noise,
          y: baseY + (Math.random() - 0.5) * noise
        });
      }
      const thickLine: DrawPath = {
        id: uuidv4(),
        type: DrawType.PATH,
        mode: DrawMode.DRAW,
        points: rayPoints,
        color: '#ff0000',
        thickness: 40,
        deleted: false,
      };
      patterns.push(thickLine);
    }

    // 2. Концентрические круги с плотными points
    for (let r = 500; r < worldSize; r += 500) {
      const numSegments = 72; // больше сегментов
      for (let seg = 0; seg < numSegments; seg++) {
        const arcPoints: Point[] = [];
        const numArcPoints = 20;
        for (let k = 0; k <= numArcPoints; k++) {
          const frac = k / numArcPoints;
          const a = (seg + frac) / numSegments * Math.PI * 2;
          const baseX = centerX + r * Math.cos(a);
          const baseY = centerY + r * Math.sin(a);
          const noise = 2;
          arcPoints.push({
            x: baseX + (Math.random() - 0.5) * noise,
            y: baseY + (Math.random() - 0.5) * noise
          });
        }
        const circleSeg: DrawPath = {
          id: uuidv4(),
          type: DrawType.PATH,
          mode: DrawMode.DRAW,
          points: arcPoints,
          color: '#00ff00',
          thickness: 8,
          deleted: false,
        };
        patterns.push(circleSeg);
      }
    }

    // 3. Спираль Архимеда с более плотными points
    const spiralPoints: Point[] = [];
    let spiralAngle = 0;
    let spiralRadius = 20;
    for (let t = 0; t < Math.PI * 20; t += 0.02) { // плотнее
      const x = centerX + spiralRadius * Math.cos(spiralAngle);
      const y = centerY + spiralRadius * Math.sin(spiralAngle);
      const noise = 1.5;
      spiralPoints.push({
        x: x + (Math.random() - 0.5) * noise,
        y: y + (Math.random() - 0.5) * noise
      });
      spiralAngle = t;
      spiralRadius += 0.4; // медленнее рост для плотности
    }
    const spiral: DrawPath = {
      id: uuidv4(),
      type: DrawType.PATH,
      mode: DrawMode.DRAW,
      points: spiralPoints,
      color: '#0000ff',
      thickness: 6,
      deleted: false,
    };
    patterns.push(spiral);

    // 4. Волны sin/cos с более плотными points
    for (let waveY = -4000; waveY < 4000; waveY += 800) {
      const wavePoints: Point[] = [];
      for (let x = -worldSize; x <= worldSize; x += 10) { // плотнее
        const wavyY = waveY + 300 * Math.sin(x / 300) + 150 * Math.cos(x / 200);
        const noise = 1;
        wavePoints.push({
          x: x + (Math.random() - 0.5) * noise,
          y: wavyY + (Math.random() - 0.5) * noise
        });
      }
      const wave: DrawPath = {
        id: uuidv4(),
        type: DrawType.PATH,
        mode: DrawMode.DRAW,
        points: wavePoints,
        color: '#ff00ff',
        thickness: 4,
        deleted: false,
      };
      patterns.push(wave);
    }

    // 5. Множество случайных точек как маленькие круги с плотными points
    for (let i = 0; i < 10000; i++) { // больше
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * worldSize;
      const cx = centerX + dist * Math.cos(angle);
      const cy = centerY + dist * Math.sin(angle);
      const dotPoints: Point[] = [];
      const numDotPoints = 12; // круг из points
      for (let k = 0; k < numDotPoints; k++) {
        const da = (k / numDotPoints) * Math.PI * 2;
        const dx = 3 * Math.cos(da);
        const dy = 3 * Math.sin(da);
        dotPoints.push({
          x: cx + dx + (Math.random() - 0.5),
          y: cy + dy + (Math.random() - 0.5)
        });
      }
      const dot: DrawPath = {
        id: uuidv4(),
        type: DrawType.PATH,
        mode: DrawMode.DRAW,
        points: dotPoints,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`,
        thickness: 1 + Math.random() * 2,
        deleted: false,
      };
      patterns.push(dot);
    }

    board.addObjects(patterns, false);
  } catch (error) {
    console.error('Error adding base image:', error);
  }

  board.setDrawingMode(DrawMode.DRAW);
  board.openToolBar(true);
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-24 bg-gradient-to-br from-green-50 to-emerald-100">
    <h1 class="text-4xl font-bold mb-8 text-gray-900">FastDraw Vue Example</h1>
    <button @click="isWhiteboardOpen = true"
      class="px-8 py-4 bg-emerald-600 text-white font-semibold rounded-lg shadow-lg hover:bg-emerald-700 transition-colors text-xl">
      Открыть доску FastDraw
    </button>
    <FastDraw v-model:open="isWhiteboardOpen" @onCloseBoard="isWhiteboardOpen = false"
      @onRender="addBaseImageToWhiteboard" />
  </div>
</template>

<style scoped></style>
