import { DrawPath, Point } from '../types';

export function splitLongPath(path: DrawPath, maxLength: number): DrawPath[] {
  const segments: DrawPath[] = [];
  let currentPoints: Point[] = [path.points[0]];
  let currentLength = 0;

  for (let i = 1; i < path.points.length; i++) {
    const dx = path.points[i].x - path.points[i - 1].x;
    const dy = path.points[i].y - path.points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);

    if (currentLength + segLen > maxLength) {
      segments.push({
        ...path,
        id: `${path.id}-${segments.length}`,
        points: currentPoints,
      });
      currentPoints = [path.points[i - 1], path.points[i]];
      currentLength = segLen;
    } else {
      currentPoints.push(path.points[i]);
      currentLength += segLen;
    }
  }

  if (currentPoints.length > 1) {
    segments.push({
      ...path,
      id: `${path.id}-${segments.length}`,
      points: currentPoints,
    });
  }

  return segments;
}
