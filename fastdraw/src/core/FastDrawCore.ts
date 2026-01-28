import { History } from './History';
import { ObjectStore } from './ObjectStore';
import { AddObjectCommand, UpdateObjectCommand } from './Commands';
import { Command } from './Command';
import { EventHandler } from './EventHandler';
import { HybridRenderer } from './render/HybridRenderer';
import { v4 as uuidv4 } from 'uuid';
import * as PIXI from 'pixi.js';
import {
  DrawObject,
  FastDrawData,
  Point,
  DrawPath,
  DrawText,
  DrawImage,
  DrawObjectId,
  DrawMode,
  LODLevel,
  DrawType,
} from '../types';

// --- Monitors ---
import '../monitors/PerformanceMonitor';
import '../monitors/DebugMonitor';

type FastDrawEvents = {
  objectsUpdate: (objects: DrawObject[]) => void;
  transform: (transform: { scale: number; offsetX: number; offsetY: number; lodLevel: LODLevel }) => void;
  modeChange: (mode: DrawMode) => void;
  textAdded: (textObject: DrawText) => void;
  currentPathUpdate: (path: DrawPath | null) => void;
  selectionChange: (selectedIds: Set<DrawObjectId>) => void;
  toolbarOpenChange: (isOpen: boolean) => void;
  render: () => void;
  cursorMove: (x: number, y: number) => void;
  brushChange: (brush: { color: string; thickness: number }) => void;
  panStateChange: (state: { isPanning: boolean, startX?: number, startY?: number }) => void;
};

export class FastDrawCore {
  // --- Public State ---
  private objectStore: ObjectStore;
  get objects(): DrawObject[] {
    return this.objectStore.getAll();
  }
  currentPath: DrawPath | null = null;
  selectedObjectIds: Set<DrawObjectId> = new Set();
  private _drawingMode: DrawMode = DrawMode.PAN;
  brushColor = '#000000';
  brushThickness = 15;
  fontSize = 16;
  currentText: DrawText | null = null;
  isToolbarOpen = false;
  zoomSensitivity = 0.01;

  transformState = {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    lodLevel: LODLevel.Mid,
  };

  private readonly lodBands = {
    near: 1.5,
    mid: 1.0,
    far: 0.3,
  } as const;

  private readonly lodHysteresis = {
    enter: 0.1,
    exit: 0.15,
  } as const;

  // --- Modules ---
  private history: History;
  eventHandler: EventHandler;
  private hybridRenderer: HybridRenderer | null = null;

  // --- Private State ---
  private eventListeners: { [K in keyof FastDrawEvents]?: FastDrawEvents[K][] } = {};
  private canvasBoundingRect: DOMRect | null = null;
  private wrapperElement: HTMLElement | null = null;
  private disabledEmits: { [key: string]: boolean } = {};

  private instanceId: string;

  constructor(initialData?: FastDrawData, wrapperContainer?: HTMLElement) {
    this.instanceId = uuidv4();
    console.log('[DEBUG WhiteboardCore] constructor called, ID:', this.instanceId);

    this.objectStore = this.initializeObjectStore(initialData?.objects);
    this.history = new History(this.objectStore);
    this.eventHandler = new EventHandler(this);
    console.log('[DEBUG WhiteboardCore] Initial data loaded, objects count:', this.objects.length);

    if (wrapperContainer) {
      this.setWrapperElement(wrapperContainer);
    }
  }

  // --- Getters/Setters ---

  get drawingMode(): DrawMode {
    return this._drawingMode;
  }

  set drawingMode(mode: DrawMode) {
    this.clearSelection();
    this._drawingMode = mode;
    this.emit('modeChange', mode);
  }

  // --- Public API ---

  on<K extends keyof FastDrawEvents>(event: K, listener: FastDrawEvents[K]): void {
    let listeners = this.eventListeners[event] as FastDrawEvents[K][] | undefined;
    if (!listeners) {
      listeners = [];
      (this.eventListeners as any)[event] = listeners;
    }
    listeners.push(listener);
    console.log(this.eventListeners);
  }

  off<K extends keyof FastDrawEvents>(event: K, listener: FastDrawEvents[K]): void {
    const listeners = this.eventListeners[event];
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit<K extends keyof FastDrawEvents>(event: K, ...args: Parameters<FastDrawEvents[K]>): void {
    if (this._isDisabledEmit(event)) return;
    const listenersArray = this.eventListeners[event] as any[] | undefined;
    if (listenersArray && listenersArray.length > 0) {
      // Create a copy of the array to avoid issues if a listener is removed while iterating
      const listenersCopy = [...listenersArray];
      for (const listener of listenersCopy) {
        (listener as (...args: any[]) => void)(...args);
      }
    }
  }

  setBrush(newBrush: { color?: string; thickness?: number }): void {
    if (newBrush.color) {
      this.brushColor = newBrush.color;
    }
    if (newBrush.thickness) {
      this.brushThickness = newBrush.thickness;
    }
    this.emit('brushChange', { color: this.brushColor, thickness: this.brushThickness });
  }

  loadData(data: FastDrawData): void {
    this.objectStore = this.initializeObjectStore(data.objects);
    this.history = new History(this.objectStore);
    this.emit('objectsUpdate', this.objectStore.getAll());
  }

  clearSelection(): void {
    if (this.selectedObjectIds.size > 0) {
      this.selectedObjectIds.clear();
      this.emit('selectionChange', this.selectedObjectIds);
    }
  }

  selectObject(objectId: DrawObjectId, additive = false): void {
    if (!additive) {
      // If not additive, clear previous selection unless the clicked object is already the only one selected
      if (this.selectedObjectIds.size !== 1 || !this.selectedObjectIds.has(objectId)) {
        this.selectedObjectIds.clear();
        this.selectedObjectIds.add(objectId);
        this.emit('selectionChange', this.selectedObjectIds);
      }
    } else {
      // Additive selection
      if (this.selectedObjectIds.has(objectId)) {
        this.selectedObjectIds.delete(objectId); // Toggle off if already selected
      } else {
        this.selectedObjectIds.add(objectId);
      }
      this.emit('selectionChange', this.selectedObjectIds);
    }
  }

  /**
   * Finds objects within a given rectangular area using the quadtree.
   * @param bounds The rectangular area to search in.
   * @returns A (potentially empty) array of objects found in the area.
   */
  findObjectsIn(bounds: PIXI.Rectangle): DrawObject[] {
    return this.objectStore.findObjectsIn(bounds);
  }

  setCanvasBoundingRect(rect: DOMRect): void {
    this.canvasBoundingRect = rect;
  }

  getCanvasBoundingRect(): DOMRect | null {
    return this.canvasBoundingRect;
  }

  setWrapperElement(element: HTMLElement): void {
    // Update event handlers
    this.destroyEventHandlers();
    this.eventHandler.attach(element);
    this.wrapperElement = element;

    // Initialize renders
    this.initializeRenders();

    // Update view and LOD
    this.initializeView();
    this.updateLodLevel();
  }

  getWrapperElement(): HTMLElement | null {
    return this.wrapperElement;
  }

  /**
   * Initializes the view by centering it.
   */
  private initializeView(): void {
    if (!this.wrapperElement) return;

    const wrapperWidth = this.wrapperElement.clientWidth;
    const wrapperHeight = this.wrapperElement.clientHeight;

    // Center the initial view at 0,0 world coordinates
    this.transformState.scale = 1;
    this.transformState.offsetX = wrapperWidth / 2;
    this.transformState.offsetY = wrapperHeight / 2;
    this.emit('transform', this.transformState);
  }

  private initializeRenders(): void {
    if (!this.wrapperElement) return;

    this.destroyRenders();
    this.hybridRenderer = new HybridRenderer(this, this.wrapperElement);
  }

  destroyRenders(): void {
    if (this.hybridRenderer) {
      this.hybridRenderer.destroy();
      this.hybridRenderer = null;
    }
  }

  destroyEventHandlers(): void {
    if (this.wrapperElement) {
      this.eventHandler.detach(this.wrapperElement);
      this.wrapperElement = null;
    }
  }

  destroy(): void {
    this.destroyRenders();
    this.destroyEventHandlers();

    this.history.clean();
    this.objectStore.release();
  }

  /**
   * Updates the canvas bounding rect. Should be called on resize.
   */
  updateBoundingRect(element: HTMLElement): void {
    this.canvasBoundingRect = element.getBoundingClientRect();
  }

  getTransformedCoordinates(event: MouseEvent | TouchEvent): Point | null {
    if (!this.canvasBoundingRect) {
      console.log('[DEBUG WhiteboardCore] getTransformedCoordinates no rect');
      return null;
    }
    const { clientX, clientY } = this.eventHandler['getEventCoordinates'](event);

    const rect = this.canvasBoundingRect;
    const svgX = clientX - rect.left;
    const svgY = clientY - rect.top;

    const logicalX = (svgX - this.transformState.offsetX) / this.transformState.scale;
    const logicalY = (svgY - this.transformState.offsetY) / this.transformState.scale;

    return { x: logicalX, y: logicalY };
  }

  addObject(obj: DrawObject, saveHistory = true): void {
    console.log('[LOD] addObject, current lodLevel:', this.transformState.lodLevel, 'scale:', this.transformState.scale);
    const pointsLen = 'points' in obj ? (obj as any).points?.length || 0 : 0;
    const objSizeMB = JSON.stringify(obj).length / 1024 / 1024;
    console.log('[DEBUG WhiteboardCore] addObject type:', obj.type, 'id:', obj.id.slice(0, 8), 'points:', pointsLen, 'sizeMB:', objSizeMB.toFixed(2));
    if (saveHistory) {
      this.save(obj);
    } else {
      this.objectStore.add(obj);
    }
    console.log('[DEBUG WhiteboardCore] objectsUpdate emitted with count:', this.objects.length);
  }

  addObjects(objects: DrawObject[], saveHistory = false): void {
    const totalSizeMB = objects.reduce((sum, obj) => sum + JSON.stringify(obj).length / 1024 / 1024, 0);
    console.log(`[DEBUG WhiteboardCore] addObjects: ${objects.length} objects, totalSizeMB: ${totalSizeMB.toFixed(2)}`);

    const startTime = performance.now();

    if (saveHistory) {
      this._disableEmit('objectsUpdate', true);
      for (const obj of objects) {
        this.save(obj);
      }
      this._disableEmit('objectsUpdate', false);
    } else {
      const addObjectsToStoreStartTime = performance.now();
      objects.forEach(obj => this.objectStore.add(obj));
      const addObjectsToStoreEndTime = performance.now();
      console.log(`[DEBUG WhiteboardCore] Time to add objects to objectStore: ${(addObjectsToStoreEndTime - addObjectsToStoreStartTime).toFixed(2)} ms`);
    }

    console.log('[DEBUG WhiteboardCore] objects count after addObjects:', this.objects.length);
        console.log('[DEBUG WhiteboardCore] objectStore size after addObjects:', this.objectStore.getStoreSizeMB().toFixed(2), 'MB');

    const emitObjectsUpdateStartTime = performance.now();
    this.emit('objectsUpdate', this.objects);
    const emitObjectsUpdateEndTime = performance.now();
    console.log(`[DEBUG WhiteboardCore] Time to emit objectsUpdate event: ${(emitObjectsUpdateEndTime - emitObjectsUpdateStartTime).toFixed(2)} ms`);

    const endTime = performance.now();
    console.log(`[DEBUG WhiteboardCore] Total addObjects execution time: ${(endTime - startTime).toFixed(2)} ms`);
  }

  async addImage(src: string, x: number, y: number, width: number, height: number): Promise<void> {
    try {
      await PIXI.Assets.load(src); // Загружаем изображение через PixiJS Assets
      const imageObject: DrawImage = {
        id: uuidv4(),
        type: DrawType.IMAGE,
        src,
        width,
        height,
        x,
        y,
        locked: true,
        deleted: false,
      };
      this.addObject(imageObject);
    } catch (error) {
      console.error('Failed to load image with PixiJS Assets in WhiteboardCore:', error);
      // Возможно, здесь нужно будет emit'ить событие об ошибке
    }
  }

  removeObject(id: DrawObjectId, saveHistory = true): void {
    this.selectedObjectIds.delete(id); // Deselect if it was selected
    this.emit('selectionChange', this.selectedObjectIds);

    const obj = this.objectStore.get(id);
    if (!obj) {
      return;
    }

    const oldObj = JSON.parse(JSON.stringify(obj));
    obj.deleted = true;

    if (saveHistory) {
      this.history.push(new UpdateObjectCommand(id, oldObj, obj));
    }

    this.emit('objectsUpdate', this.objects);
    console.log('[DEBUG WhiteboardCore] total objects:', this.objects.length, 'approx total data MB:', (JSON.stringify(this.objects).length / 1024 / 1024).toFixed(2));
  }

  stopEditingText = () => {
    if (this.currentText) {
      if (this.currentText.text.trim() === '') {
        // discard
      } else {
        const fullText = { ...this.currentText, isEditing: false };
        this.commitText(fullText);
      }
      this.currentText = null;
    }
    this.emit('objectsUpdate', this.objects);
  };

  private _disableEmit(event: string, status: boolean = true): void {
    if (status) {
      this.disabledEmits[event] = true;
    } else {
      delete this.disabledEmits[event];
    }
  }

  private _isDisabledEmit(event: string): boolean {
    return event in this.disabledEmits && this.disabledEmits[event] === true;
  }

  /** Save state to history & update objects list */
  save(obj: DrawObject): void {
    const existing = this.objectStore.get(obj.id);
    let command: Command;
    if (existing) {
      const oldObj = JSON.parse(JSON.stringify(existing));
      command = new UpdateObjectCommand(obj.id, oldObj, obj);
    } else {
      command = new AddObjectCommand(obj);
    }
    this.history.push(command);
    this.emit('objectsUpdate', this.objects);
  }

  undo(): void {
    console.log('[DEBUG WhiteboardCore] undo before, objects:', this.objects.length, 'deleted:', this.objects.filter(o => o.deleted).length);
    this.history.undo();
    this.clearSelection();
    this.emit('objectsUpdate', this.objects);
    console.log('[DEBUG WhiteboardCore] undo after emit, objects:', this.objects.length, 'deleted:', this.objects.filter(o => o.deleted).length);
  }

  redo(): void {
    console.log('[DEBUG WhiteboardCore] redo before, objects:', this.objects.length, 'deleted:', this.objects.filter(o => o.deleted).length);
    this.history.redo();
    this.clearSelection();
    this.emit('objectsUpdate', this.objects);
    console.log('[DEBUG WhiteboardCore] redo after emit, objects:', this.objects.length, 'deleted:', this.objects.filter(o => o.deleted).length);
  }

  canUndo(): boolean {
    return this.history.canUndo;
  }

  canRedo(): boolean {
    return this.history.canRedo;
  }

  /**
   * Returns the current whiteboard data for saving.
   */
  getData(): FastDrawData {
    return {
      objects: this.objects,
    };
  }

  public getObjects(): DrawObject[] {
    return this.objects;
  }

  commitText(fullText: DrawText): void {
    const command = new AddObjectCommand(fullText);
    this.history.push(command);
    this.emit('objectsUpdate', this.objects);
  }

  public updateLodLevel(): void {
    const currentLevel = this.transformState.lodLevel;
    const nextLevel = this.resolveLodLevel(this.transformState.scale);

    if (currentLevel === nextLevel) {
      return;
    }

    const entering = nextLevel < currentLevel;
    const hysteresis = entering ? this.lodHysteresis.enter : this.lodHysteresis.exit;

    const canSwitch = entering
      ? this.transformState.scale > this.getEnterThreshold(currentLevel, hysteresis)
      : this.transformState.scale < this.getExitThreshold(currentLevel, hysteresis);

    if (canSwitch) {
      const prev = this.transformState.lodLevel;
      this.transformState.lodLevel = nextLevel;
      console.debug('[LOD] Switch', prev, '->', nextLevel, 'scale', this.transformState.scale);
    }
  }

  private resolveLodLevel(scale: number): LODLevel {
    if (scale > this.lodBands.near) {
      return LODLevel.Near;
    }
    if (scale > this.lodBands.mid) {
      return LODLevel.Mid;
    }
    if (scale > this.lodBands.far) {
      return LODLevel.Far;
    }
    return LODLevel.Overview;
  }

  private getEnterThreshold(level: LODLevel, hysteresis: number): number {
    switch (level) {
      case LODLevel.Overview:
        return this.lodBands.far + hysteresis;
      case LODLevel.Far:
        return this.lodBands.mid + hysteresis;
      case LODLevel.Mid:
        return this.lodBands.near + hysteresis;
      case LODLevel.Near:
      default:
        return Infinity;
    }
  }

  private getExitThreshold(level: LODLevel, hysteresis: number): number {
    switch (level) {
      case LODLevel.Near:
        return this.lodBands.near - hysteresis;
      case LODLevel.Mid:
        return this.lodBands.mid - hysteresis;
      case LODLevel.Far:
        return this.lodBands.far - hysteresis;
      case LODLevel.Overview:
      default:
        return 0;
    }
  }

  /**
   * Opens or closes the toolbar.
   */
  openToolBar(isOpen: boolean = true): void {
    this.isToolbarOpen = isOpen;
    this.emit('toolbarOpenChange', isOpen);
  }

  private initializeObjectStore(initialObjects?: DrawObject[]): ObjectStore {
    const store = new ObjectStore();
    if (initialObjects && initialObjects.length > 0) {
      store.bulkLoad(initialObjects);
    }
    return store;
  }
}
