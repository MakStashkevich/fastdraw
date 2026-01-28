import { DrawObjectBase } from './DrawObject';
import { type Point, type DrawPath, DrawType, type DrawModePaint } from '../types';

export class Path extends DrawObjectBase implements Omit<DrawPath, 'id' | 'type'> {
  points: Point[];
  color: string;
  thickness: number;
  mode: DrawModePaint;

  constructor(properties: Omit<DrawPath, 'id' | 'type' | 'deleted'>) {
    super(DrawType.PATH);
    this.points = properties.points;
    this.color = properties.color;
    this.thickness = properties.thickness;
    this.mode = properties.mode;
  }
}
