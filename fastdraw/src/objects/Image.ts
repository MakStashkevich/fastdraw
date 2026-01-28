import { DrawObjectBase } from './DrawObject';
import { DrawType, type DrawImage } from '../types';

export class Image extends DrawObjectBase implements Omit<DrawImage, 'id' | 'type'> {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  locked?: boolean;

  constructor(properties: Omit<DrawImage, 'id' | 'type' | 'deleted'>) {
    super(DrawType.IMAGE);
    this.src = properties.src;
    this.x = properties.x;
    this.y = properties.y;
    this.width = properties.width;
    this.height = properties.height;
    this.locked = properties.locked;
  }
}
