import type { DrawObject, DrawObjectId, BoundingBox } from '../types';
import * as PIXI from 'pixi.js';
import { ObjectUtils } from '../utils/ObjectUtils';
import { createRootBounds, ObjectStoreNodePool } from './ObjectStoreNode';

const DEFAULT_OPTIONS: Required<LooseObjectStoreOptions> = {
  minNodeSize: 256,
  maxDepth: 8,
  maxObjectsPerNode: 32,
  mergeThreshold: 12,
  looseness: 1.5,
  oversizedNodeDepthCap: 4,
  nodePoolSize: 16384,
  objectCapacity: 4096,
  objectRefCapacity: 4096,
  tileChunkSize: 32,
  dynamicUpdateThreshold: 6,
  dynamicUpdateWindow: 16,
};

const enum ChildIndex {
  NorthWest = 0,
  NorthEast = 1,
  SouthWest = 2,
  SouthEast = 3,
}

const enum ObjectFlags {
  None = 0,
  Static = 1 << 0,
  Dynamic = 1 << 1,
  Dirty = 1 << 2,
  Deleted = 1 << 3,
  Oversized = 1 << 4,
  TileCoverageDirty = 1 << 5,
}

export interface LooseObjectStoreOptions {
  minNodeSize?: number;
  maxDepth?: number;
  maxObjectsPerNode?: number;
  mergeThreshold?: number;
  looseness?: number;
  oversizedNodeDepthCap?: number;
  nodePoolSize?: number;
  objectCapacity?: number;
  objectRefCapacity?: number;
  tileChunkSize?: number;
  dynamicUpdateThreshold?: number;
  dynamicUpdateWindow?: number;
}

export interface InsertionResult {
  handle: number;
  nodeId: number;
  flags: ObjectFlags;
  status: 'inserted' | 'replaced';
}

export interface UpdateResult {
  handle: number;
  nodeId: number;
  flags: ObjectFlags;
  status: 'updated' | 'moved' | 'failed';
}

export interface FindOptions {
  includeDynamic?: boolean;
  mode?: 'all' | 'nonDeleted';
}

interface ObjectRecord {
  id: DrawObjectId;
  handle: number;
  nodeId: number;
  flags: ObjectFlags;
  updateTicks: number;
  windowTicks: number;
}

interface ScratchResults {
  insertion: InsertionResult;
  update: UpdateResult;
}

interface ScratchBuffers {
  nodeBounds: Float32Array;
  bbox: Float32Array;
  childBounds: Float32Array;
  nodeStack: Int32Array;
  handleStack: Int32Array;
  tileScratch: Uint16Array;
  tileInts: Int32Array;
}

const BBOX_COMPONENTS = 4;

/**
 * Loose quadtree ObjectStore, обеспечивающий хранение и поиск DrawObject по bbox без аллокаций.
 */
export class ObjectStore {
  private readonly options: Required<LooseObjectStoreOptions>;
  private readonly nodePool: ObjectStoreNodePool;
  private readonly scratch: ScratchBuffers;
  private readonly scratchResults: ScratchResults;
  private readonly objectIndex: Map<DrawObjectId, ObjectRecord> = new Map();
  private readonly handleToId: (DrawObjectId | null)[];
  private readonly objectStore: Map<DrawObjectId, DrawObject> = new Map();
  private objectBounds: Float32Array;
  private objectFlags: Uint32Array;
  private objectNode: Int32Array;
  private objectRefIndex: Int32Array;
  private objectUpdateCounter: Uint16Array;
  private objectWindowCounter: Uint16Array;
  private objectRefHandle: Uint32Array;
  private objectRefNext: Int32Array;
  private dynamicHandles: Uint32Array;

  private objectCapacity: number;
  private objectRefCapacity: number;
  private handleFreeList: number[] = [];
  private objectRefFreeList: number[] = [];
  private objectRefUsed = 0;
  private dynamicHandleCount = 0;
  private usedHandles = 0;
  private rootNodeId: number;
  private externalGetter?: (id: DrawObjectId) => DrawObject | undefined;

  constructor(options: LooseObjectStoreOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.nodePool = new ObjectStoreNodePool(this.options.nodePoolSize);
    this.objectCapacity = this.options.objectCapacity;
    this.objectRefCapacity = this.options.objectRefCapacity;
    this.handleToId = new Array(this.objectCapacity).fill(null);
    this.objectBounds = new Float32Array(this.objectCapacity * BBOX_COMPONENTS);
    this.objectFlags = new Uint32Array(this.objectCapacity);
    this.objectNode = new Int32Array(this.objectCapacity).fill(-1);
    this.objectRefIndex = new Int32Array(this.objectCapacity).fill(-1);
    this.objectUpdateCounter = new Uint16Array(this.objectCapacity);
    this.objectWindowCounter = new Uint16Array(this.objectCapacity);
    this.objectRefHandle = new Uint32Array(this.objectRefCapacity);
    this.objectRefNext = new Int32Array(this.objectRefCapacity).fill(-1);
    this.dynamicHandles = new Uint32Array(this.objectCapacity);
    this.scratch = {
      nodeBounds: new Float32Array(4),
      bbox: new Float32Array(4),
      childBounds: new Float32Array(4),
      nodeStack: new Int32Array(this.options.maxDepth * 16),
      handleStack: new Int32Array(this.options.maxObjectsPerNode * 4),
      tileScratch: new Uint16Array(this.options.tileChunkSize),
      tileInts: new Int32Array(this.options.tileChunkSize),
    };
    this.scratchResults = {
      insertion: { handle: -1, nodeId: -1, flags: ObjectFlags.None, status: 'inserted' },
      update: { handle: -1, nodeId: -1, flags: ObjectFlags.None, status: 'failed' },
    };

    const rootBounds = createRootBounds({ x: 0, y: 0, width: this.options.minNodeSize, height: this.options.minNodeSize });
    this.rootNodeId = this.nodePool.allocateNode(-1, 0, rootBounds);
    // console.log('[DEBUG ObjectStore] root initialized', rootBounds);
  }

  private ensureRootBounds(bbox: BoundingBox): void {
    this.nodePool.getBounds(this.rootNodeId, this.scratch.nodeBounds);
    const halfWidth = this.scratch.nodeBounds[2];
    const halfHeight = this.scratch.nodeBounds[3];
    const minX = this.scratch.nodeBounds[0] - halfWidth;
    const maxX = this.scratch.nodeBounds[0] + halfWidth;
    const minY = this.scratch.nodeBounds[1] - halfHeight;
    const maxY = this.scratch.nodeBounds[1] + halfHeight;
    const bboxMinX = bbox.x;
    const bboxMaxX = bbox.x + bbox.width;
    const bboxMinY = bbox.y;
    const bboxMaxY = bbox.y + bbox.height;

    if (bboxMinX >= minX && bboxMaxX <= maxX && bboxMinY >= minY && bboxMaxY <= maxY) {
      return;
    }

    const newCenterX = Math.min(minX, bboxMinX) + (Math.max(maxX, bboxMaxX) - Math.min(minX, bboxMinX)) / 2;
    const newCenterY = Math.min(minY, bboxMinY) + (Math.max(maxY, bboxMaxY) - Math.min(minY, bboxMinY)) / 2;
    const newHalfWidth = (Math.max(maxX, bboxMaxX) - Math.min(minX, bboxMinX)) / 2;
    const newHalfHeight = (Math.max(maxY, bboxMaxY) - Math.min(minY, bboxMinY)) / 2;
    const nextHalfWidth = Math.max(newHalfWidth, this.options.minNodeSize / 2);
    const nextHalfHeight = Math.max(newHalfHeight, this.options.minNodeSize / 2);
    const nextBounds = {
      centerX: newCenterX,
      centerY: newCenterY,
      halfWidth: nextHalfWidth,
      halfHeight: nextHalfHeight,
    } as const;
    // console.log('[DEBUG ObjectStore] root expanded to', nextBounds);
    this.nodePool.setBounds(this.rootNodeId, nextBounds);
  }

  /**
   * Подключает внешнее хранилище DrawObject.
   */
  attachExternalStore(getter: (id: DrawObjectId) => DrawObject | undefined): void {
    this.externalGetter = getter;
  }

  /**
   * Массовая загрузка объектов с возможностью переиспользования буферов.
   */
  bulkLoad(objects: Iterable<DrawObject>, reuseBuffers = true): { inserted: number } {
    let count = 0;
    for (const obj of objects) {
      ObjectUtils.ensureBoundingBox(obj);
      const bbox = obj.bbox!;
      this.objectStore.set(obj.id, obj);
      this.insert(obj.id, bbox, reuseBuffers ? ObjectFlags.Static : ObjectFlags.None);
      count++;
    }
    return { inserted: count };
  }

  /**
   * Вставляет объект по id и bbox.
   */
  insert(objectId: DrawObjectId, bbox: BoundingBox, flags: ObjectFlags = ObjectFlags.None): InsertionResult {
    const handle = this.obtainHandle(objectId);
    this.writeBoundingBox(handle, bbox);
    this.ensureRootBounds(bbox);
    let nodeId = this.objectNode[handle];
    if (nodeId !== -1) {
      this.purgeHandleFromNode(handle, nodeId);
    }

    nodeId = this.insertHandle(handle, bbox, flags);
    const record: ObjectRecord = {
      id: objectId,
      handle,
      nodeId,
      flags,
      updateTicks: 0,
      windowTicks: 0,
    };
    this.objectIndex.set(objectId, record);
    this.objectNode[handle] = nodeId;
    this.objectFlags[handle] = flags;
    this.scratchResults.insertion.handle = handle;
    this.scratchResults.insertion.nodeId = nodeId;
    this.scratchResults.insertion.flags = flags;
    this.scratchResults.insertion.status = 'inserted';
    return this.scratchResults.insertion;
  }

  /**
   * Удаляет объект по id.
   */
  remove(objectId: DrawObjectId): void {
    const record = this.objectIndex.get(objectId);
    if (!record) {
      return;
    }
    this.detachFromNode(record.handle, record.nodeId);
    this.objectFlags[record.handle] |= ObjectFlags.Deleted;
    this.handleToId[record.handle] = null;
    this.objectIndex.delete(objectId);
    this.objectNode[record.handle] = -1;
    this.objectRefIndex[record.handle] = -1;
    this.handleFreeList.push(record.handle);
    this.usedHandles--;
  }

  /**
   * Обновляет объект целиком.
   */
  update(objectId: DrawObjectId, updated: DrawObject): void {
    ObjectUtils.ensureBoundingBox(updated);
    this.objectStore.set(objectId, updated);
    // console.log('[DEBUG ObjectStore] update', { id: objectId, bbox: updated.bbox });
    this.updateBoundingBox(objectId, updated.bbox!);
  }

  /**
   * Обновляет bbox, выполняя переинсерты при необходимости.
   */
  updateBoundingBox(objectId: DrawObjectId, bbox: BoundingBox): UpdateResult {
    const record = this.objectIndex.get(objectId);
    if (!record) {
      console.warn('[DEBUG ObjectStore] updateBoundingBox missing record', objectId);
      this.scratchResults.update.handle = -1;
      this.scratchResults.update.nodeId = -1;
      this.scratchResults.update.flags = ObjectFlags.None;
      this.scratchResults.update.status = 'failed';
      return this.scratchResults.update;
    }

    const handle = record.handle;
    const currentNode = record.nodeId;
    this.writeBoundingBox(handle, bbox);
    record.flags = this.objectFlags[handle];

    let newNode = currentNode;
    if (!this.fitsNode(currentNode, bbox)) {
      // console.log('[DEBUG ObjectStore] reinsert', { id: objectId, from: currentNode });
      this.detachFromNode(handle, currentNode);
      newNode = this.insertHandle(handle, bbox, record.flags);
      record.nodeId = newNode;
      this.objectNode[handle] = newNode;
      this.scratchResults.update.status = 'moved';
    } else {
      this.scratchResults.update.status = 'updated';
    }

    this.objectFlags[handle] |= ObjectFlags.Dirty |
      ObjectFlags.TileCoverageDirty;
    this.bumpDynamicCounters(handle);

    this.scratchResults.update.handle = handle;
    this.scratchResults.update.nodeId = newNode;
    this.scratchResults.update.flags = this.objectFlags[handle];
    return this.scratchResults.update;
  }

  /**
   * Коллекция статуса объекта.
   */
  get(objectId: DrawObjectId): DrawObject | undefined {
    if (this.externalGetter) {
      return this.externalGetter(objectId);
    }
    return this.objectStore.get(objectId);
  }

  /**
   * Выполняет поиск в пределах worldBounds, заполняя outBuffer id-хэндлами.
   */
  findInBounds(bounds: Float32Array, outBuffer: Uint32Array, options: FindOptions = {}): number {
    // console.time('ObjectStore.findInBounds');
    // console.log('[DEBUG ObjectStore.findInBounds] start, bounds:', Array.from(bounds));
    // console.log('[DEBUG ObjectStore] node0 dump', this.debugDumpNode(this.rootNodeId));
    const includeDynamic = options.includeDynamic ?? true;
    const mode = options.mode ?? 'nonDeleted';
    let count = 0;
    let stackSize = 0;
    let nodeVisitCount = 0;
    let objCheckCount = 0;
    this.scratch.nodeStack[stackSize++] = this.rootNodeId;

    while (stackSize > 0) {
      const nodeId = this.scratch.nodeStack[--stackSize];
      nodeVisitCount++;
      if (nodeVisitCount > 10000) {
        console.error('[DEBUG ObjectStore.findInBounds] TOO MANY NODES VISITED:', nodeVisitCount, 'ABORT');
        return 0;
      }
      if (!this.nodeIntersects(nodeId, bounds)) {
        continue;
      }

      const firstRef = this.nodePool.getFirstObject(nodeId);
      const expectedObjCount = this.nodePool.getObjectCount(nodeId);
      // console.log('[DEBUG ObjectStore.findInBounds node', nodeId, '] firstRef:', firstRef, 'expectedObjCount:', expectedObjCount);
      let ref = firstRef;
      let prevRef = -1;
      let traversedObjs = 0;
      const maxTraverse = expectedObjCount * 2 + 10;
      while (ref !== -1 && traversedObjs < maxTraverse) {
        traversedObjs++;
        if (ref < 0 || ref >= this.objectRefHandle.length) {
          console.warn('[ObjectStore] invalid ref', ref, 'node', nodeId);
          break;
        }
        const handle = this.objectRefHandle[ref];
        if (this.scratch.handleStack.length > 0 && traversedObjs - 1 < this.scratch.handleStack.length) {
          this.scratch.handleStack[traversedObjs - 1] = handle;
        }
        if (handle < 0 || handle >= this.objectCapacity || !this.handleToId[handle] || this.objectNode[handle] !== nodeId || (this.objectFlags[handle] & ObjectFlags.Deleted)) {
          console.warn('[ObjectStore] skipped invalid handle', handle, 'ref', ref, 'node', nodeId);
          const nextRef = this.objectRefNext[ref];
          this.detachRef(nodeId, ref, prevRef, handle);
          ref = nextRef;
          continue;
        }
        const flags = this.objectFlags[handle];
        objCheckCount++;
        if (mode === 'all' || (flags & ObjectFlags.Deleted) === 0) {
          this.readBoundingBox(handle, this.scratch.bbox);
          // console.log('[DEBUG ObjectStore] obj bbox', Array.from(this.scratch.bbox), 'query', Array.from(bounds), 'intersects?', this.bboxIntersects(this.scratch.bbox, bounds));
          if (this.bboxIntersects(this.scratch.bbox, bounds)) {
            if (includeDynamic || (flags & ObjectFlags.Dynamic) === 0) {
              outBuffer[count++] = handle;
              if (count >= outBuffer.length) {
                return count;
              }
            }
          }
        }
        prevRef = ref;
        ref = this.objectRefNext[ref];
      }
        if (traversedObjs >= maxTraverse) {
          console.error('[DEBUG ObjectStore.findInBounds] LONG OBJ LIST node', nodeId, 'expected', expectedObjCount, 'traversed', traversedObjs);
          break;
        }

      for (let i = 0; i < 4; i++) {
        const childId = this.nodePool.getChild(nodeId, i);
        if (childId !== -1) {
          this.scratch.nodeStack[stackSize++] = childId;
        }
      }
    }

    // console.log('[DEBUG ObjectStore.findInBounds] processed nodes:', nodeVisitCount, 'objects checked:', objCheckCount, 'found:', count);
    // console.timeEnd('ObjectStore.findInBounds');
    return count;
  }

  /**
   * Возвращает DrawObject[] для совместимости со старыми вызовами.
   */
  findObjectsIn(bounds: PIXI.Rectangle): DrawObject[] {
    const paddedBounds = new Float32Array([
      bounds.x,
      bounds.y,
      bounds.width * 2,
      bounds.height * 2,
    ]);
    const stackBuffer = new Uint32Array(this.objectCapacity);
    const resultCount = this.findInBounds(paddedBounds, stackBuffer, { includeDynamic: true });
    // console.log('[DEBUG ObjectStore.findObjectsIn] bounds', paddedBounds, 'results', resultCount, 'tileSize', this.tileSize, 'objectsTotal', this.objectIndex.size);
    const results: DrawObject[] = [];
    for (let i = 0; i < resultCount; i++) {
      const handle = stackBuffer[i];
      if (handle < 0 || handle >= this.handleToId.length) {
        continue;
      }
      const id = this.handleToId[handle];
      if (!id) {
        continue;
      }
      const obj = this.get(id);
      if (obj) {
        results.push(obj);
      }
    }
    return results;
  }

  /**
   * Сбор динамических объектов в буфер.
   */
  collectDynamicObjects(outBuffer: Uint32Array): number {
    let count = 0;
    for (let i = 0; i < this.dynamicHandleCount; i++) {
      const handle = this.dynamicHandles[i];
      if (handle === undefined) {
        continue;
      }
      const flags = this.objectFlags[handle];
      if ((flags & ObjectFlags.Dynamic) !== 0 && (flags & ObjectFlags.Deleted) === 0) {
        outBuffer[count++] = handle;
        if (count >= outBuffer.length) {
          return count;
        }
      }
    }
    return count;
  }

  /**
   * Освобождение ресурсов пулов.
   */
  release(): void {
    this.objectIndex.clear();
    this.objectStore.clear();
    this.handleFreeList = [];
    this.objectRefFreeList = [];
    this.dynamicHandleCount = 0;
  }

  /**
   * Совместимая реализация add для legacy-кода.
   */
  add(obj: DrawObject): void {
    ObjectUtils.ensureBoundingBox(obj);
    if (!obj.zIndex) { // Update zIndex
      obj.zIndex = this.objectStore.size;
    }
    this.objectStore.set(obj.id, obj);
    const bbox = obj.bbox!;
    const existing = this.objectIndex.get(obj.id);
    if (existing) {
      this.updateBoundingBox(obj.id, bbox);
    } else {
      this.insert(obj.id, bbox);
    }
  }

  /**
   * Совместимая реализация getAll.
   */
  getAll(): DrawObject[] {
    const list: DrawObject[] = [];
    for (const [id] of this.objectIndex) {
      const obj = this.get(id);
      if (obj) {
        list.push(obj);
      }
    }
    return list;
  }

  /**
   * Возвращает приблизительный размер всех объектов в хранилище в мегабайтах.
   */
  getStoreSizeMB(): number {
    let totalSize = 0;
    for (const [id] of this.objectIndex) {
      const obj = this.get(id);
      if (obj) {
        totalSize += JSON.stringify(obj).length;
      }
    }
    return totalSize / (1024 * 1024);
  }


  /**
   * Возвращает итератор по DrawObject.
   */
  *values(): IterableIterator<DrawObject> {
    for (const [id] of this.objectIndex) {
      const obj = this.get(id);
      if (obj) {
        yield obj;
      }
    }
  }

  private obtainHandle(id: DrawObjectId): number {
    let handle: number;
    if (this.objectIndex.has(id)) {
      return this.objectIndex.get(id)!.handle;
    }
    if (this.handleFreeList.length > 0) {
      handle = this.handleFreeList.pop()!;
    } else if (this.usedHandles >= this.objectCapacity) {
      handle = this.expandHandles();
    } else {
      handle = this.usedHandles;
    }
    this.usedHandles++;
    this.handleToId[handle] = id;
    this.objectFlags[handle] = ObjectFlags.None;
    this.objectNode[handle] = -1;
    this.objectRefIndex[handle] = -1;
    this.objectUpdateCounter[handle] = 0;
    this.objectWindowCounter[handle] = 0;
    return handle;
  }

  private expandHandles(): number {
    if (this.objectCapacity === this.handleToId.length) {
      const newCapacity = this.objectCapacity * 2;
      this.resizeHandles(newCapacity);
    }
    const handle = this.usedHandles;
    return handle;
  }

  private resizeHandles(newCapacity: number): void {
    const oldCapacity = this.objectCapacity;
    this.objectCapacity = newCapacity;
    this.resizeFloatArray(this.objectBounds, newCapacity * BBOX_COMPONENTS);
    this.resizeUint32Array(this.objectFlags, newCapacity);
    this.resizeInt32Array(this.objectNode, newCapacity, -1);
    this.resizeInt32Array(this.objectRefIndex, newCapacity, -1);
    this.resizeUint16Array(this.objectUpdateCounter, newCapacity);
    this.resizeUint16Array(this.objectWindowCounter, newCapacity);
    this.resizeUint32Array(this.dynamicHandles, newCapacity);
    for (let i = oldCapacity; i < newCapacity; i++) {
      this.handleToId[i] = null;
    }
  }

  private resizeFloatArray(array: Float32Array, newLength: number): void {
    if (array.length >= newLength) {
      return;
    }
    const next = new Float32Array(newLength);
    next.set(array);
    (this.objectBounds as any) = next;
  }

  private resizeUint32Array(array: Uint32Array, newLength: number): void {
    if (array.length >= newLength) {
      return;
    }
    const next = new Uint32Array(newLength);
    next.set(array);
    if (array === this.objectFlags) {
      (this.objectFlags as any) = next;
    } else if (array === this.objectRefHandle) {
      (this.objectRefHandle as any) = next;
    } else if (array === this.dynamicHandles) {
      (this.dynamicHandles as any) = next;
    }
  }

  private resizeUint16Array(array: Uint16Array, newLength: number): void {
    if (array.length >= newLength) {
      return;
    }
    const next = new Uint16Array(newLength);
    next.set(array);
    if (array === this.objectUpdateCounter) {
      (this.objectUpdateCounter as any) = next;
    } else if (array === this.objectWindowCounter) {
      (this.objectWindowCounter as any) = next;
    }
  }

  private resizeInt32Array(array: Int32Array, newLength: number, fillValue = -1, copy = false): void {
    if (array.length >= newLength) {
      return;
    }
    const next = new Int32Array(newLength);
    if (copy) {
      next.set(array);
    } else {
      next.set(array.subarray(0, array.length));
      if (fillValue !== 0) {
        for (let i = array.length; i < newLength; i++) {
          next[i] = fillValue;
        }
      }
    }
    if (array === this.objectNode) {
      (this.objectNode as any) = next;
    } else if (array === this.objectRefIndex) {
      (this.objectRefIndex as any) = next;
    } else if (array === this.objectRefNext) {
      (this.objectRefNext as any) = next;
    }
  }

  private writeBoundingBox(handle: number, bbox: BoundingBox): void {
    const offset = handle * BBOX_COMPONENTS;
    this.objectBounds[offset] = bbox.x;
    this.objectBounds[offset + 1] = bbox.y;
    this.objectBounds[offset + 2] = bbox.width;
    this.objectBounds[offset + 3] = bbox.height;
  }

  private readBoundingBox(handle: number, out: Float32Array): void {
    const offset = handle * BBOX_COMPONENTS;
    out[0] = this.objectBounds[offset];
    out[1] = this.objectBounds[offset + 1];
    out[2] = this.objectBounds[offset + 2];
    out[3] = this.objectBounds[offset + 3];
  }

  private insertHandle(handle: number, bbox: BoundingBox, _flags: ObjectFlags): number {
    // console.log('[DEBUG ObjectStore.insertHandle] start handle:', handle, 'bbox:', bbox);
    this.ensureRootBounds(bbox);
    let nodeId = this.rootNodeId;
    let depth = 0;
    while (true) {
      if (this.nodePool.isLeaf(nodeId)) {
        const nodeCount = this.nodePool.getObjectCount(nodeId);
        if (nodeCount < this.options.maxObjectsPerNode || depth >= this.options.maxDepth) {
          this.attachToNode(handle, nodeId);
          return nodeId;
        }
        this.splitNode(nodeId, depth);
      }
      const childIndex = this.selectChild(nodeId, bbox, depth);
      if (childIndex === -1) {
        this.attachToNode(handle, nodeId);
        return nodeId;
      }
      const childId = this.nodePool.getChild(nodeId, childIndex);
      if (childId === -1) {
        this.attachToNode(handle, nodeId);
        return nodeId;
      }
      nodeId = childId;
      depth++;
      if (depth > this.options.maxDepth + 5) {
        console.error('[DEBUG ObjectStore.insertHandle] DEPTH EXCEEDED:', depth);
        this.attachToNode(handle, nodeId);
        return nodeId;
      }

    }
  }

  private attachToNode(handle: number, nodeId: number): void {
    const refIndex = this.obtainObjectRefIndex();
    const first = this.nodePool.getFirstObject(nodeId);
    // console.log('[DEBUG attach node' + nodeId + '] ref' + refIndex + ' handle' + handle + ' firstWas' + first + ' nextTo' + first);
    this.objectRefHandle[refIndex] = handle;
    this.objectRefNext[refIndex] = first;
    this.nodePool.setFirstObject(nodeId, refIndex);
    this.nodePool.incrementObjectCount(nodeId);
    this.objectRefIndex[handle] = refIndex;
    this.objectNode[handle] = nodeId;
  }

  private detachFromNode(handle: number, nodeId: number): void {
    if (nodeId === -1) {
      return;
    }
    const removed = this.purgeHandleFromNode(handle, nodeId);
    if (removed) {
      this.tryMerge(nodeId);
    }
  }

  private purgeHandleFromNode(handle: number, nodeId: number): boolean {
    if (nodeId === -1) {
      return false;
    }
    let current = this.nodePool.getFirstObject(nodeId);
    let prev = -1;
    let removed = false;
    while (current !== -1) {
      const next = this.objectRefNext[current];
      if (this.objectRefHandle[current] === handle) {
        this.detachRef(nodeId, current, prev, handle);
        removed = true;
        break;
      }
      prev = current;
      current = next;
    }
    return removed;
  }

  private detachRef(nodeId: number, refIndex: number, prevRef: number, handle: number | null = null): void {
    const next = this.objectRefNext[refIndex];
    if (prevRef === -1) {
      this.nodePool.setFirstObject(nodeId, next);
    } else {
      this.objectRefNext[prevRef] = next;
    }
    this.objectRefNext[refIndex] = -1;
    this.objectRefHandle[refIndex] = 0;
    if (handle !== null && handle >= 0 && handle < this.objectRefIndex.length && this.objectRefIndex[handle] === refIndex) {
      this.objectRefIndex[handle] = -1;
      this.objectNode[handle] = -1;
    }
    this.objectRefFreeList.push(refIndex);
    this.nodePool.decrementObjectCount(nodeId);
  }

  private obtainObjectRefIndex(): number {
    if (this.objectRefFreeList.length > 0) {
      return this.objectRefFreeList.pop()!;
    }
    if (this.objectRefUsed >= this.objectRefCapacity) {
      this.expandObjectRefs();
    }
    return this.objectRefUsed++;
  }

  private expandObjectRefs(): void {
    const newCapacity = this.objectRefCapacity * 2;
    this.objectRefCapacity = newCapacity;
    this.resizeUint32Array(this.objectRefHandle, newCapacity);
    this.resizeInt32Array(this.objectRefNext, newCapacity, -1);
  }

  private splitNode(nodeId: number, depth: number): void {
    this.nodePool.setLeaf(nodeId, false);
    this.nodePool.getBounds(nodeId, this.scratch.nodeBounds);
    const halfWidth = this.scratch.nodeBounds[2] / 2;
    const halfHeight = this.scratch.nodeBounds[3] / 2;
    const centerX = this.scratch.nodeBounds[0];
    const centerY = this.scratch.nodeBounds[1];

    const childDepth = depth + 1;
    const childBounds: [number, number, number, number][] = [
      [centerX - halfWidth, centerY - halfHeight, halfWidth, halfHeight],
      [centerX + halfWidth, centerY - halfHeight, halfWidth, halfHeight],
      [centerX - halfWidth, centerY + halfHeight, halfWidth, halfHeight],
      [centerX + halfWidth, centerY + halfHeight, halfWidth, halfHeight],
    ];

    for (let i = 0; i < 4; i++) {
      const bounds = childBounds[i];
      const nodeBounds = {
        centerX: bounds[0],
        centerY: bounds[1],
        halfWidth,
        halfHeight,
      };
      const childId = this.nodePool.allocateNode(nodeId, childDepth, nodeBounds);
      this.nodePool.setChild(nodeId, i, childId);
    }
    this.redistribute(nodeId, depth);
  }

  private redistribute(nodeId: number, depth: number): void {
    let ref = this.nodePool.getFirstObject(nodeId);
    let count = 0;
    while (ref !== -1 && count < this.scratch.handleStack.length) {
      this.scratch.handleStack[count++] = this.objectRefHandle[ref];
      ref = this.objectRefNext[ref];
    }
    for (let i = 0; i < count; i++) {
      const handle = this.scratch.handleStack[i];
      this.readBoundingBox(handle, this.scratch.bbox);
      const childIndex = this.selectChild(nodeId, {
        x: this.scratch.bbox[0],
        y: this.scratch.bbox[1],
        width: this.scratch.bbox[2],
        height: this.scratch.bbox[3],
      }, depth);
      if (childIndex !== -1) {
        const childId = this.nodePool.getChild(nodeId, childIndex);
        if (childId !== -1) {
          this.detachFromNode(handle, nodeId);
          this.attachToNode(handle, childId);
        }
      }
    }
  }

  private selectChild(nodeId: number, bbox: BoundingBox, depth: number): number {
    if (depth >= this.options.maxDepth) {
      return -1;
    }
    this.nodePool.getBounds(nodeId, this.scratch.nodeBounds);
    const width = this.scratch.nodeBounds[2];
    const height = this.scratch.nodeBounds[3];
    if (width <= this.options.minNodeSize && height <= this.options.minNodeSize) {
      return -1;
    }

    const centerX = this.scratch.nodeBounds[0];
    const centerY = this.scratch.nodeBounds[1];

    const midX = centerX;
    const midY = centerY;
    const bboxMinX = bbox.x;
    const bboxMinY = bbox.y;
    const bboxMaxX = bbox.x + bbox.width;
    const bboxMaxY = bbox.y + bbox.height;

    const fitsLeft = bboxMaxX <= midX;
    const fitsRight = bboxMinX >= midX;
    const fitsTop = bboxMaxY <= midY;
    const fitsBottom = bboxMinY >= midY;

    if (fitsLeft) {
      if (fitsTop) {
        return ChildIndex.NorthWest;
      }
      if (fitsBottom) {
        return ChildIndex.SouthWest;
      }
    } else if (fitsRight) {
      if (fitsTop) {
        return ChildIndex.NorthEast;
      }
      if (fitsBottom) {
        return ChildIndex.SouthEast;
      }
    }
    return -1;
  }

  private fitsNode(nodeId: number, bbox: BoundingBox): boolean {
    this.nodePool.getBounds(nodeId, this.scratch.nodeBounds);
    const looseness = this.options.looseness;
    const centerX = this.scratch.nodeBounds[0];
    const centerY = this.scratch.nodeBounds[1];
    const halfWidth = this.scratch.nodeBounds[2] * looseness;
    const halfHeight = this.scratch.nodeBounds[3] * looseness;
    const minX = centerX - halfWidth;
    const minY = centerY - halfHeight;
    const maxX = centerX + halfWidth;
    const maxY = centerY + halfHeight;
    return bbox.x >= minX && bbox.y >= minY && bbox.x + bbox.width <= maxX && bbox.y + bbox.height <= maxY;
  }

  private tryMerge(nodeId: number): void {
    const parentId = this.nodePool.getParent(nodeId);
    if (parentId === -1) {
      return;
    }
    let total = 0;
    let canMerge = true;
    for (let i = 0; i < 4; i++) {
      const childId = this.nodePool.getChild(parentId, i);
      if (childId === -1) {
        continue;
      }
      if (!this.nodePool.isLeaf(childId)) {
        canMerge = false;
        break;
      }
      total += this.nodePool.getObjectCount(childId);
    }
    if (!canMerge || total > this.options.mergeThreshold) {
      return;
    }
    for (let i = 0; i < 4; i++) {
      const childId = this.nodePool.getChild(parentId, i);
      if (childId === -1) {
        continue;
      }
      let ref = this.nodePool.getFirstObject(childId);
      while (ref !== -1) {
        const handle = this.objectRefHandle[ref];
        this.attachToNode(handle, parentId);
        ref = this.objectRefNext[ref];
      }
      this.nodePool.releaseNode(childId);
      this.nodePool.setChild(parentId, i, -1);
    }
    this.nodePool.setLeaf(parentId, true);
  }

  private bboxIntersects(lhs: Float32Array, rhs: Float32Array): boolean {
    const lhsMaxX = lhs[0] + lhs[2];
    const lhsMaxY = lhs[1] + lhs[3];
    const rhsMaxX = rhs[0] + rhs[2];
    const rhsMaxY = rhs[1] + rhs[3];
    return lhs[0] < rhsMaxX && lhsMaxX > rhs[0] && lhs[1] < rhsMaxY && lhsMaxY > rhs[1];
  }

  private nodeIntersects(nodeId: number, bounds: Float32Array): boolean {
    this.nodePool.getBounds(nodeId, this.scratch.nodeBounds);
    const looseness = this.options.looseness;
    const minX = this.scratch.nodeBounds[0] - this.scratch.nodeBounds[2] * looseness;
    const maxX = this.scratch.nodeBounds[0] + this.scratch.nodeBounds[2] * looseness;
    const minY = this.scratch.nodeBounds[1] - this.scratch.nodeBounds[3] * looseness;
    const maxY = this.scratch.nodeBounds[1] + this.scratch.nodeBounds[3] * looseness;
    const boundsMaxX = bounds[0] + bounds[2];
    const boundsMaxY = bounds[1] + bounds[3];
    return minX < boundsMaxX && maxX > bounds[0] && minY < boundsMaxY && maxY > bounds[1];
  }

  private bumpDynamicCounters(handle: number): void {
    const updateCount = this.objectUpdateCounter[handle] + 1;
    this.objectUpdateCounter[handle] = updateCount;
    const windowCount = this.objectWindowCounter[handle] + 1;
    this.objectWindowCounter[handle] = windowCount;
    if (windowCount >= this.options.dynamicUpdateWindow) {
      this.objectUpdateCounter[handle] = 0;
      this.objectWindowCounter[handle] = 0;
    }
    if (updateCount >= this.options.dynamicUpdateThreshold) {
      if ((this.objectFlags[handle] & ObjectFlags.Dynamic) === 0) {
        this.objectFlags[handle] |= ObjectFlags.Dynamic;
        if (this.dynamicHandleCount >= this.dynamicHandles.length) {
          this.resizeUint32Array(this.dynamicHandles, this.dynamicHandles.length * 2);
        }
        this.dynamicHandles[this.dynamicHandleCount++] = handle;
      }
    }
  }
}

export { ObjectFlags };
