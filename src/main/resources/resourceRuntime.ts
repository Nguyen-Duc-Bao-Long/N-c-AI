import {
  ensureUserResourceDirectories
} from './paths'

import {
  loadSystemConfig
} from './systemResourceLoader'

import {
  ResourceRegistry
} from './resourceRegistry'

import {
  loadSystemResourceCatalog
} from './systemResourceCatalogLoader'

import type {
  LoadedSystemResourceCatalog,
  LoadedSystemCatalogResource
} from './systemResourceCatalogLoader'

import type {
  LoadedSystemConfig,
  ResourceKind,
  UserResourcePaths
} from './types'


/*
  ============================================================
  F.A.T - RESOURCE RUNTIME
  ============================================================

  Đây là lifecycle layer của Resource System.

  Nhiệm vụ:

    1. Load + validate app.yaml
    2. Resolve credits.yaml
    3. Ensure User Resource directories
    4. Load Central Built-in Catalog
    5. Register built-in resources
    6. Check configured defaults
    7. Giữ ResourceRegistry sống trong suốt app lifecycle

  QUAN TRỌNG:

    index.ts chỉ nên gọi:
      initializeFatResourceSystem()

    Các module khác sau này có thể gọi:
      getFatResourceRuntime()

    để truy cập:
      - system config
      - system paths
      - user paths
      - registry
      - loaded catalog

  Không để bootstrap logic nằm trực tiếp trong index.ts.
*/


export type FatResourceRuntimeState = {
  system:
    LoadedSystemConfig

  user:
    UserResourcePaths

  registry:
    ResourceRegistry

  systemCatalog:
    LoadedSystemResourceCatalog

  missingDefaultResources:
    string[]
}


let fatResourceRuntime:
  FatResourceRuntimeState | null =
    null


/*
  ============================================================
  DEFAULT RESOURCE DESCRIPTORS
  ============================================================

  app.yaml là source of truth.
*/


function getDefaultResourceDescriptors(
  system:
    LoadedSystemConfig
): Array<{
  kind:
    ResourceKind

  id:
    string
}> {
  return [
    {
      kind:
        'character',

      id:
        system.config.defaults.character
    },

    {
      kind:
        'visual',

      id:
        system.config.defaults.visual
    },

    {
      kind:
        'brain',

      id:
        system.config.defaults.brain
    },

    {
      kind:
        'stt',

      id:
        system.config.defaults.stt
    },

    {
      kind:
        'tts',

      id:
        system.config.defaults.tts
    }
  ]
}


/*
  ============================================================
  REGISTER BUILT-IN CATALOG RESOURCES
  ============================================================
*/


function registerSystemCatalogResources(
  registry:
    ResourceRegistry,

  resources:
    LoadedSystemCatalogResource[]
): void {
  resources.forEach(
    loaded => {
      const result =
        registry.register(
          loaded.record
        )


      if (
        !result.ok
      ) {
        throw new Error(
          [
            '[F.A.T] Failed to register built-in catalog resource.',
            `Kind: ${loaded.record.kind}`,
            `ID: ${loaded.record.id}`,
            `Catalog: ${loaded.catalogResource.type}:${loaded.catalogResource.id}`,
            `Reason: ${result.reason ?? 'Unknown registry error'}`
          ].join(
            '\n'
          )
        )
      }
    }
  )
}


/*
  ============================================================
  FIND MISSING DEFAULT RESOURCES
  ============================================================

  Hiện tại vẫn cho phép BOOTSTRAP MODE:

    catalog có thể chưa chứa đủ default resource.

  Thiếu default:
    warning

  Config / catalog invalid:
    startup error

  Khi Built-in Resource Set hoàn chỉnh,
  check này có thể chuyển thành strict validation.
*/


function findMissingDefaultResources(
  system:
    LoadedSystemConfig,

  registry:
    ResourceRegistry
): string[] {
  return getDefaultResourceDescriptors(
    system
  )
    .filter(
      item =>
        !registry.has(
          item.kind,
          item.id
        )
    )
    .map(
      item =>
        `${item.kind}:${item.id}`
    )
}


/*
  ============================================================
  LOG RUNTIME
  ============================================================
*/


function logFatResourceRuntime(
  runtime:
    FatResourceRuntimeState
): void {
  const {
    system,
    user,
    registry,
    systemCatalog,
    missingDefaultResources
  } =
    runtime


  console.log('')


  console.log(
    '============================================================'
  )


  console.log(
    '[F.A.T] RESOURCE SYSTEM READY'
  )


  console.log(
    '[F.A.T] Architecture: CENTRAL CATALOG'
  )


  console.log(
    '[F.A.T] App:',
    system.config.app.name
  )


  console.log(
    '[F.A.T] System root:',
    system.paths.root
  )


  console.log(
    '[F.A.T] App config:',
    system.paths.appConfigFile
  )


  console.log(
    '[F.A.T] Credits:',
    system.creditsFile
  )


  console.log(
    '[F.A.T] Resource schema:',
    systemCatalog.schemaFile
  )


  console.log(
    '[F.A.T] Built-in catalog:',
    systemCatalog.catalogFile
  )


  console.log(
    '[F.A.T] User data root:',
    user.root
  )


  console.log(
    '[F.A.T] User catalog:',
    user.resourcesCatalogFile
  )


  console.log(
    '[F.A.T] User library:',
    user.libraryDir
  )


  console.log(
    '[F.A.T] Built-in catalog resources:',
    systemCatalog.resources.length
  )


  console.log(
    '[F.A.T] Registry resources:',
    registry.size
  )


  console.log(
    '[F.A.T] Character resources:',
    registry.list(
      'character'
    ).length
  )


  console.log(
    '[F.A.T] Visual resources:',
    registry.list(
      'visual'
    ).length
  )


  console.log(
    '[F.A.T] Brain resources:',
    registry.list(
      'brain'
    ).length
  )


  console.log(
    '[F.A.T] STT resources:',
    registry.list(
      'stt'
    ).length
  )


  console.log(
    '[F.A.T] TTS resources:',
    registry.list(
      'tts'
    ).length
  )


  if (
    missingDefaultResources.length >
      0
  ) {
    console.warn(
      '[F.A.T] BOOTSTRAP MODE - default resources not installed yet:'
    )


    missingDefaultResources.forEach(
      resourceKey => {
        console.warn(
          `[F.A.T]   - ${resourceKey}`
        )
      }
    )
  }
  else {
    console.log(
      '[F.A.T] All configured default resources are registered.'
    )
  }


  console.log(
    '============================================================'
  )


  console.log('')
}


/*
  ============================================================
  INITIALIZE
  ============================================================

  Idempotent:
    nếu lifecycle gọi lại trong cùng process,
    trả runtime hiện tại thay vì tạo Registry thứ hai.
*/


export function initializeFatResourceSystem():
  FatResourceRuntimeState {
  if (
    fatResourceRuntime
  ) {
    return fatResourceRuntime
  }


  const system =
    loadSystemConfig()


  const user =
    ensureUserResourceDirectories()


  const registry =
    new ResourceRegistry(
      system.config
    )


  const systemCatalog =
    loadSystemResourceCatalog(
      system
    )


  registerSystemCatalogResources(
    registry,
    systemCatalog.resources
  )


  const missingDefaultResources =
    findMissingDefaultResources(
      system,
      registry
    )


  const runtime:
    FatResourceRuntimeState = {
      system,
      user,
      registry,
      systemCatalog,
      missingDefaultResources
    }


  fatResourceRuntime =
    runtime


  logFatResourceRuntime(
    runtime
  )


  return runtime
}


/*
  ============================================================
  GET RUNTIME
  ============================================================
*/


export function getFatResourceRuntime():
  FatResourceRuntimeState {
  if (
    !fatResourceRuntime
  ) {
    throw new Error(
      '[F.A.T] Resource System has not been initialized.'
    )
  }


  return fatResourceRuntime
}


/*
  ============================================================
  RESET RUNTIME
  ============================================================

  Hiện runtime chỉ giữ config / paths / registry in-memory,
  không có file handle cần dispose.

  Hàm riêng giúp index.ts không phải biết
  biến internal fatResourceRuntime.
*/


export function resetFatResourceRuntime():
  void {
  fatResourceRuntime =
    null
}