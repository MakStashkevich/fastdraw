import { type DrawObject, type DrawPath, type DrawImage, type DrawText, type BoundingBox, DrawType } from '../types';

export class ObjectUtils {
  static getObjectBoundingBox(object: DrawObject): BoundingBox {
    switch(object.type) {
        case DrawType.PATH:
            return ObjectUtils.getPathBoundingBox(object as DrawPath);
        case DrawType.IMAGE:
            const img = object as DrawImage;
            return { x: img.x, y: img.y, width: img.width, height: img.height };
        case DrawType.TEXT:
            const txt = object as DrawText;
            // This is a rough estimate. For accurate bounds, canvas measureText would be needed.
            const width = txt.width || (txt.text.length * txt.fontSize * 0.6);
            const height = txt.height || txt.fontSize;
            return { x: txt.x, y: txt.y - height, width, height }; // y is often the baseline, so adjust
    }
  }

  static getPathBoundingBox(path: DrawPath): BoundingBox {
    if (path.points.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of path.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    // Add padding for the stroke thickness
    const padding = path.thickness / 2;

    return {
      x: minX - padding,
      y: minY - padding,
      width: (maxX - minX) + path.thickness,
      height: (maxY - minY) + path.thickness,
    };
  }

  static ensureBoundingBox(obj: DrawObject): BoundingBox {
    if (!obj.bbox) {
      obj.bbox = ObjectUtils.getObjectBoundingBox(obj);
    }
    return obj.bbox!;
  }
}
