import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  screen as electronScreen,
  dialog,
  protocol,
  net
} from 'electron'

import {
  cp,
  mkdir,
  readFile,
  writeFile
} from 'node:fs/promises'

import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path'

import {
  pathToFileURL
} from 'node:url'

import {
  randomUUID
} from 'node:crypto'

import {
  electronApp,
  optimizer,
  is
} from '@electron-toolkit/utils'


/*
  ============================================================
  TYPES
  ============================================================
*/

type ImportedModelInfo = {
  id: string

  name: string

  modelUrl: string

  transform: {
    scale: number
    x: number
    y: number
  }
}


/*
  ============================================================
  CUSTOM PROTOCOL
  ============================================================

  Phải đăng ký BEFORE app.ready.

  Ví dụ model import sẽ có URL:

  live2d-model://miku-abc123/miku.model3.json

  Các path tương đối bên trong model3.json như:

  textures/texture_00.png
  expressions/happy.exp3.json
  motions/wave.motion3.json

  cũng có thể resolve qua cùng protocol.
*/

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'live2d-model',

    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
])


/*
  ============================================================
  MODEL LIBRARY PATHS
  ============================================================
*/

function getModelLibraryRoot():
  string {
  return join(
    app.getPath('userData'),
    'model-library'
  )
}


function getImportedModelsRoot():
  string {
  return join(
    getModelLibraryRoot(),
    'models'
  )
}


function getModelIndexPath():
  string {
  return join(
    getModelLibraryRoot(),
    'index.json'
  )
}


/*
  Tạo folder Model Library nếu chưa có.
*/
async function ensureModelLibrary():
  Promise<void> {
  await mkdir(
    getImportedModelsRoot(),
    {
      recursive: true
    }
  )
}


/*
  ============================================================
  MODEL LIBRARY INDEX
  ============================================================
*/

async function readImportedModels():
  Promise<ImportedModelInfo[]> {
  await ensureModelLibrary()


  try {
    const content =
      await readFile(
        getModelIndexPath(),
        'utf8'
      )


    const parsed =
      JSON.parse(
        content
      )


    if (
      !Array.isArray(
        parsed
      )
    ) {
      return []
    }


    return parsed as ImportedModelInfo[]
  }
  catch {
    /*
      Lần đầu chạy chưa có index.json
      thì trả về danh sách rỗng.
    */
    return []
  }
}


async function writeImportedModels(
  models: ImportedModelInfo[]
): Promise<void> {
  await ensureModelLibrary()


  await writeFile(
    getModelIndexPath(),

    JSON.stringify(
      models,
      null,
      2
    ),

    'utf8'
  )
}


/*
  ============================================================
  MODEL ID
  ============================================================
*/

function createModelId(
  modelName: string
): string {
  /*
    Chuyển tên thành ID an toàn cho URL.

    Ví dụ:

    My Akari
       ↓
    my-akari-UUID
  */

  const slug =
    modelName
      .toLowerCase()
      .normalize('NFKD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-z0-9_-]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )


  return `${
    slug || 'model'
  }-${randomUUID()}`
}


/*
  ============================================================
  IMPORT LIVE2D MODEL
  ============================================================
*/

async function importLive2DModel(
  parentWindow: BrowserWindow
): Promise<ImportedModelInfo | null> {
  /*
    Mở native Windows file picker.
  */
  const result =
    await dialog.showOpenDialog(
      parentWindow,
      {
        title:
          'Import Live2D Model',

        buttonLabel:
          'Import Model',

        properties: [
          'openFile'
        ],

        filters: [
          {
            name:
              'Live2D Model (*.model3.json)',

            /*
              Electron filter theo extension,
              nên cho phép JSON rồi kiểm tra
              model3.json ở phía dưới.
            */
            extensions: [
              'json'
            ]
          }
        ]
      }
    )


  /*
    User bấm Cancel.
  */
  if (
    result.canceled ||
    result.filePaths.length === 0
  ) {
    return null
  }


  const selectedFile =
    result.filePaths[0]


  if (!selectedFile) {
    return null
  }


  /*
    Chỉ chấp nhận *.model3.json.
  */
  if (
    !selectedFile
      .toLowerCase()
      .endsWith(
        '.model3.json'
      )
  ) {
    throw new Error(
      'Please select a .model3.json file.'
    )
  }


  /*
    Folder nguồn.

    Ví dụ:

    D:\Models\Miku\
  */
  const sourceFolder =
    dirname(
      selectedFile
    )


  /*
    miku.model3.json
  */
  const modelFileName =
    basename(
      selectedFile
    )


  /*
    miku.model3.json
       ↓
    miku
  */
  const modelName =
    modelFileName.replace(
      /\.model3\.json$/i,
      ''
    )


  /*
    ID duy nhất.
  */
  const id =
    createModelId(
      modelName
    )


  /*
    Folder đích:

    userData/
      model-library/
        models/
          miku-UUID/
  */
  const destinationFolder =
    join(
      getImportedModelsRoot(),
      id
    )


  /*
    Copy NGUYÊN folder model.

    Bao gồm:
    - moc3
    - texture
    - physics
    - expression
    - motion
    - model3.json
    - ...
  */
  await cp(
    sourceFolder,
    destinationFolder,
    {
      recursive: true
    }
  )


  /*
    URL model runtime.
  */
  const modelUrl =
    `live2d-model://${id}/${encodeURIComponent(
      modelFileName
    )}`


  const modelInfo:
    ImportedModelInfo = {
      id,

      name:
        modelName,

      modelUrl,

      /*
        Giá trị mặc định.
        Sau này Model Settings
        có thể chỉnh riêng từng model.
      */
      transform: {
        scale: 0.9,

        x: 0.5,

        y: 0.5
      }
    }


  /*
    Thêm vào index.
  */
  const models =
    await readImportedModels()


  models.push(
    modelInfo
  )


  await writeImportedModels(
    models
  )


  console.log(
    '[Models] Imported:',
    modelInfo
  )


  return modelInfo
}


/*
  ============================================================
  MODEL PROTOCOL
  ============================================================
*/

function registerModelProtocol():
  void {
  protocol.handle(
    'live2d-model',

    async (
      request
    ) => {
      try {
        /*
          Ví dụ:

          live2d-model://MODEL_ID/texture.png
        */
        const requestUrl =
          new URL(
            request.url
          )


        /*
          MODEL_ID
        */
        const modelId =
          requestUrl.hostname


        /*
          /expressions/happy.exp3.json
             ↓
          expressions/happy.exp3.json
        */
        const requestedPath =
          decodeURIComponent(
            requestUrl.pathname
          )
            .replace(
              /^\/+/,
              ''
            )


        /*
          Root model.
        */
        const modelRoot =
          resolve(
            getImportedModelsRoot(),
            modelId
          )


        /*
          File user đang request.
        */
        const filePath =
          resolve(
            modelRoot,
            requestedPath
          )


        /*
          ============================================
          SECURITY
          ============================================

          Không cho URL:

          ../../file

          thoát ra ngoài folder model.
        */
        const relativePath =
          relative(
            modelRoot,
            filePath
          )


        if (
          relativePath.startsWith(
            '..'
          ) ||
          isAbsolute(
            relativePath
          )
        ) {
          return new Response(
            'Forbidden',
            {
              status: 403
            }
          )
        }


        /*
          Dùng Electron net.fetch
          để đọc file local.
        */
        return await net.fetch(
          pathToFileURL(
            filePath
          ).toString()
        )
      }
      catch (error) {
        console.error(
          '[Models] Protocol error:',
          error
        )


        return new Response(
          'Model file not found',
          {
            status: 404
          }
        )
      }
    }
  )
}


/*
  ============================================================
  IPC
  ============================================================
*/

function registerIpcHandlers():
  void {
  /*
    ----------------------------------------------------------
    CURSOR POSITION
    ----------------------------------------------------------
  */

  ipcMain.handle(
    'cursor:get-position',

    (
      event
    ) => {
      const mainWindow =
        BrowserWindow.fromWebContents(
          event.sender
        )


      if (!mainWindow) {
        return {
          x: 0,
          y: 0
        }
      }


      /*
        Vị trí con trỏ trên toàn Desktop.
      */
      const cursorPosition =
        electronScreen
          .getCursorScreenPoint()


      /*
        Bounds của vùng renderer.
      */
      const windowBounds =
        mainWindow
          .getContentBounds()


      /*
        Desktop coordinate
           ↓
        Window coordinate
      */
      return {
        x:
          cursorPosition.x -
          windowBounds.x,

        y:
          cursorPosition.y -
          windowBounds.y
      }
    }
  )


  /*
    ----------------------------------------------------------
    MODEL LIST
    ----------------------------------------------------------
  */

  ipcMain.handle(
    'models:list',

    async () => {
      return await readImportedModels()
    }
  )


  /*
    ----------------------------------------------------------
    IMPORT MODEL
    ----------------------------------------------------------
  */

  ipcMain.handle(
    'models:import',

    async (
      event
    ) => {
      const mainWindow =
        BrowserWindow.fromWebContents(
          event.sender
        )


      if (!mainWindow) {
        return null
      }


      try {
        return await importLive2DModel(
          mainWindow
        )
      }
      catch (error) {
        console.error(
          '[Models] Import failed:',
          error
        )


        throw error
      }
    }
  )


  /*
    IPC test của template Electron.
  */
  ipcMain.on(
    'ping',
    () => {
      console.log(
        'pong'
      )
    }
  )
}


/*
  ============================================================
  CREATE WINDOW
  ============================================================
*/

function createWindow():
  void {
  const mainWindow =
    new BrowserWindow({
      width:
        500,

      height:
        700,


      /*
        Đợi renderer sẵn sàng
        rồi mới show.
      */
      show:
        false,


      /*
        Không title bar.
      */
      frame:
        false,


      /*
        Nền trong suốt.
      */
      transparent:
        true,


      /*
        Transparent window hiện tại
        không resize bằng tay.
      */
      resizable:
        false,


      /*
        Không shadow hệ điều hành.
      */
      hasShadow:
        false,


      /*
        Character luôn nổi phía trên.
      */
      alwaysOnTop:
        true,


      /*
        Không menu Electron mặc định.
      */
      autoHideMenuBar:
        true,


      /*
        Transparent hoàn toàn.
      */
      backgroundColor:
        '#00000000',


      webPreferences: {
        preload:
          join(
            __dirname,
            '../preload/index.js'
          ),

        sandbox:
          false
      }
    })


  /*
    Khi renderer sẵn sàng.
  */
  mainWindow.on(
    'ready-to-show',

    () => {
      mainWindow.show()
    }
  )


  /*
    Link ngoài app mở bằng browser.
  */
  mainWindow.webContents
    .setWindowOpenHandler(
      (
        details
      ) => {
        void shell.openExternal(
          details.url
        )


        return {
          action:
            'deny'
        }
      }
    )


  /*
    Development:
    Vite dev server.

    Production:
    renderer/index.html.
  */
  if (
    is.dev &&
    process.env[
      'ELECTRON_RENDERER_URL'
    ]
  ) {
    void mainWindow.loadURL(
      process.env[
        'ELECTRON_RENDERER_URL'
      ]
    )
  }
  else {
    void mainWindow.loadFile(
      join(
        __dirname,
        '../renderer/index.html'
      )
    )
  }
}


/*
  ============================================================
  APP READY
  ============================================================
*/

app.whenReady().then(
  async () => {
    /*
      Windows App ID.
    */
    electronApp
      .setAppUserModelId(
        'com.electron'
      )


    /*
      Tạo Model Library.
    */
    await ensureModelLibrary()


    /*
      Custom protocol phải được handle
      sau khi Electron ready.
    */
    registerModelProtocol()


    /*
      IPC:
      - cursor
      - model list
      - import
    */
    registerIpcHandlers()


    /*
      Dev shortcuts.
    */
    app.on(
      'browser-window-created',

      (
        _,
        window
      ) => {
        optimizer
          .watchWindowShortcuts(
            window
          )
      }
    )


    /*
      Tạo cửa sổ character.
    */
    createWindow()


    /*
      macOS:
      click dock icon để mở lại window.
    */
    app.on(
      'activate',

      () => {
        if (
          BrowserWindow
            .getAllWindows()
            .length === 0
        ) {
          createWindow()
        }
      }
    )
  }
)


/*
  ============================================================
  WINDOW CLOSED
  ============================================================
*/

app.on(
  'window-all-closed',

  () => {
    /*
      macOS thường giữ app chạy
      khi đóng toàn bộ window.
    */
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit()
    }
  }
)