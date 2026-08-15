<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref
} from 'vue'

import reactFaceIcon
  from './assets/ui/react-face.svg'

import switchModelIcon
  from './assets/ui/switch-model.png'

import move4DirIcon
  from './assets/ui/move-4dir.png'

import Live2DStage
  from './features/live2d/components/Live2DStage.vue'

import ReactionWheel
  from './features/reactions/components/ReactionWheel.vue'

import ModelPicker
  from './features/models/components/ModelPicker.vue'

import {
  characters,
  DEFAULT_CHARACTER_ID
} from './characters'

import type {
  CharacterConfig
} from './characters/types'

import type {
  Live2DAction
} from './features/live2d/types'


/*
  ============================================================
  TYPES
  ============================================================
*/

type Live2DStageHandle = {
  runAction:
    (
      action: Live2DAction
    ) => Promise<void>

  resetReaction:
    () => Promise<void>
}


type ModelBounds = {
  x: number
  y: number
  width: number
  height: number
}


type MoveDragState = {
  pointerId: number

  startPointerX: number
  startPointerY: number

  startCharacterX: number
  startCharacterY: number

  element: HTMLElement
}


/*
  ============================================================
  CHARACTER SHELL
  ============================================================

  Shell vẫn giữ 500 x 700.

  Live2DStage.vue hiện chịu trách nhiệm:
  - render model
  - khung đỏ
  - 4 nút tròn resize model
*/

const CHARACTER_WIDTH =
  500


const CHARACTER_HEIGHT =
  700


/*
  Cho phép character đi phần lớn
  ra ngoài màn hình nhưng vẫn giữ
  lại một phần nhỏ.
*/

const MIN_VISIBLE_PIXELS =
  40


/*
  ============================================================
  CHARACTER POSITION
  ============================================================
*/

const characterX =
  ref(
    0
  )


const characterY =
  ref(
    0
  )


const characterShellRef =
  ref<HTMLDivElement | null>(
    null
  )


const characterShellStyle =
  computed(
    () => ({
      width:
        `${CHARACTER_WIDTH}px`,

      height:
        `${CHARACTER_HEIGHT}px`,

      transform:
        `translate3d(${characterX.value}px, ${characterY.value}px, 0)`
    })
  )


/*
  Live2DStage dùng offset này
  để biết character-shell hiện
  nằm ở đâu trong BrowserWindow.
*/

const stageOffset =
  computed(
    () => ({
      x:
        characterX.value,

      y:
        characterY.value
    })
  )


/*
  ============================================================
  HELPERS
  ============================================================
*/

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(
    Math.max(
      value,
      min
    ),
    max
  )
}


function clampCharacterPosition(
  x: number,
  y: number
): {
  x: number
  y: number
} {
  return {
    x:
      clamp(
        x,

        -CHARACTER_WIDTH +
          MIN_VISIBLE_PIXELS,

        window.innerWidth -
          MIN_VISIBLE_PIXELS
      ),

    y:
      clamp(
        y,

        -CHARACTER_HEIGHT +
          MIN_VISIBLE_PIXELS,

        window.innerHeight -
          MIN_VISIBLE_PIXELS
      )
  }
}


function initializeCharacterPosition():
  void {
  const position =
    clampCharacterPosition(
      window.innerWidth -
        CHARACTER_WIDTH -
        24,

      window.innerHeight -
        CHARACTER_HEIGHT -
        24
    )


  characterX.value =
    position.x


  characterY.value =
    position.y
}


function handleWindowResize():
  void {
  const position =
    clampCharacterPosition(
      characterX.value,
      characterY.value
    )


  characterX.value =
    position.x


  characterY.value =
    position.y


  syncFrameToolsPosition()
}


/*
  ============================================================
  MODEL LIBRARY
  ============================================================
*/

const builtInModels:
  CharacterConfig[] =
    Object.values(
      characters
    )


const importedModels =
  ref<CharacterConfig[]>(
    []
  )


const availableModels =
  computed<CharacterConfig[]>(
    () => [
      ...builtInModels,
      ...importedModels.value
    ]
  )


const deletableModelIds =
  computed<string[]>(
    () =>
      importedModels
        .value
        .map(
          model =>
            model.id
        )
  )


const deletingModelId =
  ref<string | null>(
    null
  )


/*
  ============================================================
  CURRENT MODEL
  ============================================================
*/

const currentCharacterId =
  ref<string>(
    DEFAULT_CHARACTER_ID
  )


const currentCharacter =
  computed<CharacterConfig>(
    () => {
      const found =
        availableModels
          .value
          .find(
            item =>
              item.id ===
              currentCharacterId.value
          )


      return (
        found ??
        characters[
          DEFAULT_CHARACTER_ID
        ]
      )
    }
  )


async function loadImportedModels():
  Promise<void> {
  try {
    importedModels.value =
      await window.api
        .listModels()
  }
  catch (error) {
    console.error(
      '[Models] Failed to load model library:',
      error
    )
  }
}


/*
  ============================================================
  LIVE2D
  ============================================================
*/

const live2dStage =
  ref<Live2DStageHandle | null>(
    null
  )


const actions =
  ref<Live2DAction[]>(
    []
  )


const modelBounds =
  ref<ModelBounds | null>(
    null
  )


function handleActionsReady(
  newActions: Live2DAction[]
): void {
  actions.value =
    newActions
}


function handleModelBounds(
  bounds: ModelBounds
): void {
  modelBounds.value =
    bounds


  /*
    Model scale thay đổi
    → khung đỏ thay đổi
    → toolbar phải theo khung.
  */

  window.requestAnimationFrame(
    syncFrameToolsPosition
  )
}


/*
  ============================================================
  MODEL HOVER
  ============================================================
*/

const isModelHovered =
  ref(
    false
  )


function handleModelHover(
  hovered: boolean
): void {
  isModelHovered.value =
    hovered


  if (
    hovered
  ) {
    window.requestAnimationFrame(
      syncFrameToolsPosition
    )
  }
}


/*
  ============================================================
  REACTION / MODEL PICKER STATE
  ============================================================
*/

const reactionWheelOpen =
  ref(
    false
  )


const modelPickerOpen =
  ref(
    false
  )


const modelImporting =
  ref(
    false
  )


/*
  ============================================================
  FRAME TOOLBAR
  ============================================================

  Toolbar KHÔNG tự tính từ modelBounds.

  Nó đọc trực tiếp DOM của:

    .model-resize-frame

  trong Live2DStage.vue.

  Nhờ vậy toolbar luôn nằm đúng
  góc trên-phải KHUNG ĐỎ thật.
*/


const isMoveDragging =
  ref(
    false
  )


const frameToolsReady =
  ref(
    false
  )


const frameToolsX =
  ref(
    0
  )


const frameToolsY =
  ref(
    0
  )


/*
  Toolbar cách mép phải frame
  một chút để không đè lên
  nút tròn resize góc trên-phải.
*/

const FRAME_TOOLS_RIGHT_INSET =
  10


const FRAME_TOOLS_TOP_OFFSET =
  28


const showFrameTools =
  computed(
    () =>
      (
        isModelHovered.value ||
        reactionWheelOpen.value ||
        modelPickerOpen.value ||
        isMoveDragging.value
      ) &&
      frameToolsReady.value
  )


const frameToolsStyle =
  computed(
    () => ({
      left:
        `${frameToolsX.value}px`,

      top:
        `${frameToolsY.value}px`
    })
  )


function syncFrameToolsPosition():
  void {
  const shell =
    characterShellRef.value


  if (!shell) {
    frameToolsReady.value =
      false

    return
  }


  /*
    model-resize-frame nằm trong
    Live2DStage.vue nhưng vẫn là
    DOM child thực của shell.
  */

  const frame =
    shell
      .querySelector<HTMLElement>(
        '.model-resize-frame'
      )


  if (!frame) {
    frameToolsReady.value =
      false

    return
  }


  const frameStyle =
    window.getComputedStyle(
      frame
    )


  /*
    Frame đang v-show=false.
  */

  if (
    frameStyle.display ===
      'none' ||
    frameStyle.visibility ===
      'hidden'
  ) {
    frameToolsReady.value =
      false

    return
  }


  const shellRect =
    shell.getBoundingClientRect()


  const frameRect =
    frame.getBoundingClientRect()


  if (
    frameRect.width <=
      0 ||
    frameRect.height <=
      0
  ) {
    frameToolsReady.value =
      false

    return
  }


  /*
    RIGHT EDGE của toolbar sẽ nằm
    sát góc trên-phải khung đỏ.

    CSS bên dưới dùng:

      transform: translateX(-100%)

    nên left này là tọa độ
    cạnh phải toolbar.
  */

  frameToolsX.value =
    frameRect.right -
    shellRect.left -
    FRAME_TOOLS_RIGHT_INSET


  frameToolsY.value =
    frameRect.top -
    shellRect.top +
    FRAME_TOOLS_TOP_OFFSET


  frameToolsReady.value =
    true
}


/*
  ============================================================
  REACTION
  ============================================================
*/

function openReactionWheel():
  void {
  if (
    actions.value.length ===
    0
  ) {
    return
  }


  modelPickerOpen.value =
    false


  reactionWheelOpen.value =
    true
}


function closeReactionWheel():
  void {
  reactionWheelOpen.value =
    false
}


async function selectAction(
  action: Live2DAction
): Promise<void> {
  await live2dStage
    .value
    ?.runAction(
      action
    )


  closeReactionWheel()
}


/*
  ============================================================
  MODEL PICKER
  ============================================================
*/

function openModelPicker():
  void {
  reactionWheelOpen.value =
    false


  modelPickerOpen.value =
    true
}


function closeModelPicker():
  void {
  modelPickerOpen.value =
    false
}


function selectModel(
  selectedModel: CharacterConfig
): void {
  if (
    selectedModel.id ===
    currentCharacterId.value
  ) {
    modelPickerOpen.value =
      false

    return
  }


  currentCharacterId.value =
    selectedModel.id


  actions.value =
    []


  modelPickerOpen.value =
    false


  frameToolsReady.value =
    false
}


/*
  ============================================================
  IMPORT MODEL
  ============================================================
*/

async function importModel():
  Promise<void> {
  if (
    modelImporting.value
  ) {
    return
  }


  modelImporting.value =
    true


  try {
    const imported =
      await window.api
        .importModel()


    if (!imported) {
      return
    }


    const exists =
      importedModels
        .value
        .some(
          item =>
            item.id ===
            imported.id
        )


    if (!exists) {
      importedModels
        .value
        .push(
          imported
        )
    }


    currentCharacterId.value =
      imported.id


    actions.value =
      []


    modelPickerOpen.value =
      false


    frameToolsReady.value =
      false
  }
  catch (error) {
    console.error(
      '[Models] Import failed:',
      error
    )
  }
  finally {
    modelImporting.value =
      false
  }
}


/*
  ============================================================
  DELETE MODEL
  ============================================================
*/

async function deleteModel(
  targetModel: CharacterConfig
): Promise<void> {
  const importedModel =
    importedModels
      .value
      .find(
        item =>
          item.id ===
          targetModel.id
      )


  if (!importedModel) {
    return
  }


  if (
    deletingModelId.value !==
    null
  ) {
    return
  }


  deletingModelId.value =
    targetModel.id


  try {
    const deleted =
      await window.api
        .deleteModel(
          targetModel.id
        )


    if (!deleted) {
      return
    }


    if (
      currentCharacterId.value ===
      targetModel.id
    ) {
      reactionWheelOpen.value =
        false


      actions.value =
        []


      currentCharacterId.value =
        DEFAULT_CHARACTER_ID
    }


    importedModels.value =
      importedModels
        .value
        .filter(
          item =>
            item.id !==
            targetModel.id
        )


    modelPickerOpen.value =
      true


    frameToolsReady.value =
      false
  }
  catch (error) {
    console.error(
      '[Models] Delete failed:',
      error
    )
  }
  finally {
    deletingModelId.value =
      null
  }
}


/*
  ============================================================
  MODEL PICKER POSITION
  ============================================================
*/

const modelPickerStyle =
  computed(
    () => {
      const bounds =
        modelBounds.value


      const panelWidth =
        290


      if (!bounds) {
        return {
          left:
            '10px',

          top:
            '100px'
        }
      }


      const gap =
        12


      let left =
        bounds.x +
        bounds.width +
        gap


      if (
        left +
        panelWidth >
        CHARACTER_WIDTH
      ) {
        left =
          bounds.x -
          panelWidth -
          gap
      }


      left =
        clamp(
          left,
          8,
          CHARACTER_WIDTH -
            panelWidth -
            8
        )


      let top =
        bounds.y +
        bounds.height *
        0.10


      top =
        clamp(
          top,
          8,
          CHARACTER_HEIGHT -
            450
        )


      return {
        left:
          `${left}px`,

        top:
          `${top}px`
      }
    }
  )


/*
  ============================================================
  MOVE CHARACTER
  ============================================================

  QUAN TRỌNG:

  Không còn model-drag-zone.

  Chỉ khi pointerdown trên
  nút mũi tên 4 hướng
  thì character mới di chuyển.
*/

let moveDrag:
  MoveDragState | null =
    null


let pendingMovePosition:
  {
    x: number
    y: number
  } | null =
    null


let moveAnimationFrame:
  number | null =
    null


function flushMovePosition():
  void {
  moveAnimationFrame =
    null


  if (
    !pendingMovePosition
  ) {
    return
  }


  const position =
    clampCharacterPosition(
      pendingMovePosition.x,
      pendingMovePosition.y
    )


  characterX.value =
    position.x


  characterY.value =
    position.y


  pendingMovePosition =
    null
}


function queueMovePosition(
  x: number,
  y: number
): void {
  pendingMovePosition = {
    x,
    y
  }


  if (
    moveAnimationFrame !==
    null
  ) {
    return
  }


  moveAnimationFrame =
    window.requestAnimationFrame(
      flushMovePosition
    )
}


function startMoveDrag(
  event: PointerEvent
): void {
  /*
    Chỉ chuột trái.
  */

  if (
    event.button !==
    0
  ) {
    return
  }


  /*
    Khi Model Picker hoặc
    Reaction Wheel đang mở
    thì không move.
  */

  if (
    reactionWheelOpen.value ||
    modelPickerOpen.value ||
    moveDrag
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const element =
    event.currentTarget as HTMLElement


  moveDrag = {
    pointerId:
      event.pointerId,

    startPointerX:
      event.clientX,

    startPointerY:
      event.clientY,

    startCharacterX:
      characterX.value,

    startCharacterY:
      characterY.value,

    element
  }


  isMoveDragging.value =
    true


  /*
    Khi đang drag,
    BrowserWindow phải nhận mouse.
  */

  applyIgnoreMouseState(
    false
  )


  try {
    element.setPointerCapture(
      event.pointerId
    )
  }
  catch {
    /*
      Không nghiêm trọng.
    */
  }
}


function moveCharacterFromButton(
  event: PointerEvent
): void {
  const drag =
    moveDrag


  if (!drag) {
    return
  }


  if (
    event.pointerId !==
    drag.pointerId
  ) {
    return
  }


  /*
    Mouse trái đã thả
    nhưng pointerup chưa tới.
  */

  if (
    (
      event.buttons &
      1
    ) ===
    0
  ) {
    stopMoveDrag(
      event
    )

    return
  }


  event.preventDefault()


  const deltaX =
    event.clientX -
    drag.startPointerX


  const deltaY =
    event.clientY -
    drag.startPointerY


  queueMovePosition(
    drag.startCharacterX +
      deltaX,

    drag.startCharacterY +
      deltaY
  )
}


function stopMoveDrag(
  event?:
    PointerEvent
): void {
  const drag =
    moveDrag


  if (!drag) {
    return
  }


  if (
    event &&
    event.pointerId !==
      drag.pointerId
  ) {
    return
  }


  if (
    event
  ) {
    event.preventDefault()
    event.stopPropagation()
  }


  /*
    Apply frame cuối.
  */

  if (
    moveAnimationFrame !==
    null
  ) {
    window.cancelAnimationFrame(
      moveAnimationFrame
    )


    moveAnimationFrame =
      null
  }


  flushMovePosition()


  moveDrag =
    null


  isMoveDragging.value =
    false


  try {
    if (
      drag.element
        .hasPointerCapture(
          drag.pointerId
        )
    ) {
      drag.element
        .releasePointerCapture(
          drag.pointerId
        )
    }
  }
  catch {
    /*
      Ignore.
    */
  }


  syncFrameToolsPosition()


  void syncMousePassthrough()
}


/*
  ============================================================
  MOUSE PASSTHROUGH
  ============================================================
*/

let mousePassthroughTimer:
  number | null =
    null


let mousePassthroughPending =
  false


let lastIgnoreMouseState:
  boolean | null =
    null


function applyIgnoreMouseState(
  ignore: boolean
): void {
  if (
    lastIgnoreMouseState ===
    ignore
  ) {
    return
  }


  lastIgnoreMouseState =
    ignore


  window.api
    .setIgnoreMouseEvents(
      ignore
    )
}


/*
  ============================================================
  HIT TEST
  ============================================================
*/

function pointInsideRect(
  x: number,
  y: number,
  rect: DOMRect
): boolean {
  return (
    x >=
      rect.left &&

    x <=
      rect.right &&

    y >=
      rect.top &&

    y <=
      rect.bottom
  )
}


/*
  modelBounds có thể nhỏ hơn
  vùng thực của resize handle.

  Thêm padding để mouse activation
  xảy ra trước khi cursor tới handle.
*/

const MODEL_INTERACTION_PADDING =
  40


function isCursorOverModelArea(
  x: number,
  y: number
): boolean {
  const bounds =
    modelBounds.value


  if (!bounds) {
    return false
  }


  const localX =
    x -
    characterX.value


  const localY =
    y -
    characterY.value


  return (
    localX >=
      bounds.x -
        MODEL_INTERACTION_PADDING &&

    localX <=
      bounds.x +
        bounds.width +
        MODEL_INTERACTION_PADDING &&

    localY >=
      bounds.y -
        MODEL_INTERACTION_PADDING &&

    localY <=
      bounds.y +
        bounds.height +
        MODEL_INTERACTION_PADDING
  )
}


function isCursorOverInteractiveDom(
  x: number,
  y: number
): boolean {
  const selectors = [

    '.model-resize-handle',
    /*
      Toolbar mới.
    */
    '.model-frame-tools',
    '.model-frame-tool-button',

    /*
      Popup UI.
    */
    '.model-picker-container',
    '.reaction-wheel-container',

    'button',
    'input',
    'select',
    'textarea',
    'a'
  ]


  const elements =
    document
      .querySelectorAll<HTMLElement>(
        selectors.join(',')
      )


  for (
    const element
    of elements
  ) {
    const style =
      window.getComputedStyle(
        element
      )


    if (
      style.display ===
        'none' ||
      style.visibility ===
        'hidden'
    ) {
      continue
    }


    const rect =
      element
        .getBoundingClientRect()


    if (
      rect.width <=
        0 ||
      rect.height <=
        0
    ) {
      continue
    }


    if (
      pointInsideRect(
        x,
        y,
        rect
      )
    ) {
      return true
    }
  }


  return false
}


/*
  ============================================================
  SYNC MOUSE PASSTHROUGH
  ============================================================
*/

async function syncMousePassthrough():
  Promise<void> {
  /*
    Toolbar cần bám theo
    model frame liên tục.
  */

  syncFrameToolsPosition()


  if (
    mousePassthroughPending
  ) {
    return
  }


  /*
    Đang giữ nút Move:
    luôn nhận mouse.
  */

  if (
    moveDrag
  ) {
    applyIgnoreMouseState(
      false
    )

    return
  }


  mousePassthroughPending =
    true


  try {
    const cursor =
      await window.api
        .getCursorPosition()


    const overModel =
      isCursorOverModelArea(
        cursor.x,
        cursor.y
      )


    const overInteractiveDom =
      isCursorOverInteractiveDom(
        cursor.x,
        cursor.y
      )


    applyIgnoreMouseState(
      !(
        overModel ||
        overInteractiveDom
      )
    )
  }
  catch (error) {
    console.error(
      '[MousePassthrough] Failed:',
      error
    )
  }
  finally {
    mousePassthroughPending =
      false
  }
}


/*
  ============================================================
  STARTUP
  ============================================================
*/

onMounted(
  async () => {
    initializeCharacterPosition()


    await loadImportedModels()


    /*
      Window.
    */

    window.addEventListener(
      'resize',
      handleWindowResize
    )


    /*
      MOVE BUTTON.

      Dùng window pointermove
      để vẫn kéo được dù cursor
      đã rời khỏi button.
    */

    window.addEventListener(
      'pointermove',
      moveCharacterFromButton
    )


    window.addEventListener(
      'pointerup',
      stopMoveDrag
    )


    window.addEventListener(
      'pointercancel',
      stopMoveDrag
    )


    /*
      Khoảng 30 FPS.

      Đồng thời:
      - sync toolbar với red frame
      - kiểm tra click-through
    */

    mousePassthroughTimer =
      window.setInterval(
        () => {
          void syncMousePassthrough()
        },

        33
      )


    await syncMousePassthrough()
  }
)


/*
  ============================================================
  DESTROY
  ============================================================
*/

onBeforeUnmount(
  () => {
    window.removeEventListener(
      'resize',
      handleWindowResize
    )


    window.removeEventListener(
      'pointermove',
      moveCharacterFromButton
    )


    window.removeEventListener(
      'pointerup',
      stopMoveDrag
    )


    window.removeEventListener(
      'pointercancel',
      stopMoveDrag
    )


    if (
      mousePassthroughTimer !==
      null
    ) {
      window.clearInterval(
        mousePassthroughTimer
      )


      mousePassthroughTimer =
        null
    }


    if (
      moveAnimationFrame !==
      null
    ) {
      window.cancelAnimationFrame(
        moveAnimationFrame
      )


      moveAnimationFrame =
        null
    }


    pendingMovePosition =
      null
  }
)
</script>


<template>
  <main class="desktop-stage">

    <div
      ref="characterShellRef"
      class="character-shell"
      :style="characterShellStyle"
    >

      <!--
        =======================================================
        LIVE2D
        =======================================================

        Live2DStage chịu trách nhiệm:
        - model
        - khung đỏ
        - 4 nút tròn resize
      -->

      <Live2DStage
        ref="live2dStage"
        :character="currentCharacter"
        :stage-offset="stageOffset"
        @hover-change="handleModelHover"
        @actions-ready="handleActionsReady"
        @model-bounds-change="handleModelBounds"
      />


      <!--
        =======================================================
        FRAME TOOLS
        =======================================================

        3 nút nằm ở góc trên-phải
        của khung đỏ:

        1. React
        2. Switch model
        3. Move
      -->

      <Transition name="frame-tools">

        <div
          v-show="showFrameTools"
          class="model-frame-tools"
          :style="frameToolsStyle"
        >

          <!-- =====================
               REACT
               ===================== -->

          <button
            class="
              model-frame-tool-button
              model-frame-tool-button--react
            "
            type="button"
            title="React"
            :disabled="actions.length === 0"
            @click="openReactionWheel"
          >
            <img
              :src="reactFaceIcon"
              class="model-frame-tool-icon"
              alt="React"
            />
          </button>


          <!-- =====================
               SWITCH MODEL
               ===================== -->

          <button
            class="
              model-frame-tool-button
              model-frame-tool-button--model
            "
            type="button"
            title="Đổi model"
            @click="openModelPicker"
          >
            <img
              :src="switchModelIcon"
              class="model-frame-tool-icon"
              alt="Đổi model"
            />
          </button>


          <!-- =====================
               MOVE
               ===================== -->

          <button
            class="
              model-frame-tool-button
              model-frame-tool-button--move
            "
            :class="{
              'model-frame-tool-button--active':
                isMoveDragging
            }"
            type="button"
            title="Giữ và kéo để di chuyển nhân vật"
            @pointerdown="startMoveDrag"
          >
            <img
              :src="move4DirIcon"
              class="model-frame-tool-icon"
              alt="Di chuyển"
            />
          </button>

        </div>

      </Transition>


      <!--
        =======================================================
        MODEL PICKER
        =======================================================
      -->

      <div
        v-if="modelPickerOpen"
        class="model-picker-container"
        :style="modelPickerStyle"
      >

        <ModelPicker
          :models="availableModels"
          :selected-id="currentCharacterId"
          :default-id="DEFAULT_CHARACTER_ID"
          :importing="modelImporting"
          :deletable-ids="deletableModelIds"
          :deleting-id="deletingModelId"
          @select="selectModel"
          @import="importModel"
          @delete="deleteModel"
          @close="closeModelPicker"
        />

      </div>


      <!--
        =======================================================
        REACTION WHEEL
        =======================================================
      -->

      <div
        v-if="reactionWheelOpen"
        class="reaction-wheel-container"
      >

        <ReactionWheel
          :actions="actions"
          @select="selectAction"
          @close="closeReactionWheel"
        />

      </div>

    </div>

  </main>
</template>


<style scoped>
/*
  ============================================================
  FULL SCREEN HOST
  ============================================================
*/

.desktop-stage {
  position:
    fixed;

  inset:
    0;

  width:
    100%;

  height:
    100%;

  overflow:
    hidden;

  background:
    transparent;

  pointer-events:
    none;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  CHARACTER SHELL
  ============================================================
*/

.character-shell {
  position:
    absolute;

  left:
    0;

  top:
    0;

  width:
    500px;

  height:
    700px;

  overflow:
    visible;

  background:
    transparent;

  pointer-events:
    none;

  user-select:
    none;

  will-change:
    transform;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  LIVE2D
  ============================================================
*/

:deep(.live2d-stage) {
  pointer-events:
    none;
}


/*
  4 nút tròn của khung đỏ
  trong Live2DStage.vue
  vẫn click được.
*/

:deep(.model-resize-handle) {
  z-index:
    23000 !important;

  pointer-events:
    auto !important;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  FRAME TOOLBAR
  ============================================================

  Toolbar dạng dọc giống UI
  trong ảnh mẫu bạn gửi.

       ○ React
       ○ Models
       ○ Move

  Nó nằm ngay phía trong
  góc trên-phải khung đỏ.
*/

.model-frame-tools {
  position:
    absolute;

  /*
    frameToolsX là cạnh phải
    của toolbar.
  */

  transform:
    translateX(
      -100%
    );

  display:
    flex;

  flex-direction:
    column;

  gap:
    6px;

  padding:
    4px;

  z-index:
    25000;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  FRAME TOOL BUTTON
  ============================================================
*/

.model-frame-tool-button {
  width:
    34px;

  height:
    34px;

  padding:
    0;

  border:
    1px solid
    rgba(
      80,
      80,
      90,
      0.14
    );

  border-radius:
    10px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  background:
    rgba(
      255,
      255,
      255,
      0.92
    );

  box-shadow:
    0 4px 12px
    rgba(
      0,
      0,
      0,
      0.16
    );

  cursor:
    pointer;

  pointer-events:
    auto;

  touch-action:
    none;

  user-select:
    none;

  -webkit-app-region:
    no-drag;

  transition:
    transform 120ms ease,
    background 120ms ease,
    box-shadow 120ms ease,
    opacity 120ms ease;
}


.model-frame-tool-button:hover {
  transform:
    scale(
      1.08
    );

  background:
    rgba(
      255,
      255,
      255,
      1
    );

  box-shadow:
    0 6px 16px
    rgba(
      0,
      0,
      0,
      0.22
    );
}


.model-frame-tool-button:active {
  transform:
    scale(
      0.94
    );
}


/*
  React không có action
  thì disable.
*/

.model-frame-tool-button:disabled {
  opacity:
    0.38;

  cursor:
    default;

  transform:
    none;
}


/*
  ============================================================
  MOVE ACTIVE
  ============================================================

  Khi đang giữ nút Move,
  highlight để user biết
  hiện đang ở chế độ kéo.
*/

.model-frame-tool-button--move {
  cursor:
    move;
}


.model-frame-tool-button--active {
  background:
    rgba(
      228,
      237,
      255,
      1
    );

  box-shadow:
    0 0 0 2px
    rgba(
      85,
      125,
      255,
      0.42
    ),
    0 5px 16px
    rgba(
      0,
      0,
      0,
      0.22
    );

  transform:
    scale(
      1.06
    );
}


/*
  ============================================================
  ICON
  ============================================================
*/

.model-frame-tool-icon {
  width:
    21px;

  height:
    21px;

  display:
    block;

  object-fit:
    contain;

  pointer-events:
    none;

  user-select:
    none;
}


/*
  Icon Move có thể hơi nhỏ
  tùy file PNG bạn đang dùng.
*/

.model-frame-tool-button--move
.model-frame-tool-icon {
  width:
    20px;

  height:
    20px;
}


/*
  ============================================================
  MODEL PICKER
  ============================================================
*/

.model-picker-container {
  position:
    absolute;

  z-index:
    26000;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  REACTION WHEEL
  ============================================================
*/

.reaction-wheel-container {
  position:
    absolute;

  inset:
    0;

  z-index:
    26000;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  TOOLBAR TRANSITION
  ============================================================
*/

.frame-tools-enter-active,
.frame-tools-leave-active {
  transition:
    opacity 120ms ease;
}


.frame-tools-enter-from,
.frame-tools-leave-to {
  opacity:
    0;
}
</style>