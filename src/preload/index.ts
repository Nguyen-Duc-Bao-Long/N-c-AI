import {
  contextBridge,
  ipcRenderer
} from 'electron'

import {
  electronAPI
} from '@electron-toolkit/preload'


/*
  ============================================================
  TYPES
  ============================================================
*/

type CursorPosition = {
  x: number
  y: number
}


type ModelTransform = {
  scale: number
  x: number
  y: number
}


type ImportedModelInfo = {
  id: string
  name: string
  modelUrl: string
  transform: ModelTransform
}


/*
  ============================================================
  APP API
  ============================================================

  Chỉ expose những chức năng renderer thực sự cần.
*/

const api = {
  /*
    ----------------------------------------------------------
    CURSOR
    ----------------------------------------------------------
  */

  getCursorPosition:
    (): Promise<CursorPosition> => {
      return ipcRenderer.invoke(
        'cursor:get-position'
      )
    },


  /*
    ----------------------------------------------------------
    MODEL LIBRARY
    ----------------------------------------------------------
  */

  listModels:
    (): Promise<ImportedModelInfo[]> => {
      return ipcRenderer.invoke(
        'models:list'
      )
    },


  importModel:
    (): Promise<ImportedModelInfo | null> => {
      return ipcRenderer.invoke(
        'models:import'
      )
    }
}


/*
  ============================================================
  EXPOSE TO RENDERER
  ============================================================
*/

if (
  process.contextIsolated
) {
  try {
    /*
      API mặc định của electron-toolkit.
    */
    contextBridge.exposeInMainWorld(
      'electron',
      electronAPI
    )


    /*
      API riêng của app.
    */
    contextBridge.exposeInMainWorld(
      'api',
      api
    )
  }
  catch (error) {
    console.error(
      '[Preload] Failed to expose APIs:',
      error
    )
  }
}
else {
  /*
    Fallback nếu contextIsolation tắt.
  */

  // @ts-ignore
  window.electron =
    electronAPI

  // @ts-ignore
  window.api =
    api
}