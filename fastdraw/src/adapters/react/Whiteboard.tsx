import '../../style.css';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  FastDrawData,
  DrawObject,
  DrawImage,
  DrawText,
  BoardApi,
  DrawMode,
  DrawType,
} from '../../types';
import { FastDrawCore } from '../../core/FastDrawCore';
import { getVersion } from '../../utils/version';

// --- COMPONENT ---
export interface WhiteboardProps {
  data?: FastDrawData;
  open?: boolean;
  onSave?: (payload: FastDrawData) => void;
  onCloseBoard?: () => void;
  onBeforeRender?: () => void;
  onRender?: (api: BoardApi) => void;
}

const version = getVersion();

const initialBoardSize = { width: 0, height: 0 };

const Whiteboard: React.FC<WhiteboardProps> = ({
  data,
  open = false,
  onSave,
  onCloseBoard,
  onBeforeRender,
  onRender,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<FastDrawCore | null>(null);
  const boardSizeRef = useRef(initialBoardSize);
  const selectedImageIdRef = useRef<string | null>(null);

  // --- LOCAL STATE ---
  const [objects, setObjects] = useState<DrawObject[]>([]);
  const [transform, setTransform] = useState(coreRef.current?.transformState ?? {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const [drawingMode, setDrawingModeState] = useState<DrawMode>(DrawMode.PAN);
  const [brushColor, setBrushColor] = useState('#000000');
  const [brushThickness, setBrushThickness] = useState(15);
  const [fontSize, setFontSize] = useState(16);
  const [isToolbarOpen, setIsToolbarOpen] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // --- TEXT EDITING STATE ---
  const [editingText, setEditingText] = useState<DrawText | null>(null);

  const updateBoardSize = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) {
      boardSizeRef.current = initialBoardSize;
      return;
    }
    const nextSize = {
      width: wrapper.clientWidth,
      height: wrapper.clientHeight,
    };
    boardSizeRef.current = nextSize;
  }, []);

  const setDrawingMode = useCallback((mode: DrawMode) => {
    if (coreRef.current) {
      coreRef.current.drawingMode = mode;
    }
  }, []);

  const stopEditingText = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    if (editingText) {
      const editor = document.getElementById(`text-editor-${editingText.id}`);
      const userText = editor ? editor.innerText : editingText.text;
      if (userText.trim() !== '') {
        const updatedText: DrawText = {
          ...editingText,
          text: userText,
          isEditing: false,
        };
        core.commitText(updatedText);
      }
      core.currentText = null;
      setEditingText(null);
    }
  }, [editingText]);

  const handleCloseBoard = useCallback(() => {
    stopEditingText();
    setIsToolbarOpen(false);
    onCloseBoard?.();
  }, [onCloseBoard, stopEditingText]);

  const handleSave = useCallback(() => {
    const core = coreRef.current;
    if (core) {
      stopEditingText();
      const payload = core.getData();
      onSave?.(payload);
    }
    handleCloseBoard();
  }, [handleCloseBoard, onSave, stopEditingText]);

  const handleUndo = useCallback(() => {
    coreRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    coreRef.current?.redo();
  }, []);

  const handleCanvasClick = useCallback((event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (editingText && !target.closest('[contenteditable="true"]')) {
      stopEditingText();
    }
  }, [editingText, stopEditingText]);

  const toggleImageLock = useCallback(() => {
    const core = coreRef.current;
    const imageId = selectedImageIdRef.current;
    if (!imageId || !core) return;
    const image = core.objects.find((obj): obj is DrawImage => obj.type === DrawType.IMAGE && obj.id === imageId);
    if (!image) return;
    const updatedImage: DrawImage = { ...image, locked: !image.locked };
    core.save(updatedImage);
  }, []);

  const boardApi = useMemo<BoardApi>(() => ({
    addElement: (element: DrawObject) => coreRef.current?.addObject(element),
    addImage: (src, x, y, width, height) => coreRef.current?.addImage(src, x, y, width, height),
    addObjects: (items, saveHistory = false) => coreRef.current?.addObjects(items, saveHistory),
    getBoardSize: () => ({ ...boardSizeRef.current }),
    setDrawingMode: (mode: DrawMode) => setDrawingMode(mode),
    openToolBar: (isOpen = true) => coreRef.current?.openToolBar(isOpen),
  }), [setDrawingMode]);

  useEffect(() => {
    if (open) {
      onBeforeRender?.();
    }
  }, [open, onBeforeRender]);

  useEffect(() => {
    if (!open) {
      setSelectedImageId(null);
      selectedImageIdRef.current = null;
      return;
    }

    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const core = new FastDrawCore(data, wrapper);
    coreRef.current = core;

    updateBoardSize();

    const syncObjects = (nextObjects: DrawObject[]) => {
      setObjects(nextObjects);
      setCanUndo(core.canUndo());
      setCanRedo(core.canRedo());
      const imageId = selectedImageIdRef.current;
      if (imageId && !nextObjects.some(obj => obj.id === imageId && obj.type === DrawType.IMAGE)) {
        selectedImageIdRef.current = null;
        setSelectedImageId(null);
      }
    };

    const syncTransform = (nextTransform: typeof core.transformState) => {
      setTransform({ ...nextTransform });
    };

    const syncMode = (mode: DrawMode) => {
      setDrawingModeState(mode);
    };

    const syncToolbar = (isOpen: boolean) => {
      setIsToolbarOpen(isOpen);
    };

    const handleTextAdded = (textObject: DrawText) => {
      setEditingText(textObject);
      requestAnimationFrame(() => {
        const editor = document.getElementById(`text-editor-${textObject.id}`);
        editor?.focus();
      });
    };

    const handleObjectsUpdate = (nextObjects: DrawObject[]) => {
      syncObjects(nextObjects);
      setEditingText(core.currentText ?? null);
    };

    const handleSelectionChange = (selectedIds: Set<string>) => {
      const imageId = [...selectedIds].find((id) => {
        const obj = core.objects.find(item => item.id === id);
        return obj?.type === DrawType.IMAGE;
      }) ?? null;
      selectedImageIdRef.current = imageId;
      setSelectedImageId(imageId);
    };

    core.on('objectsUpdate', handleObjectsUpdate);
    core.on('transform', syncTransform);
    core.on('modeChange', syncMode);
    core.on('toolbarOpenChange', syncToolbar);
    core.on('textAdded', handleTextAdded);
    core.on('selectionChange', handleSelectionChange);

    syncObjects(core.objects);
    syncTransform(core.transformState);
    syncMode(core.drawingMode);
    syncToolbar(core.isToolbarOpen);
    setBrushColor(core.brushColor);
    setBrushThickness(core.brushThickness);
    setFontSize(core.fontSize);

    onRender?.(boardApi);

    const handleResize = () => {
      updateBoardSize();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(wrapper);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      stopEditingText();
      coreRef.current = null;
      setObjects([]);
      setEditingText(null);
      selectedImageIdRef.current = null;
      setSelectedImageId(null);
    };
  }, [open, data, updateBoardSize, boardApi, onRender, stopEditingText]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.brushColor = brushColor;
  }, [brushColor]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.brushThickness = brushThickness;
  }, [brushThickness]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.fontSize = fontSize;
    if (core.currentText) {
      setEditingText({ ...core.currentText, fontSize });
    }
  }, [fontSize]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.openToolBar(isToolbarOpen);
  }, [isToolbarOpen]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const core = coreRef.current;
    if (!core) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        stopEditingText();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, stopEditingText]);

  useEffect(() => {
    if (editingText) {
      setFontSize(editingText.fontSize);
      setBrushColor(editingText.color);
    }
  }, [editingText]);

  const selectedImage = useMemo(() => {
    if (!selectedImageId) return null;
    return objects.find((obj): obj is DrawImage => obj.type === DrawType.IMAGE && obj.id === selectedImageId) ?? null;
  }, [selectedImageId, objects]);

  const lockIconStyle = useMemo(() => {
    const core = coreRef.current;
    if (!selectedImage || !core) {
      return { display: 'none' as const };
    }

    const { scale, offsetX, offsetY } = core.transformState;
    const iconX = selectedImage.x + selectedImage.width;
    const iconY = selectedImage.y;

    const screenX = iconX * scale + offsetX;
    const screenY = iconY * scale + offsetY;

    return {
      display: 'block' as const,
      top: `${screenY}px`,
      left: `${screenX}px`,
    };
  }, [selectedImage, transform]);

  if (!open) return null;

  return (
    <div className="modal-container">
      <div className="modal-overlay" onClick={handleCloseBoard} />
      <span className="modal-version">v{version}</span>
      <button className="close-button" onClick={handleCloseBoard}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div ref={wrapperRef} className={`whiteboard-wrapper cursor-${drawingMode}`} onClick={handleCanvasClick}>
        {/* HybridRenderer will mount layers into this wrapper */}

        <div className="react-whiteboard-canvas" />

        {/* Text Editor Overlay */}
        {editingText && (
          <div
            id={`text-editor-${editingText.id}`}
            contentEditable
            className="text-editor"
            style={{
              position: 'absolute',
              left: `${editingText.x * transform.scale + transform.offsetX}px`,
              top: `${editingText.y * transform.scale + transform.offsetY}px`,
              color: editingText.color,
              fontSize: `${editingText.fontSize * transform.scale}px`,
              lineHeight: 1.2,
              transformOrigin: 'top left',
            }}
            onBlur={stopEditingText}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                stopEditingText();
              }
            }}
          >
            {editingText.text}
          </div>
        )}

        {/* Lock Icon for selected image */}
        {selectedImage && (
          <button className="lock-icon" style={lockIconStyle} onClick={toggleImageLock}>
            {selectedImage.locked ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            )}
          </button>
        )}

        {/* Toolbar */}
        <div className={`toolbar ${isToolbarOpen ? 'is-open' : ''}`}>
          <div className="toolbar-group">
            <input
              id="color-picker"
              type="color"
              value={brushColor}
              onChange={(event) => setBrushColor(event.target.value)}
            />
          </div>
          <div className="toolbar-group brush-preview-group">
            <span
              className="brush-preview"
              style={{
                width: `${brushThickness}px`,
                height: `${brushThickness}px`,
                backgroundColor: brushColor,
              }}
            />
            <input
              id="brush-thickness"
              type="range"
              min="1"
              max="50"
              value={brushThickness}
              onChange={(event) => setBrushThickness(Number(event.target.value))}
            />
          </div>
          <div className="toolbar-group">
            <button
              className={drawingMode === DrawMode.DRAW ? 'active' : ''}
              title="Карандаш"
              onClick={() => setDrawingMode(DrawMode.DRAW)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
            <button
              className={drawingMode === DrawMode.ERASE ? 'active' : ''}
              title="Ластик"
              onClick={() => setDrawingMode(DrawMode.ERASE)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21H7zM5 12l5 5m-9 4h16" />
              </svg>
            </button>
            <button
              className={drawingMode === DrawMode.TEXT ? 'active' : ''}
              title="Текст"
              onClick={() => setDrawingMode(DrawMode.TEXT)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="9" y1="20" x2="15" y2="20" />
                <line x1="12" y1="4" x2="12" y2="20" />
              </svg>
            </button>
            <button
              className={drawingMode === DrawMode.SELECT ? 'active' : ''}
              title="Выделение"
              onClick={() => setDrawingMode(DrawMode.SELECT)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"></path>
                <path d="M13 13l6 6"></path>
              </svg>
            </button>
            <button
              className={drawingMode === DrawMode.PAN ? 'active' : ''}
              title="Перемещение"
              onClick={() => setDrawingMode(DrawMode.PAN)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="5 9 2 12 5 15" />
                <polyline points="9 5 12 2 15 5" />
                <polyline points="15 19 12 22 9 19" />
                <polyline points="19 9 22 12 19 15" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <line x1="12" y1="2" x2="12" y2="22" />
              </svg>
            </button>
          </div>
          <div className="toolbar-group">
            <button disabled={!canUndo} title="Отмена" onClick={handleUndo}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9h13a5 5 0 0 1 5 5v2" />
                <path d="m7 13-4-4 4-4" />
              </svg>
            </button>
            <button disabled={!canRedo} title="Повтор" onClick={handleRedo}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 9H8a5 5 0 0 0-5 5v2" />
                <path d="m17 13 4-4-4-4" />
              </svg>
            </button>
          </div>
          <div className="toolbar-group">
            <button className="save-btn" title="Сохранить" onClick={handleSave}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Whiteboard;

