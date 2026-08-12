import type { CharacterConfig } from './types'

export const akariCharacter = {
  id: 'akari',
  name: 'Akari',

  modelUrl:
    './live2d/models/akari_vts/akari.model3.json',

  transform: {
    scale: 0.9,
    x: 0.5,
    y: 0.5
  }
} satisfies CharacterConfig