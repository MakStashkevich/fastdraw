import type { BoundingBox, DrawPath, Point } from '../../types';
import type { FastDrawCore } from '../FastDrawCore';
import { Widget } from './Widget';

export class ActivePathWidget extends Widget {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private lastRenderedPointIndex = 0;
  private currentPath: DrawPath | null = null;
  private currentBBox: BoundingBox | null = null;

  constructor(core: FastDrawCore, container: HTMLElement) {
    super(core, container);
    this.createElement();
  }

  createElement(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.display = 'none'; // Initially hidden
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  initialize(): void {
    this.core.on('currentPathUpdate', this.handlePathUpdate);
    this.core.on('transform', this.handleTransform);
  }

  destroy(): void {
    this.core.off('currentPathUpdate', this.handlePathUpdate);
    this.core.off('transform', this.handleTransform);
    this.canvas.remove();
  }

  private handleTransform = () => {
    // When transform changes, we need to redraw the whole path with the new scale and position
    if (this.currentPath) {
      this.lastRenderedPointIndex = 0; // Reset to force full redraw
      this.renderCurrentPath(this.currentPath);
    }
  }

  private handlePathUpdate = (path: DrawPath | null) => {
    this.currentPath = path;
    if (!path || path.points.length === 0) {
      this.clearCanvas();
      return;
    }

    // If it's a new path, reset the rendering index
    if (path.id !== this.currentPath?.id) {
      this.lastRenderedPointIndex = 0;
    }

    this.renderCurrentPath(path);
  }

  private computeBBox(points: Point[]): BoundingBox {
    if (points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    let minX = points[0].x;
    let minY = points[0].y;
    let maxX = points[0].x;
    let maxY = points[0].y;

    for (let i = 1; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxX = Math.max(maxX, points[i].x);
      maxY = Math.max(maxY, points[i].y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      minX,
      minY,
      maxX,
      maxY,
    };
  }

  private clearCanvas() {
    this.canvas.style.display = 'none';
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.lastRenderedPointIndex = 0;
    this.currentBBox = null;
  }

  private renderCurrentPath = (path: DrawPath) => {
    if (path.points.length < 1) {
      this.clearCanvas();
      return;
    }

    const newBBox = this.computeBBox(path.points);

    this.lastRenderedPointIndex = 0;
    this.currentBBox = newBBox;

    if (!this.currentBBox) {
      // This should not happen in practice, but it satisfies the TypeScript compiler.
      return;
    }
    const { scale, offsetX, offsetY } = this.core.transformState;
    const padding = path.thickness;
    const scaledPadding = padding * scale;

    // --- Canvas Position and Size ---
    const screenX = this.currentBBox.x * scale + offsetX - scaledPadding;
    const screenY = this.currentBBox.y * scale + offsetY - scaledPadding;
    const canvasWidth = this.currentBBox.width * scale + scaledPadding * 2;
    const canvasHeight = this.currentBBox.height * scale + scaledPadding * 2;

    this.canvas.style.left = `${screenX}px`;
    this.canvas.style.top = `${screenY}px`;
    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
    this.canvas.style.display = 'block';

    // --- Drawing ---
    this.ctx.strokeStyle = path.color;
    this.ctx.lineWidth = path.thickness * scale;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    // If we need a full redraw, clear and start from the beginning
    if (this.lastRenderedPointIndex === 0) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.beginPath();
      const firstPoint = path.points[0];
      const localX = (firstPoint.x - this.currentBBox.x) * scale + scaledPadding;
      const localY = (firstPoint.y - this.currentBBox.y) * scale + scaledPadding;
      this.ctx.moveTo(localX, localY);
    }

    for (let i = this.lastRenderedPointIndex > 0 ? this.lastRenderedPointIndex : 1; i < path.points.length; i++) {
      const point = path.points[i];
      const prevPoint = path.points[i - 1]; // For incremental drawing from last point

      // On full redraw, moveTo is already set. For incremental, we start from the last rendered point.
      if (i === this.lastRenderedPointIndex && i > 0) {
        this.ctx.beginPath();
        const lastRenderedX = (prevPoint.x - this.currentBBox.x) * scale + scaledPadding;
        const lastRenderedY = (prevPoint.y - this.currentBBox.y) * scale + scaledPadding;
        this.ctx.moveTo(lastRenderedX, lastRenderedY);
      }

      const localX = (point.x - this.currentBBox.x) * scale + scaledPadding;
      const localY = (point.y - this.currentBBox.y) * scale + scaledPadding;
      this.ctx.lineTo(localX, localY);
    }

    this.ctx.stroke();
    this.lastRenderedPointIndex = path.points.length;
  }
}
