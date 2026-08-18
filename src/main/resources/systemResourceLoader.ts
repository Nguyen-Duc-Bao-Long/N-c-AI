import {
  existsSync,
  readFileSync
} from 'node:fs'

import path
  from 'node:path'

import {
  parse
} from 'yaml'

import {
  getSystemResourcePaths
} from './paths'

import type {
  FatAppConfig,
  FatDefaultResources,
  FatResourcePolicy,
  LoadedSystemConfig
} from './types'


/*
  ============================================================
  HELPERS
  ============================================================
*/


function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value ===
      'object' &&
    value !==
      null &&
    !Array.isArray(
      value
    )
  )
}


function requireRecord(
  value: unknown,
  name: string
): Record<string, unknown> {
  if (
    !isRecord(
      value
    )
  ) {
    throw new Error(
      `[Resources] "${name}" must be a YAML object.`
    )
  }


  return value
}


function requireString(
  value: unknown,
  name: string
): string {
  if (
    typeof value !==
      'string' ||
    value.trim().length ===
      0
  ) {
    throw new Error(
      `[Resources] "${name}" must be a non-empty string.`
    )
  }


  return value.trim()
}


function requireBoolean(
  value: unknown,
  name: string
): boolean {
  if (
    typeof value !==
    'boolean'
  ) {
    throw new Error(
      `[Resources] "${name}" must be true or false.`
    )
  }


  return value
}


/*
  ============================================================
  VALIDATE DEFAULTS
  ============================================================
*/


function parseDefaults(
  value: unknown
): FatDefaultResources {
  const defaults =
    requireRecord(
      value,
      'defaults'
    )


  return {
    character:
      requireString(
        defaults.character,
        'defaults.character'
      ),

    visual:
      requireString(
        defaults.visual,
        'defaults.visual'
      ),

    brain:
      requireString(
        defaults.brain,
        'defaults.brain'
      ),

    stt:
      requireString(
        defaults.stt,
        'defaults.stt'
      ),

    tts:
      requireString(
        defaults.tts,
        'defaults.tts'
      )
  }
}


/*
  ============================================================
  VALIDATE RESOURCE POLICY
  ============================================================
*/


function parseResourcePolicy(
  value: unknown
): FatResourcePolicy {
  const policy =
    requireRecord(
      value,
      'resource_policy'
    )


  return {
    builtin_resources_locked:
      requireBoolean(
        policy.builtin_resources_locked,
        'resource_policy.builtin_resources_locked'
      ),

    allow_delete_builtin:
      requireBoolean(
        policy.allow_delete_builtin,
        'resource_policy.allow_delete_builtin'
      ),

    allow_overwrite_builtin:
      requireBoolean(
        policy.allow_overwrite_builtin,
        'resource_policy.allow_overwrite_builtin'
      ),

    allow_user_resource_id_collision:
      requireBoolean(
        policy.allow_user_resource_id_collision,
        'resource_policy.allow_user_resource_id_collision'
      )
  }
}


/*
  ============================================================
  VALIDATE APP CONFIG
  ============================================================

  Không cast thẳng YAML thành FatAppConfig.

  app.yaml là file cấu hình quan trọng của hệ thống,
  nên phải kiểm tra dữ liệu trước khi dùng.
*/


function parseAppConfig(
  input: unknown
): FatAppConfig {
  const root =
    requireRecord(
      input,
      'root'
    )


  if (
    root.schema_version !==
      1
  ) {
    throw new Error(
      `[Resources] Unsupported app.yaml schema_version: ${String(root.schema_version)}`
    )
  }


  const appConfig =
    requireRecord(
      root.app,
      'app'
    )


  const project =
    requireRecord(
      root.project,
      'project'
    )


  return {
    schema_version:
      1,

    app: {
      id:
        requireString(
          appConfig.id,
          'app.id'
        ),

      name:
        requireString(
          appConfig.name,
          'app.name'
        )
    },

    defaults:
      parseDefaults(
        root.defaults
      ),

    resource_policy:
      parseResourcePolicy(
        root.resource_policy
      ),

    project: {
      credits:
        requireString(
          project.credits,
          'project.credits'
        )
    }
  }
}


/*
  ============================================================
  SAFE SYSTEM PATH
  ============================================================

  app.yaml được bundle cùng app và là trusted config.

  Tuy vậy vẫn chặn path trỏ ra ngoài resources/fat
  để tránh cấu hình sai kiểu:

    ../../../../something
*/


function resolveInsideSystemRoot(
  systemRoot: string,
  baseDir: string,
  relativePath: string
): string {
  const resolvedRoot =
    path.resolve(
      systemRoot
    )


  const resolved =
    path.resolve(
      baseDir,
      relativePath
    )


  const rootPrefix =
    `${resolvedRoot}${path.sep}`


  if (
    resolved !==
      resolvedRoot &&
    !resolved.startsWith(
      rootPrefix
    )
  ) {
    throw new Error(
      `[Resources] System resource path escapes resources/fat: ${relativePath}`
    )
  }


  return resolved
}


/*
  ============================================================
  LOAD SYSTEM CONFIG
  ============================================================
*/


export function loadSystemConfig():
  LoadedSystemConfig {
  const paths =
    getSystemResourcePaths()


  if (
    !existsSync(
      paths.root
    )
  ) {
    throw new Error(
      `[Resources] System resource root does not exist: ${paths.root}`
    )
  }


  if (
    !existsSync(
      paths.appConfigFile
    )
  ) {
    throw new Error(
      `[Resources] Missing app config: ${paths.appConfigFile}`
    )
  }


  const yamlText =
    readFileSync(
      paths.appConfigFile,
      'utf8'
    )


  let parsedYaml:
    unknown


  try {
    parsedYaml =
      parse(
        yamlText
      )
  }
  catch (error) {
    throw new Error(
      `[Resources] Invalid YAML in app.yaml: ${String(error)}`
    )
  }


  const config =
    parseAppConfig(
      parsedYaml
    )


  const creditsFile =
    resolveInsideSystemRoot(
      paths.root,
      paths.configDir,
      config.project.credits
    )


  if (
    !existsSync(
      creditsFile
    )
  ) {
    throw new Error(
      `[Resources] credits.yaml was not found: ${creditsFile}`
    )
  }


  return {
    config,

    paths,

    creditsFile
  }
}


/*
  ============================================================
  READ PROJECT CREDITS
  ============================================================

  Step 2 chỉ cung cấp loader chung.

  Schema riêng của credits.yaml sẽ được xử lý
  ở CreditLoader / ProjectContext sau này.
*/


export function readSystemCreditsYaml():
  string {
  const system =
    loadSystemConfig()


  return readFileSync(
    system.creditsFile,
    'utf8'
  )
}