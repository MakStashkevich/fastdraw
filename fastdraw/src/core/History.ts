import { Command } from './Command';
import type { ObjectStore } from './ObjectStore';

const MAX_HISTORY_LENGTH = 30;

export class History {
  private stack: Command[] = [];
  private cursor = -1;

  constructor(private readonly store: ObjectStore) {}

  push(command: Command): void {
    // Clear redo stack by truncating to cursor +1
    this.stack.length = this.cursor + 1;
    this.stack.push(command);
    this.cursor = this.stack.length - 1;

    command.do(this.store);

    // Limit history length
    if (this.stack.length > MAX_HISTORY_LENGTH) {
      this.stack.shift();
      this.cursor--;
    }
  }

  undo(): void {
    console.log('[DEBUG History] undo called, cursor before:', this.cursor);
    if (this.cursor >= 0) {
      this.stack[this.cursor].undo(this.store);
      this.cursor--;
      console.log('[DEBUG History] undo done, cursor after:', this.cursor);
    }
  }

  redo(): void {
    console.log('[DEBUG History] redo called, cursor before:', this.cursor);
    if (this.cursor < this.stack.length - 1) {
      this.cursor++;
      this.stack[this.cursor].do(this.store);
      console.log('[DEBUG History] redo done, cursor after:', this.cursor);
    }
  }

  clean(): void {
    this.stack = [];
    this.cursor = -1;
  }

  get canUndo(): boolean {
    return this.cursor >= 0;
  }

  get canRedo(): boolean {
    return this.cursor < this.stack.length - 1;
  }
}
