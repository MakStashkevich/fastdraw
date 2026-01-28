import { useState, useEffect, useRef, useCallback, RefObject } from 'react';
import { FastDrawCore } from '../../core/FastDrawCore';
import type { FastDrawData, DrawObject, DrawMode } from '../../types';

export const useWhiteboard = (
  initialData?: FastDrawData,
  wrapperRef?: RefObject<HTMLDivElement | null>
) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [core] = useState(() => new FastDrawCore(initialData));
  const [objects, setObjects] = useState<DrawObject[]>(core.objects);
  const [transform, setTransform] = useState(core.transformState);
  const [drawingMode, setDrawingModeState] = useState<DrawMode>(core.drawingMode);

  const setDrawingMode = useCallback((mode: DrawMode) => {
    core.drawingMode = mode;
    setDrawingModeState(mode);
  }, [core]);

  useEffect(() => {
    if (svgRef.current) {
      // Set wrapper element if provided
      if (wrapperRef?.current) {
        core.setWrapperElement(wrapperRef.current);
      }
      
      core.on('objectsUpdate', (newObjects) => {
        setObjects([...newObjects]);
      });
      
      core.on('transform', (newTransform) => {
        setTransform({ ...newTransform });
      });

      core.on('modeChange', (mode) => {
        setDrawingModeState(mode);
      });

      // Sync initial state
      setObjects([...core.objects]);
      setTransform({ ...core.transformState });
    }
    return () => {};
  }, [core, wrapperRef]);

  useEffect(() => {
    if (initialData) {
      core.loadData(initialData);
    }
  }, [initialData, core]);

  return {
    svgRef,
    core,
    objects,
    transform,
    drawingMode,
    setDrawingMode,
  };
};
