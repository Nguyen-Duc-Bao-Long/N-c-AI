import {
  app
} from 'electron'

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'

import {
  dirname,
  join
} from 'path'


/*
  ============================================================
  APP SETTINGS
  ============================================================

  Settings này thuộc về USER.

  Nó KHÔNG chứa thông tin
  model built-in nào là fallback.

  Ví dụ:

  {
    "version": 1,
    "startupModelId": "hiyori"
  }

  Nếu startupModelId = null:
  renderer sẽ sử dụng
  FALLBACK_CHARACTER_ID.
*/


export interface AppSettings {
  /*
    Version giúp sau này
    migrate settings dễ hơn.
  */
  version: number


  /*
    Model được user chọn
    để mở khi khởi động app.

    null:
      chưa từng chọn startup model.
  */
  startupModelId:
    string | null
}


/*
  ============================================================
  SETTINGS VERSION
  ============================================================
*/

const SETTINGS_VERSION =
  1


/*
  ============================================================
  DEFAULT USER SETTINGS
  ============================================================

  QUAN TRỌNG:

  Không viết:

    startupModelId: 'akari'

  ở đây.

  Vì Akari chỉ là built-in
  tạm thời.

  Fallback sẽ do renderer
  quyết định riêng.
*/

function createDefaultSettings():
  AppSettings {
  return {
    version:
      SETTINGS_VERSION,

    startupModelId:
      null
  }
}


/*
  ============================================================
  SETTINGS PATH
  ============================================================

  Ví dụ Windows:

  C:\Users\<user>\AppData\Roaming\
  AI-Desktop-Character\settings.json
*/

export function getSettingsPath():
  string {
  return join(
    app.getPath(
      'userData'
    ),

    'settings.json'
  )
}


/*
  ============================================================
  ENSURE DIRECTORY
  ============================================================
*/

function ensureSettingsDirectory():
  void {
  const settingsPath =
    getSettingsPath()


  const directory =
    dirname(
      settingsPath
    )


  if (
    existsSync(
      directory
    )
  ) {
    return
  }


  mkdirSync(
    directory,

    {
      recursive:
        true
    }
  )
}


/*
  ============================================================
  NORMALIZE SETTINGS
  ============================================================

  Không tin hoàn toàn dữ liệu
  đọc từ JSON.

  Nếu file cũ / lỗi / thiếu field
  thì normalize về format hiện tại.
*/

function normalizeSettings(
  value: unknown
): AppSettings {
  const defaults =
    createDefaultSettings()


  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return defaults
  }


  const object =
    value as Record<
      string,
      unknown
    >


  let startupModelId:
    string | null =
      null


  if (
    typeof object.startupModelId ===
      'string'
  ) {
    const trimmed =
      object.startupModelId
        .trim()


    if (
      trimmed.length >
      0
    ) {
      startupModelId =
        trimmed
    }
  }


  return {
    version:
      SETTINGS_VERSION,

    startupModelId
  }
}


/*
  ============================================================
  READ SETTINGS
  ============================================================
*/

export function readAppSettings():
  AppSettings {
  ensureSettingsDirectory()


  const settingsPath =
    getSettingsPath()


  /*
    Chưa có settings.json:
    tạo settings mặc định.
  */

  if (
    !existsSync(
      settingsPath
    )
  ) {
    const defaults =
      createDefaultSettings()


    writeAppSettings(
      defaults
    )


    return defaults
  }


  try {
    const raw =
      readFileSync(
        settingsPath,
        'utf8'
      )


    const parsed:
      unknown =
        JSON.parse(
          raw
        )


    const normalized =
      normalizeSettings(
        parsed
      )


    return normalized
  }
  catch (error) {
    /*
      File settings lỗi
      không được làm app crash.
    */

    console.error(
      '[Settings] Failed to read settings:',
      error
    )


    const defaults =
      createDefaultSettings()


    /*
      Ghi lại file settings sạch.
    */

    try {
      writeAppSettings(
        defaults
      )
    }
    catch (writeError) {
      console.error(
        '[Settings] Failed to repair settings:',
        writeError
      )
    }


    return defaults
  }
}


/*
  ============================================================
  WRITE SETTINGS
  ============================================================

  Dùng file tạm trước rồi rename
  để giảm khả năng settings.json
  bị ghi dang dở nếu app đóng
  đúng lúc đang save.
*/

export function writeAppSettings(
  settings: AppSettings
): void {
  ensureSettingsDirectory()


  const settingsPath =
    getSettingsPath()


  const temporaryPath =
    `${settingsPath}.tmp`


  const normalized =
    normalizeSettings(
      settings
    )


  const json =
    JSON.stringify(
      normalized,
      null,
      2
    )


  try {
    writeFileSync(
      temporaryPath,
      json,
      'utf8'
    )


    /*
      Windows có thể không cho
      rename đè file đang tồn tại.

      Vì vậy xóa file cũ trước.
    */

    if (
      existsSync(
        settingsPath
      )
    ) {
      unlinkSync(
        settingsPath
      )
    }


    renameSync(
      temporaryPath,
      settingsPath
    )
  }
  catch (error) {
    /*
      Nếu lỗi thì dọn file temp.
    */

    try {
      if (
        existsSync(
          temporaryPath
        )
      ) {
        unlinkSync(
          temporaryPath
        )
      }
    }
    catch {
      /*
        Ignore cleanup error.
      */
    }


    throw error
  }
}


/*
  ============================================================
  GET STARTUP MODEL
  ============================================================
*/

export function getStartupModelId():
  string | null {
  const settings =
    readAppSettings()


  return settings
    .startupModelId
}


/*
  ============================================================
  SET STARTUP MODEL
  ============================================================
*/

export function setStartupModelId(
  modelId: string
): AppSettings {
  const normalizedId =
    modelId.trim()


  if (
    normalizedId.length ===
    0
  ) {
    throw new Error(
      'startupModelId cannot be empty.'
    )
  }


  const settings =
    readAppSettings()


  const nextSettings:
    AppSettings = {
      ...settings,

      startupModelId:
        normalizedId
  }


  writeAppSettings(
    nextSettings
  )


  console.log(
    '[Settings] Startup model:',
    normalizedId
  )


  return nextSettings
}


/*
  ============================================================
  RESET STARTUP MODEL
  ============================================================

  Không reset về Akari.

  Chỉ đưa về null.

  Sau đó renderer sẽ dùng
  FALLBACK_CHARACTER_ID hiện tại.

  Đây là điểm giúp sau này
  thay Akari bằng model khác
  mà không phải sửa settings system.
*/

export function resetStartupModelId():
  AppSettings {
  const settings =
    readAppSettings()


  const nextSettings:
    AppSettings = {
      ...settings,

      startupModelId:
        null
  }


  writeAppSettings(
    nextSettings
  )


  console.log(
    '[Settings] Startup model reset.'
  )


  return nextSettings
}