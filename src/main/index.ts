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
  CUSTOM LIVE2D PROTOCOL
  ============================================================

  Ví dụ:

  live2d-model://model-id/model.model3.json

  Phải đăng ký trước app.ready.
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

function getModelLibraryRoot(): string {
  return join(
    app.getPath('userData'),
    'model-library'
  )
}


function getImportedModelsRoot(): string {
  return join(
    getModelLibraryRoot(),
    'models'
  )
}


function getModelIndexPath(): string {
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

async function ensureModelLibrary(): Promise<void> {
  await mkdir(
    getImportedModelsRoot(),
    {
      recursive: true
    }
  )
}


/*
  ============================================================
  READ IMPORTED MODELS
  ============================================================
*/

async function readImportedModels(): Promise<ImportedModelInfo[]> {
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
      Lần đầu chạy có thể
      chưa có index.json.
    */
    return []
  }
}


/*
  ============================================================
  WRITE IMPORTED MODELS
  ============================================================
*/

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
  CREATE MODEL ID
  ============================================================
*/

function createModelId(
  modelName: string
): string {
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
  FIND FILES RECURSIVELY
  ============================================================

  Tìm file trong toàn bộ folder model.

  Ví dụ:

  expressions/EyesLove.exp3.json

  animations/Love.motion3.json

  motions/Happy.motion3.json
*/

async function findFilesBySuffix(
  directory: string,
  suffix: string
): Promise<string[]> {
  const result: string[] =
    []


  const entries =
    await readdir(
      directory,
      {
        withFileTypes: true
      }
    )


  for (
    const entry of entries
  ) {
    const fullPath =
      join(
        directory,
        entry.name
      )


    /*
      Nếu là folder thì tiếp tục scan.
    */
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


    /*
      Nếu là file đúng suffix.
    */
    if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith(
          suffix.toLowerCase()
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
  NORMALIZE MODEL PATH
  ============================================================

  Windows:

  expressions\EyesLove.exp3.json

  Live2D:

  expressions/EyesLove.exp3.json
*/

function toModelRelativePath(
  modelRoot: string,
  absoluteFilePath: string
): string {
  return relative(
    modelRoot,
    absoluteFilePath
  ).replace(
    /\\/g,
    '/'
  )
}

function isExpressionFolderMotion(
  modelRoot: string,
  filePath: string
): boolean {
  const relativePath =
    toModelRelativePath(
      modelRoot,
      filePath
    ).toLowerCase()


  return (
    relativePath.startsWith(
      'expressions/'
    ) ||
    relativePath.includes(
      '/expressions/'
    )
  )
}

/*
  ============================================================
  EXPRESSION NAME
  ============================================================

  EyesLove.exp3.json

        ↓

  EyesLove
*/

function getExpressionName(
  filePath: string
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

  Idle_2.motion3.json
        ↓
  Idle

  Love.motion3.json
        ↓
  Love

  Happy01.motion3.json
        ↓
  Happy

  Happy_02.motion3.json
        ↓
  Happy
*/

function getMotionGroupName(
  modelRoot: string,
  filePath: string
): string {
  /*
    Lấy path tương đối để biết
    motion nằm trong folder nào.
  */
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
    ==========================================================
    MOTION NẰM TRONG EXPRESSIONS
    ==========================================================

    Ví dụ:

    expressions/hiyori_m01.motion3.json
    expressions/hiyori_m02.motion3.json

    Đây là các React motion.

    QUAN TRỌNG:
    Không gộp hiyori_m01, hiyori_m02
    thành cùng một group hiyori_m.

    Mỗi file sẽ có group riêng.
  */

  if (
    normalizedPath.startsWith(
      'expressions/'
    ) ||
    normalizedPath.includes(
      '/expressions/'
    )
  ) {
    return fileName
  }


  /*
    ==========================================================
    IDLE
    ==========================================================
  */

  if (
    /^idle(?:[_ -]?\d+)?$/i.test(
      fileName
    )
  ) {
    return 'Idle'
  }


  /*
    ==========================================================
    MOTION THÔNG THƯỜNG
    ==========================================================

    Happy01
        ↓
    Happy

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

  Model designer có thể giao model3.json
  chưa khai báo Expressions / Motions.

  App sẽ tự:

  1. Scan *.exp3.json
  2. Scan *.motion3.json
  3. Thêm Expressions
  4. Thêm Motions
  5. Ghi lại model3.json

  Chỉ sửa bản model đã copy vào
  Model Library.

  Model gốc của designer KHÔNG bị sửa.
*/

async function preprocessLive2DModel(
  modelRoot: string,
  modelFilePath: string
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
    READ MODEL3.JSON
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


  /*
    Nếu FileReferences chưa tồn tại
    thì tạo mới.
  */
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


  /*
    Expression cũ.

    Nếu model3.json ban đầu đã có
    expression thì giữ metadata bổ sung.
  */
  const oldExpressions =
    fileReferences.Expressions ??
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
      expression.File.replace(
        /\\/g,
        '/'
      ),

      expression
    )
  }


  /*
    Rebuild Expressions dựa trên
    file thực tế trong folder model.
  */
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
    expressions.length > 0
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


  /*
    Lưu metadata motion cũ
    theo đường dẫn file.
  */
  const oldMotionMap =
    new Map<
      string,
      Model3Motion
    >()


  /*
    Đồng thời lưu Group cũ.

    Nếu designer đã khai báo group
    đúng thì ưu tiên giữ group đó.
  */
  const oldMotionGroupMap =
    new Map<
      string,
      string
    >()


  const oldMotions =
    fileReferences.Motions ??
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
        motion.File.replace(
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


  /*
    Rebuild Motion Groups
    từ file thật trên disk.
  */
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


    /*
      Nếu motion đã có group được
      designer khai báo thì giữ nguyên.

      Nếu chưa có thì tự suy luận
      từ tên file.
    */
    const inferredGroupName =
  getMotionGroupName(
    modelRoot,
    motionFile
  )


/*
  Motion nằm trong expressions/
  luôn normalize lại.

  Không giữ group cũ vì model có thể
  đã được preprocess bằng phiên bản
  code cũ.
*/
const groupName =
  isExpressionFolderMotion(
    modelRoot,
    motionFile
  )
    ? inferredGroupName
    : (
        oldMotionGroupMap.get(
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
      ] = []
    }


    motions[
      groupName
    ].push({
      /*
        Giữ các field cũ như:

        FadeInTime
        FadeOutTime
        Sound

        nếu model đã khai báo.
      */
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

  Một số model VTube Studio không
  cung cấp Idle motion riêng.

  Nếu không có Idle, app sẽ lấy
  một motion phù hợp làm baseline.

  Thứ tự ưu tiên:

  idle
  neutral
  default
  standby
  wait

  Nếu không có tên nào phù hợp,
  dùng motion đầu tiên.
*/

const hasIdle =
  Array.isArray(
    motions.Idle
  ) &&
  motions.Idle.length > 0


if (
  !hasIdle &&
  motionFiles.length > 0
) {
  let fallbackMotionFile =
    motionFiles.find(
      (
        file
      ) => {
        const name =
          basename(
            file
          ).toLowerCase()


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


  /*
    Hiyori chỉ có:

    hiyori_m01
    hiyori_m02
    ...

    nên fallback về motion đầu tiên.
  */
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
  ).length > 0
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

  Các model được import từ phiên bản
  cũ có thể chưa được preprocess.

  Mỗi lần app khởi động sẽ kiểm tra
  và preprocess lại chúng.
*/

async function repairImportedModels():
  Promise<void> {
  const models =
    await readImportedModels()


  if (
    models.length === 0
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
    const model of models
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
      /*
        Một model lỗi không được
        làm crash toàn app.
      */
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
  parentWindow: BrowserWindow
): Promise<ImportedModelInfo | null> {
  /*
    Mở file picker.
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
    result.filePaths.length ===
      0
  ) {
    return null
  }


  const selectedFile =
    result.filePaths[0]


  if (
    !selectedFile
  ) {
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
    Folder model gốc.
  */
  const sourceFolder =
    dirname(
      selectedFile
    )


  /*
    Ví dụ:
    akari.model3.json
  */
  const modelFileName =
    basename(
      selectedFile
    )


  /*
    akari.model3.json
        ↓
    akari
  */
  const modelName =
    modelFileName.replace(
      /\.model3\.json$/i,
      ''
    )


  /*
    ID riêng cho model.
  */
  const id =
    createModelId(
      modelName
    )


  /*
    Folder đích trong userData.
  */
  const destinationFolder =
    join(
      getImportedModelsRoot(),
      id
    )


  /*
    ==========================================================
    COPY + PREPROCESS
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


    /*
      Copy nguyên folder model.
    */
    await cp(
      sourceFolder,
      destinationFolder,
      {
        recursive: true
      }
    )


    /*
      model3.json trong bản đã copy.
    */
    const importedModelFilePath =
      join(
        destinationFolder,
        modelFileName
      )


    /*
      Preprocess model.
    */
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


    /*
      Nếu lỗi thì xóa folder
      import dở dang.
    */
    await rm(
      destinationFolder,
      {
        recursive: true,
        force: true
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
    ==========================================================
    SAVE MODEL TO INDEX.JSON
    ==========================================================
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

  Chỉ các model Imported nằm trong
  index.json mới có thể bị xóa.

  Akari built-in không nằm trong
  index.json nên không bị xóa.
*/

async function deleteImportedModel(
  parentWindow: BrowserWindow,
  modelId: string
): Promise<boolean> {
  const models =
    await readImportedModels()


  /*
    Tìm model cần xóa.
  */
  const model =
    models.find(
      (
        item
      ) =>
        item.id === modelId
    )


  /*
    Không tìm thấy model.

    Có thể là built-in model
    hoặc ID không hợp lệ.
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
    ==========================================================
    CONFIRM DELETE
    ==========================================================
  */

  const confirmation =
    await dialog.showMessageBox(
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


  /*
    0 = Cancel
    1 = Delete
  */
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
    MODEL FOLDER
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


  /*
    Security check.

    Không cho ID kiểu:

    ../../something
  */
  const relativeModelPath =
    relative(
      modelsRoot,
      modelFolder
    )


  if (
    relativeModelPath === '' ||
    relativeModelPath.startsWith(
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
    ==========================================================
    DELETE MODEL FOLDER
    ==========================================================
  */

  await rm(
    modelFolder,
    {
      recursive: true,
      force: true
    }
  )


  /*
    ==========================================================
    REMOVE FROM INDEX.JSON
    ==========================================================
  */

  const remainingModels =
    models.filter(
      (
        item
      ) =>
        item.id !== modelId
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
        const requestUrl =
          new URL(
            request.url
          )


        /*
          live2d-model://MODEL_ID/...
        */
        const modelId =
          requestUrl.hostname


        /*
          /expressions/Love.exp3.json

              ↓

          expressions/Love.exp3.json
        */
        const requestedPath =
          decodeURIComponent(
            requestUrl.pathname
          ).replace(
            /^\/+/,
            ''
          )


        /*
          Folder root của model.
        */
        const modelRoot =
          resolve(
            getImportedModelsRoot(),
            modelId
          )


        /*
          File được request.
        */
        const filePath =
          resolve(
            modelRoot,
            requestedPath
          )


        /*
          ====================================================
          PATH TRAVERSAL PROTECTION
          ====================================================
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
          Load local file.
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
  IPC HANDLERS
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


      if (
        !mainWindow
      ) {
        return {
          x: 0,
          y: 0
        }
      }


      /*
        Vị trí cursor toàn desktop.
      */
      const cursorPosition =
        electronScreen
          .getCursorScreenPoint()


      /*
        Vị trí window.
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


      if (
        !mainWindow
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
    ----------------------------------------------------------
    DELETE MODEL
    ----------------------------------------------------------
  */

  ipcMain.handle(
    'models:delete',

    async (
      event,
      modelId: unknown
    ) => {
      /*
        Chỉ nhận string.
      */
      if (
        typeof modelId !==
        'string'
      ) {
        return false
      }


      const mainWindow =
        BrowserWindow.fromWebContents(
          event.sender
        )


      if (
        !mainWindow
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
    Electron template IPC test.
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
        Show sau khi renderer ready.
      */
      show:
        false,

      /*
        Không title bar.
      */
      frame:
        false,

      /*
        Transparent background.
      */
      transparent:
        true,

      /*
        Hiện tại không resize.
      */
      resizable:
        false,

      /*
        Không shadow Windows.
      */
      hasShadow:
        false,

      /*
        Character luôn ở trên.
      */
      alwaysOnTop:
        true,

      /*
        Không menu mặc định.
      */
      autoHideMenuBar:
        true,

      /*
        Background trong suốt.
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
    Khi renderer ready mới show.
  */
  mainWindow.on(
    'ready-to-show',

    () => {
      mainWindow.show()
    }
  )


  /*
    Link ngoài mở bằng browser.
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
    renderer/index.html
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
      Đảm bảo Model Library tồn tại.
    */
    await ensureModelLibrary()


    /*
      Repair các model đã import
      từ phiên bản cũ.
    */
    await repairImportedModels()


    /*
      Register live2d-model://
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
      Tạo main window.
    */
    createWindow()


    /*
      macOS:
      click Dock để mở lại app.
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
      }
    )
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
    /*
      macOS thường giữ app chạy
      khi đóng hết window.
    */
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit()
    }
  }
)