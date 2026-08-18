import type {
  FatAppConfig,
  ResourceKind
} from './types'


/*
  ============================================================
  F.A.T - RESERVED RESOURCE IDS
  ============================================================

  Built-in default resource IDs phải được bảo vệ.

  Ví dụ:

    character:
      shu

    visual:
      shu-live2d-default

    brain:
      shu-brain-default

    stt:
      fat-stt-default

    tts:
      shu-tts-default

  Quan trọng:
    ID được reserve theo RESOURCE KIND.

  Nghĩa là:
    character:shu
  khác:
    visual:shu

  Registry sẽ dùng key dạng:

    <kind>:<id>
*/


export type ReservedResourceId = {
  kind:
    ResourceKind

  id:
    string
}


/*
  ============================================================
  RESOURCE KEY
  ============================================================
*/


export function createResourceKey(
  kind: ResourceKind,
  id: string
): string {
  return `${kind}:${id}`
}


/*
  ============================================================
  DEFAULT IDS FROM app.yaml
  ============================================================

  Không hard-code Shu trong Registry.

  app.yaml là source of truth.
*/


export function getReservedResourceIds(
  config: FatAppConfig
): ReservedResourceId[] {
  return [
    {
      kind:
        'character',

      id:
        config.defaults.character
    },

    {
      kind:
        'visual',

      id:
        config.defaults.visual
    },

    {
      kind:
        'brain',

      id:
        config.defaults.brain
    },

    {
      kind:
        'stt',

      id:
        config.defaults.stt
    },

    {
      kind:
        'tts',

      id:
        config.defaults.tts
    }
  ]
}


/*
  ============================================================
  RESERVED KEY SET
  ============================================================
*/


export function createReservedResourceKeySet(
  config: FatAppConfig
): Set<string> {
  return new Set(
    getReservedResourceIds(
      config
    )
      .map(
        item =>
          createResourceKey(
            item.kind,
            item.id
          )
      )
  )
}


/*
  ============================================================
  CHECK
  ============================================================
*/


export function isReservedResourceId(
  config: FatAppConfig,
  kind: ResourceKind,
  id: string
): boolean {
  const reservedKeys =
    createReservedResourceKeySet(
      config
    )


  return reservedKeys.has(
    createResourceKey(
      kind,
      id
    )
  )
}