import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  screen as electronScreen,
  dialog,
  protocol,
  net,
  Menu,
  Tray,
  nativeImage
} from 'electron'

import {
  getStartupModelId,
  setStartupModelId,
  resetStartupModelId
} from './settings'

import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
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
  MAIN WINDOW / SYSTEM TRAY
  ============================================================

  BrowserWindow vẫn skipTaskbar = true
  vì đây là desktop companion full-screen transparent.

  User sẽ quản lý app bằng System Tray:
  - Show Character
  - Hide Character
  - Exit

  Tray icon bên dưới được nhúng trực tiếp vào code để bản Beta
  vẫn luôn có icon kể cả khi chưa có build/icon.ico riêng.
*/

let mainWindow:
  BrowserWindow | null =
    null


let tray:
  Tray | null =
    null


const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA0klEQVR4nO2Xyw2EMAxEAdEONLGUBScoC5rYLWg5ESFC7Jl8iBD4hBTH8+zYUSiKp1upOfSf7z9EYFpaUcO5GCqMglRXiEsxLYAU4lLsSnNIDVGHBBvnxnwP3c8rhmkMJvu98NFQkK0pT5vwSqMBpOyR9WCA2HY/AK3J2GnIXgGve2DLMsY9QAO4utwXhjoCdMSYUYQB2PlG/SEAVpzZl30KXgAIwHfGkX0GQHu9shCS/16LOgIUgoG1sk79LjxW2qqAdhQxxU8BUkG4Ymb/NXttBelbUzpnNfUCAAAAAElFTkSuQmCC'


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


type Model3Expression = {
  Name: string
  File: string

  [key: string]: unknown
}


type Model3Motion = {
  File: string

  [key: string]: unknown
}


type Model3FileReferences = {
  Moc?: string

  Textures?: string[]

  Physics?: string

  UserData?: string

  DisplayInfo?: string

  Expressions?: Model3Expression[]

  Motions?: Record<
    string,
    Model3Motion[]
  >

  [key: string]: unknown
}


type Model3Json = {
  Version?: number

  FileReferences?: Model3FileReferences

  Groups?: unknown[]

  [key: string]: unknown
}


type PreprocessResult = {
  expressions: string[]

  motionGroups: Record<
    string,
    string[]
  >
}


/*
  ============================================================
  LIVE2D CUSTOM PROTOCOL
  ============================================================
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
    app.getPath(
      'userData'
    ),

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
  ============================================================
  ENSURE MODEL LIBRARY
  ============================================================
*/

async function ensureModelLibrary():
  Promise<void> {
  await mkdir(
    getImportedModelsRoot(),

    {
      recursive:
        true
    }
  )
}


/*
  ============================================================
  READ IMPORTED MODELS
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
    return []
  }
}


/*
  ============================================================
  WRITE IMPORTED MODELS
  ============================================================
*/

async function writeImportedModels(
  models:
    ImportedModelInfo[]
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
  CREATE MODEL ID
  ============================================================
*/

function createModelId(
  modelName:
    string
): string {
  const slug =
    modelName
      .toLowerCase()
      .normalize(
        'NFKD'
      )
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
    slug ||
    'model'
  }-${randomUUID()}`
}


/*
  ============================================================
  FIND FILES RECURSIVELY
  ============================================================
*/

async function findFilesBySuffix(
  directory:
    string,

  suffix:
    string
): Promise<string[]> {
  const result:
    string[] =
      []


  const entries =
    await readdir(
      directory,

      {
        withFileTypes:
          true
      }
    )


  for (
    const entry
    of entries
  ) {
    const fullPath =
      join(
        directory,
        entry.name
      )


    if (
      entry.isDirectory()
    ) {
      const nestedFiles =
        await findFilesBySuffix(
          fullPath,
          suffix
        )


      result.push(
        ...nestedFiles
      )


      continue
    }


    if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith(
          suffix
            .toLowerCase()
        )
    ) {
      result.push(
        fullPath
      )
    }
  }


  return result
}


/*
  ============================================================
  MODEL RELATIVE PATH
  ============================================================
*/

function toModelRelativePath(
  modelRoot:
    string,

  absoluteFilePath:
    string
): string {
  return relative(
    modelRoot,
    absoluteFilePath
  ).replace(
    /\\/g,
    '/'
  )
}


/*
  ============================================================
  EXPRESSION FOLDER MOTION
  ============================================================
*/

function isExpressionFolderMotion(
  modelRoot:
    string,

  filePath:
    string
): boolean {
  const relativePath =
    toModelRelativePath(
      modelRoot,
      filePath
    )
      .toLowerCase()


  return (
    relativePath
      .startsWith(
        'expressions/'
      ) ||

    relativePath
      .includes(
        '/expressions/'
      )
  )
}


/*
  ============================================================
  EXPRESSION NAME
  ============================================================
*/

function getExpressionName(
  filePath:
    string
): string {
  return basename(
    filePath
  ).replace(
    /\.exp3\.json$/i,
    ''
  )
}


/*
  ============================================================
  MOTION GROUP NAME
  ============================================================
*/

function getMotionGroupName(
  modelRoot:
    string,

  filePath:
    string
): string {
  const relativePath =
    toModelRelativePath(
      modelRoot,
      filePath
    )


  const normalizedPath =
    relativePath
      .toLowerCase()


  const fileName =
    basename(
      filePath
    ).replace(
      /\.motion3\.json$/i,
      ''
    )


  /*
    Motion trong expressions/
    giữ nguyên tên file làm group.

    Ví dụ:

    expressions/hiyori_m01.motion3.json

    group:
    hiyori_m01
  */
  if (
    normalizedPath
      .startsWith(
        'expressions/'
      ) ||

    normalizedPath
      .includes(
        '/expressions/'
      )
  ) {
    return fileName
  }


  /*
    Idle_1
    Idle_2
    Idle
        ↓
    Idle
  */
  if (
    /^idle(?:[_ -]?\d+)?$/i
      .test(
        fileName
      )
  ) {
    return 'Idle'
  }


  /*
    Happy01
    Happy_02
       ↓
    Happy
  */
  const normalized =
    fileName.replace(
      /[_ -]?\d+$/i,
      ''
    )


  return (
    normalized ||
    fileName
  )
}


/*
  ============================================================
  PREPROCESS LIVE2D MODEL
  ============================================================
*/

async function preprocessLive2DModel(
  modelRoot:
    string,

  modelFilePath:
    string
): Promise<PreprocessResult> {
  console.log('')


  console.log(
    '============================================================'
  )


  console.log(
    '[Models] PREPROCESS START'
  )


  console.log(
    '[Models] Root:',
    modelRoot
  )


  console.log(
    '[Models] model3.json:',
    modelFilePath
  )


  /*
    ----------------------------------------------------------
    READ MODEL JSON
    ----------------------------------------------------------
  */

  const raw =
    await readFile(
      modelFilePath,
      'utf8'
    )


  const modelJson =
    JSON.parse(
      raw
    ) as Model3Json


  if (
    !modelJson.FileReferences
  ) {
    modelJson.FileReferences =
      {}
  }


  const fileReferences =
    modelJson.FileReferences


  /*
    ==========================================================
    EXPRESSIONS
    ==========================================================
  */

  const expressionFiles =
    await findFilesBySuffix(
      modelRoot,
      '.exp3.json'
    )


  expressionFiles.sort(
    (
      a,
      b
    ) =>
      a.localeCompare(
        b
      )
  )


  console.log(
    '[Models] Found expression files:',
    expressionFiles.length
  )


  const oldExpressions =
    fileReferences
      .Expressions ??
    []


  const oldExpressionMap =
    new Map<
      string,
      Model3Expression
    >()


  for (
    const expression
    of oldExpressions
  ) {
    if (
      typeof expression.File !==
      'string'
    ) {
      continue
    }


    oldExpressionMap.set(
      expression
        .File
        .replace(
          /\\/g,
          '/'
        ),

      expression
    )
  }


  const expressions:
    Model3Expression[] =
      []


  for (
    const expressionFile
    of expressionFiles
  ) {
    const relativePath =
      toModelRelativePath(
        modelRoot,
        expressionFile
      )


    const oldExpression =
      oldExpressionMap.get(
        relativePath
      )


    const expressionName =
      getExpressionName(
        expressionFile
      )


    expressions.push({
      ...oldExpression,

      Name:
        expressionName,

      File:
        relativePath
    })


    console.log(
      `[Models] Expression: ${expressionName} -> ${relativePath}`
    )
  }


  if (
    expressions.length >
    0
  ) {
    fileReferences.Expressions =
      expressions
  }
  else {
    delete fileReferences.Expressions
  }


  /*
    ==========================================================
    MOTIONS
    ==========================================================
  */

  const motionFiles =
    await findFilesBySuffix(
      modelRoot,
      '.motion3.json'
    )


  motionFiles.sort(
    (
      a,
      b
    ) =>
      a.localeCompare(
        b
      )
  )


  console.log(
    '[Models] Found motion files:',
    motionFiles.length
  )


  const oldMotionMap =
    new Map<
      string,
      Model3Motion
    >()


  const oldMotionGroupMap =
    new Map<
      string,
      string
    >()


  const oldMotions =
    fileReferences
      .Motions ??
    {}


  for (
    const [
      groupName,
      groupMotions
    ]
    of Object.entries(
      oldMotions
    )
  ) {
    for (
      const motion
      of groupMotions
    ) {
      if (
        typeof motion.File !==
        'string'
      ) {
        continue
      }


      const normalizedFile =
        motion
          .File
          .replace(
            /\\/g,
            '/'
          )


      oldMotionMap.set(
        normalizedFile,
        motion
      )


      oldMotionGroupMap.set(
        normalizedFile,
        groupName
      )
    }
  }


  const motions:
    Record<
      string,
      Model3Motion[]
    > =
      {}


  for (
    const motionFile
    of motionFiles
  ) {
    const relativePath =
      toModelRelativePath(
        modelRoot,
        motionFile
      )


    const inferredGroupName =
      getMotionGroupName(
        modelRoot,
        motionFile
      )


    /*
      Motion trong expressions/
      luôn sử dụng group suy luận
      từ tên file.

      Không dùng group cũ vì
      model có thể đã được preprocess
      bởi code cũ.
    */
    const groupName =
      isExpressionFolderMotion(
        modelRoot,
        motionFile
      )
        ?
        inferredGroupName

        :
        (
          oldMotionGroupMap
            .get(
              relativePath
            ) ??
          inferredGroupName
        )


    const oldMotion =
      oldMotionMap.get(
        relativePath
      )


    if (
      !motions[
        groupName
      ]
    ) {
      motions[
        groupName
      ] =
        []
    }


    motions[
      groupName
    ].push({
      ...oldMotion,

      File:
        relativePath
    })


    console.log(
      `[Models] Motion: ${groupName} -> ${relativePath}`
    )
  }


  /*
    ==========================================================
    AUTO IDLE FALLBACK
    ==========================================================

    Nếu model không có Idle,
    lấy một motion phù hợp làm baseline.
  */

  const hasIdle =
    Array.isArray(
      motions.Idle
    ) &&
    motions.Idle.length >
      0


  if (
    !hasIdle &&
    motionFiles.length >
      0
  ) {
    let fallbackMotionFile =
      motionFiles.find(
        (
          file
        ) => {
          const name =
            basename(
              file
            )
              .toLowerCase()


          return (
            name.includes(
              'idle'
            ) ||

            name.includes(
              'neutral'
            ) ||

            name.includes(
              'default'
            ) ||

            name.includes(
              'standby'
            ) ||

            name.includes(
              'wait'
            )
          )
        }
      )


    fallbackMotionFile ??=
      motionFiles[0]


    if (
      fallbackMotionFile
    ) {
      const fallbackRelativePath =
        toModelRelativePath(
          modelRoot,
          fallbackMotionFile
        )


      const oldFallbackMotion =
        oldMotionMap.get(
          fallbackRelativePath
        )


      motions.Idle = [
        {
          ...oldFallbackMotion,

          File:
            fallbackRelativePath
        }
      ]


      console.warn(
        '[Models] No Idle motion found.'
      )


      console.warn(
        '[Models] Auto Idle fallback:',
        fallbackRelativePath
      )
    }
  }


  if (
    Object.keys(
      motions
    ).length >
    0
  ) {
    fileReferences.Motions =
      motions
  }
  else {
    delete fileReferences.Motions
  }


  /*
    ==========================================================
    WRITE MODEL3.JSON
    ==========================================================
  */

  await writeFile(
    modelFilePath,

    JSON.stringify(
      modelJson,
      null,
      2
    ),

    'utf8'
  )


  /*
    ==========================================================
    PREPROCESS RESULT
    ==========================================================
  */

  const motionGroups:
    Record<
      string,
      string[]
    > =
      {}


  for (
    const [
      groupName,
      groupMotions
    ]
    of Object.entries(
      motions
    )
  ) {
    motionGroups[
      groupName
    ] =
      groupMotions.map(
        (
          motion
        ) =>
          motion.File
      )
  }


  const result:
    PreprocessResult = {
      expressions:
        expressions.map(
          (
            expression
          ) =>
            expression.Name
        ),

      motionGroups
    }


  console.log(
    '[Models] PREPROCESS RESULT'
  )


  console.log(
    '[Models] Expressions:',
    result.expressions
  )


  console.log(
    '[Models] Motion groups:',
    result.motionGroups
  )


  console.log(
    '[Models] PREPROCESS DONE'
  )


  console.log(
    '============================================================'
  )


  console.log('')


  return result
}


/*
  ============================================================
  REPAIR OLD IMPORTED MODELS
  ============================================================
*/

async function repairImportedModels():
  Promise<void> {
  const models =
    await readImportedModels()


  if (
    models.length ===
    0
  ) {
    console.log(
      '[Models] No imported models to repair.'
    )


    return
  }


  console.log(
    `[Models] Repairing ${models.length} imported model(s)...`
  )


  for (
    const model
    of models
  ) {
    try {
      const modelUrl =
        new URL(
          model.modelUrl
        )


      const modelFileName =
        decodeURIComponent(
          modelUrl.pathname
        ).replace(
          /^\/+/,
          ''
        )


      if (
        !modelFileName
          .toLowerCase()
          .endsWith(
            '.model3.json'
          )
      ) {
        console.warn(
          '[Models] Invalid model URL:',
          model.modelUrl
        )


        continue
      }


      const modelRoot =
        join(
          getImportedModelsRoot(),
          model.id
        )


      const modelFilePath =
        join(
          modelRoot,
          modelFileName
        )


      console.log(
        '[Models] Repair:',
        model.name
      )


      await preprocessLive2DModel(
        modelRoot,
        modelFilePath
      )
    }
    catch (error) {
      console.error(
        `[Models] Could not repair "${model.name}":`,
        error
      )
    }
  }


  console.log(
    '[Models] Repair completed.'
  )
}


/*
  ============================================================
  IMPORT LIVE2D MODEL
  ============================================================
*/

async function importLive2DModel(
  parentWindow:
    BrowserWindow
): Promise<ImportedModelInfo | null> {
  const result =
    await dialog
      .showOpenDialog(
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

              extensions: [
                'json'
              ]
            }
          ]
        }
      )


  /*
    User Cancel.
  */
  if (
    result.canceled ||
    result.filePaths.length ===
      0
  ) {
    return null
  }


  const selectedFile =
    result.filePaths[
      0
    ]


  if (
    !selectedFile
  ) {
    return null
  }


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


  const sourceFolder =
    dirname(
      selectedFile
    )


  const modelFileName =
    basename(
      selectedFile
    )


  const modelName =
    modelFileName.replace(
      /\.model3\.json$/i,
      ''
    )


  const id =
    createModelId(
      modelName
    )


  const destinationFolder =
    join(
      getImportedModelsRoot(),
      id
    )


  /*
    ==========================================================
    COPY MODEL
    ==========================================================
  */

  try {
    console.log(
      '[Models] Import source:',
      sourceFolder
    )


    console.log(
      '[Models] Import destination:',
      destinationFolder
    )


    await cp(
      sourceFolder,
      destinationFolder,

      {
        recursive:
          true
      }
    )


    const importedModelFilePath =
      join(
        destinationFolder,
        modelFileName
      )


    const preprocessResult =
      await preprocessLive2DModel(
        destinationFolder,
        importedModelFilePath
      )


    console.log(
      '[Models] Imported expressions:',
      preprocessResult.expressions
    )


    console.log(
      '[Models] Imported motion groups:',
      preprocessResult.motionGroups
    )
  }
  catch (error) {
    console.error(
      '[Models] Import/preprocess failed:',
      error
    )


    await rm(
      destinationFolder,

      {
        recursive:
          true,

        force:
          true
      }
    )


    throw error
  }


  /*
    ==========================================================
    RUNTIME MODEL URL
    ==========================================================
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

      transform: {
        scale:
          0.9,

        x:
          0.5,

        y:
          0.5
      }
    }


  /*
    Save model index.
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
    '[Models] Imported successfully:',
    modelInfo
  )


  return modelInfo
}


/*
  ============================================================
  DELETE IMPORTED MODEL
  ============================================================
*/

async function deleteImportedModel(
  parentWindow:
    BrowserWindow,

  modelId:
    string
): Promise<boolean> {
  const models =
    await readImportedModels()


  const model =
    models.find(
      (
        item
      ) =>
        item.id ===
        modelId
    )


  /*
    Model không có trong index.json
    → không cho xóa.
  */
  if (
    !model
  ) {
    console.warn(
      '[Models] Delete failed. Model not found:',
      modelId
    )


    return false
  }


  /*
    Confirm.
  */

  const confirmation =
    await dialog
      .showMessageBox(
        parentWindow,

        {
          type:
            'warning',

          title:
            'Delete Model',

          message:
            `Delete "${model.name}"?`,

          detail:
            'The imported copy of this Live2D model will be permanently removed from the application.',

          buttons: [
            'Cancel',
            'Delete'
          ],

          defaultId:
            0,

          cancelId:
            0,

          noLink:
            true
        }
      )


  if (
    confirmation.response !==
    1
  ) {
    console.log(
      '[Models] Delete cancelled:',
      model.name
    )


    return false
  }


  /*
    ==========================================================
    SECURITY CHECK
    ==========================================================
  */

  const modelsRoot =
    resolve(
      getImportedModelsRoot()
    )


  const modelFolder =
    resolve(
      modelsRoot,
      model.id
    )


  const relativeModelPath =
    relative(
      modelsRoot,
      modelFolder
    )


  if (
    relativeModelPath ===
      '' ||

    relativeModelPath
      .startsWith(
        '..'
      ) ||

    isAbsolute(
      relativeModelPath
    )
  ) {
    throw new Error(
      'Invalid model folder.'
    )
  }


  /*
    Delete folder.
  */

  await rm(
    modelFolder,

    {
      recursive:
        true,

      force:
        true
    }
  )


  /*
    Delete from index.
  */

  const remainingModels =
    models.filter(
      (
        item
      ) =>
        item.id !==
        modelId
    )


  await writeImportedModels(
    remainingModels
  )


  console.log(
    '[Models] Deleted successfully:',
    model.name
  )


  return true
}


/*
  ============================================================
  LIVE2D MODEL PROTOCOL
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
        const requestUrl =
          new URL(
            request.url
          )


        const modelId =
          requestUrl.hostname


        const requestedPath =
          decodeURIComponent(
            requestUrl.pathname
          ).replace(
            /^\/+/,
            ''
          )


        const modelRoot =
          resolve(
            getImportedModelsRoot(),
            modelId
          )


        const filePath =
          resolve(
            modelRoot,
            requestedPath
          )


        /*
          Security:
          không cho ../
        */

        const relativePath =
          relative(
            modelRoot,
            filePath
          )


        if (
          relativePath
            .startsWith(
              '..'
            ) ||

          isAbsolute(
            relativePath
          )
        ) {
          return new Response(
            'Forbidden',

            {
              status:
                403
            }
          )
        }


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
            status:
              404
          }
        )
      }
    }
  )
}


/*
  ============================================================
  IPC HANDLERS
  ============================================================

  QUAN TRỌNG:

  Không còn:

  window:drag-start
  window:drag-update
  window:drag-end

  BrowserWindow không di chuyển
  trong lúc kéo character nữa.
*/

function registerIpcHandlers():
  void {
  /*
    ==========================================================
    MOUSE PASSTHROUGH
    ==========================================================

    true:
      click xuyên xuống desktop.

    false:
      Electron nhận mouse event.
  */

  ipcMain.on(
    'window:set-ignore-mouse-events',

    (
      event,
      ignore:
        unknown
    ) => {
      if (
        typeof ignore !==
        'boolean'
      ) {
        return
      }


      const mainWindow =
        BrowserWindow
          .fromWebContents(
            event.sender
          )


      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
        return
      }


      /*
        Khi ignore = true,
        forward mouse move để renderer
        vẫn có thể theo dõi cursor.
      */
      if (
        ignore
      ) {
        mainWindow
          .setIgnoreMouseEvents(
            true,

            {
              forward:
                true
            }
          )
      }
      else {
        mainWindow
          .setIgnoreMouseEvents(
            false
          )
      }
    }
  )


  /*
    ==========================================================
    CURSOR
    ==========================================================

    Trả cursor relative với
    BrowserWindow full-screen.
  */

  ipcMain.handle(
    'cursor:get-position',

    (
      event
    ) => {
      const mainWindow =
        BrowserWindow
          .fromWebContents(
            event.sender
          )


      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
        return {
          x:
            0,

          y:
            0
        }
      }


      const cursorPosition =
        electronScreen
          .getCursorScreenPoint()


      const windowBounds =
        mainWindow
          .getContentBounds()


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
    ==========================================================
    MODEL LIST
    ==========================================================
  */

  ipcMain.handle(
    'models:list',

    async () => {
      return await readImportedModels()
    }
  )


  /*
    ==========================================================
    IMPORT MODEL
    ==========================================================
  */

  ipcMain.handle(
    'models:import',

    async (
      event
    ) => {
      const mainWindow =
        BrowserWindow
          .fromWebContents(
            event.sender
          )


      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
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
    ==========================================================
    DELETE MODEL
    ==========================================================
  */

  ipcMain.handle(
    'models:delete',

    async (
      event,
      modelId:
        unknown
    ) => {
      if (
        typeof modelId !==
        'string'
      ) {
        return false
      }


      const mainWindow =
        BrowserWindow
          .fromWebContents(
            event.sender
          )


      if (
        !mainWindow ||
        mainWindow.isDestroyed()
      ) {
        return false
      }


      try {
        return await deleteImportedModel(
          mainWindow,
          modelId
        )
      }
      catch (error) {
        console.error(
          '[Models] Delete failed:',
          error
        )


        throw error
      }
    }
  )



  /*
    ==========================================================
    SETTINGS - STARTUP MODEL
    ==========================================================

    startupModelId là lựa chọn của user.

    Main process KHÔNG biết model built-in
    fallback hiện tại là Akari hay model nào khác.

    Nếu startupModelId = null,
    renderer sẽ tự dùng FALLBACK_CHARACTER_ID.
  */

  ipcMain.handle(
    'settings:get-startup-model',

    () => {
      try {
        return getStartupModelId()
      }
      catch (error) {
        console.error(
          '[Settings] Failed to get startup model:',
          error
        )


        return null
      }
    }
  )


  ipcMain.handle(
    'settings:set-startup-model',

    (
      _event,
      modelId:
        unknown
    ) => {
      if (
        typeof modelId !==
        'string'
      ) {
        return null
      }


      const normalizedModelId =
        modelId.trim()


      if (
        normalizedModelId.length ===
        0
      ) {
        return null
      }


      try {
        const settings =
          setStartupModelId(
            normalizedModelId
          )


        return settings
          .startupModelId
      }
      catch (error) {
        console.error(
          '[Settings] Failed to set startup model:',
          error
        )


        return null
      }
    }
  )


  ipcMain.handle(
    'settings:reset-startup-model',

    () => {
      try {
        resetStartupModelId()


        return true
      }
      catch (error) {
        console.error(
          '[Settings] Failed to reset startup model:',
          error
        )


        return false
      }
    }
  )


  /*
    Electron template ping.
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
  SYSTEM TRAY
  ============================================================
*/

function createTrayIcon() {
  const icon =
    nativeImage
      .createFromDataURL(
        TRAY_ICON_DATA_URL
      )


  /*
    Windows tray thường hiển thị tốt
    với icon 16x16 hoặc 32x32.
  */

  return icon.resize({
    width:
      16,

    height:
      16
  })
}


function showCharacterWindow():
  void {
  /*
    Nếu window đã bị destroy,
    tạo lại window.
  */

  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    createWindow()

    return
  }


  /*
    showInactive() giúp hiện character
    mà không giật focus khỏi app user
    đang sử dụng.
  */

  if (
    !mainWindow.isVisible()
  ) {
    mainWindow
      .showInactive()
  }


  /*
    Bảo đảm desktop companion
    tiếp tục luôn nổi sau khi show.
  */

  mainWindow
    .setAlwaysOnTop(
      true
    )
}


function hideCharacterWindow():
  void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return
  }


  mainWindow.hide()
}


function createTray():
  void {
  /*
    Không tạo nhiều Tray icon
    nếu Electron activate lại app.
  */

  if (tray) {
    return
  }


  tray =
    new Tray(
      createTrayIcon()
    )


  tray.setToolTip(
    `AI Desktop Character ${app.getVersion()}`
  )


  const trayMenu =
    Menu.buildFromTemplate([
      {
        label:
          `AI Desktop Character ${app.getVersion()}`,

        enabled:
          false
      },

      {
        type:
          'separator'
      },

      {
        label:
          'Show Character',

        click:
          () => {
            showCharacterWindow()
          }
      },

      {
        label:
          'Hide Character',

        click:
          () => {
            hideCharacterWindow()
          }
      },

      {
        type:
          'separator'
      },

      {
        label:
          'Exit',

        click:
          () => {
            app.quit()
          }
      }
    ])


  tray.setContextMenu(
    trayMenu
  )


  /*
    Double-click tray icon
    → hiện character trở lại.
  */

  tray.on(
    'double-click',

    () => {
      showCharacterWindow()
    }
  )
}


/*
  ============================================================
  CREATE WINDOW
  ============================================================

  BrowserWindow giờ phủ toàn màn hình.

  Nó KHÔNG di chuyển.

  App.vue sau này sẽ có:

  character-shell 500x700

  và chỉ di chuyển character-shell
  bằng transform.
*/

function createWindow():
  void {
  const primaryDisplay =
    electronScreen
      .getPrimaryDisplay()


  const displayBounds =
    primaryDisplay.bounds


  const window =
    new BrowserWindow({
      /*
        Full monitor.
      */
      x:
        displayBounds.x,

      y:
        displayBounds.y,

      width:
        displayBounds.width,

      height:
        displayBounds.height,


      /*
        Không hiện cho đến khi
        renderer load xong.
      */
      show:
        false,


      /*
        Transparent frameless.
      */
      frame:
        false,

      transparent:
        true,


      /*
        Window đứng yên.
      */
      resizable:
        false,

      movable:
        false,

      fullscreenable:
        false,


      hasShadow:
        false,


      /*
        Desktop companion luôn nổi.
      */
      alwaysOnTop:
        true,


      /*
        Không hiện host full-screen
        trên taskbar.
      */
      skipTaskbar:
        true,


      autoHideMenuBar:
        true,


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
    Lưu BrowserWindow vào biến global
    để System Tray có thể Show / Hide.
  */

  mainWindow =
    window


  /*
    Nếu window bị đóng/destroy,
    bỏ reference cũ.
  */

  window.on(
    'closed',

    () => {
      if (
        mainWindow ===
        window
      ) {
        mainWindow =
          null
      }
    }
  )


  /*
    Ban đầu click xuyên desktop.

    App.vue sẽ bật lại mouse event
    khi cursor vào:
    - character drag zone
    - resize handle
    - buttons
    - panels
  */

  window
    .setIgnoreMouseEvents(
      true,

      {
        forward:
          true
      }
    )


  /*
    Show khi renderer ready.
  */

  window.on(
    'ready-to-show',

    () => {
      window.show()
    }
  )


  /*
    Link ngoài mở bằng browser.
  */

  window
    .webContents
    .setWindowOpenHandler(
      (
        details
      ) => {
        void shell
          .openExternal(
            details.url
          )


        return {
          action:
            'deny'
        }
      }
    )


  /*
    Development.
  */

  if (
    is.dev &&
    process.env[
      'ELECTRON_RENDERER_URL'
    ]
  ) {
    void window
      .loadURL(
        process.env[
          'ELECTRON_RENDERER_URL'
        ]
      )
  }
  else {
    /*
      Production.
    */

    void window
      .loadFile(
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

app
  .whenReady()
  .then(
    async () => {
      /*
        Windows App ID.
      */

      electronApp
        .setAppUserModelId(
          'com.electron'
        )


      /*
        Model Library.
      */

      await ensureModelLibrary()


      /*
        Repair imported models.
      */

      await repairImportedModels()


      /*
        Register custom protocol.
      */

      registerModelProtocol()


      /*
        Register IPC.
      */

      registerIpcHandlers()


      /*
        Electron toolkit shortcuts.
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
        Create main window.
      */

      createWindow()


      /*
        System Tray.

        Vì BrowserWindow dùng
        skipTaskbar = true,
        Tray là nơi user quản lý:
        - Show
        - Hide
        - Exit
      */

      createTray()


      /*
        macOS activate.
      */

      app.on(
        'activate',

        () => {
          if (
            BrowserWindow
              .getAllWindows()
              .length ===
            0
          ) {
            createWindow()
          }


          createTray()
        }
      )
    }
  )


/*
  ============================================================
  APP BEFORE QUIT
  ============================================================

  Dọn System Tray để Windows
  không giữ icon ghost sau khi Exit.
*/

app.on(
  'before-quit',

  () => {
    if (tray) {
      tray.destroy()

      tray =
        null
    }
  }
)


/*
  ============================================================
  APP CLOSED
  ============================================================
*/

app.on(
  'window-all-closed',

  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit()
    }
  }
)