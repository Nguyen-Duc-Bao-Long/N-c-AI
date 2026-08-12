import type {
  ElectronAPI
} from '@electron-toolkit/preload'


/*
  ============================================================
  TYPES
  ============================================================
*/

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
  /*
    Cursor tracking.
  */
  getCursorPosition:
    () => Promise<CursorPosition>


  /*
    Trả về danh sách model
    user đã import.
  */
  listModels:
    () => Promise<ImportedModelInfo[]>


  /*
    Mở file picker và import
    một model mới.

    null = user bấm Cancel.
  */
  importModel:
    () => Promise<ImportedModelInfo | null>
}


/*
  ============================================================
  WINDOW GLOBAL
  ============================================================
*/

declare global {
  interface Window {
    electron: ElectronAPI

    api: AppAPI
  }
}