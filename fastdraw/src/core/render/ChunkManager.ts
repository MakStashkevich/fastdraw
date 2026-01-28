import * as PIXI from 'pixi.js';
import type { DrawObject, Viewport, BoundingBox } from '../../types';
import { LODLevel } from '../../types';
import { drawObjectToPixi } from '../../utils/PixiUtils';

const CHUNK_SIZE = 1024;

export interface ChunkSegment {
  objectId: string;
  chunkKey: string;
  localX: number;
  localY: number;
  clipRect: PIXI.Rectangle;
  zIndex: number;
  lod: LODLevel;
}

class Chunk {
  public readonly key: string;
  public readonly live: PIXI.Container;
  public readonly renderContainer: PIXI.Container;
  public readonly sprite: PIXI.Sprite;
  private renderTexture: PIXI.RenderTexture;
  private segments = new Map<string, ChunkSegment>();
  private isDirty = true;
  private previousLod: LODLevel | null | undefined = null;
  private updatedLodContent = false;

  constructor(
    cx: number,
    cy: number,
    private renderer: PIXI.Renderer
  ) {
    this.key = `${cx},${cy}`;

    this.renderTexture = PIXI.RenderTexture.create({
      width: CHUNK_SIZE,
      height: CHUNK_SIZE,
      resolution: renderer.resolution,
    });

    this.sprite = new PIXI.Sprite(this.renderTexture);
    this.sprite.x = cx * CHUNK_SIZE;
    this.sprite.y = cy * CHUNK_SIZE;

    this.renderContainer = new PIXI.Container(); // для рендеринга в RenderTexture
    this.renderContainer.x = 0;
    this.renderContainer.y = 0;
    this.renderContainer.sortableChildren = true;

    this.live = new PIXI.Container(); // живые объекты поверх
    this.live.x = cx * CHUNK_SIZE;
    this.live.y = cy * CHUNK_SIZE;
    this.live.sortableChildren = true;
  }

  addSegment(segment: ChunkSegment) {
    const segmentKey = `${segment.objectId}:${segment.chunkKey}`;
    if (!this.segments.has(segmentKey)) {
      this.segments.set(segmentKey, segment);
      this.isDirty = true;
      this.updatedLodContent = true;
    }
  }

  removeSegmentsByObjectId(objectId: string) {
    let changed = false;
    for (const key of this.segments.keys()) {
      if (key.startsWith(`${objectId}:`)) {
        this.segments.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.isDirty = true;
      this.updatedLodContent = true;
    }
  }

  removeSegment(segmentKey: string) {
    if (this.segments.delete(segmentKey)) {
      this.isDirty = true;
      this.updatedLodContent = true;
    }
  }

  private rebuildLive(getObject: (id: string) => DrawObject | null) {
    this.live.removeChildren().forEach(o => o.destroy({ children: true }));
    const chunkX = this.sprite.x;
    const chunkY = this.sprite.y;

    for (const segment of this.segments.values()) {
      const obj = getObject(segment.objectId);
      if (!obj) {
        console.warn(`[DEBUG Chunk] Object ${segment.objectId.slice(0, 8)} not found for segment in chunk ${this.key}`);
        continue;
      }

      // Для Near LOD рендерим объект целиком, без клиппинга
      const pixiObj = drawObjectToPixi(obj, LODLevel.Near);
      if (!pixiObj) {
        console.warn(`[DEBUG Chunk] Pixi object not created for object ${obj.id.slice(0, 8)} in chunk ${this.key}`);
        continue;
      }

      pixiObj.x = obj.bbox!.x - chunkX;
      pixiObj.y = obj.bbox!.y - chunkY;
      pixiObj.zIndex = obj.zIndex ?? 0;

      this.live.addChild(pixiObj);
    }

    this.live.sortChildren();
  }

  private rebuildRenderTexture(getObject: (id: string) => DrawObject | null) {
    this.renderContainer.removeChildren().forEach(o => o.destroy({ children: true }));

    for (const segment of this.segments.values()) {
      const obj = getObject(segment.objectId);
      if (!obj) {
        console.warn(`[DEBUG Chunk] Object ${segment.objectId.slice(0, 8)} not found for segment in chunk ${this.key}`);
        continue;
      }

      const pixiObj = this.drawSegmentToPixi(obj, segment);
      if (!pixiObj) {
        console.warn(`[DEBUG Chunk] Pixi segment object not created for object ${obj.id.slice(0, 8)} in chunk ${this.key}`);
        continue;
      }

      pixiObj.x = segment.localX;
      pixiObj.y = segment.localY;
      pixiObj.zIndex = segment.zIndex;

      this.renderContainer.addChild(pixiObj);
    }

    this.renderContainer.sortChildren();

    this.renderer.render({
      container: this.renderContainer,
      target: this.renderTexture,
      clear: true,
    });
  }

  private drawSegmentToPixi(
    obj: DrawObject,
    segment: ChunkSegment
  ): PIXI.Container | null {
    const pixiObj = drawObjectToPixi(obj, segment.lod);
    if (!pixiObj) return null;

    // Контейнер для сегмента
    const container = new PIXI.Container();

    // Сдвигаем объект внутри контейнера, чтобы левый верх был 0,0
    pixiObj.x = -segment.clipRect.x;
    pixiObj.y = -segment.clipRect.y;
    container.addChild(pixiObj);

    // Создаем маску для контейнера
    const mask = new PIXI.Graphics()
      .rect(0, 0, segment.clipRect.width, segment.clipRect.height)
      .fill(0xffffff); 

    container.addChild(mask);
    container.mask = mask; // маска применяется к контейнеру, не к объекту

    return container;
  }

  update(viewport: Viewport, getObject: (id: string) => DrawObject | null) {
    const lod = viewport.lodLevel;

    if (this.previousLod !== null && this.previousLod !== lod) {
      // Если LOD изменился на Near или с Near на другой, помечаем как грязный
      if ((lod === LODLevel.Near || this.previousLod === LODLevel.Near) && this.updatedLodContent) {
        console.log('this.updatedLodContent = ' + this.updatedLodContent)
        this.isDirty = true;
        this.updatedLodContent = false;
      }
    }
    this.previousLod = lod;

    // Обновляем LOD для всех сегментов в этом чанке
    for (const segment of this.segments.values()) {
      const obj = getObject(segment.objectId);
      if (obj) {
        segment.lod = this.computeLOD(obj, viewport);
      }
    }

    if (lod === LODLevel.Near) {
      if (this.isDirty || this.live.children.length === 0) {
        this.rebuildLive(getObject);
        this.isDirty = false;
      }
      this.live.visible = true;
      this.sprite.visible = false;
    } else {
      if (this.isDirty) {
        this.rebuildRenderTexture(getObject);
        this.isDirty = false;
      }
      this.live.visible = false;
      this.sprite.visible = true;
    }
  }

  private computeLOD(obj: DrawObject, viewport: Viewport): LODLevel {
    const bbox = obj.bbox!;
    const pxDiag = Math.sqrt(bbox.width ** 2 + bbox.height ** 2) * viewport.scale;
    if (pxDiag >= 130) return LODLevel.Near;
    if (pxDiag >= 60) return LODLevel.Mid;
    if (pxDiag >= 30) return LODLevel.Far;
    return LODLevel.Overview;
  }

  destroy() {
    this.live.destroy({ children: true });
    this.renderContainer.destroy({ children: true });
    this.sprite.destroy({ texture: true });
    this.renderTexture.destroy(true);
  }
}

export class ChunkManager {
  private chunks = new Map<string, Chunk>();
  private objectToChunks = new Map<string, Set<string>>();
  private objects = new Map<string, DrawObject>();

  constructor(private world: PIXI.Container, private renderer: PIXI.Renderer) { }

  private getChunksForBbox(bbox: BoundingBox): string[] {
    const left = Math.floor(bbox.x / CHUNK_SIZE);
    const right = Math.floor((bbox.x + bbox.width - 1) / CHUNK_SIZE);
    const top = Math.floor(bbox.y / CHUNK_SIZE);
    const bottom = Math.floor((bbox.y + bbox.height - 1) / CHUNK_SIZE);

    const keys: string[] = [];
    for (let cx = left; cx <= right; cx++) {
      for (let cy = top; cy <= bottom; cy++) {
        keys.push(`${cx},${cy}`);
      }
    }
    return keys;
  }

  private computeSegmentsForObject(obj: DrawObject): ChunkSegment[] {
    if (!obj.bbox) return [];

    const segments: ChunkSegment[] = [];
    const chunkKeys = this.getChunksForBbox(obj.bbox);

    for (const key of chunkKeys) {
      const [cxStr, cyStr] = key.split(',');
      const cx = parseInt(cxStr, 10);
      const cy = parseInt(cyStr, 10);
      const chunkX = cx * CHUNK_SIZE;
      const chunkY = cy * CHUNK_SIZE;

      const ix = Math.max(obj.bbox!.x, chunkX);
      const iy = Math.max(obj.bbox!.y, chunkY);
      const ax = Math.min(obj.bbox!.x + obj.bbox!.width, chunkX + CHUNK_SIZE);
      const ay = Math.min(obj.bbox!.y + obj.bbox!.height, chunkY + CHUNK_SIZE);

      if (ax <= ix || ay <= iy) continue;

      const localX = ix - chunkX;
      const localY = iy - chunkY;
      const clipRect = new PIXI.Rectangle(
        ix - obj.bbox!.x,
        iy - obj.bbox!.y,
        ax - ix,
        ay - iy
      );

      const zIndex = obj.zIndex ?? 0;

      segments.push({
        objectId: obj.id,
        chunkKey: key,
        localX,
        localY,
        clipRect,
        zIndex,
        lod: LODLevel.Near, // Временно, будет вычисляться позже
      });
    }

    return segments;
  }

  addObjects(objects: DrawObject[]) {
    for (const obj of objects) {
      if (!obj.bbox) {
        console.warn(`[DEBUG ChunkManager] Object ${obj.id.slice(0, 8)} has no bbox, skipping.`);
        continue;
      }

      this.objects.set(obj.id, obj);

      // Удаляем старые сегменты объекта из чанков и помечаем их как грязные
      const oldChunkKeys = this.objectToChunks.get(obj.id);
      if (oldChunkKeys) {
        for (const key of oldChunkKeys) {
          const chunk = this.chunks.get(key);
          if (chunk) {
            chunk.removeSegmentsByObjectId(obj.id);
          }
        }
      }

      const segments = this.computeSegmentsForObject(obj);
      const newChunkKeys = new Set<string>();

      for (const segment of segments) {
        let chunk = this.chunks.get(segment.chunkKey);
        if (!chunk) {
          const [cx, cy] = segment.chunkKey.split(',').map(Number);
          chunk = new Chunk(cx, cy, this.renderer);
          this.chunks.set(segment.chunkKey, chunk);
          this.world.addChild(chunk.sprite);
          this.world.addChild(chunk.live);
        }
        chunk.addSegment(segment);
        newChunkKeys.add(segment.chunkKey);
      }
      this.objectToChunks.set(obj.id, newChunkKeys);
    }
  }

  updateVisibleChunks(viewport: Viewport, visible: PIXI.Rectangle) {
    for (const chunk of this.chunks.values()) {
      const chunkRect = new PIXI.Rectangle(chunk.sprite.x, chunk.sprite.y, CHUNK_SIZE, CHUNK_SIZE);
      if (visible.intersects(chunkRect)) {
        chunk.update(viewport, id => this.objects.get(id) || null);
      }
    }
  }

  getChunksSize(): number {
    return this.chunks.size;
  }

  clear() {
    for (const chunk of this.chunks.values()) chunk.destroy();
    this.chunks.clear();
    this.objectToChunks.clear();
    this.objects.clear();
    this.world.removeChildren();
  }
}
