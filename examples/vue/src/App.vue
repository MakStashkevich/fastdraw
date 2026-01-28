<script setup lang="ts">
import { ref } from 'vue'
import FastDraw from 'fastdraw/vue'

const isWhiteboardOpen = ref(false)

const addBaseImageToWhiteboard = (api: any) => {
  // Пример добавления базового изображения
  // api.addImage('https://example.com/base-image.jpg', 100, 100, 400, 300);
  console.log('Whiteboard rendered, API available:', api)
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-24 bg-gradient-to-br from-green-50 to-emerald-100">
    <h1 class="text-4xl font-bold mb-8 text-gray-900">FastDraw Vue Example</h1>
    <button 
      @click="isWhiteboardOpen = true"
      class="px-8 py-4 bg-emerald-600 text-white font-semibold rounded-lg shadow-lg hover:bg-emerald-700 transition-colors text-xl"
    >
      Открыть доску FastDraw
    </button>
    <FastDraw
      v-model:open="isWhiteboardOpen" 
      @onCloseBoard="isWhiteboardOpen = false"
      @onRender="addBaseImageToWhiteboard" 
    />
  </div>
</template>

<style scoped></style>
