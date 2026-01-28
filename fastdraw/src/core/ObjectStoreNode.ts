import type { BoundingBox } from '../types';

const CHILDREN_PER_NODE = 4;

const enum NodeFlag {
  Leaf = 1 << 0,
}

export interface NodeBounds {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
}

export class ObjectStoreNodePool {
  private readonly capacity: number;
  private readonly bounds: Float32Array;
  private readonly firstObject: Int32Array;
  private readonly objectCount: Uint16Array;
  private readonly parent: Int32Array;
  private readonly children: Int32Array;
  private readonly depth: Uint8Array;
  private readonly flags: Uint8Array;
  private readonly freeList: number[] = [];
  private nodeCount = 0;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('ObjectStoreNodePool capacity must be > 0');
    }
    this.capacity = capacity;
    this.bounds = new Float32Array(capacity * 4);
    this.firstObject = new Int32Array(capacity);
    this.objectCount = new Uint16Array(capacity);
    this.parent = new Int32Array(capacity);
    this.children = new Int32Array(capacity * CHILDREN_PER_NODE);
    this.depth = new Uint8Array(capacity);
    this.flags = new Uint8Array(capacity);

    this.firstObject.fill(-1);
    this.parent.fill(-1);
    this.children.fill(-1);
  }

  getCapacity(): number {
    return this.capacity;
  }

  getActiveNodeCount(): number {
    return this.nodeCount - this.freeList.length;
  }

  allocateNode(parentId: number, depth: number, bounds: NodeBounds): number {
    const nodeId = this.obtainNodeId();
    const offset = nodeId * 4;
    this.bounds[offset] = bounds.centerX;
    this.bounds[offset + 1] = bounds.centerY;
    this.bounds[offset + 2] = bounds.halfWidth;
    this.bounds[offset + 3] = bounds.halfHeight;
    this.parent[nodeId] = parentId;
    this.depth[nodeId] = depth;
    this.flags[nodeId] = NodeFlag.Leaf;
    this.firstObject[nodeId] = -1;
    this.objectCount[nodeId] = 0;
    const childrenOffset = nodeId * CHILDREN_PER_NODE;
    this.children[childrenOffset] = -1;
    this.children[childrenOffset + 1] = -1;
    this.children[childrenOffset + 2] = -1;
    this.children[childrenOffset + 3] = -1;
    return nodeId;
  }

  releaseNode(nodeId: number): void {
    if (nodeId < 0 || nodeId >= this.capacity) {
      return;
    }
    this.firstObject[nodeId] = -1;
    this.objectCount[nodeId] = 0;
    this.flags[nodeId] = NodeFlag.Leaf;
    const childrenOffset = nodeId * CHILDREN_PER_NODE;
    this.children[childrenOffset] = -1;
    this.children[childrenOffset + 1] = -1;
    this.children[childrenOffset + 2] = -1;
    this.children[childrenOffset + 3] = -1;
    this.freeList.push(nodeId);
  }

  setLeaf(nodeId: number, value: boolean): void {
    if (value) {
      this.flags[nodeId] |= NodeFlag.Leaf;
    } else {
      this.flags[nodeId] &= ~NodeFlag.Leaf;
    }
  }

  isLeaf(nodeId: number): boolean {
    return (this.flags[nodeId] & NodeFlag.Leaf) !== 0;
  }

  getDepth(nodeId: number): number {
    return this.depth[nodeId];
  }

  getParent(nodeId: number): number {
    return this.parent[nodeId];
  }

  setParent(nodeId: number, parentId: number): void {
    this.parent[nodeId] = parentId;
  }

  getBounds(nodeId: number, out: Float32Array): void {
    const offset = nodeId * 4;
    out[0] = this.bounds[offset];
    out[1] = this.bounds[offset + 1];
    out[2] = this.bounds[offset + 2];
    out[3] = this.bounds[offset + 3];
  }

  setBounds(nodeId: number, bounds: NodeBounds): void {
    const offset = nodeId * 4;
    this.bounds[offset] = bounds.centerX;
    this.bounds[offset + 1] = bounds.centerY;
    this.bounds[offset + 2] = bounds.halfWidth;
    this.bounds[offset + 3] = bounds.halfHeight;
  }

  getFirstObject(nodeId: number): number {
    return this.firstObject[nodeId];
  }

  setFirstObject(nodeId: number, handle: number): void {
    this.firstObject[nodeId] = handle;
  }

  getObjectCount(nodeId: number): number {
    return this.objectCount[nodeId];
  }

  incrementObjectCount(nodeId: number): void {
    this.objectCount[nodeId]++;
  }

  decrementObjectCount(nodeId: number): void {
    if (this.objectCount[nodeId] > 0) {
      this.objectCount[nodeId]--;
    }
  }

  getChild(nodeId: number, index: number): number {
    const offset = nodeId * CHILDREN_PER_NODE + index;
    return this.children[offset];
  }

  setChild(nodeId: number, index: number, childId: number): void {
    const offset = nodeId * CHILDREN_PER_NODE + index;
    this.children[offset] = childId;
  }

  getChildren(nodeId: number, out: Int32Array): void {
    const offset = nodeId * CHILDREN_PER_NODE;
    out[0] = this.children[offset];
    out[1] = this.children[offset + 1];
    out[2] = this.children[offset + 2];
    out[3] = this.children[offset + 3];
  }

  private obtainNodeId(): number {
    if (this.freeList.length > 0) {
      return this.freeList.pop()!;
    }
    if (this.nodeCount >= this.capacity) {
      throw new Error('ObjectStoreNodePool exhausted');
    }
    const id = this.nodeCount;
    this.nodeCount++;
    return id;
  }
}

export function createRootBounds(worldBounds: BoundingBox): NodeBounds {
  const halfWidth = worldBounds.width / 2;
  const halfHeight = worldBounds.height / 2;
  return {
    centerX: worldBounds.x + halfWidth,
    centerY: worldBounds.y + halfHeight,
    halfWidth,
    halfHeight,
  };
}

