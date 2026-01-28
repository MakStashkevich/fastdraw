import * as PIXI from 'pixi.js';
import { Renderer } from './Renderer';
import type { FastDrawCore } from '../FastDrawCore';
import { drawObjectToPixi } from '../../utils/PixiUtils';
import type { DrawObject, Viewport } from '../../types';
import { LODLevel } from '../../types';
import { ChunkManager } from './ChunkManager';

export class BoardRenderer extends Renderer {
  private app: PIXI.Application;
  private camera: PIXI.Container;
  private world: PIXI.Container;
  private selectedContainer: PIXI.Container | null = null;
  private currentDrawObjectsSize: number = 0;
  private chunkManager?: ChunkManager;

  constructor(core: FastDrawCore, container: HTMLElement) {
    super(core);
    console.log('[DEBUG BoardRenderer] Constructor called');
    this.app = new PIXI.Application();
    console.log('[DEBUG BoardRenderer] PIXI.Application instance created');

    // Setup scene graph
    this.camera = new PIXI.Container();
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.camera);
    this.camera.addChild(this.world);

    // set bounding rect for use zoom & move & calc xyz
    this.core.updateBoundingRect(container);

    // Asynchronously initialize the PIXI Application
    this.init(container);
  }

  private async init(container: HTMLElement): Promise<void> {
    console.log('[DEBUG WebGLRenderer] init start');
    console.log('[DEBUG WebGLRenderer] PIXI.isWebGLSupported:', PIXI.isWebGLSupported);
    try {
      await this.app.init({
        backgroundColor: '#ffffff',
        resizeTo: container,
        preference: 'webgl',
        antialias: true,
        resolution: 1,
        textureGCActive: true, // Enable texture garbage collection
        textureGCMaxIdle: 3600, // 1 hours idle time
        textureGCCheckCountMax: 600, // Check every 10 seconds at 60 FPS
      });
      console.log('[DEBUG WebGLRenderer] app.init complete. Canvas size:', this.app.canvas.width, 'x', this.app.canvas.height);
    } catch (error) {
      console.error('[DEBUG WebGLRenderer] Error during PIXI.Application init:', error);
      throw error; // Перебрасываем ошибку, чтобы она была видна
    }
    console.log('[DEBUG WebGLRenderer] container size:', container.clientWidth, 'x', container.clientHeight);
    const glContext = (this.app.renderer as any).gl;
    console.log('[DEBUG WebGLRenderer] GL context after init:', glContext);

    // Update GL info for monitor
    const gl = (this.app.renderer as any).gl as WebGLRenderingContext | WebGL2RenderingContext | null;
    if (gl && (window as any).fastdraw?.perfomance) {
      const vendor = gl.getParameter(gl.VENDOR);
      const renderer = gl.getParameter(gl.RENDERER);
      const version = gl.getParameter(gl.VERSION);
      const shading = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      (window as any).fastdraw.perfomance.updateGlInfo(
        vendor as string,
        renderer as string,
        version as string,
        shading as string,
        PIXI.VERSION,
        0
      );
    }
    container.appendChild(this.app.canvas);

    // Expose core and renderer for debug access
    if (typeof window !== 'undefined') {
      (window as any).fastdraw = (window as any).fastdraw || {};
      (window as any).fastdraw.core = this.core;
      (window as any).fastdraw.renderer = this;
    }

    // Handle resize
    const resizeHandler = () => {
      console.log('[DEBUG WebGLRenderer] resize detected');
      this.core.setCanvasBoundingRect(this.app.canvas.getBoundingClientRect());
    };
    window.addEventListener('resize', resizeHandler);
    this.resizeHandler = resizeHandler; // store for destroy

    // Initial render
    this.app.ticker.add(() => this.render());
    this.app.ticker.start();

    // Initial chunk manager
    this.chunkManager = new ChunkManager(this.world, this.app.renderer);

    // Add core objects after PIXI initialize if needed
    const initialObjects = this.core.objects.filter(o => !o.deleted);
    if (initialObjects.length > 0) {
      console.log(`[DEBUG WebGLRenderer] Adding ${initialObjects.length} initial objects to ChunkManager.`);
      this.addObjectsForRender(initialObjects);
    }
  }

  private previousLod: LODLevel = LODLevel.Near;

  initialize(): void {
    // Listen for transform changes to trigger re-renders
    this.core.on('transform', (transform) => {
      const { scale, offsetX, offsetY, lodLevel } = transform;

      this.camera.scale.set(scale, scale);
      this.camera.position.set(offsetX, offsetY);
      if (lodLevel !== this.previousLod) {
        this.previousLod = lodLevel;
      }
    });
    this.core.on('objectsUpdate', (objects) => {
      console.log('[DEBUG WebGLRenderer] objectsUpdate event received, objects count:', objects.length);
      this.addObjectsForRender(objects);
    });
    console.log('[DEBUG WebGLRenderer] Subscribed to objectsUpdate event.');
    this.core.on('selectionChange', () => {
      console.log('[DEBUG WebGLRenderer] selectionChange event received');
      // When selection changes, we need to invalidate the tiles for both the
      // newly selected and previously selected items. A simple way is to just re-render.
      // A full implementation would require knowing the "before" and "after" state.
    });
  }

  private addObjectsForRender(objects: DrawObject[]): void {
    this.currentDrawObjectsSize = objects.filter(o => !o.deleted).length;
    this.chunkManager?.addObjects(objects);
  }

  private resizeHandler?: () => void;

  public getCanvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  public getStage(): PIXI.Container {
    return this.app.stage;
  }

  destroy(): void {
    console.log('[DEBUG BoardRenderer] destroy called');
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      console.log('[DEBUG BoardRenderer] Removed resize listener');
    }

    this.chunkManager?.clear();

    console.log('[DEBUG BoardRenderer] Cache-related code removed as per new chunk-only RenderTexture architecture');

    if (this.selectedContainer) {
      this.selectedContainer.destroy({ children: true, texture: true, textureSource: true });
    }

    if (this.world) {
      this.world.destroy({ children: true, texture: true, textureSource: true });
    }

    if (this.camera) {
      this.camera.destroy({ children: true, texture: true, textureSource: true });
    }

    if (this.app) {
      if (this.app.stage) {
        this.app.stage.destroy({ children: true, texture: true, textureSource: true });
      }

      if (this.app.ticker && this.app.ticker.started) {
        this.app.ticker.stop();
      }

      setTimeout(() => {
        if (this.app) {
          this.app.destroy(
            { removeView: true, releaseGlobalResources: false },
            { children: true, context: true, texture: true, textureSource: true, style: true }
          );
          this.app = null as any;
          console.log('[DEBUG BoardRenderer] app.destroy() complete and app set to null');

          // Очищаем PIXI.Assets
          if (PIXI.Assets) {
            PIXI.Assets.reset();
            console.log('[DEBUG BoardRenderer] PIXI.Assets reset complete');
          }
        }
      }, 0);
    }

    // Validate: log remaining canvases
    console.log('[DEBUG BoardRenderer] post-destroy canvases in DOM:', document.querySelectorAll('canvas').length);
    console.log('[DEBUG BoardRenderer] destroy END');
  }

  public render(): void {
    if (!this.app?.renderer) {
      return;
    }

    const renderStart = performance.now();

    const wrapper = this.core.getWrapperElement();
    if (!wrapper) {
      return;
    }

    const viewport: Viewport = {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
      scale: this.core.transformState.scale,
      offsetX: this.core.transformState.offsetX,
      offsetY: this.core.transformState.offsetY,
      lodLevel: this.core.transformState.lodLevel,
    };
    const visibleBounds = this.computeVisibleWorldBounds(viewport);

    this.chunkManager?.updateVisibleChunks(viewport, visibleBounds);

    this._renderSelection();

    // stage position and scale already set in transform listener
    this.app.renderer.render(this.app.stage);

    const renderTime = performance.now() - renderStart;
    if ((window as any).fastdraw?.perfomance) {
      (window as any).fastdraw.perfomance.updateRenderStats(renderTime, this.chunkManager?.getChunksSize() ?? 0, this.currentDrawObjectsSize);
      // (window as any).fastdraw.perfomance.updateCacheStats(this.tileCache.size, this.tileSprites.size + this.maskSprites.size, lodTileStats, lodMaskStats);
    }
  }

  private _renderSelection() {
    const selectedIds = this.core.selectedObjectIds;
    if (selectedIds.size === 0) {
      if (this.selectedContainer) {
        this.selectedContainer.visible = false;
      }
    } else {
      if (!this.selectedContainer) {
        this.selectedContainer = new PIXI.Container();
        this.world.addChild(this.selectedContainer);
      }
      this.selectedContainer.visible = true;
      this.selectedContainer.children.forEach(child => child.destroy(true));
      this.selectedContainer.removeChildren();
      for (const id of selectedIds) {
        const obj = this.core.objects.find(o => o.id === id);
        if (!obj) {
          continue;
        }
        const pixiObject = drawObjectToPixi(obj);
        if (pixiObject) {
          this.selectedContainer.addChild(pixiObject);
        }
      }
    }
  }

  private computeVisibleWorldBounds(viewport: Viewport): PIXI.Rectangle {
    const visibleX = -viewport.offsetX / viewport.scale;
    const visibleY = -viewport.offsetY / viewport.scale;
    const visibleWidth = viewport.width / viewport.scale;
    const visibleHeight = viewport.height / viewport.scale;
    return new PIXI.Rectangle(visibleX, visibleY, visibleWidth, visibleHeight);
  }
}

