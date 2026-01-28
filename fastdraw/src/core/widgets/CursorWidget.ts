import { DrawMode } from "../../types";
import { getCursorStyle } from "../../utils/CursorUtils";
import type { FastDrawCore } from "../FastDrawCore";
import { Widget } from "./Widget";

export class CursorWidget extends Widget {
  private element!: HTMLDivElement;

  private lastCursorX = 0;
  private lastCursorY = 0;

  constructor(core: FastDrawCore, container: HTMLElement) {
    super(core, container);
    this.createElement();
  }

  public createElement() {
    this.element = document.createElement('div');
    this.element.style.pointerEvents = 'none';
    this.element.style.position = 'absolute';
    this.element.style.borderRadius = '50%';
    this.element.style.borderWidth = '1px';
    this.element.style.borderColor = 'black';
    this.element.style.borderStyle = 'solid';
    this.element.style.opacity = '0.1';
    this.element.style.willChange = 'transform';
    const size = this.core.brushThickness * this.core.transformState.scale;
    this.element.style.width = `${size}px`;
    this.element.style.height = `${size}px`;
    this.element.style.visibility = 'hidden'; // Initially hidden
    this.element.style.zIndex = '10';
    this.container.appendChild(this.element);
  }

  public initialize(): void {
    this.core.on('cursorMove', this.handleCursorMove);
    this.core.on('brushChange', this.handleBrushChange);
    this.core.on('transform', this.handleTransformChange);
    this.core.on('modeChange', this.handleModeChange);
    this.core.on('panStateChange', this.handlePanStateChange);
    this.container.addEventListener('mouseenter', this.handleMouseEnter);
    this.container.addEventListener('mouseleave', this.handleMouseLeave);
  }

  public destroy() {
    this.core.off('cursorMove', this.handleCursorMove);
    this.core.off('brushChange', this.handleBrushChange);
    this.core.off('transform', this.handleTransformChange);
    this.core.off('modeChange', this.handleModeChange);
    this.core.off('panStateChange', this.handlePanStateChange);
    this.container.removeEventListener('mouseenter', this.handleMouseEnter);
    this.container.removeEventListener('mouseleave', this.handleMouseLeave);
  }

  private handleCursorMove = (x: number, y: number) => {
    this.lastCursorX = x;
    this.lastCursorY = y;
    const rect = this.container.getBoundingClientRect();
    const cursorSize = parseFloat(this.element.style.width);
    this.element.style.transform = `translate(${x - rect.left - cursorSize / 2}px, ${y - rect.top - cursorSize / 2}px)`;
  }

  private handleBrushChange = (brush: { color: string, thickness: number }) => {
    const size = brush.thickness * this.core.transformState.scale;
    this.element.style.width = `${size}px`;
    this.element.style.height = `${size}px`;
  }

  private handleTransformChange = () => {
    const size = this.core.brushThickness * this.core.transformState.scale;
    this.element.style.width = `${size}px`;
    this.element.style.height = `${size}px`;

    // Recalculate position on transform change
    const rect = this.container.getBoundingClientRect();
    this.element.style.transform = `translate(${this.lastCursorX - rect.left - size / 2}px, ${this.lastCursorY - rect.top - size / 2}px)`;
  }

  private get canVisiblePenStyle(): boolean {
    return this.core.drawingMode === DrawMode.DRAW || this.core.drawingMode === DrawMode.ERASE;
  }

  private handleMouseEnter = () => {
    if (!this.canVisiblePenStyle) return;
    this.element.style.visibility = 'visible';
  }

  private handleMouseLeave = () => {
    this.element.style.visibility = 'hidden';
  }

  private handleModeChange = (mode: DrawMode) => {
    const wrapper = this.core.getWrapperElement();
    if (wrapper) {
      wrapper.style.cursor = getCursorStyle(mode);
    }
  }

  private handlePanStateChange = (state: { isPanning: boolean }) => {
    this.element.style.visibility = state.isPanning ? 'hidden' : (this.canVisiblePenStyle ? 'visible' : 'hidden');

    const wrapper = this.core.getWrapperElement();
    if (wrapper) {
      wrapper.style.cursor = getCursorStyle(state.isPanning ? DrawMode.PANNING : this.core.drawingMode);
    }
  }
}
