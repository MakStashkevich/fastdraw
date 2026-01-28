import { type DrawObject, type DrawPath, type Point, type DrawImage, type DrawText, DrawType } from '../types';

/**
 * Finds the topmost object that is hit by a given point.
 * @param point The point of interaction (e.g., a click).
 * @param objects An array of candidate objects to test against (e.g., from a quadtree query).
 * @returns The hit object or null if no object was hit.
 */
export function findHitObject(point: Point, objects: DrawObject[]): DrawObject | null {
  // Iterate backwards to find the topmost object first
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i];
    if (isPointInObject(point, object)) {
      return object;
    }
  }
  return null;
}

function isPointInObject(point: Point, object: DrawObject): boolean {
  switch (object.type) {
    case DrawType.PATH:
      return isPointOnPath(point, object as DrawPath);
    case DrawType.IMAGE:
      return isPointInRect(point, object as DrawImage);
    case DrawType.TEXT:
        // For text, a simple bounding box check is often sufficient.
        // A more precise check would involve rendering text to a hidden canvas.
      return isPointInRect(point, object as DrawText);
    default:
      return false;
  }
}

function isPointInRect(point: Point, rect: { x: number, y: number, width?: number, height?: number }): boolean {
    const width = rect.width ?? 0;
    const height = rect.height ?? 0;
    return (
        point.x >= rect.x &&
        point.x <= rect.x + width &&
        point.y >= rect.y &&
        point.y <= rect.y + height
    );
}

function isPointOnPath(point: Point, path: DrawPath): boolean {
  const halfThickness = path.thickness / 2;
  for (let i = 0; i < path.points.length - 1; i++) {
    const p1 = path.points[i];
    const p2 = path.points[i + 1];
    if (distanceToSegment(point, p1, p2) <= halfThickness) {
      return true;
    }
  }
  return false;
}

// --- GEOMETRY UTILS ---

function sqr(x: number) {
  return x * x;
}

function dist2(v: Point, w: Point) {
  return sqr(v.x - w.x) + sqr(v.y - w.y);
}

/**
 * Calculates the squared distance from a point to a line segment.
 * @param p The point.
 * @param v The start of the line segment.
 * @param w The end of the line segment.
 */
function distanceToSegmentSquared(p: Point, v: Point, w: Point): number {
  const l2 = dist2(v, w);
  if (l2 === 0) return dist2(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
}

function distanceToSegment(p: Point, v: Point, w: Point): number {
  return Math.sqrt(distanceToSegmentSquared(p, v, w));
}
