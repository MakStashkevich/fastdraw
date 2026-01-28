export class DebugMonitor {
  private statsDiv: HTMLDivElement | null = null;
  private isRunning: boolean = false;
  public showGrid: boolean = false;
  private gridToggle: HTMLInputElement | null = null;
  private perfListenerBound: boolean = false;
  private readonly baseLeft = 10;
  private readonly baseTop = 10;
  private readonly perfOffset = 320;

  private createStatsDiv(): HTMLDivElement {
    const div = document.createElement('div');
    div.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid cyan; padding-bottom: 5px; color: cyan;">FastDraw Debug</div>
      <div>
        <label style="color: white;">Show Grid: 
          <input type="checkbox" id="gridToggle" checked style="margin-left: 5px;">
        </label>
      </div>
    `;
    div.style.cssText = `
      position: fixed;
      top: ${this.baseTop}px;
      left: ${this.baseLeft}px;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.8);
      color: cyan;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      border: 1px solid cyan;
      border-radius: 4px;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.3s;
      line-height: 1.4;
      max-width: 250px;
      min-width: 200px;
    `;
    document.body.appendChild(div);
    return div as HTMLDivElement;
  }

  start(): void {
    if (this.isRunning) {
      console.warn('[DEBUG] Monitor already running');
      return;
    }
    console.log('[DEBUG] Starting FastDraw debug overlay...');
    this.isRunning = true;

    if (!this.statsDiv) {
      this.statsDiv = this.createStatsDiv();
    }
    this.statsDiv.style.opacity = '1';

    this.setupControls();
    this.applyGridState(true);
    this.bindPerfEvents();
    this.updatePosition();
  }

  private setupControls(): void {
    this.gridToggle = this.statsDiv!.querySelector('#gridToggle') as HTMLInputElement;
    this.gridToggle.checked = this.showGrid;
    this.gridToggle.onchange = () => {
      this.applyGridState(this.gridToggle!.checked);
    };
  }

  stop(): void {
    if (!this.isRunning) {
      console.warn('[DEBUG] Monitor not running');
      return;
    }
    console.log('[DEBUG] Stopping FastDraw debug overlay');
    this.isRunning = false;
    if (this.statsDiv) {
      this.statsDiv.style.opacity = '0';
    }
    this.applyGridState(false);
    this.unbindPerfEvents();
  }

  destroy(): void {
    this.stop();
    if (this.statsDiv && this.statsDiv.parentNode) {
      this.statsDiv.parentNode.removeChild(this.statsDiv);
      this.statsDiv = null;
    }
  }

  private applyGridState(checked: boolean): void {
    if (this.showGrid === checked) {
      if (this.gridToggle) {
        this.gridToggle.checked = checked;
      }
      return;
    }
    this.showGrid = checked;
    if (this.gridToggle) {
      this.gridToggle.checked = checked;
    }
  }

  private bindPerfEvents(): void {
    if (this.perfListenerBound || typeof window === 'undefined') {
      return;
    }
    window.addEventListener('fastdraw:perf-toggle', this.handlePerfToggle);
    this.perfListenerBound = true;
  }

  private unbindPerfEvents(): void {
    if (!this.perfListenerBound || typeof window === 'undefined') {
      return;
    }
    window.removeEventListener('fastdraw:perf-toggle', this.handlePerfToggle);
    this.perfListenerBound = false;
  }

  private handlePerfToggle = (event: Event): void => {
    const detail = (event as CustomEvent<{ active: boolean }>).detail;
    this.updatePosition(detail?.active);
  };

  private updatePosition(perfActive?: boolean): void {
    if (!this.statsDiv) {
      return;
    }
    let active = perfActive;
    if (active === undefined && typeof window !== 'undefined') {
      active = !!window.fastdraw?.perfomance?.isVisible?.();
    }
    const offset = active ? this.perfOffset : 0;
    this.statsDiv.style.left = `${this.baseLeft + offset}px`;
    this.statsDiv.style.top = `${this.baseTop}px`;
  }
}

if (typeof window !== 'undefined') {
  window.fastdraw = (window.fastdraw || {}) as any;
  window.fastdraw.debug = new DebugMonitor();
  console.log('[DEBUG] FastDraw Debug Monitor ready: window.fastdraw.debug.start()');
}
