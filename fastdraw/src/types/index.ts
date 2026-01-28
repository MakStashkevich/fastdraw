import type { DebugMonitor } from "../monitors/DebugMonitor";
import type { PerformanceMonitor } from "../monitors/PerformanceMonitor";

declare global {
  interface Window {
    fastdraw: {
      perfomance: PerformanceMonitor;
      debug: DebugMonitor;
    };
  }
}

/**
 * Represents the viewport state.
 */
export interface Viewport {
  width: number; // pixel width of the viewport
  height: number; // pixel height of the viewport
  scale: number;
  offsetX: number;
  offsetY: number;
  lodLevel?: LODLevel;
}

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  minX?: number;
  minY?: number;
  maxX?: number;
  maxY?: number;
}

export const enum LODLevel {
  Near = 0,
  Mid = 1,
  Far = 2,
  Overview = 3,
}

export interface VisualDescriptor {
  lod: LODLevel;
  kind: 'full' | 'simplified' | 'skeleton' | 'hidden';
}

export interface LODState {
  active: LODLevel;
  target: LODLevel;
  lastUpdate: number;
  hysteresisRange: [number, number];
}

export interface DrawBase {
  id: string;
  deleted: boolean;
  zIndex?: number;
  bbox?: BoundingBox;
  visualVariants?: VisualDescriptor[];
  lodState?: LODState;
}

export enum DrawType {
  PATH = 'path',
  IMAGE = 'image',
  TEXT = 'text',
}

export interface DrawPath extends DrawBase {
  type: DrawType.PATH;
  points: Point[];
  color: string;
  thickness: number;
  mode: DrawModePaint;
}

export interface DrawImage extends DrawBase {
  type: DrawType.IMAGE;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;
}

export interface DrawText extends DrawBase {
  type: DrawType.TEXT;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  isEditing?: boolean;
  width?: number;
  height?: number;
}

export type DrawObject = DrawPath | DrawImage | DrawText;

export type DrawObjectId = string; // uuid v4

export interface FastDrawData {
  objects: DrawObject[];
}

export enum DrawMode {
  DRAW = 'draw',
  ERASE = 'erase',
  PAN = 'pan',
  PANNING = 'panning',
  TEXT = 'text',
  SELECT = 'select',
}

export type DrawModePaint = DrawMode.DRAW | DrawMode.ERASE;
export type DrawModeErase = DrawMode.ERASE;

export interface BoardDimensions {
  width: number;
  height: number;
}

export interface BoardApi {
  addElement: (element: DrawObject) => void;
  addImage: (src: string, x: number, y: number, width: number, height: number) => void;
  addObjects: (objects: DrawObject[], saveHistory?: boolean) => void;
  getBoardSize: () => BoardDimensions;
  setDrawingMode: (mode: DrawMode) => void;
  openToolBar: (isOpen?: boolean) => void;
}
