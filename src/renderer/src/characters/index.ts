import { akariCharacter } from './akari'

import type {
  CharacterConfig
} from './types'


/*
  Tất cả character mà app hỗ trợ
  sẽ được đăng ký tại đây.
*/
export const characters = {
  akari: akariCharacter
} satisfies Record<string, CharacterConfig>


/*
  Type tự động trở thành:

  'akari'

  Sau này thêm miku thì tự thành:

  'akari' | 'miku'
*/
export type CharacterId =
  keyof typeof characters


/*
  Character mặc định khi app khởi động.
*/
/*
  ============================================================
  BUILT-IN FALLBACK CHARACTER
  ============================================================

  Đây là model được đóng gói sẵn
  cùng ứng dụng.

  Nó KHÔNG có nghĩa là model
  mặc định do người dùng chọn.

  Nếu model user chọn bị mất,
  bị xóa hoặc load lỗi,
  app sẽ quay về model này.

  Hiện tại tạm thời dùng Akari.
  Sau này có thể đổi rất dễ.
*/

export const FALLBACK_CHARACTER_ID =
  'akari'

/*
  ============================================================
  TEMPORARY COMPATIBILITY
  ============================================================

  Giữ alias này tạm thời để
  những file cũ chưa bị lỗi.

  Sau khi hệ thống User Default
  hoàn thiện, ta sẽ xóa nó.
*/

export const DEFAULT_CHARACTER_ID =
  FALLBACK_CHARACTER_ID

export function getCharacterConfig(
  id: CharacterId
): CharacterConfig {
  return characters[id]
}