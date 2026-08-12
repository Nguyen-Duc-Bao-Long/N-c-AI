/// <reference types="vite/client" />

import type {
  ElectronAPI
} from '@electron-toolkit/preload'


/*
  ============================================================
  CURSOR
  ============================================================
*/

interface CursorPosition {
  x: number
  y: number
}


/*
  ============================================================
  MODELS
  ============================================================
*/

interface ModelTransform {
  scale: number
  x: number
  y: number
}


interface ImportedModelInfo {
  id: string
  name: string
  modelUrl: string
  transform: ModelTransform
}


/*
  ============================================================
  APP API
  ============================================================
*/

interface AppAPI {
  getCursorPosition:
    () => Promise<CursorPosition>


  listModels:
    () => Promise<ImportedModelInfo[]>


  importModel:
    () => Promise<ImportedModelInfo | null>
}


/*
  ============================================================
  WINDOW
  ============================================================
*/

declare global {
  interface Window {
    electron: ElectronAPI

    api: AppAPI
  }
}


export {}