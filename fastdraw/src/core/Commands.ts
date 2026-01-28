import { Command } from './Command';
import type { DrawObject } from '../types';
import type { ObjectStore } from './ObjectStore';

export class AddObjectCommand implements Command {
  constructor(private readonly obj: DrawObject) {}

  do(store: ObjectStore): void {
    store.add(this.obj);
  }

  undo(store: ObjectStore): void {
    store.remove(this.obj.id);
  }
}

export class RemoveObjectCommand implements Command {
  constructor(private readonly id: string, private readonly obj: DrawObject) {}

  do(store: ObjectStore): void {
    store.remove(this.id);
  }

  undo(store: ObjectStore): void {
    store.add(this.obj);
  }
}

export class UpdateObjectCommand implements Command {
  constructor(
    private readonly id: string, 
    private readonly oldObj: DrawObject, 
    private readonly newObj: DrawObject
  ) {}

  do(store: ObjectStore): void {
    store.update(this.id, this.newObj);
  }

  undo(store: ObjectStore): void {
    store.update(this.id, this.oldObj);
  }
}
