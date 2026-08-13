/// <reference types="vite/client" />

import type {
  ElectronAPI
} from '@electron-toolkit/preload'


interface CursorPosition {
  x: number
  y: number
}


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


interface AppAPI {
  getCursorPosition:
    () => Promise<CursorPosition>


  listModels:
    () => Promise<
      ImportedModelInfo[]
    >


  importModel:
    () => Promise<
      ImportedModelInfo | null
    >


  deleteModel:
    (
      id: string
    ) => Promise<boolean>
}


declare global {
  interface Window {
    electron:
      ElectronAPI

    api:
      AppAPI
  }
}


export {}