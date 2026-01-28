import type { FastDrawCore } from '../FastDrawCore';

export abstract class Widget {
  protected core: FastDrawCore;
  protected container: HTMLElement;

  constructor(core: FastDrawCore, container: HTMLElement) {
    this.core = core;
    this.container = container;
  }

  abstract createElement(): void;
  abstract initialize(): void;
  abstract destroy(): void;
}
