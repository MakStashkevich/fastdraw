<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted, type CSSProperties } from 'vue';
import { FastDrawCore } from '../../core/FastDrawCore';
import {
  FastDrawData,
  DrawText,
  DrawMode,
  DrawObject,
  DrawImage,
  BoardApi,
  DrawType,
} from '../../types';
import { getVersion } from '../../utils/version';

const props = defineProps<{
  data?: FastDrawData;
}>();

const open = defineModel<boolean>('open', { default: false });
const drawingMode = ref<DrawMode>(DrawMode.PAN);
const version = getVersion();

const emit = defineEmits<{
  (e: 'onSave', payload: FastDrawData): void;
  (e: 'onCloseBoard'): void;
  (e: 'onRender', api: BoardApi): void;
}>();

const wrapperRef = ref<HTMLElement | null>(null);
const coreRef = ref<FastDrawCore | null>(null);
const resizeObserverRef = ref<ResizeObserver | null>(null);

const brushColor = ref('#000000');
const brushThickness = ref(15);
const fontSize = ref(16);
const isToolbarOpen = ref(false);
const canUndo = ref(false);
const canRedo = ref(false);

const objects = ref<DrawObject[]>([]);
const transform = ref({ scale: 1, offsetX: 0, offsetY: 0 });
const selectedImageId = ref<string | null>(null);

const editingText = ref<DrawText | null>(null);

const boardSize = reactive({ width: 0, height: 0 });

const updateBoardSize = () => {
  if (!wrapperRef.value) {
    boardSize.width = 0;
    boardSize.height = 0;
    return;
  }
  boardSize.width = wrapperRef.value.clientWidth;
  boardSize.height = wrapperRef.value.clientHeight;
};

const selectedImage = computed<DrawImage | null>(() => {
  if (!selectedImageId.value) return null;
  return objects.value.find((obj): obj is DrawImage => obj.type === DrawType.IMAGE && obj.id === selectedImageId.value) ?? null;
});

const textEditorStyle = computed((): CSSProperties => {
  if (!editingText.value) return { display: 'none' };
  const { scale, offsetX, offsetY } = transform.value;
  const textObject = editingText.value;
  const screenX = textObject.x * scale + offsetX;
  const screenY = textObject.y * scale + offsetY;
  return {
    display: 'block',
    position: 'absolute',
    left: `${screenX}px`,
    top: `${screenY}px`,
    color: textObject.color,
    fontSize: `${textObject.fontSize * scale}px`,
    lineHeight: 1.2,
    transformOrigin: 'top left',
  };
});

const lockIconStyle = computed((): CSSProperties => {
  if (!selectedImage.value) {
    return { display: 'none' };
  }
  const { scale, offsetX, offsetY } = transform.value;
  const iconX = selectedImage.value.x + selectedImage.value.width;
  const iconY = selectedImage.value.y;
  const screenX = iconX * scale + offsetX;
  const screenY = iconY * scale + offsetY;
  return {
    display: 'block',
    position: 'absolute',
    left: `${screenX}px`,
    top: `${screenY}px`,
  };
});

const boardApi: BoardApi = {
  addElement: (element) => coreRef.value?.addObject(element),
  addImage: (src, x, y, width, height) => coreRef.value?.addImage(src, x, y, width, height),
  addObjects: (items, saveHistory = false) => coreRef.value?.addObjects(items, saveHistory),
  getBoardSize: () => ({ ...boardSize }),
  setDrawingMode: (mode) => {
    if (coreRef.value) coreRef.value.drawingMode = mode;
  },
  openToolBar: (isOpen = true) => {
    if (coreRef.value) coreRef.value.openToolBar(isOpen);
  },
};

defineExpose(boardApi);

const stopEditingText = () => {
  const core = coreRef.value;
  if (!core) return;
  if (editingText.value) {
    const editor = document.getElementById(`text-editor-${editingText.value.id}`);
    const userText = editor ? editor.innerText : editingText.value.text;
    if (userText.trim() !== '') {
      const updated: DrawText = { ...editingText.value, text: userText, isEditing: false };
      core.commitText(updated);
    }
    core.currentText = null;
    editingText.value = null;
  }
};

const toggleImageLock = () => {
  const core = coreRef.value;
  if (!core || !selectedImage.value) return;
  const updated: DrawImage = { ...selectedImage.value, locked: !selectedImage.value.locked };
  core.save(updated);
};

const handleGlobalKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    stopEditingText();
  }
};

const handleCanvasClick = (event: MouseEvent) => {
  if (!editingText.value) return;
  const target = event.target as HTMLElement;
  if (!target.closest('[contenteditable="true"]')) {
    stopEditingText();
  }
};

const initializeWhiteboard = () => {
  if (!wrapperRef.value) return;

  const core = new FastDrawCore(props.data, wrapperRef.value);
  coreRef.value = core;

  updateBoardSize();

  brushColor.value = core.brushColor;
  brushThickness.value = core.brushThickness;
  fontSize.value = core.fontSize;
  isToolbarOpen.value = core.isToolbarOpen;
  transform.value = { ...core.transformState };
  objects.value = [...core.objects];
  canUndo.value = core.canUndo();
  canRedo.value = core.canRedo();

  core.on('toolbarOpenChange', (isOpen) => {
    isToolbarOpen.value = isOpen;
  });
  core.on('modeChange', (mode) => {
    drawingMode.value = mode;
  });
  core.on('transform', (nextTransform) => {
    transform.value = { ...nextTransform };
  });
  core.on('textAdded', (textObject) => {
    editingText.value = textObject;
    nextTick(() => {
      const editor = document.getElementById(`text-editor-${textObject.id}`);
      editor?.focus();
    });
  });
  core.on('objectsUpdate', (nextObjects) => {
    objects.value = [...nextObjects];
    editingText.value = core.currentText;
    canUndo.value = core.canUndo();
    canRedo.value = core.canRedo();
    if (selectedImageId.value && !objects.value.some(obj => obj.type === DrawType.IMAGE && obj.id === selectedImageId.value)) {
      selectedImageId.value = null;
    }
  });
  core.on('selectionChange', (selectedIds) => {
    const imageId = Array.from(selectedIds).find((id) => {
      const obj = core.objects.find(item => item.id === id);
      return obj?.type === DrawType.IMAGE;
    }) ?? null;
    selectedImageId.value = imageId;
  });

  emit('onRender', boardApi);
};

const tearDown = () => {
  console.log('Whiteboard: tearDown called');
  stopEditingText();
  if (coreRef.value) {
    coreRef.value.destroy();
    coreRef.value = null;
  }
  resizeObserverRef.value?.disconnect();
  resizeObserverRef.value = null;
  objects.value = [];
  selectedImageId.value = null;
  transform.value = { scale: 1, offsetX: 0, offsetY: 0 };
  canUndo.value = false;
  canRedo.value = false;
};

const closeBoard = () => {
  console.log('Whiteboard: closeBoard called, open.value:', open.value);
  stopEditingText();
  emit('onCloseBoard');
};

const handleResize = () => {
  updateBoardSize();
};

const setMode = (mode: DrawMode) => {
  if (coreRef.value) coreRef.value.drawingMode = mode;
};

const undo = () => coreRef.value?.undo();
const redo = () => coreRef.value?.redo();

const save = () => {
  const core = coreRef.value;
  if (core) {
    stopEditingText();
    emit('onSave', core.getData());
  }
  closeBoard();
};

onMounted(() => {
  if (!open.value) return;
  initializeWhiteboard();
  if (wrapperRef.value) {
    resizeObserverRef.value = new ResizeObserver(handleResize);
    resizeObserverRef.value.observe(wrapperRef.value);
  }
  window.addEventListener('resize', handleResize);
  window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('keydown', handleGlobalKeyDown);
  tearDown();
});

watch(() => props.data, (newData) => {
  if (newData && coreRef.value) {
    coreRef.value.loadData(newData);
  }
}, { deep: true });

watch(open, (isOpen) => {
  console.log('Whiteboard: watch(open) triggered, isOpen:', isOpen);
  if (isOpen) {
    nextTick(() => {
      initializeWhiteboard();
      if (wrapperRef.value) {
        resizeObserverRef.value = new ResizeObserver(handleResize);
        resizeObserverRef.value.observe(wrapperRef.value);
      }
      window.addEventListener('resize', handleResize);
      window.addEventListener('keydown', handleGlobalKeyDown);
    });
  } else {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('keydown', handleGlobalKeyDown);
    tearDown();
  }
});

watch(brushColor, (color) => {
  if (coreRef.value) coreRef.value.setBrush({ color });
});

watch(brushThickness, (thickness) => {
  if (coreRef.value) coreRef.value.setBrush({ thickness });
});

watch(fontSize, (size) => {
  const core = coreRef.value;
  if (!core) return;
  core.fontSize = size;
  if (core.currentText) {
    editingText.value = { ...core.currentText, fontSize: size };
  }
});

watch(isToolbarOpen, (value) => {
  if (coreRef.value) coreRef.value.openToolBar(value);
});

watch(drawingMode, (mode) => {
  if (coreRef.value && coreRef.value.drawingMode !== mode) {
    coreRef.value.drawingMode = mode;
  }
});

watch(editingText, (next) => {
  if (next) {
    fontSize.value = next.fontSize;
    brushColor.value = next.color;
  }
});

</script>

<template>
  <transition name="fade">
    <div v-if="open" class="canvas-fixed-container">
      <div class="canvas-overlay" @click="closeBoard" />
      <span class="canvas-version">v{{ version }}</span>
      <button class="canvas-close-button" type="button" @click="closeBoard">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div ref="wrapperRef" class="fastdraw-wrapper" @click="handleCanvasClick">
        <div v-if="editingText" :id="`text-editor-${editingText.id}`" contenteditable="true" :style="textEditorStyle"
          class="text-editor" @blur="stopEditingText" @keydown.esc="stopEditingText">
          {{ editingText.text }}
        </div>

        <button v-if="selectedImage" class="lock-icon" type="button" :style="lockIconStyle"
          @click.stop="toggleImageLock">
          <svg v-if="selectedImage.locked" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        </button>
      </div>

      <div class="toolbar" :class="{ 'is-open': isToolbarOpen }">
        <div class="toolbar-group">
          <input id="color-picker" v-model="brushColor" type="color">
        </div>
        <div class="toolbar-group brush-preview-group">
          <span class="brush-preview"
            :style="{ width: `${brushThickness}px`, height: `${brushThickness}px`, backgroundColor: brushColor }" />
          <input id="brush-thickness" v-model.number="brushThickness" type="range" min="1" max="50">
        </div>
        <div class="toolbar-group">
          <button :class="{ active: drawingMode === DrawMode.DRAW }" type="button" title="Карандаш"
            @click="setMode(DrawMode.DRAW)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
            </svg>
          </button>
          <button :class="{ active: drawingMode === DrawMode.ERASE }" type="button" title="Ластик"
            @click="setMode(DrawMode.ERASE)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path
                d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7zM5 12l5 5m-9 4h16" />
            </svg>
          </button>
          <button :class="{ active: drawingMode === DrawMode.TEXT }" type="button" title="Текст"
            @click="setMode(DrawMode.TEXT)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>
          <transition name="slide-fade">
            <div v-if="drawingMode === DrawMode.TEXT || editingText" class="toolbar-group font-size-group">
              <span>{{ fontSize }}px</span>
              <input id="font-size" v-model.number="fontSize" type="range" min="8" max="72">
            </div>
          </transition>
          <button :class="{ active: drawingMode === DrawMode.SELECT }" type="button" title="Выделение"
            @click="setMode(DrawMode.SELECT)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path>
              <path d="M13 13l6 6"></path>
            </svg>
          </button>
          <button :class="{ active: drawingMode === DrawMode.PAN }" type="button" title="Перемещение"
            @click="setMode(DrawMode.PAN)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="5 9 2 12 5 15" />
              <polyline points="9 5 12 2 15 5" />
              <polyline points="15 19 12 22 9 19" />
              <polyline points="19 9 22 12 19 15" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
          </button>
        </div>
        <div class="toolbar-group">
          <button :disabled="!canUndo" type="button" title="Отмена" @click="undo">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9h13a5 5 0 0 1 5 5v2" />
              <path d="m7 13-4-4 4-4" />
            </svg>
          </button>
          <button :disabled="!canRedo" type="button" title="Повтор" @click="redo">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 9H8a5 5 0 0 0-5 5v2" />
              <path d="m17 13 4-4-4-4" />
            </svg>
          </button>
        </div>
        <div class="toolbar-group">
          <button class="save-btn" type="button" title="Сохранить" @click="save">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.canvas-fixed-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas-fixed-container>* {
  pointer-events: all;
}

.canvas-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
}

.canvas-version {
  position: absolute;
  top: 40px;
  right: 80px;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  user-select: none;
  border: none;
  color: rgba(0, 0, 0, 0.2);
}

.canvas-close-button {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1;
  background-color: white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

#pixiCanvasContainer {
  -webkit-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.fastdraw-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.text-editor {
  outline: none;
  cursor: text;
  border: 1px dashed #999;
  background-color: rgba(255, 255, 255, 0.7);
  min-width: 10px;
  white-space: pre;
  z-index: 2000;
}

.lock-icon {
  position: absolute;
  z-index: 2001;
  background: white;
  border: none;
  border-radius: 6px;
  padding: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.toolbar {
  position: absolute;
  z-index: 1;
  pointer-events: auto;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  opacity: 1;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 28px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(5px);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brush-preview-group,
.font-size-group {
  min-width: 40px;
  justify-content: center;
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.font-size-group span {
  font-size: 14px;
  min-width: 20px;
  text-align: right;
}

.brush-preview {
  display: inline-block;
  border-radius: 50%;
  border: 1px solid #ccc;
  transition: all 0.1s ease;
  flex-shrink: 0;
}

.toolbar button {
  padding: 6px;
  white-space: nowrap;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #ccc;
  background-color: #fff;
  cursor: pointer;
}

.toolbar button:hover {
  background-color: #f0f0f0;
}

.toolbar button.active {
  background-color: #e0e0e0;
  border-color: #999;
}

.toolbar button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar .save-btn {
  background-color: var(--avances-primary-500, #3b82f6);
  color: white;
  border-color: var(--avances-primary-500, #3b82f6);
}

.toolbar .save-btn:hover {
  background-color: var(--avances-primary-600, #2563eb);
  color: white;
  border-color: var(--avances-primary-600, #2563eb);
}

.slide-fade-enter-active {
  transition: max-width 0.3s ease-in-out, opacity 0.2s 0.1s ease;
  overflow: hidden;
  max-width: 200px;
}

.slide-fade-leave-active {
  transition: max-width 0.3s 0.1s ease-in-out, opacity 0.2s ease;
  overflow: hidden;
  max-width: 200px;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  max-width: 0;
  opacity: 0;
}
</style>
