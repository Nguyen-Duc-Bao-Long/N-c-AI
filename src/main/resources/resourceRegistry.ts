import type {
  FatAppConfig,
  ResourceKind,
  ResourceOrigin,
  ResourceRecord
} from './types'

import {
  createResourceKey,
  createReservedResourceKeySet
} from './reservedResourceIds'


/*
  ============================================================
  F.A.T - RESOURCE REGISTRY
  ============================================================

  Đây là registry chung cho:

    - Character
    - Visual / Live2D
    - Brain
    - STT
    - TTS

  Registry KHÔNG đọc file.

  Nhiệm vụ của nó chỉ là:

    1. nhận ResourceRecord đã được loader validate
    2. lưu theo kind + id
    3. bảo vệ built-in resource
    4. ngăn user resource ghi đè built-in
    5. cung cấp API get/list cho app

  Loader / scanner sẽ được viết ở bước sau.
*/


/*
  ============================================================
  TYPES
  ============================================================
*/


export type RegisterResourceResult = {
  ok:
    boolean

  resource:
    ResourceRecord | null

  reason:
    string | null
}


export type RemoveResourceResult = {
  ok:
    boolean

  resource:
    ResourceRecord | null

  reason:
    string | null
}


export type ResourceRegistrySnapshot = {
  characters:
    ResourceRecord[]

  visuals:
    ResourceRecord[]

  brains:
    ResourceRecord[]

  stt:
    ResourceRecord[]

  tts:
    ResourceRecord[]
}


/*
  ============================================================
  HELPERS
  ============================================================
*/


function normalizeId(
  id: string
): string {
  return id.trim()
}


function normalizeName(
  name: string
): string {
  return name.trim()
}


function validateResourceRecord(
  resource: ResourceRecord
): string | null {
  if (
    normalizeId(
      resource.id
    ).length ===
      0
  ) {
    return 'Resource ID cannot be empty.'
  }


  if (
    normalizeName(
      resource.name
    ).length ===
      0
  ) {
    return 'Resource name cannot be empty.'
  }


  if (
    resource.origin !==
      'builtin' &&
    resource.origin !==
      'user'
  ) {
    return `Unsupported resource origin: ${String(resource.origin)}`
  }


  if (
    resource.kind !==
      'character' &&
    resource.kind !==
      'visual' &&
    resource.kind !==
      'brain' &&
    resource.kind !==
      'stt' &&
    resource.kind !==
      'tts'
  ) {
    return `Unsupported resource kind: ${String(resource.kind)}`
  }


  if (
    resource.sourcePath.trim().length ===
      0
  ) {
    return 'Resource sourcePath cannot be empty.'
  }


  return null
}


/*
  ============================================================
  REGISTRY
  ============================================================
*/


export class ResourceRegistry {
  private readonly resources =
    new Map<
      string,
      ResourceRecord
    >()


  private readonly reservedKeys:
    Set<string>


  constructor(
    private readonly config:
      FatAppConfig
  ) {
    this.reservedKeys =
      createReservedResourceKeySet(
        config
      )
  }


  /*
    ==========================================================
    REGISTER
    ==========================================================
  */


  register(
    input:
      ResourceRecord
  ): RegisterResourceResult {
    const validationError =
      validateResourceRecord(
        input
      )


    if (
      validationError
    ) {
      return {
        ok:
          false,

        resource:
          null,

        reason:
          validationError
      }
    }


    const resource:
      ResourceRecord = {
      ...input,

      id:
        normalizeId(
          input.id
        ),

      name:
        normalizeName(
          input.name
        )
    }


    const key =
      createResourceKey(
        resource.kind,
        resource.id
      )


    const existing =
      this.resources.get(
        key
      )


    /*
      ========================================================
      USER CANNOT CLAIM RESERVED DEFAULT ID
      ========================================================

      Ví dụ user import:

        kind: character
        id: shu

      thì reject ngay cả khi Shu built-in chưa scan xong.

      Nhờ vậy thứ tự scan không ảnh hưởng security/policy.
    */

    if (
      resource.origin ===
        'user' &&
      this.reservedKeys.has(
        key
      ) &&
      !this.config
        .resource_policy
        .allow_user_resource_id_collision
    ) {
      return {
        ok:
          false,

        resource:
          null,

        reason:
          `User resource cannot use reserved built-in ID: ${key}`
      }
    }


    /*
      ========================================================
      NO EXISTING RESOURCE
      ========================================================
    */

    if (
      !existing
    ) {
      this.resources.set(
        key,
        resource
      )


      return {
        ok:
          true,

        resource,

        reason:
          null
      }
    }


    /*
      ========================================================
      BUILTIN EXISTING
      ========================================================

      User không được overwrite built-in nếu policy cấm.

      Built-in cũng không tự overwrite built-in khác,
      vì đó thường là lỗi package/config.
    */

    if (
      existing.origin ===
        'builtin'
    ) {
      if (
        resource.origin ===
          'builtin'
      ) {
        return {
          ok:
            false,

          resource:
            existing,

          reason:
            `Duplicate built-in resource ID: ${key}`
        }
      }


      if (
        !this.config
          .resource_policy
          .allow_overwrite_builtin
      ) {
        return {
          ok:
            false,

          resource:
            existing,

          reason:
            `Built-in resource is protected: ${key}`
        }
      }
    }


    /*
      ========================================================
      USER EXISTING
      ========================================================

      Bước hiện tại:
        không tự overwrite user resource.

      Import Manager sau này phải hỏi user:
        Replace?
        Cancel?
        Import as new ID?

      Registry không tự quyết định.
    */

    if (
      existing.origin ===
        'user' &&
      resource.origin ===
        'user'
    ) {
      return {
        ok:
          false,

        resource:
          existing,

        reason:
          `User resource ID already exists: ${key}`
      }
    }


    /*
      ========================================================
      BUILTIN REPLACING USER
      ========================================================

      Trường hợp này có thể xảy ra nếu scan user trước built-in.

      Built-in luôn được quyền chiếm ID hệ thống,
      vì System Resource là authoritative.
    */

    if (
      existing.origin ===
        'user' &&
      resource.origin ===
        'builtin'
    ) {
      this.resources.set(
        key,
        resource
      )


      return {
        ok:
          true,

        resource,

        reason:
          null
      }
    }


    /*
      ========================================================
      POLICY ALLOWS BUILTIN OVERWRITE
      ========================================================
    */

    this.resources.set(
      key,
      resource
    )


    return {
      ok:
        true,

      resource,

      reason:
        null
    }
  }


  /*
    ==========================================================
    GET
    ==========================================================
  */


  get(
    kind:
      ResourceKind,
    id:
      string
  ):
    ResourceRecord |
    null {
    return (
      this.resources.get(
        createResourceKey(
          kind,
          normalizeId(
            id
          )
        )
      ) ??
      null
    )
  }


  has(
    kind:
      ResourceKind,
    id:
      string
  ): boolean {
    return (
      this.get(
        kind,
        id
      ) !==
      null
    )
  }


  /*
    ==========================================================
    LIST
    ==========================================================
  */


  list(
    kind?:
      ResourceKind
  ): ResourceRecord[] {
    const values = [
      ...this.resources.values()
    ]


    const filtered =
      kind
        ? values.filter(
            resource =>
              resource.kind ===
              kind
          )
        : values


    return filtered
      .sort(
        (
          left,
          right
        ) => {
          /*
            Built-in trước user.
          */

          if (
            left.origin !==
            right.origin
          ) {
            return left.origin ===
              'builtin'
              ? -1
              : 1
          }


          return left.name
            .localeCompare(
              right.name
            )
        }
      )
  }


  listByOrigin(
    origin:
      ResourceOrigin
  ): ResourceRecord[] {
    return this.list()
      .filter(
        resource =>
          resource.origin ===
          origin
      )
  }


  /*
    ==========================================================
    REMOVE
    ==========================================================
  */


  remove(
    kind:
      ResourceKind,
    id:
      string
  ): RemoveResourceResult {
    const key =
      createResourceKey(
        kind,
        normalizeId(
          id
        )
      )


    const existing =
      this.resources.get(
        key
      )


    if (
      !existing
    ) {
      return {
        ok:
          false,

        resource:
          null,

        reason:
          `Resource not found: ${key}`
      }
    }


    /*
      Built-in resource mặc định bị khóa.
    */

    if (
      existing.origin ===
        'builtin' &&
      (
        this.config
          .resource_policy
          .builtin_resources_locked ||
        !this.config
          .resource_policy
          .allow_delete_builtin
      )
    ) {
      return {
        ok:
          false,

        resource:
          existing,

        reason:
          `Built-in resource cannot be deleted: ${key}`
      }
    }


    this.resources.delete(
      key
    )


    return {
      ok:
        true,

      resource:
        existing,

      reason:
        null
    }
  }


  /*
    ==========================================================
    CLEAR USER RESOURCES
    ==========================================================

    Chỉ clear state trong memory.

    KHÔNG xóa file trên disk.
  */


  clearUserResources():
    void {
    for (
      const [
        key,
        resource
      ] of this.resources
    ) {
      if (
        resource.origin ===
          'user'
      ) {
        this.resources.delete(
          key
        )
      }
    }
  }


  /*
    ==========================================================
    SNAPSHOT
    ==========================================================
  */


  snapshot():
    ResourceRegistrySnapshot {
    return {
      characters:
        this.list(
          'character'
        ),

      visuals:
        this.list(
          'visual'
        ),

      brains:
        this.list(
          'brain'
        ),

      stt:
        this.list(
          'stt'
        ),

      tts:
        this.list(
          'tts'
        )
    }
  }


  /*
    ==========================================================
    DEBUG
    ==========================================================
  */


  get size():
    number {
    return this.resources.size
  }
}