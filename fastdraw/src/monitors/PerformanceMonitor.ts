export class PerformanceMonitor {
  private frameTimes: number[] = [];
  private lastLogTime: number = 0;
  private rafId: number = 0;
  private isRunning: boolean = false;
  private statsDiv: HTMLDivElement | null = null;

  // Perf stats
  private lastRenderTime: number = 0;
  private lastChunks: number = 0;
  private lastObjects: number = 0;

  // Debug stats
  private cacheChunks: number = 0;
  private cacheSprites: number = 0;
  private historySnapshotMB: number = 0;
  private historyObjects: number = 0;
  private historyStackLen: number = 0;

  // GL info
  private glVendor: string = 'N/A';
  private glRenderer: string = 'N/A';
  private glVersion: string = 'N/A';
  private glShading: string = 'N/A';
  private pixiVersion: string = 'N/A';
  private tileSize: number = 0;

  private createStatsDiv(): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.8);
      color: lime;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      border: 1px solid lime;
      border-radius: 4px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.3s;
      line-height: 1.4;
      max-width: 300px;
    `;
    document.body.appendChild(div);
    return div;
  }

  start(): void {
    if (this.isRunning) {
      console.warn('[PERF] Monitor already running');
      return;
    }
    console.log('[PERF] Starting FastDraw performance overlay...');
    this.isRunning = true;
    this.frameTimes = [];
    this.lastLogTime = performance.now();

    if (!this.statsDiv) {
      this.statsDiv = this.createStatsDiv();
    }
    this.statsDiv.style.opacity = '1';
    this.emitVisibilityChange(true);

    this.loop();
  }

  stop(): void {
    if (!this.isRunning) {
      console.warn('[PERF] Monitor not running');
      return;
    }
    console.log('[PERF] Stopping FastDraw performance overlay');
    this.isRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    if (this.statsDiv) {
      this.statsDiv.style.opacity = '0';
    }
    this.emitVisibilityChange(false);
  }

  destroy(): void {
    this.stop();
    if (this.statsDiv && this.statsDiv.parentNode) {
      this.statsDiv.parentNode.removeChild(this.statsDiv);
      this.statsDiv = null;
    }
  }

  public updateRenderStats(time: number, chunks: number, objects: number): void {
    this.lastRenderTime = time;
    this.lastChunks = chunks;
    this.lastObjects = objects;
  }

  public updateCacheStats(chunks: number, sprites: number): void {
    this.cacheChunks = chunks;
    this.cacheSprites = sprites;
  }

  public updateHistoryStats(snapshotMB: number, objects: number, stackLen: number): void {
    this.historySnapshotMB = snapshotMB;
    this.historyObjects = objects;
    this.historyStackLen = stackLen;
  }

  public updateGlInfo(vendor: string, renderer: string, version: string, shading: string, pixiVersion: string, tileSize: number): void {
    this.glVendor = vendor;
    this.glRenderer = renderer;
    this.glVersion = version;
    this.glShading = shading;
    this.pixiVersion = pixiVersion;
    this.tileSize = tileSize;
  }

  public updateTileSize(tileSize: number): void {
    this.tileSize = tileSize;
  }

  public isVisible(): boolean {
    return this.isRunning;
  }

  private loop(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    this.frameTimes.push(now);

    while (this.frameTimes.length > 0 && this.frameTimes[0] < now - 2000) {
      this.frameTimes.shift();
    }

    if (now - this.lastLogTime >= 1000 || this.frameTimes.length < 2) {
      const fps = this.frameTimes.length > 1 ? Math.round(1000 * this.frameTimes.length / (now - this.frameTimes[0])) : 0;
      let memoryInfo = 'N/A';
      if ((performance as any).memory) {
        const mem = (performance as any).memory as {
          usedJSHeapSize: number;
          totalJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
        memoryInfo = `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(1)} / Total ${(mem.totalJSHeapSize / 1024 / 1024).toFixed(1)} / Limit ${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(1)}MB`;
      }
      const cpuCores = navigator.hardwareConcurrency || 'N/A';

      if (this.statsDiv) {
        this.statsDiv.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid lime; padding-bottom: 5px;">FastDraw Monitor</div>
          <div>FPS: <strong>${fps}</strong></div>
          <div>Memory: <strong>${memoryInfo}</strong></div>
          <div>CPU cores: <strong>${cpuCores}</strong></div>
          <div style="margin-top: 10px; font-size: 11px; color: #00ff00;">WebGL:</div>
          <div>Vendor: <strong>${this.glVendor}</strong></div>
          <div>Renderer: <strong>${this.glRenderer}</strong></div>
          <div>Version: <strong>${this.glVersion}</strong></div>
          <div>Shading: <strong>${this.glShading}</strong></div>
          <div>PIXI v${this.pixiVersion} | Tile: <strong>${this.tileSize}px</strong></div>
          <div style="margin-top: 10px; font-size: 11px; color: #00ff00;">Debug:</div>
          <div>Cache Chunks: <strong>${this.cacheChunks}</strong> Sprites: <strong>${this.cacheSprites}</strong></div>
          <div>History Snap: <strong>${this.historySnapshotMB.toFixed(2)}MB</strong> Obj: <strong>${this.historyObjects}</strong> Stack: <strong>${this.historyStackLen}</strong></div>
          <div style="margin-top: 10px; font-size: 11px; color: #00ff00;">Last Render:</div>
          <div>${this.lastRenderTime.toFixed(1)}ms | Chunks: <strong>${this.lastChunks}</strong> | Objects: <strong>${this.lastObjects}</strong></div>
        `;
      }

      this.lastLogTime = now;
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  private emitVisibilityChange(active: boolean): void {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent('fastdraw:perf-toggle', { detail: { active } }));
  }
}

if (typeof window !== 'undefined') {
  window.fastdraw = (window.fastdraw || {}) as any;
  window.fastdraw.perfomance = new PerformanceMonitor();
  console.log('[PERF] FastDraw Monitor ready: window.fastdraw.perfomance.start()');
}
