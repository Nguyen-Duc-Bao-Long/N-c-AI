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
  /*
    Cursor
  */
  getCursorPosition:
    () => Promise<CursorPosition>


  /*
    Model Library
  */
  listModels:
    () => Promise<
      ImportedModelInfo[]
    >


  importModel:
    () => Promise<
      ImportedModelInfo | null
    >


  /*
    Delete imported model.
  */
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