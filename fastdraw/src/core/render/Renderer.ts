import type { FastDrawCore } from '../FastDrawCore';

export abstract class Renderer {
  protected core: FastDrawCore;

  constructor(core: FastDrawCore) {
    this.core = core;
  }

  abstract render(): void;
  abstract initialize(): void;
  abstract destroy(): void;
}
