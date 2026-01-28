'use client';

import { useState } from 'react';
import FastDraw from 'fastdraw/react';
import 'fastdraw/react/style.css';

export default function Home() {
  const [isWhiteboardOpen, setIsWhiteboardOpen] = useState(false);

  const addBaseImageToWhiteboard = (api: any) => {
    // Пример добавления базового изображения
    // api.addImage('https://example.com/base-image.jpg', 100, 100, 400, 300);
    console.log('Whiteboard rendered, API available:', api);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-blue-50 to-indigo-100">
      <h1 className="text-4xl font-bold mb-8 text-gray-900">FastDraw NextJs (React) Example</h1>
      <button
        onClick={() => setIsWhiteboardOpen(true)}
        className="px-8 py-4 bg-blue-600 text-white font-semibold rounded-lg shadow-lg hover:bg-blue-700 transition-colors text-xl"
      >
        Открыть доску FastDraw
      </button>
      <FastDraw
        open={isWhiteboardOpen}
        onCloseBoard={() => setIsWhiteboardOpen(false)}
        onRender={addBaseImageToWhiteboard}
      />
    </main>
  );
}
