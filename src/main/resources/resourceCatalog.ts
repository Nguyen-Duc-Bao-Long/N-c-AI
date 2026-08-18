import type {
  ResourceKind,
  ResourceOrigin
} from './types'


/*
  ============================================================
  F.A.T - CENTRAL RESOURCE CATALOG TYPES
  ============================================================

  Central Catalog thay thế hoàn toàn mô hình:

    mỗi resource folder / manifest.yaml

  BUILT-IN catalog:

    resources/fat/catalog/builtin-resources.yaml

  USER catalog:

    userData/fat-data/catalog/resources.json

  User KHÔNG cần tự viết manifest.

  App / importer chịu trách nhiệm:
    - nhận diện resource
    - tạo ID
    - tạo metadata
    - ghi User Catalog
*/


/*
  ============================================================
  COMMON RESOURCE SOURCE
  ============================================================

  directory:
    đường dẫn tương đối tính từ folder chứa catalog.

  Ví dụ:

    builtin-resources.yaml nằm ở:
      resources/fat/catalog/

    và resource có:

      source:
        directory: "../characters/shu"

    thì source directory sẽ là:

      resources/fat/characters/shu
*/


export type CatalogResourceSource = {
  directory:
    string | null
}


/*
  ============================================================
  CHARACTER
  ============================================================
*/


export type CatalogCharacterModules = {
  visual:
    string

  brain:
    string

  stt:
    string

  tts:
    string
}


export type CatalogCharacterData = {
  personality:
    string | null

  lore:
    string | null

  icon:
    string | null

  modules:
    CatalogCharacterModules
}


/*
  ============================================================
  VISUAL
  ============================================================
*/


export type CatalogVisualData = {
  engine:
    string

  entry:
    string
}


/*
  ============================================================
  GENERIC CATALOG RESOURCE
  ============================================================

  Brain / STT / TTS metadata chi tiết sẽ được bổ sung
  khi làm Provider System.

  raw giữ lại toàn bộ object YAML để sau này có thể mở rộng
  mà không phải phá base catalog loader.
*/


export type CatalogResource = {
  id:
    string

  type:
    ResourceKind

  name:
    string

  origin:
    ResourceOrigin

  locked:
    boolean

  description:
    string | null

  source:
    CatalogResourceSource

  character:
    CatalogCharacterData | null

  visual:
    CatalogVisualData | null

  raw:
    Record<string, unknown>
}


/*
  ============================================================
  CENTRAL CATALOG
  ============================================================
*/


export type ResourceCatalog = {
  schema_version:
    1

  resources:
    CatalogResource[]
}


/*
  ============================================================
  PARSER HELPERS
  ============================================================
*/


const RESOURCE_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]*$/


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
      `[ResourceCatalog] "${name}" must be an object.`
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
      `[ResourceCatalog] "${name}" must be a non-empty string.`
    )
  }


  return value.trim()
}


function optionalString(
  value: unknown,
  name: string
): string | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null
  }


  if (
    typeof value !==
      'string'
  ) {
    throw new Error(
      `[ResourceCatalog] "${name}" must be a string when provided.`
    )
  }


  const normalized =
    value.trim()


  return (
    normalized.length >
      0
      ? normalized
      : null
  )
}


function optionalBoolean(
  value: unknown,
  fallback: boolean,
  name: string
): boolean {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback
  }


  if (
    typeof value !==
      'boolean'
  ) {
    throw new Error(
      `[ResourceCatalog] "${name}" must be true or false when provided.`
    )
  }


  return value
}


function parseResourceKind(
  value: unknown,
  name: string
): ResourceKind {
  const kind =
    requireString(
      value,
      name
    )


  if (
    kind !==
      'character' &&
    kind !==
      'visual' &&
    kind !==
      'brain' &&
    kind !==
      'stt' &&
    kind !==
      'tts'
  ) {
    throw new Error(
      `[ResourceCatalog] Unsupported resource type: ${kind}`
    )
  }


  return kind
}


function parseOrigin(
  value: unknown,
  name: string
): ResourceOrigin {
  const origin =
    requireString(
      value,
      name
    )


  if (
    origin !==
      'builtin' &&
    origin !==
      'user'
  ) {
    throw new Error(
      `[ResourceCatalog] Unsupported resource origin: ${origin}`
    )
  }


  return origin
}


function parseResourceId(
  value: unknown,
  name: string
): string {
  const id =
    requireString(
      value,
      name
    )


  if (
    !RESOURCE_ID_PATTERN.test(
      id
    )
  ) {
    throw new Error(
      [
        `[ResourceCatalog] Invalid resource ID: ${id}`,
        'Allowed characters:',
        'a-z, 0-9, dot, underscore, hyphen.'
      ].join(
        ' '
      )
    )
  }


  return id
}


/*
  ============================================================
  SOURCE
  ============================================================
*/


function parseSource(
  value: unknown,
  resourceName: string
): CatalogResourceSource {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return {
      directory:
        null
    }
  }


  const source =
    requireRecord(
      value,
      `${resourceName}.source`
    )


  return {
    directory:
      optionalString(
        source.directory,
        `${resourceName}.source.directory`
      )
  }
}


/*
  ============================================================
  CHARACTER DATA
  ============================================================
*/


function parseCharacterData(
  value: unknown,
  resourceName: string
): CatalogCharacterData {
  const character =
    requireRecord(
      value,
      `${resourceName}.character`
    )


  const modules =
    requireRecord(
      character.modules,
      `${resourceName}.character.modules`
    )


  return {
    personality:
      optionalString(
        character.personality,
        `${resourceName}.character.personality`
      ),

    lore:
      optionalString(
        character.lore,
        `${resourceName}.character.lore`
      ),

    icon:
      optionalString(
        character.icon,
        `${resourceName}.character.icon`
      ),

    modules: {
      visual:
        requireString(
          modules.visual,
          `${resourceName}.character.modules.visual`
        ),

      brain:
        requireString(
          modules.brain,
          `${resourceName}.character.modules.brain`
        ),

      stt:
        requireString(
          modules.stt,
          `${resourceName}.character.modules.stt`
        ),

      tts:
        requireString(
          modules.tts,
          `${resourceName}.character.modules.tts`
        )
    }
  }
}


/*
  ============================================================
  VISUAL DATA
  ============================================================
*/


function parseVisualData(
  value: unknown,
  resourceName: string
): CatalogVisualData {
  const visual =
    requireRecord(
      value,
      `${resourceName}.visual`
    )


  return {
    engine:
      requireString(
        visual.engine,
        `${resourceName}.visual.engine`
      ),

    entry:
      requireString(
        visual.entry,
        `${resourceName}.visual.entry`
      )
  }
}


/*
  ============================================================
  PARSE ONE RESOURCE
  ============================================================
*/


function parseCatalogResource(
  value: unknown,
  index: number
): CatalogResource {
  const resourceName =
    `resources[${index}]`


  const raw =
    requireRecord(
      value,
      resourceName
    )


  const type =
    parseResourceKind(
      raw.type,
      `${resourceName}.type`
    )


  const resource:
    CatalogResource = {
    id:
      parseResourceId(
        raw.id,
        `${resourceName}.id`
      ),

    type,

    name:
      requireString(
        raw.name,
        `${resourceName}.name`
      ),

    origin:
      parseOrigin(
        raw.origin,
        `${resourceName}.origin`
      ),

    locked:
      optionalBoolean(
        raw.locked,
        raw.origin ===
          'builtin',
        `${resourceName}.locked`
      ),

    description:
      optionalString(
        raw.description,
        `${resourceName}.description`
      ),

    source:
      parseSource(
        raw.source,
        resourceName
      ),

    character:
      null,

    visual:
      null,

    raw
  }


  if (
    type ===
      'character'
  ) {
    resource.character =
      parseCharacterData(
        raw.character,
        resourceName
      )
  }


  if (
    type ===
      'visual'
  ) {
    resource.visual =
      parseVisualData(
        raw.visual,
        resourceName
      )
  }


  return resource
}


/*
  ============================================================
  PARSE CENTRAL CATALOG
  ============================================================

  Empty catalog is valid:

    schema_version: 1
    resources: []

  Đây chính là trạng thái bootstrap hiện tại.
*/


export function parseResourceCatalog(
  input: unknown
): ResourceCatalog {
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
      `[ResourceCatalog] Unsupported schema_version: ${String(root.schema_version)}`
    )
  }


  if (
    !Array.isArray(
      root.resources
    )
  ) {
    throw new Error(
      '[ResourceCatalog] "resources" must be an array.'
    )
  }


  const resources =
    root.resources.map(
      (
        item,
        index
      ) =>
        parseCatalogResource(
          item,
          index
        )
    )


  /*
    Duplicate trong cùng catalog bị chặn ngay tại parser.

    Registry vẫn tiếp tục là lớp bảo vệ cuối cùng
    khi merge BUILTIN + USER.
  */

  const seenKeys =
    new Set<string>()


  resources.forEach(
    resource => {
      const key =
        `${resource.type}:${resource.id}`


      if (
        seenKeys.has(
          key
        )
      ) {
        throw new Error(
          `[ResourceCatalog] Duplicate resource in catalog: ${key}`
        )
      }


      seenKeys.add(
        key
      )
    }
  )


  return {
    schema_version:
      1,

    resources
  }
}