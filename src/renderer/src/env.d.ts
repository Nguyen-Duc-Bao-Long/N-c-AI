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
  /*
    Cursor
  */
  getCursorPosition:
    () => Promise<CursorPosition>


  /*
    Mouse Passthrough

    true:
    click xuyên qua transparent window.

    false:
    Electron window nhận mouse event.
  */
  setIgnoreMouseEvents:
    (
      ignore: boolean
    ) => void


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

/*
  ============================================================
  STARTUP MODEL SETTINGS
  ============================================================
*/

getStartupModelId:
  () => Promise<
    string | null
  >

setStartupModelId:
  (
    modelId: string
  ) => Promise<
    string | null
  >

resetStartupModelId:
  () => Promise<
    boolean
  >

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