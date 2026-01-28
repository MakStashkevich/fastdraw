import type { ObjectStore } from './ObjectStore';

export interface Command {
  do(store: ObjectStore): void;
  undo(store: ObjectStore): void;
}
