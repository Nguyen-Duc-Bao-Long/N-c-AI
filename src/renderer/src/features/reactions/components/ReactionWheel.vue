<script setup lang="ts">
import { computed } from 'vue'

import type {
  Live2DAction
} from '../../live2d/types'


const props = defineProps<{
  actions: Live2DAction[]
}>()


const emit = defineEmits<{
  select: [action: Live2DAction]

  close: []
}>()


/*
  Mỗi vòng tối đa 8 action.

  Nếu model có >8 action,
  menu sẽ tự tạo vòng thứ hai.
*/
const ITEMS_PER_RING = 8


const positionedActions =
  computed(() => {
    return props.actions.map(
      (action, index) => {

        const ring =
          Math.floor(
            index / ITEMS_PER_RING
          )


        const ringStart =
          ring * ITEMS_PER_RING


        const itemsInThisRing =
          Math.min(
            ITEMS_PER_RING,
            props.actions.length -
              ringStart
          )


        const indexInRing =
          index - ringStart


        /*
          Bắt đầu từ phía trên.
        */
        const angle =
          -Math.PI / 2 +
          (
            Math.PI *
            2 *
            indexInRing
          ) /
          itemsInThisRing


        /*
          Vòng 1: 105px
          Vòng 2: 170px
          ...
        */
        const radius =
          105 +
          ring * 65


        const x =
          Math.cos(angle) *
          radius


        const y =
          Math.sin(angle) *
          radius


        return {
          action,

          style: {
            transform:
              `translate(${x}px, ${y}px)`
          }
        }
      }
    )
  })


function iconFor(
  action: Live2DAction
): string {

  if (
    action.type ===
    'expression'
  ) {
    return '☺'
  }

  return '✦'
}
</script>


<template>
  <div
    class="reaction-overlay"
    @pointerdown.self="emit('close')"
  >

    <div class="reaction-wheel">

      <div
        class="wheel-background"
      />


      <button
        v-for="item in positionedActions"
        :key="item.action.id"
        class="reaction-item"
        :style="item.style"
        :title="item.action.label"
        @click="
          emit(
            'select',
            item.action
          )
        "
      >

        <span class="reaction-icon">
          {{
            iconFor(
              item.action
            )
          }}
        </span>

        <span class="reaction-label">
          {{
            item.action.label
          }}
        </span>

      </button>


      <button
        class="reaction-center"
        @click="emit('close')"
      >
        ×
      </button>

    </div>

  </div>
</template>


<style scoped>
.reaction-overlay {
  position: absolute;

  inset: 0;

  z-index: 10000;

  /*
    Cực kỳ quan trọng:
    menu phải click được,
    không được biến thành vùng kéo Electron.
  */
  -webkit-app-region: no-drag;
}


.reaction-wheel {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 360px;
  height: 360px;

  transform:
    translate(-50%, -50%);

  -webkit-app-region: no-drag;
}


.wheel-background {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 270px;
  height: 270px;

  transform:
    translate(-50%, -50%);

  border-radius: 50%;

  background:
    rgba(15, 15, 22, 0.72);

  border:
    1px solid
    rgba(255, 255, 255, 0.12);

  backdrop-filter:
    blur(12px);

  pointer-events: none;
}


.reaction-item {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 64px;
  height: 64px;

  margin-left: -32px;
  margin-top: -32px;

  border: none;

  border-radius: 50%;

  background:
    rgba(42, 42, 54, 0.95);

  color: white;

  cursor: pointer;

  display: flex;

  flex-direction: column;

  align-items: center;
  justify-content: center;

  transition:
    transform 120ms ease,
    background 120ms ease;

  -webkit-app-region: no-drag;
}


.reaction-item:hover {
  background:
    rgba(80, 80, 105, 0.98);
}


.reaction-icon {
  font-size: 22px;

  line-height: 22px;
}


.reaction-label {
  width: 56px;

  margin-top: 4px;

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;

  font-size: 9px;

  text-align: center;
}


.reaction-center {
  position: absolute;

  left: 50%;
  top: 50%;

  width: 66px;
  height: 66px;

  transform:
    translate(-50%, -50%);

  border: none;

  border-radius: 50%;

  background:
    rgba(24, 24, 32, 0.98);

  color: white;

  font-size: 30px;

  cursor: pointer;

  -webkit-app-region: no-drag;
}
</style>