import { v4 as uuidv4 } from 'uuid';
import type { FastDrawCore } from './FastDrawCore';
import { findHitObject } from '../utils/HitTestUtils';
import * as PIXI from 'pixi.js';
import { DrawMode, DrawType, type DrawModePaint } from '../types';

export class EventHandler {
  private core: FastDrawCore;
  private panState = { isPanning: false, startX: 0, startY: 0 };
  private isDrawing = false;
  private touchStartDistance = 0;
  private startX1 = 0;
  private startY1 = 0;
  private startX2 = 0;
  private startY2 = 0;
  private isPinching = false;
  justAddedText = false;
  private lastMouseMoveTime = 0;
  private readonly throttleInterval = 8; // ms, roughly 120fps

  constructor(core: FastDrawCore) {
    this.core = core;
  }

  private setPanState(newState: { isPanning: boolean, startX?: number, startY?: number }): void {
    this.panState = { ...this.panState, ...newState };
    this.core.emit('panStateChange', newState);
  }

  public attach(element: HTMLElement): void {
    element.addEventListener('mousedown', this.handleMouseDown);
    element.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    element.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    document.addEventListener('touchend', this.handleTouchEnd);
    element.addEventListener('wheel', this.handleWheel, { passive: false });
    element.addEventListener('click', this.handleCanvasClick);
    element.addEventListener('contextmenu', e => e.preventDefault());
  }

  public detach(element: HTMLElement): void {
    element.removeEventListener('mousedown', this.handleMouseDown);
    element.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    element.removeEventListener('touchstart', this.handleTouchStart);
    element.removeEventListener('touchmove', this.handleTouchMove);
    document.removeEventListener('touchend', this.handleTouchEnd);
    element.removeEventListener('wheel', this.handleWheel);
    element.removeEventListener('click', this.handleCanvasClick);
    element.removeEventListener('contextmenu', e => e.preventDefault());
  }

  // --- Event Handlers ---

  /**
  * Checks if the event target is inside a contenteditable element.
  */
  private isInsideContentEditable(event: MouseEvent | TouchEvent): boolean {
    const target = event.target as HTMLElement;
    return !!target.closest('[contenteditable="true"]');
  }

  private handleSingleTouchStart = (event: TouchEvent) => {
    // Don't interfere with text editing
    if (this.isInsideContentEditable(event)) {
      return;
    }

    const coords = this.core.getTransformedCoordinates(event);
    if (!coords) {
      console.log('[DEBUG EventHandler] no coords, skip');
      return;
    }

    if (this.core.drawingMode === DrawMode.SELECT) {
      const searchBounds = new PIXI.Rectangle(coords.x - 1, coords.y - 1, 2, 2);
      const candidates = this.core.findObjectsIn(searchBounds);
      const hitObject = findHitObject(coords, candidates);

      if (hitObject) {
        this.core.selectObject(hitObject.id, false);
      } else {
        this.core.clearSelection();
      }

    } else if (this.core.drawingMode === DrawMode.PAN) {
      this.handlePanStart(event);
    } else if (this.core.drawingMode === DrawMode.TEXT) {
      this.core.stopEditingText();

      const newText = {
        id: uuidv4(),
        type: DrawType.TEXT as const,
        x: coords.x,
        y: coords.y,
        text: 'Введите текст',
        color: this.core.brushColor,
        fontSize: this.core.fontSize,
        isEditing: true,
        deleted: false,
      };
      this.core.currentText = newText;
      this.justAddedText = true;
      // Emit event for frameworks to focus the new text element
      this.core.emit('textAdded', newText);
      this.core.drawingMode = DrawMode.PAN;

    } else { // 'draw' or 'erase'
      this.handleDrawStart(event);
    }
  };

  private handleSingleTouchEnd = (event: TouchEvent) => {
    if (this.justAddedText) {
      return;
    }

    // Don't interfere with text editing
    if (this.isInsideContentEditable(event)) {
      return;
    }

    if (this.isDrawing || this.panState.isPanning) {
      event.preventDefault();

      console.log('[DEBUG EventHandler] singleTouchEnd', {
        isDrawing: this.isDrawing,
        isPanning: this.panState.isPanning,
        points: this.core.currentPath?.points.length ?? 0,
      });

      if (this.isDrawing) {
        this.handleDrawEnd();
      }

      if (this.panState.isPanning) {
        this.handlePanEnd();
      }
    }
  };

  private handleDrawStart = (event: MouseEvent | TouchEvent) => {
    event.preventDefault();
    this.isDrawing = true;

    const coords = this.core.getTransformedCoordinates(event);
    if (!coords) {
      console.log('[DEBUG EventHandler] no coords, skip');
      return;
    }

    const newPath = {
      id: uuidv4(),
      type: DrawType.PATH as const,
      points: [coords],
      color: this.core.brushColor,
      thickness: this.core.brushThickness,
      mode: this.core.drawingMode as DrawModePaint,
      deleted: false,
    };

    this.core.currentPath = newPath;
    this.core.emit('currentPathUpdate', this.core.currentPath);
  };

  private handleDrawMove = (event: MouseEvent | TouchEvent) => {
    const coords = this.core.getTransformedCoordinates(event);
    if (coords && this.core.currentPath) {
      const lastPoint = this.core.currentPath.points[this.core.currentPath.points.length - 1];
      const dist = Math.hypot(coords.x - lastPoint.x, coords.y - lastPoint.y);
      const minDist = this.core.brushThickness / 4;
      if (dist > minDist) {
        this.core.currentPath.points.push(coords);
        this.core.emit('currentPathUpdate', this.core.currentPath);
      }
    }
  };

  private handleDrawEnd = () => {
    if (this.isDrawing && this.core.currentPath) {
      console.log('[DEBUG EventHandler] save path', this.core.currentPath.id, 'points', this.core.currentPath.points.length);
      this.core.save(this.core.currentPath);

      this.core.currentPath = null;
      this.core.emit('currentPathUpdate', null);
    }
    this.isDrawing = false;
  };

  private handleSingleTouchMove = (event: TouchEvent) => {
    const now = Date.now();
    if (now - this.lastMouseMoveTime < this.throttleInterval) {
      return;
    }
    this.lastMouseMoveTime = now;

    // Don't interfere with text editing (cursor movement, selection)
    if (this.isInsideContentEditable(event)) {
      return;
    }

    if (this.isDrawing || this.panState.isPanning) {
      event.preventDefault();
    }

    if (this.panState.isPanning) {
      this.handlePanMove(event);
    } else if (this.isDrawing) {
      this.handleDrawMove(event);
    }

    // Emit cursor move event for custom cursor UI
    const { clientX, clientY } = this.getEventCoordinates(event);
    this.core.emit('cursorMove', clientX, clientY);
  };

  private handlePanStart = (event: MouseEvent | TouchEvent) => {
    event.preventDefault();
    this.setPanState({ isPanning: true });
    const { clientX, clientY } = this.getEventCoordinates(event);
    this.panState.startX = clientX - this.core.transformState.offsetX;
    this.panState.startY = clientY - this.core.transformState.offsetY;
  };

  private handlePanMove = (event: MouseEvent | TouchEvent) => {
    const { clientX, clientY } = this.getEventCoordinates(event);
    this.core.transformState.offsetX = clientX - this.panState.startX;
    this.core.transformState.offsetY = clientY - this.panState.startY;
    this.core.updateLodLevel();
    this.core.emit('transform', this.core.transformState);
  };

  private handlePanEnd = () => {
    this.setPanState({ isPanning: false });
  };

  handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.isPinching = true;
      this.startX1 = event.touches[0].clientX;
      this.startY1 = event.touches[0].clientY;
      this.startX2 = event.touches[1].clientX;
      this.startY2 = event.touches[1].clientY;
      this.touchStartDistance = this.getDistance(this.startX1, this.startY1, this.startX2, this.startY2);
    } else if (event.touches.length === 1) {
      this.handleSingleTouchStart(event);
    }
  };

  handleMouseDown = (event: MouseEvent) => {
    // Right mouse button should activate panning
    if (event.button === 2) {
      this.handlePanStart(event);
      return;
    }

    // --- Continue with left-click logic ---

    console.log('[DEBUG EventHandler] mouseDown fired, mode:', this.core.drawingMode);
    // Don't interfere with text editing
    if (this.isInsideContentEditable(event)) {
      console.log('[DEBUG EventHandler] inside contentEditable, skip');
      return;
    }

    const coords = this.core.getTransformedCoordinates(event);
    if (!coords) {
      console.log('[DEBUG EventHandler] no coords, skip');
      return;
    }
    console.log('[DEBUG EventHandler] mouseDown mode:', this.core.drawingMode, 'coords:', coords);

    if (this.core.drawingMode === DrawMode.SELECT) {
      const searchBounds = new PIXI.Rectangle(coords.x - 1, coords.y - 1, 2, 2);
      const candidates = this.core.findObjectsIn(searchBounds);
      const hitObject = findHitObject(coords, candidates);

      if (hitObject) {
        this.core.selectObject(hitObject.id, event.shiftKey);
      } else {
        this.core.clearSelection();
      }

    } else if (this.core.drawingMode === DrawMode.PAN) {
      this.handlePanStart(event);
    } else if (this.core.drawingMode === DrawMode.TEXT) {
      this.core.stopEditingText();

      const newText = {
        id: uuidv4(),
        type: DrawType.TEXT as const,
        x: coords.x,
        y: coords.y,
        text: 'Введите текст',
        color: this.core.brushColor,
        fontSize: this.core.fontSize,
        isEditing: true,
        deleted: false,
      };
      this.core.currentText = newText;
      this.justAddedText = true;
      // Emit event for frameworks to focus the new text element
      this.core.emit('textAdded', newText);
      this.core.drawingMode = DrawMode.PAN;

    } else { // 'draw' or 'erase'
      this.handleDrawStart(event);
    }
  };

  handleMouseMove = (event: MouseEvent) => {
    const now = Date.now();
    if (now - this.lastMouseMoveTime < this.throttleInterval) {
      return;
    }
    this.lastMouseMoveTime = now;

    // Don't interfere with text editing (cursor movement, selection)
    if (this.isInsideContentEditable(event)) {
      return;
    }

    if (this.isDrawing || this.panState.isPanning) {
      event.preventDefault();
    }

    if (this.panState.isPanning) {
      this.handlePanMove(event);
    } else if (this.isDrawing) {
      this.handleDrawMove(event);
    }

    // Emit cursor move event for custom cursor UI
    const { clientX, clientY } = this.getEventCoordinates(event);
    this.core.emit('cursorMove', clientX, clientY);
  };

  handleTouchMove = (event: TouchEvent) => {
    if (this.isPinching) {
      if (event.touches.length < 2) {
        // Если было два касания, а стало меньше, значит щипок закончился
        this.isPinching = false;
        this.touchStartDistance = 0;
        return;
      }
      event.preventDefault();

      const currentX1 = event.touches[0].clientX;
      const currentY1 = event.touches[0].clientY;
      const currentX2 = event.touches[1].clientX;
      const currentY2 = event.touches[1].clientY;
      const currentDistance = this.getDistance(currentX1, currentY1, currentX2, currentY2);

      const { offsetX, offsetY, scale } = this.core.transformState;

      const rect = this.core.getCanvasBoundingRect();
      if (!rect) return;

      const clientX = (currentX1 + currentX2) / 2;
      const clientY = (currentY1 + currentY2) / 2;

      const mouseX = clientX - rect.left;
      const mouseY = clientY - rect.top;

      const mousePointX = (mouseX - offsetX) / scale;
      const mousePointY = (mouseY - offsetY) / scale;

      const zoom = currentDistance / this.touchStartDistance;
      const newScale = Math.max(0.1, Math.min(10, scale * zoom));

      this.core.transformState.offsetX = mouseX - mousePointX * newScale;
      this.core.transformState.offsetY = mouseY - mousePointY * newScale;
      this.core.transformState.scale = newScale;
      this.core.updateLodLevel();

      this.core.emit('transform', this.core.transformState);

      this.touchStartDistance = currentDistance;
    } else if (event.touches.length === 1) {
      this.handleSingleTouchMove(event);
    }
  };

  handleMouseUp = (event: MouseEvent) => {
    const isMouseEvent = 'button' in event;

    // Stop panning on right-click up
    if (isMouseEvent && (event as MouseEvent).button === 2) {
      this.handlePanEnd();
      event.preventDefault();
      return;
    }

    if (this.justAddedText) {
      return;
    }

    // Don't interfere with text editing
    if (this.isInsideContentEditable(event)) {
      return;
    }

    if (this.isDrawing || this.panState.isPanning) {
      event.preventDefault();

      console.log('[DEBUG EventHandler] mouseUp', {
        isDrawing: this.isDrawing,
        isPanning: this.panState.isPanning,
        points: this.core.currentPath?.points.length ?? 0,
      });

      if (this.isDrawing) {
        this.handleDrawEnd();
      }

      if (this.panState.isPanning) {
        this.handlePanEnd();
      }
    }
  };

  handleTouchEnd = (event: TouchEvent) => {
    if (this.isPinching) {
      this.isPinching = false;
      this.touchStartDistance = 0;
    } else if (event.touches.length === 0) {
      this.handleSingleTouchEnd(event);
    }
  };

  handleCanvasClick = () => {
    if (this.justAddedText) {
      this.justAddedText = false;
      return;
    }
    // If the click is not on a text editor, finish editing.
    this.core.stopEditingText();
  };

  handleWheel = (event: WheelEvent) => {
    // Don't interfere with text editing (scrolling in text)
    if (this.isInsideContentEditable(event)) {
      return;
    }

    event.preventDefault();

    const { clientX, clientY, deltaY } = event;
    const { offsetX, offsetY, scale } = this.core.transformState;

    // This needs the SVG element's rect, which should be passed from the adapter.
    // For now, let's assume the canvas is the whole window for simplicity.
    // A proper implementation needs the container's getBoundingClientRect().
    const rect = this.core.getCanvasBoundingRect();
    if (!rect) return;

    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const mousePointX = (mouseX - offsetX) / scale;
    const mousePointY = (mouseY - offsetY) / scale;

    const zoom = Math.exp(-deltaY * this.core.zoomSensitivity);
    const newScale = Math.max(0.1, Math.min(10, scale * zoom));

    this.core.transformState.offsetX = mouseX - mousePointX * newScale;
    this.core.transformState.offsetY = mouseY - mousePointY * newScale;
    this.core.transformState.scale = newScale;
    this.core.updateLodLevel();

    this.core.emit('transform', this.core.transformState);
  };


  // --- UTILS ---

  private getDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  private getEventCoordinates(event: MouseEvent | TouchEvent): { clientX: number, clientY: number } {
    if ('touches' in event) {
      const touch = event.touches[0];
      return { clientX: touch?.clientX ?? 0, clientY: touch?.clientY ?? 0 };
    }
    return { clientX: event.clientX, clientY: event.clientY };
  }
}
