import {
  ipcMain
} from 'electron'

import {
  getFatResourceRuntime
} from './resourceRuntime'

import type {
  ResourceKind,
  ResourceOrigin,
  ResourceRecord
} from './types'


/*
  ============================================================
  F.A.T - RESOURCE IPC
  ============================================================

  ResourceRegistry
        ↓
  Electron Main IPC
        ↓
  Preload
        ↓
  Renderer

  Renderer KHÔNG nhận sourcePath.

  sourcePath là filesystem detail chỉ Main process được biết.
*/


export type PublicResourceRecord = {
  id:
    string

  name:
    string

  kind:
    ResourceKind

  origin:
    ResourceOrigin

  locked:
    boolean
}


export type PublicResourceSnapshot = {
  characters:
    PublicResourceRecord[]

  visuals:
    PublicResourceRecord[]

  brains:
    PublicResourceRecord[]

  stt:
    PublicResourceRecord[]

  tts:
    PublicResourceRecord[]
}


/*
  ============================================================
  VALIDATION
  ============================================================
*/


function isResourceKind(
  value:
    unknown
): value is ResourceKind {
  return (
    value ===
      'character' ||

    value ===
      'visual' ||

    value ===
      'brain' ||

    value ===
      'stt' ||

    value ===
      'tts'
  )
}


function requireResourceKind(
  value:
    unknown
): ResourceKind {
  if (
    !isResourceKind(
      value
    )
  ) {
    throw new Error(
      `[F.A.T Resources IPC] Invalid resource kind: ${String(value)}`
    )
  }


  return value
}


function requireResourceId(
  value:
    unknown
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new Error(
      '[F.A.T Resources IPC] Resource ID must be a string.'
    )
  }


  const id =
    value.trim()


  if (
    id.length ===
      0
  ) {
    throw new Error(
      '[F.A.T Resources IPC] Resource ID cannot be empty.'
    )
  }


  return id
}


/*
  ============================================================
  PUBLIC DTO
  ============================================================
*/


function toPublicResource(
  resource:
    ResourceRecord
): PublicResourceRecord {
  return {
    id:
      resource.id,

    name:
      resource.name,

    kind:
      resource.kind,

    origin:
      resource.origin,

    locked:
      resource.locked
  }
}


function toPublicResourceList(
  resources:
    ResourceRecord[]
): PublicResourceRecord[] {
  return resources.map(
    toPublicResource
  )
}


/*
  ============================================================
  REGISTER RESOURCE IPC
  ============================================================
*/


export function registerResourceIpcHandlers():
  void {
  /*
    ==========================================================
    LIST
    ==========================================================

    window.fat.resources.list()

    hoặc:

    window.fat.resources.list(
      'character'
    )
  */

  ipcMain.handle(
    'fat:resources:list',

    (
      _event,
      kind:
        unknown
    ) => {
      const runtime =
        getFatResourceRuntime()


      if (
        kind ===
          undefined ||

        kind ===
          null
      ) {
        return toPublicResourceList(
          runtime.registry.list()
        )
      }


      return toPublicResourceList(
        runtime.registry.list(
          requireResourceKind(
            kind
          )
        )
      )
    }
  )


  /*
    ==========================================================
    GET
    ==========================================================

    Không tìm thấy:
      null
  */

  ipcMain.handle(
    'fat:resources:get',

    (
      _event,
      kind:
        unknown,
      id:
        unknown
    ) => {
      const runtime =
        getFatResourceRuntime()


      const resource =
        runtime.registry.get(
          requireResourceKind(
            kind
          ),

          requireResourceId(
            id
          )
        )


      return resource
        ? toPublicResource(
            resource
          )
        : null
    }
  )


  /*
    ==========================================================
    SNAPSHOT
    ==========================================================
  */

  ipcMain.handle(
    'fat:resources:snapshot',

    () => {
      const runtime =
        getFatResourceRuntime()


      const snapshot =
        runtime.registry.snapshot()


      const publicSnapshot:
        PublicResourceSnapshot = {
        characters:
          toPublicResourceList(
            snapshot.characters
          ),

        visuals:
          toPublicResourceList(
            snapshot.visuals
          ),

        brains:
          toPublicResourceList(
            snapshot.brains
          ),

        stt:
          toPublicResourceList(
            snapshot.stt
          ),

        tts:
          toPublicResourceList(
            snapshot.tts
          )
      }


      return publicSnapshot
    }
  )


  /*
    ==========================================================
    DEFAULT RESOURCE IDS
    ==========================================================

    app.yaml vẫn là source of truth.

    Chỉ expose ID, không expose filesystem path.
  */

  ipcMain.handle(
    'fat:resources:get-defaults',

    () => {
      const runtime =
        getFatResourceRuntime()


      return {
        ...runtime
          .system
          .config
          .defaults
      }
    }
  )


  /*
    ==========================================================
    STATUS
    ==========================================================

    Dùng cho debug và Control Center sau này.
  */

  ipcMain.handle(
    'fat:resources:get-status',

    () => {
      const runtime =
        getFatResourceRuntime()


      return {
        ready:
          true,

        total:
          runtime.registry.size,

        missingDefaultResources: [
          ...runtime
            .missingDefaultResources
        ],

        counts: {
          character:
            runtime.registry
              .list(
                'character'
              )
              .length,

          visual:
            runtime.registry
              .list(
                'visual'
              )
              .length,

          brain:
            runtime.registry
              .list(
                'brain'
              )
              .length,

          stt:
            runtime.registry
              .list(
                'stt'
              )
              .length,

          tts:
            runtime.registry
              .list(
                'tts'
              )
              .length
        }
      }
    }
  )
}