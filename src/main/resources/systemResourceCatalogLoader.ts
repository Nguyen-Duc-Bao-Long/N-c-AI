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
  parseResourceCatalog
} from './resourceCatalog'

import type {
  CatalogResource,
  ResourceCatalog
} from './resourceCatalog'

import type {
  LoadedSystemConfig,
  ResourceRecord
} from './types'


/*
  ============================================================
  F.A.T - SYSTEM RESOURCE CATALOG LOADER
  ============================================================

  Thay cho cơ chế cũ:

    scan folder
      ↓
    find manifest.yaml

  Bằng:

    resources/fat/catalog/builtin-resources.yaml
      ↓
    validate
      ↓
    resolve paths
      ↓
    ResourceRecord[]
*/


export type LoadedSystemCatalogResource = {
  catalogResource:
    CatalogResource

  record:
    ResourceRecord

  sourceDirectory:
    string
}


export type LoadedSystemResourceCatalog = {
  catalog:
    ResourceCatalog

  catalogFile:
    string

  schemaFile:
    string

  resources:
    LoadedSystemCatalogResource[]
}


/*
  ============================================================
  SAFE SYSTEM PATH
  ============================================================

  Built-in catalog do F.A.T quản lý,
  nhưng vẫn không cho đường dẫn resource thoát ra ngoài:

    resources/fat/
*/


function resolveInsideSystemRoot(
  systemRoot: string,
  baseDirectory: string,
  relativePath: string
): string {
  const resolvedRoot =
    path.resolve(
      systemRoot
    )


  const resolved =
    path.resolve(
      baseDirectory,
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
      `[ResourceCatalog] Path escapes resources/fat: ${relativePath}`
    )
  }


  return resolved
}


/*
  ============================================================
  RESOLVE SOURCE DIRECTORY
  ============================================================

  Nếu resource không khai báo source.directory,
  sourcePath của ResourceRecord sẽ trỏ về catalog directory.

  Điều này cho phép resource dạng provider/config-only
  tồn tại mà không cần có model folder riêng.

  File-backed resource như Live2D / local Brain
  nên khai báo source.directory.
*/


function resolveSourceDirectory(
  system:
    LoadedSystemConfig,

  catalogFile:
    string,

  resource:
    CatalogResource
): string {
  const catalogDirectory =
    path.dirname(
      catalogFile
    )


  if (
    !resource.source.directory
  ) {
    return catalogDirectory
  }


  return resolveInsideSystemRoot(
    system.paths.root,
    catalogDirectory,
    resource.source.directory
  )
}


/*
  ============================================================
  CREATE REGISTRY RECORD
  ============================================================
*/


function createResourceRecord(
  resource:
    CatalogResource,

  sourceDirectory:
    string
): ResourceRecord {
  return {
    id:
      resource.id,

    name:
      resource.name,

    kind:
      resource.type,

    origin:
      resource.origin,

    locked:
      resource.locked,

    sourcePath:
      sourceDirectory
  }
}


/*
  ============================================================
  VALIDATE BUILT-IN ORIGIN
  ============================================================

  builtin-resources.yaml chỉ được chứa:

    origin: builtin

  User resources sẽ có User Catalog riêng.
*/


function validateBuiltinOrigin(
  resources:
    CatalogResource[]
): void {
  resources.forEach(
    resource => {
      if (
        resource.origin !==
          'builtin'
      ) {
        throw new Error(
          [
            '[ResourceCatalog] Built-in catalog contains a non-builtin resource.',
            `Resource: ${resource.type}:${resource.id}`,
            `Origin: ${resource.origin}`
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
  LOAD
  ============================================================
*/


export function loadSystemResourceCatalog(
  system:
    LoadedSystemConfig
): LoadedSystemResourceCatalog {
  const catalogFile =
    system.paths.builtinCatalogFile


  const schemaFile =
    system.paths.resourceSchemaFile


  /*
    resource.schema.yaml hiện là F.A.T schema/spec source.

    TypeScript vẫn thực hiện runtime validation.

    Ta kiểm tra file tồn tại để đảm bảo bản build
    không bị thiếu System Resource.
  */

  if (
    !existsSync(
      schemaFile
    )
  ) {
    throw new Error(
      `[ResourceCatalog] Missing resource schema: ${schemaFile}`
    )
  }


  if (
    !existsSync(
      catalogFile
    )
  ) {
    throw new Error(
      `[ResourceCatalog] Missing built-in catalog: ${catalogFile}`
    )
  }


  const yamlText =
    readFileSync(
      catalogFile,
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
      `[ResourceCatalog] Invalid YAML in built-in catalog:\n${catalogFile}\n${String(error)}`
    )
  }


  const catalog =
    parseResourceCatalog(
      parsedYaml
    )


  validateBuiltinOrigin(
    catalog.resources
  )


  const resources =
    catalog.resources.map(
      resource => {
        const sourceDirectory =
          resolveSourceDirectory(
            system,
            catalogFile,
            resource
          )


        return {
          catalogResource:
            resource,

          record:
            createResourceRecord(
              resource,
              sourceDirectory
            ),

          sourceDirectory
        }
      }
    )


  return {
    catalog,

    catalogFile,

    schemaFile,

    resources
  }
}