import * as PIXI from 'pixi.js';
import type { DrawObject, DrawPath, DrawText, DrawImage, Point } from '../types';
import { DrawType, LODLevel } from '../types';

export function drawObjectToPixi(object: DrawObject, lodBand: LODLevel = LODLevel.Near): PIXI.Container | null {
  switch (object.type) {
    case DrawType.PATH:
      return renderPath(object as DrawPath, lodBand);
    case DrawType.TEXT:
      return renderText(object as DrawText, lodBand);
    case DrawType.IMAGE:
      return renderImage(object as DrawImage, lodBand);
    default:
      console.warn('[PixiUtils] Unknown object type:', (object as any).type);
      return null;
  }
}

/** ----------------- PATH ----------------- */

function simplifyPathPoints(points: Point[], angleThreshold = 1): Point[] {
  if (points.length <= 2) return points;

  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];

    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;

    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len1 === 0 || len2 === 0) continue;

    const cosAngle = Math.max(-1, Math.min(1, (dx1 * dx2 + dy1 * dy2) / (len1 * len2)));
    const angle = Math.acos(cosAngle) * (180 / Math.PI);

    if (angle > angleThreshold) {
      out.push(p1);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function simplifyPathPointsLOD(points: Point[], lodBand: LODLevel, maxPoints = 50): Point[] {
  const threshold = lodBand === LODLevel.Near ? 1 : lodBand === LODLevel.Mid ? 5 : 10;
  let simplified = simplifyPathPoints(points, threshold);

  if (lodBand === LODLevel.Far && simplified.length > maxPoints) {
    const step = Math.ceil(simplified.length / maxPoints);
    simplified = simplified.filter((_, i) => i % step === 0);
  }

  return simplified;
}

function renderPath(path: DrawPath, lodBand: LODLevel = LODLevel.Near): PIXI.Graphics | null {
  if (!path.points || path.points.length === 0) return null;

  const points = simplifyPathPointsLOD(path.points, lodBand);

  const g = new PIXI.Graphics();

  let width = path.thickness;
  let cap: PIXI.LineCap, join: PIXI.LineJoin;

  if (lodBand === LODLevel.Near) { cap = 'round'; join = 'round'; }
  else if (lodBand === LODLevel.Mid) { cap = 'butt'; join = 'miter'; width *= 0.8; }
  else { cap = 'butt'; join = 'bevel'; width *= 0.6; }

  let minX = Infinity, minY = Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }

  // Рисуем от left top обьекта (0,0)
  const pad = width / 2;
  const ox = minX - pad;
  const oy = minY - pad;

  if (points.length === 1) {
    g.circle(points[0].x - ox, points[0].y - oy, width / 2);
    g.fill(path.color);
    return g;
  }

  g.moveTo(points[0].x - ox, points[0].y - oy);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(
      points[i].x - ox,
      points[i].y - oy
    );
  }

  g.stroke({ width, color: path.color, alpha: 1, cap, join });
  return g;
}

/** ----------------- TEXT ----------------- */

function renderText(textObj: DrawText, lodBand: LODLevel): PIXI.Container {
  const container = new PIXI.Container();
  const bbox = textObj.bbox!;

  if (lodBand >= LODLevel.Far) {
    const g = new PIXI.Graphics();
    g.rect(0, bbox.height * 0.85, bbox.width, Math.max(1, bbox.height * 0.85));
    g.fill({ color: Number('0x' + textObj.color.slice(1)), alpha: 0.7 });
    g.x = 0;
    g.y = 0;
    container.addChild(g);
  } else {
    const style = new PIXI.TextStyle({
      fontFamily: 'Arial',
      fontSize: textObj.fontSize,
      fill: textObj.color,
    });
    const text = new PIXI.Text({ text: textObj.text, style });
    text.x = 0;
    text.y = 0;
    container.addChild(text);
  }

  return container;
}

/** ----------------- IMAGE ----------------- */

function renderImage(imageObj: DrawImage, lodBand: LODLevel): PIXI.Container | null {
  const container = new PIXI.Container();

  if (lodBand >= LODLevel.Far) {
    const g = new PIXI.Graphics();
    g.rect(0, 0, imageObj.width, imageObj.height);
    g.fill({ color: 0x808080, alpha: 0.7 });
    g.x = 0;
    g.y = 0;
    container.addChild(g);
  } else {
    const texture = PIXI.Assets.get(imageObj.src);
    if (!texture) return null;

    const sprite = new PIXI.Sprite(texture);
    sprite.x = 0;
    sprite.y = 0;
    sprite.width = imageObj.width;
    sprite.height = imageObj.height;
    container.addChild(sprite);
  }

  return container;
}
