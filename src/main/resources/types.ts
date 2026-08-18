/*
  ============================================================
  F.A.T - RESOURCE SYSTEM TYPES
  ============================================================

  Central Catalog architecture:

    SYSTEM:
      resources/fat/catalog/builtin-resources.yaml

    USER:
      userData/fat-data/catalog/resources.json

  User KHÔNG cần tự tạo manifest.yaml trong từng model.
*/

export type ResourceOrigin =
  | 'builtin'
  | 'user'

export type ResourceKind =
  | 'character'
  | 'visual'
  | 'brain'
  | 'stt'
  | 'tts'

export type FatDefaultResources = {
  character: string
  visual: string
  brain: string
  stt: string
  tts: string
}

export type FatResourcePolicy = {
  builtin_resources_locked: boolean
  allow_delete_builtin: boolean
  allow_overwrite_builtin: boolean
  allow_user_resource_id_collision: boolean
}

export type FatApplicationIdentity = {
  id: string
  name: string
}

export type FatProjectConfig = {
  credits: string
}

export type FatAppConfig = {
  schema_version: number
  app: FatApplicationIdentity
  defaults: FatDefaultResources
  resource_policy: FatResourcePolicy
  project: FatProjectConfig
}

export type SystemResourcePaths = {
  root: string
  configDir: string
  appConfigFile: string

  catalogDir: string
  builtinCatalogFile: string

  schemasDir: string
  resourceSchemaFile: string

  charactersDir: string
  modelsDir: string
  live2dModelsDir: string
  brainDir: string
  sttDir: string
  ttsDir: string
}

export type UserResourcePaths = {
  root: string

  catalogDir: string
  resourcesCatalogFile: string

  libraryDir: string
  charactersDir: string
  visualDir: string
  live2dModelsDir: string
  brainDir: string
  sttDir: string
  ttsDir: string

  cacheDir: string
  logsDir: string
  conversationsDir: string
}

export type LoadedSystemConfig = {
  config: FatAppConfig
  paths: SystemResourcePaths
  creditsFile: string
}

export type ResourceRecord = {
  id: string
  name: string
  kind: ResourceKind
  origin: ResourceOrigin
  locked: boolean
  sourcePath: string
}