<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref
} from 'vue'

import type {
  Live2DAction,
  Live2DActionMode
} from '../../live2d/types'


/*
  ============================================================
  PROPS
  ============================================================

  Quy tắc action cố định:

    *.exp3.json
      -> toggle
      -> click lần 1 = ON
      -> click lần 2 = OFF

    *.motion3.json
      -> oneshot
      -> click = chạy đúng 1 lần
*/


const props =
  withDefaults(
    defineProps<{
      actions:
        Live2DAction[]

      activeToggleActionIds?:
        string[]

      activeOneshotActionIds?:
        string[]
    }>(),
    {
      activeToggleActionIds:
        () => [],

      activeOneshotActionIds:
        () => []
    }
  )


const emit =
  defineEmits<{
    select:
      [action: Live2DAction]

    close:
      []
  }>()


/*
  ============================================================
  DOM
  ============================================================
*/


const overlayElement =
  ref<HTMLDivElement | null>(
    null
  )


/*
  ============================================================
  RINGS
  ============================================================
*/


const ITEMS_PER_RING =
  8


/*
  ============================================================
  ACTIVE STATE
  ============================================================
*/


const activeToggleIdSet =
  computed(
    () =>
      new Set(
        props.activeToggleActionIds
      )
  )


const activeOneshotIdSet =
  computed(
    () =>
      new Set(
        props.activeOneshotActionIds
      )
  )


/*
  ============================================================
  ACTION MODE
  ============================================================
*/


function actionMode(
  action: Live2DAction
): Live2DActionMode {
  return (
    action.type ===
      'expression'
      ? 'toggle'
      : 'oneshot'
  )
}


function isToggleAction(
  action: Live2DAction
): boolean {
  return (
    actionMode(
      action
    ) ===
    'toggle'
  )
}


function isToggleActive(
  action: Live2DAction
): boolean {
  return (
    isToggleAction(
      action
    ) &&
    activeToggleIdSet
      .value
      .has(
        action.id
      )
  )
}


function isOneshotActive(
  action: Live2DAction
): boolean {
  return (
    actionMode(
      action
    ) ===
      'oneshot' &&
    activeOneshotIdSet
      .value
      .has(
        action.id
      )
  )
}


/*
  ============================================================
  POSITION ACTIONS
  ============================================================
*/


const positionedActions =
  computed(
    () => {
      return props.actions.map(
        (
          action,
          index
        ) => {
          const ring =
            Math.floor(
              index /
              ITEMS_PER_RING
            )


          const ringStart =
            ring *
            ITEMS_PER_RING


          const itemsInThisRing =
            Math.min(
              ITEMS_PER_RING,

              props.actions.length -
                ringStart
            )


          const indexInRing =
            index -
            ringStart


          /*
            Bắt đầu từ phía trên.
          */

          const angle =
            -Math.PI /
              2 +
            (
              Math.PI *
              2 *
              indexInRing
            ) /
              itemsInThisRing


          /*
            Vòng 1: 105px
            Vòng 2: 170px
            Vòng 3: 235px
          */

          const radius =
            105 +
            ring *
              65


          const x =
            Math.cos(
              angle
            ) *
            radius


          const y =
            Math.sin(
              angle
            ) *
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
    }
  )


/*
  ============================================================
  WHEEL OFFSET
  ============================================================

  Reaction Wheel không còn nằm đè
  chính giữa model.

  Khi mở:

    - model nằm bên phải màn hình
      -> wheel chuyển sang bên trái

    - model nằm bên trái màn hình
      -> wheel chuyển sang bên phải

  Offset cũng tự tăng nếu model có
  nhiều vòng action.
*/


const wheelOffsetX =
  ref(
    0
  )


const wheelOffsetY =
  ref(
    -20
  )


const wheelStyle =
  computed(
    () => ({
      transform:
        `translate(calc(-50% + ${wheelOffsetX.value}px), calc(-50% + ${wheelOffsetY.value}px))`
    })
  )


function getWheelOuterRadius():
  number {
  const ringCount =
    Math.max(
      1,

      Math.ceil(
        props.actions.length /
        ITEMS_PER_RING
      )
    )


  const lastRingRadius =
    105 +
    (
      ringCount -
      1
    ) *
      65


  /*
    32px = nửa button.
    20px = khoảng an toàn.
  */

  return (
    lastRingRadius +
    32 +
    20
  )
}


function updateWheelOffset():
  void {
  const overlay =
    overlayElement.value


  if (!overlay) {
    return
  }


  const shell =
    overlay.closest<HTMLElement>(
      '.character-shell'
    )


  if (!shell) {
    /*
      Fallback:
      lệch phải nếu không tìm thấy shell.
    */

    wheelOffsetX.value =
      340


    wheelOffsetY.value =
      -20


    return
  }


  const shellRect =
    shell.getBoundingClientRect()


  const shellCenterX =
    shellRect.left +
    shellRect.width /
      2


  /*
    Chọn phía có nhiều khoảng trống hơn.
  */

  const spaceLeft =
    shellCenterX


  const spaceRight =
    window.innerWidth -
    shellCenterX


  const direction =
    spaceRight >=
      spaceLeft
      ? 1
      : -1


  const outerRadius =
    getWheelOuterRadius()


  /*
    MODEL_CLEARANCE:
    khoảng ước lượng từ tâm shell
    tới mép ngoài model.

    Cộng thêm outerRadius để cả wheel
    nằm ra khỏi model thay vì chỉ dịch
    tâm wheel một chút.
  */

  const MODEL_CLEARANCE =
    185


  const desiredOffset =
    (
      MODEL_CLEARANCE +
      outerRadius
    ) *
    direction


  /*
    Tính tâm wheel mong muốn trên màn hình.
  */

  const desiredGlobalCenterX =
    shellCenterX +
    desiredOffset


  /*
    Không cho wheel bị đẩy hoàn toàn
    ra ngoài màn hình.

    Vẫn chừa 12px ở hai bên.
  */

  const minGlobalCenterX =
    outerRadius +
    12


  const maxGlobalCenterX =
    window.innerWidth -
    outerRadius -
    12


  const clampedGlobalCenterX =
    Math.min(
      Math.max(
        desiredGlobalCenterX,
        minGlobalCenterX
      ),

      maxGlobalCenterX
    )


  wheelOffsetX.value =
    clampedGlobalCenterX -
    shellCenterX


  /*
    Hơi nâng wheel lên một chút
    để bố cục thoáng hơn.
  */

  wheelOffsetY.value =
    -20
}


/*
  ============================================================
  ICON
  ============================================================
*/


function iconFor(
  action: Live2DAction
): string {
  /*
    exp3 = toggle
  */

  if (
    action.type ===
    'expression'
  ) {
    return isToggleActive(
      action
    )
      ? '✓'
      : '☺'
  }


  /*
    motion3 = oneshot
  */

  return '✦'
}


/*
  ============================================================
  TITLE
  ============================================================
*/


function actionTitle(
  action: Live2DAction
): string {
  if (
    isToggleAction(
      action
    )
  ) {
    return isToggleActive(
      action
    )
      ? `${action.label} - ON - bấm lại để tắt`
      : `${action.label} - bấm để bật`
  }


  return isOneshotActive(
    action
  )
    ? `${action.label} - đang chạy`
    : `${action.label} - chạy một lần`
}


/*
  ============================================================
  CLICK
  ============================================================
*/


function selectAction(
  action: Live2DAction
): void {
  /*
    Không đóng wheel sau khi chọn.

    Nhờ vậy có thể bật liên tiếp:

      Wave L
      Wave R
      Tail Up
      Hat on
  */

  emit(
    'select',
    action
  )
}


/*
  ============================================================
  LIFECYCLE
  ============================================================
*/


onMounted(
  () => {
    updateWheelOffset()


    window.addEventListener(
      'resize',
      updateWheelOffset
    )
  }
)


onBeforeUnmount(
  () => {
    window.removeEventListener(
      'resize',
      updateWheelOffset
    )
  }
)
</script>


<template>
  <div
    ref="overlayElement"
    class="reaction-overlay"
    @pointerdown.self="
      emit(
        'close'
      )
    "
  >

    <div
      class="reaction-wheel"
      :style="wheelStyle"
    >

      <!--
        Không còn wheel-background.

        Vì vậy không còn vòng tròn đen
        lớn che model ở giữa.
      -->


      <button
        v-for="item in positionedActions"
        :key="item.action.id"
        class="reaction-item"
        :class="{
          'reaction-item--toggle':
            isToggleAction(
              item.action
            ),

          'reaction-item--toggle-active':
            isToggleActive(
              item.action
            ),

          'reaction-item--oneshot-active':
            isOneshotActive(
              item.action
            )
        }"
        :style="item.style"
        :title="
          actionTitle(
            item.action
          )
        "
        :aria-pressed="
          isToggleAction(
            item.action
          )
            ? isToggleActive(
                item.action
              )
            : undefined
        "
        type="button"
        @click.stop="
          selectAction(
            item.action
          )
        "
      >

        <span
          class="reaction-icon"
        >
          {{
            iconFor(
              item.action
            )
          }}
        </span>


        <span
          class="reaction-label"
        >
          {{
            item.action.label
          }}
        </span>


        <span
          v-if="
            isToggleActive(
              item.action
            )
          "
          class="reaction-badge"
        >
          ON
        </span>


        <span
          v-else-if="
            isOneshotActive(
              item.action
            )
          "
          class="reaction-badge reaction-badge--play"
        >
          PLAY
        </span>

      </button>


      <!--
        Nút X vẫn ở giữa wheel,
        nhưng nhỏ và trong suốt hơn.
      -->

      <button
        class="reaction-close"
        type="button"
        title="Đóng"
        @click.stop="
          emit(
            'close'
          )
        "
      >
        ×
      </button>

    </div>

  </div>
</template>


<style scoped>
/*
  ============================================================
  OVERLAY
  ============================================================
*/


.reaction-overlay {
  position:
    absolute;

  inset:
    0;

  z-index:
    10000;

  overflow:
    visible;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  WHEEL
  ============================================================

  Không có background tròn lớn nữa.

  Chỉ còn các action button
  nằm thành vòng.
*/


.reaction-wheel {
  position:
    absolute;

  left:
    50%;

  top:
    50%;

  width:
    360px;

  height:
    360px;

  overflow:
    visible;

  pointer-events:
    none;

  -webkit-app-region:
    no-drag;

  transition:
    transform 160ms ease;
}


/*
  ============================================================
  ACTION BUTTON
  ============================================================

  Opacity đã giảm so với bản cũ:

    cũ:
      alpha ~ 0.95

    mới:
      alpha ~ 0.62
*/


.reaction-item {
  position:
    absolute;

  left:
    50%;

  top:
    50%;

  width:
    64px;

  height:
    64px;

  margin-left:
    -32px;

  margin-top:
    -32px;

  padding:
    0;

  border:
    1px solid
    rgba(
      180,
      180,
      220,
      0.30
    );

  border-radius:
    50%;

  background:
    rgba(
      30,
      31,
      45,
      0.62
    );

  color:
    rgba(
      255,
      255,
      255,
      0.94
    );

  cursor:
    pointer;

  display:
    flex;

  flex-direction:
    column;

  align-items:
    center;

  justify-content:
    center;

  box-shadow:
    0 5px 14px
    rgba(
      0,
      0,
      0,
      0.16
    );

  backdrop-filter:
    blur(
      7px
    );

  transition:
    background 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease;

  pointer-events:
    auto;

  user-select:
    none;

  touch-action:
    manipulation;

  -webkit-app-region:
    no-drag;
}


.reaction-item:hover {
  background:
    rgba(
      65,
      67,
      92,
      0.78
    );

  border-color:
    rgba(
      210,
      205,
      255,
      0.48
    );

  box-shadow:
    0 7px 18px
    rgba(
      0,
      0,
      0,
      0.22
    );
}


.reaction-item:active {
  opacity:
    0.78;
}


/*
  ============================================================
  TOGGLE OFF
  ============================================================
*/


.reaction-item--toggle {
  border-color:
    rgba(
      145,
      128,
      255,
      0.38
    );
}


/*
  ============================================================
  TOGGLE ON
  ============================================================

  Vẫn sáng hơn action OFF,
  nhưng opacity thấp hơn bản cũ.
*/


.reaction-item--toggle-active {
  background:
    rgba(
      91,
      76,
      170,
      0.72
    );

  border-color:
    rgba(
      194,
      185,
      255,
      0.82
    );

  box-shadow:
    0 0 0 3px
    rgba(
      143,
      124,
      255,
      0.22
    ),
    0 7px 20px
    rgba(
      0,
      0,
      0,
      0.20
    );
}


.reaction-item--toggle-active:hover {
  background:
    rgba(
      105,
      89,
      192,
      0.82
    );
}


/*
  ============================================================
  ONESHOT PLAYING
  ============================================================
*/


.reaction-item--oneshot-active {
  border-color:
    rgba(
      124,
      193,
      255,
      0.72
    );

  background:
    rgba(
      45,
      87,
      122,
      0.66
    );

  box-shadow:
    0 0 0 2px
    rgba(
      99,
      179,
      255,
      0.18
    ),
    0 7px 18px
    rgba(
      0,
      0,
      0,
      0.18
    );
}


/*
  ============================================================
  ICON
  ============================================================
*/


.reaction-icon {
  font-size:
    22px;

  line-height:
    22px;

  pointer-events:
    none;
}


/*
  ============================================================
  LABEL
  ============================================================
*/


.reaction-label {
  width:
    56px;

  margin-top:
    4px;

  overflow:
    hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;

  font-size:
    9px;

  line-height:
    11px;

  text-align:
    center;

  pointer-events:
    none;
}


/*
  ============================================================
  BADGE
  ============================================================
*/


.reaction-badge {
  position:
    absolute;

  right:
    -5px;

  top:
    -5px;

  min-width:
    25px;

  height:
    17px;

  padding:
    0 5px;

  box-sizing:
    border-box;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.36
    );

  border-radius:
    999px;

  background:
    rgba(
      112,
      87,
      214,
      0.88
    );

  color:
    white;

  font-size:
    7px;

  font-weight:
    700;

  letter-spacing:
    0.3px;

  box-shadow:
    0 3px 8px
    rgba(
      0,
      0,
      0,
      0.20
    );

  pointer-events:
    none;
}


.reaction-badge--play {
  background:
    rgba(
      50,
      139,
      214,
      0.84
    );
}


/*
  ============================================================
  CLOSE
  ============================================================

  Không còn nút tròn lớn 66px.

  Nút đóng giờ nhỏ hơn,
  nhẹ hơn và trong suốt hơn.
*/


.reaction-close {
  position:
    absolute;

  left:
    50%;

  top:
    50%;

  width:
    42px;

  height:
    42px;

  padding:
    0;

  transform:
    translate(
      -50%,
      -50%
    );

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.12
    );

  border-radius:
    50%;

  background:
    rgba(
      18,
      20,
      30,
      0.42
    );

  color:
    rgba(
      255,
      255,
      255,
      0.90
    );

  font-size:
    23px;

  line-height:
    1;

  cursor:
    pointer;

  box-shadow:
    0 4px 12px
    rgba(
      0,
      0,
      0,
      0.14
    );

  backdrop-filter:
    blur(
      6px
    );

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;

  transition:
    background 120ms ease,
    opacity 120ms ease;
}


.reaction-close:hover {
  background:
    rgba(
      40,
      42,
      58,
      0.68
    );
}


.reaction-close:active {
  opacity:
    0.72;
}
</style>
