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
export const DEFAULT_CHARACTER_ID:
  CharacterId = 'akari'


export function getCharacterConfig(
  id: CharacterId
): CharacterConfig {
  return characters[id]
}