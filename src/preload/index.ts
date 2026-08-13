import {
  contextBridge,
  ipcRenderer
} from 'electron'

import {
  electronAPI
} from '@electron-toolkit/preload'


/*
  ============================================================
  APP API
  ============================================================
*/

const api = {
  /*
    ==========================================================
    CURSOR
    ==========================================================
  */

  getCursorPosition:
    () =>
      ipcRenderer.invoke(
        'cursor:get-position'
      ),


  /*
    ==========================================================
    MOUSE PASSTHROUGH
    ==========================================================

    ignore = true
      → Electron window bỏ qua mouse click
      → click xuyên xuống desktop/app bên dưới.

    ignore = false
      → Electron window nhận mouse event.

    Dùng cho kiến trúc mới:
    BrowserWindow full-screen transparent
    nhưng chỉ character / controls nhận chuột.
  */

  setIgnoreMouseEvents:
    (
      ignore: boolean
    ): void => {
      ipcRenderer.send(
        'window:set-ignore-mouse-events',
        ignore
      )
    },


  /*
    ==========================================================
    MODEL LIBRARY
    ==========================================================
  */

  listModels:
    () =>
      ipcRenderer.invoke(
        'models:list'
      ),


  importModel:
    () =>
      ipcRenderer.invoke(
        'models:import'
      ),


  /*
    ==========================================================
    DELETE IMPORTED MODEL
    ==========================================================

    Renderer:

      window.api.deleteModel(id)

            ↓

    Preload:

      ipcRenderer.invoke(
        'models:delete',
        id
      )

            ↓

    Main:

      ipcMain.handle(
        'models:delete'
      )
  */

  deleteModel:
    (
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
    /*
      Electron Toolkit API.
    */
    contextBridge
      .exposeInMainWorld(
        'electron',
        electronAPI
      )


    /*
      API riêng của project.
    */
    contextBridge
      .exposeInMainWorld(
        'api',
        api
      )
  }
  catch (error) {
    console.error(
      '[Preload] Failed to expose API:',
      error
    )
  }
}
else {
  /*
    Fallback khi contextIsolation
    bị tắt.
  */

  // @ts-ignore
  window.electron =
    electronAPI


  // @ts-ignore
  window.api =
    api
}