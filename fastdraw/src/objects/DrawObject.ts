import { v4 as uuidv4 } from 'uuid';
import type { DrawObject } from '../types';

export abstract class DrawObjectBase {
  id: string;
  type: DrawObject['type'];
  deleted: boolean;
  zIndex?: number;

  constructor(type: DrawObject['type']) {
    this.id = uuidv4();
    this.type = type;
    this.deleted = false;
  }
}
