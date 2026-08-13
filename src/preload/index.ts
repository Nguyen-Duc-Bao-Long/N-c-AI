import {
  contextBridge,
  ipcRenderer
} from 'electron'

import {
  electronAPI
} from '@electron-toolkit/preload'


const api = {
  /*
    ==========================================================
    CURSOR
    ==========================================================
  */

  getCursorPosition: () =>
    ipcRenderer.invoke(
      'cursor:get-position'
    ),


  /*
    ==========================================================
    MODEL LIBRARY
    ==========================================================
  */

  listModels: () =>
    ipcRenderer.invoke(
      'models:list'
    ),


  importModel: () =>
    ipcRenderer.invoke(
      'models:import'
    ),


  /*
    Xóa model imported.

    Renderer:
      window.api.deleteModel(id)

           ↓

    Main:
      ipcMain.handle('models:delete')
  */
  deleteModel: (
    id: string
  ) =>
    ipcRenderer.invoke(
      'models:delete',
      id
    )
}


/*
  ============================================================
  EXPOSE API
  ============================================================
*/

if (
  process.contextIsolated
) {
  try {
    contextBridge
      .exposeInMainWorld(
        'electron',
        electronAPI
      )


    contextBridge
      .exposeInMainWorld(
        'api',
        api
      )
  }
  catch (error) {
    console.error(
      error
    )
  }
}
else {
  // @ts-ignore
  window.electron =
    electronAPI

  // @ts-ignore
  window.api =
    api
}