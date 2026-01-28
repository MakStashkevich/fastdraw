import type { FastDrawCore } from '../FastDrawCore';
import { BoardRenderer } from './BoardRenderer';
import { ActivePathWidget as ActivePathWidget } from '../widgets/ActivePathWidget';
import { CursorWidget as CursorWidget } from '../widgets/CursorWidget';
import type { Widget } from '../widgets/Widget';
import type { Renderer } from './Renderer';

/**
 * The HybridRenderer orchestrates the renderers and widgets.
 * It creates and manages the DOM elements for both layers.
 */
export class HybridRenderer {
  // Core
  private core: FastDrawCore;

  // Containers
  private container: HTMLElement;
  private pixiContainer!: HTMLElement;
  private widgetsOverlay!: HTMLElement;

  // Renderer
  private renders: Renderer[] = [];

  // Widgets
  private widgets: Widget[] = [];

  constructor(core: FastDrawCore, container: HTMLElement) {
    this.core = core;
    this.container = container;
    this.createLayers();
    this.setup();
    this.initialize();
  }

  private createLayers(): void {
    // Ensure the main container can host positioned children
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    // Create Pixi Container
    this.pixiContainer = document.createElement('div');
    this.pixiContainer.id = 'pixiCanvasContainer';
    this.pixiContainer.style.position = 'absolute';
    this.pixiContainer.style.top = '0';
    this.pixiContainer.style.left = '0';
    this.pixiContainer.style.width = '100%';
    this.pixiContainer.style.height = '100%';
    this.pixiContainer.style.zIndex = '0';
    this.pixiContainer.style.pointerEvents = 'none';

    // Create Widgets Overlay
    this.widgetsOverlay = document.createElement('div');
    this.widgetsOverlay.id = 'widgetsOverlay';
    this.widgetsOverlay.style.position = 'absolute';
    this.widgetsOverlay.style.top = '0';
    this.widgetsOverlay.style.left = '0';
    this.widgetsOverlay.style.width = '100%';
    this.widgetsOverlay.style.height = '100%';
    this.widgetsOverlay.style.zIndex = '1';
    this.widgetsOverlay.style.pointerEvents = 'auto';

    this.container.appendChild(this.pixiContainer);
    this.container.appendChild(this.widgetsOverlay);
  }

  private setup(): void {
    // Renderers
    if (this.pixiContainer) {
      this.renders.push(new BoardRenderer(this.core, this.pixiContainer));
    }

    // Widgets
    if (this.widgetsOverlay) {
      this.widgets.push(new ActivePathWidget(this.core, this.widgetsOverlay));
      this.widgets.push(new CursorWidget(this.core, this.widgetsOverlay));
    }
  }

  /**
   * Initializes both the renderers and widgets.
   */
  public initialize(): void {
    // Renderer
    this.renders.forEach(renderer => {
      renderer.initialize();
    });

    // Widgets
    this.widgets.forEach(widget => {
      widget.initialize();
    });
  }

  /**
   * Destroys renderers, widgets and removes their DOM elements.
   */
  public destroy(): void {
    // Renderer
    console.log('HybridRenderer: Destroying renders');
    this.renders.forEach(renderer => {
      renderer.destroy();
    });

    // Widgets
    console.log('HybridRenderer: Destroying widgets');
    this.widgets.forEach(widget => {
      widget.destroy();
    });

    // Remove DOM elements
    if (this.pixiContainer && this.pixiContainer.parentNode) {
      this.pixiContainer.parentNode.removeChild(this.pixiContainer);
      console.log('HybridRenderer: Removed pixiContainer from DOM');
    }
    if (this.widgetsOverlay && this.widgetsOverlay.parentNode) {
      this.widgetsOverlay.parentNode.removeChild(this.widgetsOverlay);
      console.log('HybridRenderer: Removed widgetsOverlay from DOM');
    }
  }
}
