import { DrawObjectBase } from './DrawObject';
import { DrawType, type DrawText } from '../types';

export class Text extends DrawObjectBase implements Omit<DrawText, 'id' | 'type'> {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  isEditing?: boolean;
  width?: number;
  height?: number;

  constructor(properties: Omit<DrawText, 'id' | 'type' | 'deleted'>) {
    super(DrawType.TEXT);
    this.x = properties.x;
    this.y = properties.y;
    this.text = properties.text;
    this.color = properties.color;
    this.fontSize = properties.fontSize;
    this.isEditing = properties.isEditing;
    this.width = properties.width;
    this.height = properties.height;
  }
}
