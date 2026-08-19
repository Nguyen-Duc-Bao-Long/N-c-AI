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


/*
  ============================================================
  F.A.T RESOURCE API
  ============================================================
*/

type FatResourceKind =
  | 'character'
  | 'visual'
  | 'brain'
  | 'stt'
  | 'tts'


type FatResourceOrigin =
  | 'builtin'
  | 'user'


interface FatResourceRecord {
  id: string
  name: string
  kind: FatResourceKind
  origin: FatResourceOrigin
  locked: boolean
}


interface FatResourceSnapshot {
  characters: FatResourceRecord[]
  visuals: FatResourceRecord[]
  brains: FatResourceRecord[]
  stt: FatResourceRecord[]
  tts: FatResourceRecord[]
}


interface FatDefaultResources {
  character: string
  visual: string
  brain: string
  stt: string
  tts: string
}


interface FatResourceStatus {
  ready: boolean
  total: number

  missingDefaultResources:
    string[]

  counts: {
    character: number
    visual: number
    brain: number
    stt: number
    tts: number
  }
}


interface FatResourcesAPI {
  list:
    (
      kind?:
        FatResourceKind
    ) => Promise<
      FatResourceRecord[]
    >

  get:
    (
      kind:
        FatResourceKind,
      id:
        string
    ) => Promise<
      FatResourceRecord |
      null
    >

  snapshot:
    () => Promise<
      FatResourceSnapshot
    >

  getDefaults:
    () => Promise<
      FatDefaultResources
    >

  getStatus:
    () => Promise<
      FatResourceStatus
    >
}


interface FatAPI {
  resources:
    FatResourcesAPI
}


declare global {
  interface Window {
    electron:
      ElectronAPI

    api:
      AppAPI

    fat:
      FatAPI
  }
}


export {}