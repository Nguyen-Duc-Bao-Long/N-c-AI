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
  MODEL TRANSFORM
  ============================================================
*/

interface ModelTransform {
  scale: number
  x: number
  y: number
}


/*
  ============================================================
  IMPORTED MODEL
  ============================================================
*/

interface ImportedModelInfo {
  id: string

  name: string

  modelUrl: string

  transform:
    ModelTransform
}


/*
  ============================================================
  APP API
  ============================================================
*/

interface AppAPI {
  /*
    ==========================================================
    CURSOR
    ==========================================================
  */

  getCursorPosition:
    () => Promise<
      CursorPosition
    >


  /*
    ==========================================================
    MOUSE PASSTHROUGH
    ==========================================================

    true:
      Electron window bỏ qua mouse event.
      Click xuyên xuống desktop/app bên dưới.

    false:
      Electron window nhận mouse event.
  */

  setIgnoreMouseEvents:
    (
      ignore: boolean
    ) => void


  /*
    ==========================================================
    MODEL LIBRARY
    ==========================================================
  */

  /*
    Lấy danh sách model
    đã được import.
  */

  listModels:
    () => Promise<
      ImportedModelInfo[]
    >


  /*
    Import một Live2D model.

    User hủy chọn file:
      null

    Import thành công:
      ImportedModelInfo
  */

  importModel:
    () => Promise<
      ImportedModelInfo |
      null
    >


  /*
    ==========================================================
    DELETE IMPORTED MODEL
    ==========================================================

    true:
      xóa thành công.

    false:
      không xóa được / user hủy.
  */

  deleteModel:
    (
      id: string
    ) => Promise<
      boolean
    >


  /*
    ==========================================================
    STARTUP MODEL SETTINGS
    ==========================================================

    Startup model:
      model mà user muốn tự động
      xuất hiện khi mở app.

    Nó KHÔNG phải built-in fallback.

    Built-in fallback được quản lý
    riêng bởi FALLBACK_CHARACTER_ID
    bên renderer.
  */


  /*
    ==========================================================
    GET STARTUP MODEL
    ==========================================================

    string:
      user đã chọn startup model.

    null:
      user chưa chọn startup model
      hoặc đọc settings thất bại.

    Khi null:
      renderer sẽ dùng
      FALLBACK_CHARACTER_ID.
  */

  getStartupModelId:
    () => Promise<
      string |
      null
    >


  /*
    ==========================================================
    SET STARTUP MODEL
    ==========================================================

    modelId:
      ID model được user chọn
      làm startup model.

    Return:

      string:
        ID đã được lưu.

      null:
        lưu thất bại.
  */

  setStartupModelId:
    (
      modelId: string
    ) => Promise<
      string |
      null
    >


  /*
    ==========================================================
    RESET STARTUP MODEL
    ==========================================================

    Reset startupModelId về null.

    KHÔNG hard-code:
      Akari

    Nhờ vậy sau này bạn đổi
    built-in model thì phần settings
    không cần thay đổi.

    true:
      reset thành công.

    false:
      reset thất bại.
  */

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


/*
  ============================================================
  GLOBAL WINDOW
  ============================================================
*/

declare global {
  interface Window {
    /*
      Electron Toolkit API.
    */

    electron:
      ElectronAPI


    /*
      API riêng của project.
    */

    api:
      AppAPI


    /*
      API mới của F.A.T Resource System.
    */

    fat:
      FatAPI
  }
}