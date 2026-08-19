import {
  contextBridge,
  ipcRenderer
} from 'electron'

import {
  electronAPI
} from '@electron-toolkit/preload'


/*
  ============================================================
  F.A.T RESOURCE API TYPES
  ============================================================
*/

type FatResourceKind =
  | 'character'
  | 'visual'
  | 'brain'
  | 'stt'
  | 'tts'


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
      ),


  /*
    ==========================================================
    STARTUP MODEL SETTINGS
    ==========================================================

    Đây là model user muốn
    tự động mở khi app khởi động.

    Nó KHÔNG phải built-in fallback.

    Built-in fallback hiện tại
    đang là Akari, nhưng sau này
    bạn có thể đổi sang model khác.
  */


  /*
    ==========================================================
    GET STARTUP MODEL
    ==========================================================

    Trả về:

      string
        → user đã chọn startup model

      null
        → user chưa chọn startup model

    Ví dụ:

      const id =
        await window.api
          .getStartupModelId()

      id === 'hiyori'
  */

  getStartupModelId:
    () =>
      ipcRenderer.invoke(
        'settings:get-startup-model'
      ),


  /*
    ==========================================================
    SET STARTUP MODEL
    ==========================================================

    Ví dụ:

      await window.api
        .setStartupModelId(
          'hiyori'
        )

    Main process sẽ lưu:

      startupModelId: "hiyori"
  */

  setStartupModelId:
    (
      modelId: string
    ) =>
      ipcRenderer.invoke(
        'settings:set-startup-model',
        modelId
      ),


  /*
    ==========================================================
    RESET STARTUP MODEL
    ==========================================================

    Đưa startupModelId về null.

    KHÔNG reset trực tiếp về Akari.

    Renderer sau đó sẽ dùng:

      FALLBACK_CHARACTER_ID

    Nhờ vậy sau này đổi built-in
    model không cần sửa settings.
  */

  resetStartupModelId:
    () =>
      ipcRenderer.invoke(
        'settings:reset-startup-model'
      )
}


/*
  ============================================================
  F.A.T API
  ============================================================

  Legacy API:
    window.api

  Resource System API:
    window.fat.resources
*/


const fat = {
  resources: {
    list:
      (
        kind?:
          FatResourceKind
      ) =>
        ipcRenderer.invoke(
          'fat:resources:list',
          kind
        ),


    get:
      (
        kind:
          FatResourceKind,

        id:
          string
      ) =>
        ipcRenderer.invoke(
          'fat:resources:get',
          kind,
          id
        ),


    snapshot:
      () =>
        ipcRenderer.invoke(
          'fat:resources:snapshot'
        ),


    getDefaults:
      () =>
        ipcRenderer.invoke(
          'fat:resources:get-defaults'
        ),


    getStatus:
      () =>
        ipcRenderer.invoke(
          'fat:resources:get-status'
        )
  }
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


    /*
      F.A.T Resource API.
    */

    contextBridge
      .exposeInMainWorld(
        'fat',
        fat
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


  // @ts-ignore
  window.fat =
    fat
}