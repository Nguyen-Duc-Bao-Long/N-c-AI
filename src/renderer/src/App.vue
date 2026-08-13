<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref
} from 'vue'

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


type CharacterDragState = {
  pointerId: number

  startPointerX: number
  startPointerY: number

  startCharacterX: number
  startCharacterY: number

  element: HTMLElement
}


type CharacterResizeCorner =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'


type CharacterResizeState = {
  pointerId: number

  corner:
    CharacterResizeCorner

  fixedX: number
  fixedY: number

  startDistance: number

  startWidth: number
  startHeight: number

  element: HTMLElement
}


/*
  ============================================================
  CHARACTER SIZE
  ============================================================

  Đây là viewport chứa Live2D.

  BrowserWindow thật phủ toàn màn hình
  và KHÔNG di chuyển.

  Chỉ character-shell này di chuyển
  và resize.
*/

const DEFAULT_CHARACTER_WIDTH =
  500


const DEFAULT_CHARACTER_HEIGHT =
  700


/*
  Giữ đúng tỉ lệ 500 : 700.

  Model sẽ không bị kéo méo.
*/
const CHARACTER_ASPECT_RATIO =
  DEFAULT_CHARACTER_WIDTH /
  DEFAULT_CHARACTER_HEIGHT


/*
  Giới hạn resize.

  Muốn to hơn nữa sau này:
  chỉ cần tăng MAX_CHARACTER_WIDTH.
*/
const MIN_CHARACTER_WIDTH =
  260


const MAX_CHARACTER_WIDTH =
  1200


const characterWidth =
  ref(
    DEFAULT_CHARACTER_WIDTH
  )


const characterHeight =
  ref(
    DEFAULT_CHARACTER_HEIGHT
  )


/*
  Luôn giữ ít nhất 40px
  character-shell trên màn hình.

  Có thể giảm xuống 10 hoặc 1
  nếu muốn kéo gần mất hẳn.
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


const characterShellStyle =
  computed(
    () => ({
      width:
        `${characterWidth.value}px`,

      height:
        `${characterHeight.value}px`,

      transform:
        `translate3d(${characterX.value}px, ${characterY.value}px, 0)`
    })
  )


/*
  Live2DStage dùng offset này
  để convert cursor full-screen
  sang cursor local.
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


function clampCharacterPositionForSize(
  x: number,
  y: number,
  width: number,
  height: number
): {
  x: number
  y: number
} {
  const minX =
    -width +
    MIN_VISIBLE_PIXELS


  const maxX =
    window.innerWidth -
    MIN_VISIBLE_PIXELS


  const minY =
    -height +
    MIN_VISIBLE_PIXELS


  const maxY =
    window.innerHeight -
    MIN_VISIBLE_PIXELS


  return {
    x:
      clamp(
        x,
        minX,
        maxX
      ),

    y:
      clamp(
        y,
        minY,
        maxY
      )
  }
}


function clampCharacterPosition(
  x: number,
  y: number
): {
  x: number
  y: number
} {
  return clampCharacterPositionForSize(
    x,
    y,
    characterWidth.value,
    characterHeight.value
  )
}


/*
  Mặc định:
  gần góc dưới-phải màn hình.
*/

function initializeCharacterPosition():
  void {
  const position =
    clampCharacterPosition(
      window.innerWidth -
        characterWidth.value -
        24,

      window.innerHeight -
        characterHeight.value -
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
  CURRENT CHARACTER
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
    const models =
      await window.api
        .listModels()


    importedModels.value =
      models


    console.log(
      '[Models] Imported models:',
      models
    )
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


  console.log(
    '[React] Available actions:',
    newActions
  )
}


function handleModelBounds(
  bounds: ModelBounds
): void {
  modelBounds.value =
    bounds
}


/*
  ============================================================
  CONTROL POSITION
  ============================================================
*/

const reactionControlStyle =
  computed(
    () => {
      const bounds =
        modelBounds.value


      if (!bounds) {
        return {
          left:
            '325px',

          top:
            '266px'
        }
      }


      const gap =
        8


      const controlWidth =
        105


      let left =
        bounds.x +
        bounds.width +
        gap


      let top =
        bounds.y +
        bounds.height *
        0.30


      /*
        Không đủ chỗ bên phải
        → đưa controls sang trái.
      */

      if (
        left +
          controlWidth >
        characterWidth.value
      ) {
        left =
          bounds.x -
          controlWidth -
          gap
      }


      const maxLeft =
        Math.max(
          8,
          characterWidth.value -
            controlWidth
        )


      const maxTop =
        Math.max(
          8,
          characterHeight.value -
            150
        )


      left =
        clamp(
          left,
          8,
          maxLeft
        )


      top =
        clamp(
          top,
          8,
          maxTop
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
        characterWidth.value
      ) {
        left =
          bounds.x -
          panelWidth -
          gap
      }


      const maxLeft =
        Math.max(
          8,
          characterWidth.value -
            panelWidth -
            8
        )


      left =
        clamp(
          left,
          8,
          maxLeft
        )


      let top =
        bounds.y +
        bounds.height *
        0.10


      const maxTop =
        Math.max(
          8,
          characterHeight.value -
            450
        )


      top =
        clamp(
          top,
          8,
          maxTop
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
  UI STATE
  ============================================================
*/

const controlsVisible =
  ref(
    false
  )


const isModelHovered =
  ref(
    false
  )


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


const isCharacterResizing =
  ref(
    false
  )


/*
  Frame đỏ hiện giống controls.

  Khi Reaction/Models mở:
  ẩn frame để UI sạch hơn.
*/

const characterFrameVisible =
  computed(
    () =>
      (
        controlsVisible.value &&
        !reactionWheelOpen.value &&
        !modelPickerOpen.value
      ) ||
      isCharacterResizing.value
  )


let hideControlsTimer:
  number | null =
    null


function clearHideTimer():
  void {
  if (
    hideControlsTimer ===
    null
  ) {
    return
  }


  window.clearTimeout(
    hideControlsTimer
  )


  hideControlsTimer =
    null
}


function handleModelHover(
  hovered: boolean
): void {
  isModelHovered.value =
    hovered


  clearHideTimer()


  if (
    hovered
  ) {
    controlsVisible.value =
      true

    return
  }


  /*
    Trong lúc resize không ẩn frame.
  */

  if (
    isCharacterResizing.value ||
    reactionWheelOpen.value ||
    modelPickerOpen.value
  ) {
    return
  }


  hideControlsTimer =
    window.setTimeout(
      () => {
        if (
          isModelHovered.value ||
          isCharacterResizing.value ||
          reactionWheelOpen.value ||
          modelPickerOpen.value
        ) {
          return
        }


        controlsVisible.value =
          false
      },

      500
    )
}


function keepControlsVisible():
  void {
  clearHideTimer()


  controlsVisible.value =
    true
}


function scheduleControlsHide():
  void {
  if (
    isModelHovered.value ||
    isCharacterResizing.value
  ) {
    controlsVisible.value =
      true

    return
  }


  if (
    reactionWheelOpen.value ||
    modelPickerOpen.value
  ) {
    return
  }


  clearHideTimer()


  hideControlsTimer =
    window.setTimeout(
      () => {
        if (
          isModelHovered.value ||
          isCharacterResizing.value ||
          reactionWheelOpen.value ||
          modelPickerOpen.value
        ) {
          return
        }


        controlsVisible.value =
          false
      },

      300
    )
}


/*
  ============================================================
  REACTION
  ============================================================
*/

function openReactionWheel():
  void {
  clearHideTimer()


  modelPickerOpen.value =
    false


  controlsVisible.value =
    true


  reactionWheelOpen.value =
    true
}


function closeReactionWheel():
  void {
  reactionWheelOpen.value =
    false


  clearHideTimer()


  if (
    isModelHovered.value
  ) {
    controlsVisible.value =
      true

    return
  }


  scheduleControlsHide()
}


async function selectAction(
  action: Live2DAction
): Promise<void> {
  keepControlsVisible()


  await live2dStage
    .value
    ?.runAction(
      action
    )


  closeReactionWheel()
}


async function resetReaction():
  Promise<void> {
  clearHideTimer()


  await live2dStage
    .value
    ?.resetReaction()


  reactionWheelOpen.value =
    false


  if (
    isModelHovered.value
  ) {
    controlsVisible.value =
      true
  }
  else {
    scheduleControlsHide()
  }
}


/*
  ============================================================
  MODEL PICKER
  ============================================================
*/

function openModelPicker():
  void {
  clearHideTimer()


  reactionWheelOpen.value =
    false


  controlsVisible.value =
    true


  modelPickerOpen.value =
    true
}


function closeModelPicker():
  void {
  modelPickerOpen.value =
    false


  clearHideTimer()


  if (
    isModelHovered.value
  ) {
    controlsVisible.value =
      true

    return
  }


  scheduleControlsHide()
}


function selectModel(
  selectedModel:
    CharacterConfig
): void {
  if (
    selectedModel.id ===
    currentCharacterId.value
  ) {
    modelPickerOpen.value =
      false

    return
  }


  console.log(
    '[Models] Select:',
    selectedModel
  )


  currentCharacterId.value =
    selectedModel.id


  actions.value =
    []


  modelPickerOpen.value =
    false


  controlsVisible.value =
    true
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


    console.log(
      '[Models] Model imported:',
      imported
    )


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


    controlsVisible.value =
      true
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
  DELETE IMPORTED MODEL
  ============================================================
*/

async function deleteModel(
  targetModel:
    CharacterConfig
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
    console.warn(
      '[Models] Cannot delete built-in model:',
      targetModel.id
    )

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
      console.log(
        '[Models] Delete cancelled:',
        targetModel.name
      )

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


    controlsVisible.value =
      true


    console.log(
      '[Models] Deleted from UI:',
      targetModel.name
    )
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
  CHARACTER DRAG ZONE
  ============================================================
*/

const MODEL_DRAG_ZONE_WIDTH_RATIO =
  0.32


const MODEL_DRAG_ZONE_HEIGHT_RATIO =
  0.30


const MODEL_DRAG_ZONE_TOP_RATIO =
  0.28


const MODEL_DRAG_ZONE_MIN_WIDTH =
  55


const MODEL_DRAG_ZONE_MAX_WIDTH =
  115


const MODEL_DRAG_ZONE_MIN_HEIGHT =
  75


const MODEL_DRAG_ZONE_MAX_HEIGHT =
  155


const modelDragZoneStyle =
  computed(
    () => {
      const bounds =
        modelBounds.value


      if (
        !bounds ||
        bounds.width <= 0 ||
        bounds.height <= 0
      ) {
        return {
          display:
            'none'
        }
      }


      const width =
        Math.min(
          bounds.width,

          clamp(
            bounds.width *
              MODEL_DRAG_ZONE_WIDTH_RATIO,

            MODEL_DRAG_ZONE_MIN_WIDTH,

            MODEL_DRAG_ZONE_MAX_WIDTH
          )
        )


      const height =
        Math.min(
          bounds.height,

          clamp(
            bounds.height *
              MODEL_DRAG_ZONE_HEIGHT_RATIO,

            MODEL_DRAG_ZONE_MIN_HEIGHT,

            MODEL_DRAG_ZONE_MAX_HEIGHT
          )
        )


      const left =
        bounds.x +
        (
          bounds.width -
          width
        ) /
        2


      const desiredTop =
        bounds.y +
        bounds.height *
          MODEL_DRAG_ZONE_TOP_RATIO


      const maxTop =
        bounds.y +
        bounds.height -
        height


      const top =
        Math.max(
          bounds.y,

          Math.min(
            desiredTop,
            maxTop
          )
        )


      return {
        left:
          `${left}px`,

        top:
          `${top}px`,

        width:
          `${width}px`,

        height:
          `${height}px`
      }
    }
  )


/*
  ============================================================
  DRAG STATE
  ============================================================
*/

let characterDrag:
  CharacterDragState | null =
    null


let characterResize:
  CharacterResizeState | null =
    null


let pendingCharacterPosition:
  {
    x: number
    y: number
  } | null =
    null


let characterDragFrame:
  number | null =
    null


function flushCharacterDrag():
  void {
  characterDragFrame =
    null


  if (
    !pendingCharacterPosition
  ) {
    return
  }


  const position =
    clampCharacterPosition(
      pendingCharacterPosition.x,
      pendingCharacterPosition.y
    )


  characterX.value =
    position.x


  characterY.value =
    position.y


  pendingCharacterPosition =
    null
}


function queueCharacterPosition(
  x: number,
  y: number
): void {
  pendingCharacterPosition = {
    x,
    y
  }


  if (
    characterDragFrame !==
    null
  ) {
    return
  }


  characterDragFrame =
    window.requestAnimationFrame(
      flushCharacterDrag
    )
}


/*
  ============================================================
  CHARACTER DRAG START
  ============================================================
*/

function startCharacterDrag(
  event: PointerEvent
): void {
  if (
    event.button !==
    0
  ) {
    return
  }


  if (
    reactionWheelOpen.value ||
    modelPickerOpen.value
  ) {
    return
  }


  /*
    Không cho move và resize
    chạy cùng lúc.
  */

  if (
    characterDrag ||
    characterResize
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const element =
    event.currentTarget as HTMLElement


  characterDrag = {
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
      Ignore.
    */
  }
}


/*
  ============================================================
  CHARACTER DRAG MOVE
  ============================================================
*/

function moveCharacterDrag(
  event: PointerEvent
): void {
  const drag =
    characterDrag


  if (!drag) {
    return
  }


  if (
    event.pointerId !==
    drag.pointerId
  ) {
    return
  }


  if (
    (
      event.buttons &
      1
    ) ===
    0
  ) {
    stopCharacterDrag(
      event
    )

    return
  }


  event.preventDefault()
  event.stopPropagation()


  const deltaX =
    event.clientX -
    drag.startPointerX


  const deltaY =
    event.clientY -
    drag.startPointerY


  queueCharacterPosition(
    drag.startCharacterX +
      deltaX,

    drag.startCharacterY +
      deltaY
  )
}


/*
  ============================================================
  CHARACTER DRAG END
  ============================================================
*/

function stopCharacterDrag(
  event?:
    PointerEvent
): void {
  const drag =
    characterDrag


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


  if (
    characterDragFrame !==
    null
  ) {
    window.cancelAnimationFrame(
      characterDragFrame
    )


    characterDragFrame =
      null
  }


  flushCharacterDrag()


  characterDrag =
    null


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


  void syncMousePassthrough()
}


/*
  ============================================================
  RENDERER RESIZE EVENT
  ============================================================

  character-shell thay đổi size,
  báo cho Pixi resize plugin và
  Live2DStage biết viewport đã đổi.

  BrowserWindow vẫn KHÔNG resize.
*/

let rendererResizeEventFrame:
  number | null =
    null


function scheduleRendererResizeEvent():
  void {
  if (
    rendererResizeEventFrame !==
    null
  ) {
    return
  }


  rendererResizeEventFrame =
    window.requestAnimationFrame(
      () => {
        rendererResizeEventFrame =
          null


        window.dispatchEvent(
          new Event(
            'resize'
          )
        )
      }
    )
}


/*
  ============================================================
  CHARACTER FRAME RESIZE START
  ============================================================
*/

function startCharacterResize(
  event: PointerEvent,
  corner: CharacterResizeCorner
): void {
  if (
    event.button !==
    0
  ) {
    return
  }


  if (
    characterResize ||
    characterDrag
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  clearHideTimer()


  controlsVisible.value =
    true


  const startX =
    characterX.value


  const startY =
    characterY.value


  const startWidth =
    characterWidth.value


  const startHeight =
    characterHeight.value


  /*
    fixedX/Y = góc đối diện
    không di chuyển.
  */

  let fixedX =
    startX


  let fixedY =
    startY


  switch (
    corner
  ) {
    /*
      Bottom-right:
      giữ top-left.
    */

    case 'se':
      fixedX =
        startX

      fixedY =
        startY

      break


    /*
      Bottom-left:
      giữ top-right.
    */

    case 'sw':
      fixedX =
        startX +
        startWidth

      fixedY =
        startY

      break


    /*
      Top-right:
      giữ bottom-left.
    */

    case 'ne':
      fixedX =
        startX

      fixedY =
        startY +
        startHeight

      break


    /*
      Top-left:
      giữ bottom-right.
    */

    case 'nw':
      fixedX =
        startX +
        startWidth

      fixedY =
        startY +
        startHeight

      break
  }


  const startDistance =
    Math.hypot(
      event.clientX -
        fixedX,

      event.clientY -
        fixedY
    )


  if (
    !Number.isFinite(
      startDistance
    ) ||
    startDistance <=
      1
  ) {
    return
  }


  const element =
    event.currentTarget as HTMLElement


  characterResize = {
    pointerId:
      event.pointerId,

    corner,

    fixedX,

    fixedY,

    startDistance,

    startWidth,

    startHeight,

    element
  }


  isCharacterResizing.value =
    true


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
      Ignore.
    */
  }
}


/*
  ============================================================
  CHARACTER FRAME RESIZE MOVE
  ============================================================
*/

function moveCharacterResize(
  event: PointerEvent
): void {
  const resize =
    characterResize


  if (!resize) {
    return
  }


  if (
    event.pointerId !==
    resize.pointerId
  ) {
    return
  }


  if (
    (
      event.buttons &
      1
    ) ===
    0
  ) {
    stopCharacterResize(
      event
    )

    return
  }


  event.preventDefault()
  event.stopPropagation()


  const currentDistance =
    Math.hypot(
      event.clientX -
        resize.fixedX,

      event.clientY -
        resize.fixedY
    )


  if (
    !Number.isFinite(
      currentDistance
    )
  ) {
    return
  }


  const requestedRatio =
    currentDistance /
    resize.startDistance


  const minRatio =
    MIN_CHARACTER_WIDTH /
    resize.startWidth


  const maxRatio =
    MAX_CHARACTER_WIDTH /
    resize.startWidth


  const ratio =
    clamp(
      requestedRatio,
      minRatio,
      maxRatio
    )


  const nextWidth =
    resize.startWidth *
    ratio


  /*
    Giữ chính xác aspect ratio.
  */

  const nextHeight =
    nextWidth /
    CHARACTER_ASPECT_RATIO


  let nextX =
    characterX.value


  let nextY =
    characterY.value


  /*
    Tính x/y theo góc đang kéo.
  */

  switch (
    resize.corner
  ) {
    case 'se':
      nextX =
        resize.fixedX

      nextY =
        resize.fixedY

      break


    case 'sw':
      nextX =
        resize.fixedX -
        nextWidth

      nextY =
        resize.fixedY

      break


    case 'ne':
      nextX =
        resize.fixedX

      nextY =
        resize.fixedY -
        nextHeight

      break


    case 'nw':
      nextX =
        resize.fixedX -
        nextWidth

      nextY =
        resize.fixedY -
        nextHeight

      break
  }


  const position =
    clampCharacterPositionForSize(
      nextX,
      nextY,
      nextWidth,
      nextHeight
    )


  characterWidth.value =
    nextWidth


  characterHeight.value =
    nextHeight


  characterX.value =
    position.x


  characterY.value =
    position.y


  /*
    Báo cho Pixi:
    viewport character đã đổi size.
  */

  scheduleRendererResizeEvent()
}


/*
  ============================================================
  CHARACTER FRAME RESIZE END
  ============================================================
*/

function stopCharacterResize(
  event?:
    PointerEvent
): void {
  const resize =
    characterResize


  if (!resize) {
    return
  }


  if (
    event &&
    event.pointerId !==
      resize.pointerId
  ) {
    return
  }


  if (
    event
  ) {
    event.preventDefault()
    event.stopPropagation()
  }


  try {
    if (
      resize.element
        .hasPointerCapture(
          resize.pointerId
        )
    ) {
      resize.element
        .releasePointerCapture(
          resize.pointerId
        )
    }
  }
  catch {
    /*
      Ignore.
    */
  }


  characterResize =
    null


  isCharacterResizing.value =
    false


  /*
    Đảm bảo Pixi nhận size cuối.
  */

  scheduleRendererResizeEvent()


  /*
    Giữ frame hiện nếu chuột
    vẫn đang ở vùng character.
  */

  keepControlsVisible()


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


let cursorInsideActiveFrame =
  false


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


function isCursorOverCharacterShell(
  x: number,
  y: number
): boolean {
  return (
    x >=
      characterX.value &&

    x <=
      characterX.value +
      characterWidth.value &&

    y >=
      characterY.value &&

    y <=
      characterY.value +
      characterHeight.value
  )
}


function isCursorOverInteractiveDom(
  x: number,
  y: number
): boolean {
  const selectors = [
    '.model-drag-zone',
    '.character-resize-handle',
    '.character-controls',
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
      rect.width <= 0 ||
      rect.height <= 0
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


  /*
    Một chút padding quanh model
    giúp hover dễ hơn.
  */

  const padding =
    24


  return (
    localX >=
      bounds.x -
        padding &&

    localX <=
      bounds.x +
        bounds.width +
        padding &&

    localY >=
      bounds.y -
        padding &&

    localY <=
      bounds.y +
        bounds.height +
        padding
  )
}


/*
  ============================================================
  SYNC MOUSE PASSTHROUGH
  ============================================================
*/

async function syncMousePassthrough():
  Promise<void> {
  if (
    mousePassthroughPending
  ) {
    return
  }


  /*
    Khi move/resize:
    Electron phải luôn nhận mouse.
  */

  if (
    characterDrag ||
    characterResize
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


    const overCharacterShell =
      isCursorOverCharacterShell(
        cursor.x,
        cursor.y
      )


    /*
      Frame chỉ xuất hiện khi hover model.

      Nhưng một khi đã xuất hiện,
      user có thể di chuột từ model
      ra góc khung mà frame không biến mất.
    */

    const insideActiveFrame =
      characterFrameVisible.value &&
      (
        overCharacterShell ||
        overInteractiveDom
      )


    if (
      insideActiveFrame &&
      !cursorInsideActiveFrame
    ) {
      keepControlsVisible()
    }


    if (
      !insideActiveFrame &&
      cursorInsideActiveFrame
    ) {
      scheduleControlsHide()
    }


    cursorInsideActiveFrame =
      insideActiveFrame


    /*
      Khi frame đang hiện:
      toàn bộ character-shell
      là vùng mouse-active.

      Nhờ vậy user dễ đi tới
      4 góc resize.
    */

    const interactive =
      overModel ||
      overInteractiveDom ||
      (
        characterFrameVisible.value &&
        overCharacterShell
      )


    applyIgnoreMouseState(
      !interactive
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


    window.addEventListener(
      'resize',
      handleWindowResize
    )


    /*
      MOVE fallback.
    */

    window.addEventListener(
      'pointerup',
      stopCharacterDrag
    )


    window.addEventListener(
      'pointercancel',
      stopCharacterDrag
    )


    /*
      RESIZE fallback.
    */

    window.addEventListener(
      'pointerup',
      stopCharacterResize
    )


    window.addEventListener(
      'pointercancel',
      stopCharacterResize
    )


    /*
      Mouse passthrough polling.

      Không di chuyển BrowserWindow.
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
    clearHideTimer()


    window.removeEventListener(
      'resize',
      handleWindowResize
    )


    window.removeEventListener(
      'pointerup',
      stopCharacterDrag
    )


    window.removeEventListener(
      'pointercancel',
      stopCharacterDrag
    )


    window.removeEventListener(
      'pointerup',
      stopCharacterResize
    )


    window.removeEventListener(
      'pointercancel',
      stopCharacterResize
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
      characterDragFrame !==
      null
    ) {
      window.cancelAnimationFrame(
        characterDragFrame
      )


      characterDragFrame =
        null
    }


    if (
      rendererResizeEventFrame !==
      null
    ) {
      window.cancelAnimationFrame(
        rendererResizeEventFrame
      )


      rendererResizeEventFrame =
        null
    }


    pendingCharacterPosition =
      null
  }
)
</script>


<template>
  <main class="desktop-stage">

    <div
      class="character-shell"
      :style="characterShellStyle"
    >

      <!-- =====================
           LIVE2D
           ===================== -->

      <Live2DStage
        ref="live2dStage"
        :character="currentCharacter"
        :stage-offset="stageOffset"
        @hover-change="handleModelHover"
        @actions-ready="handleActionsReady"
        @model-bounds-change="handleModelBounds"
      />


      <!-- =====================
           CHARACTER FRAME
           ===================== -->

      <div
        v-show="characterFrameVisible"
        class="character-frame"
      />


      <!-- =====================
           RESIZE: TOP LEFT
           ===================== -->

      <button
        v-show="characterFrameVisible"
        class="
          character-resize-handle
          character-resize-handle--nw
        "
        type="button"
        title="Kéo để thay đổi kích thước"
        @mouseenter="keepControlsVisible"
        @mouseleave="scheduleControlsHide"
        @pointerdown="
          startCharacterResize(
            $event,
            'nw'
          )
        "
        @pointermove="moveCharacterResize"
        @pointerup="stopCharacterResize"
        @pointercancel="stopCharacterResize"
      ></button>


      <!-- =====================
           RESIZE: TOP RIGHT
           ===================== -->

      <button
        v-show="characterFrameVisible"
        class="
          character-resize-handle
          character-resize-handle--ne
        "
        type="button"
        title="Kéo để thay đổi kích thước"
        @mouseenter="keepControlsVisible"
        @mouseleave="scheduleControlsHide"
        @pointerdown="
          startCharacterResize(
            $event,
            'ne'
          )
        "
        @pointermove="moveCharacterResize"
        @pointerup="stopCharacterResize"
        @pointercancel="stopCharacterResize"
      ></button>


      <!-- =====================
           RESIZE: BOTTOM LEFT
           ===================== -->

      <button
        v-show="characterFrameVisible"
        class="
          character-resize-handle
          character-resize-handle--sw
        "
        type="button"
        title="Kéo để thay đổi kích thước"
        @mouseenter="keepControlsVisible"
        @mouseleave="scheduleControlsHide"
        @pointerdown="
          startCharacterResize(
            $event,
            'sw'
          )
        "
        @pointermove="moveCharacterResize"
        @pointerup="stopCharacterResize"
        @pointercancel="stopCharacterResize"
      ></button>


      <!-- =====================
           RESIZE: BOTTOM RIGHT
           ===================== -->

      <button
        v-show="characterFrameVisible"
        class="
          character-resize-handle
          character-resize-handle--se
        "
        type="button"
        title="Kéo để thay đổi kích thước"
        @mouseenter="keepControlsVisible"
        @mouseleave="scheduleControlsHide"
        @pointerdown="
          startCharacterResize(
            $event,
            'se'
          )
        "
        @pointermove="moveCharacterResize"
        @pointerup="stopCharacterResize"
        @pointercancel="stopCharacterResize"
      ></button>


      <!-- =====================
           CHARACTER MOVE ZONE
           ===================== -->

      <div
        v-if="
          modelBounds &&
          !reactionWheelOpen &&
          !modelPickerOpen
        "
        class="model-drag-zone"
        :style="modelDragZoneStyle"
        title="Kéo để di chuyển nhân vật"
        @pointerdown="startCharacterDrag"
        @pointermove="moveCharacterDrag"
        @pointerup="stopCharacterDrag"
        @pointercancel="stopCharacterDrag"
      />


      <!-- =====================
           CONTROLS
           ===================== -->

      <Transition name="controls">

        <div
          v-if="
            controlsVisible &&
            !reactionWheelOpen &&
            !modelPickerOpen
          "
          class="character-controls"
          :style="reactionControlStyle"
          @mouseenter="keepControlsVisible"
          @mouseleave="scheduleControlsHide"
        >

          <button
            v-if="actions.length > 0"
            class="control-button react-button"
            type="button"
            @click="openReactionWheel"
          >
            <span class="button-icon">
              ✦
            </span>

            React
          </button>


          <button
            class="control-button models-button"
            type="button"
            @click="openModelPicker"
          >
            <span class="button-icon">
              ◉
            </span>

            Models
          </button>


          <button
            class="control-button reset-button"
            type="button"
            @click="resetReaction"
          >
            <span class="button-icon">
              ↺
            </span>

            Reset
          </button>

        </div>

      </Transition>


      <!-- =====================
           MODEL PICKER
           ===================== -->

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


      <!-- =====================
           REACTION WHEEL
           ===================== -->

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
  FULL-SCREEN HOST
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

  box-sizing:
    border-box;

  overflow:
    visible;

  background:
    transparent;

  pointer-events:
    none;

  user-select:
    none;

  will-change:
    transform,
    width,
    height;

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
  ============================================================
  OLD MODEL RESIZE BUTTON
  ============================================================

  Không dùng nút ⤢ riêng nữa.

  Resize bây giờ bằng toàn bộ
  character frame.
*/

:deep(.model-resize-handle) {
  display:
    none !important;
}


/*
  ============================================================
  RED CHARACTER FRAME
  ============================================================
*/

.character-frame {
  position:
    absolute;

  inset:
    80px;

  box-sizing:
    border-box;

  border:
    2px solid
    rgba(
      255,
      90,
      100,
      0.92
    );

  border-radius:
    12px;

  box-shadow:
    0 0 0 1px
    rgba(
      255,
      255,
      255,
      0.28
    ),
    0 0 10px
    rgba(
      255,
      80,
      95,
      0.10
    );

  pointer-events:
    none;

  z-index:
    19000;
}


/*
  ============================================================
  RESIZE HANDLES
  ============================================================
*/

.character-resize-handle {
  position:
    absolute;

  width:
    16px;

  height:
    16px;

  padding:
    0;

  border:
    2px solid
    rgba(
      255,
      90,
      100,
      0.98
    );

  border-radius:
    5px;

  background:
    rgba(
      255,
      255,
      255,
      0.98
    );

  box-shadow:
    0 2px 8px
    rgba(
      0,
      0,
      0,
      0.28
    );

  pointer-events:
    auto;

  touch-action:
    none;

  user-select:
    none;

  z-index:
    20000;

  -webkit-app-region:
    no-drag;

  transition:
    transform 100ms ease,
    box-shadow 100ms ease;
}


.character-resize-handle:hover {
  transform:
    scale(1.18);

  box-shadow:
    0 3px 11px
    rgba(
      0,
      0,
      0,
      0.34
    );
}


/*
  TOP LEFT
*/

.character-resize-handle--nw {
  left:
    -8px;

  top:
    -8px;

  cursor:
    nwse-resize;
}


/*
  TOP RIGHT
*/

.character-resize-handle--ne {
  right:
    -8px;

  top:
    -8px;

  cursor:
    nesw-resize;
}


/*
  BOTTOM LEFT
*/

.character-resize-handle--sw {
  left:
    -8px;

  bottom:
    -8px;

  cursor:
    nesw-resize;
}


/*
  BOTTOM RIGHT
*/

.character-resize-handle--se {
  right:
    -8px;

  bottom:
    -8px;

  cursor:
    nwse-resize;
}


/*
  ============================================================
  MODEL DRAG ZONE
  ============================================================
*/

.model-drag-zone {
  position:
    absolute;

  z-index:
    40;

  background:
    transparent;

  cursor:
    move;

  pointer-events:
    auto;

  user-select:
    none;

  touch-action:
    none;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  CHARACTER CONTROLS
  ============================================================
*/

.character-controls {
  position:
    absolute;

  z-index:
    9000;

  width:
    100px;

  display:
    flex;

  flex-direction:
    column;

  gap:
    6px;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


.control-button {
  width:
    100px;

  min-height:
    36px;

  padding:
    0 12px;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.16
    );

  border-radius:
    18px;

  color:
    white;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  gap:
    7px;

  font-size:
    12px;

  font-weight:
    700;

  cursor:
    pointer;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;

  backdrop-filter:
    blur(12px);

  transition:
    transform 130ms ease,
    filter 130ms ease,
    background 130ms ease;
}


.control-button:hover {
  transform:
    scale(1.06);

  filter:
    brightness(1.12);
}


.control-button:active {
  transform:
    scale(0.95);
}


.button-icon {
  font-size:
    16px;
}


/*
  React
*/

.react-button {
  min-height:
    44px;

  font-size:
    14px;

  background:
    linear-gradient(
      135deg,
      rgba(
        122,
        80,
        255,
        0.96
      ),
      rgba(
        225,
        70,
        180,
        0.96
      )
    );

  box-shadow:
    0 5px 20px
    rgba(
      130,
      75,
      255,
      0.42
    );
}


/*
  Models
*/

.models-button {
  background:
    rgba(
      45,
      50,
      70,
      0.95
    );

  box-shadow:
    0 4px 14px
    rgba(
      0,
      0,
      0,
      0.22
    );
}


/*
  Reset
*/

.reset-button {
  background:
    rgba(
      25,
      25,
      34,
      0.88
    );

  opacity:
    0.78;
}


.reset-button:hover {
  opacity:
    1;
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
    12000;

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
    11000;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  TRANSITION
  ============================================================
*/

.controls-enter-active,
.controls-leave-active {
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}


.controls-enter-from,
.controls-leave-to {
  opacity:
    0;

  transform:
    translateX(-5px)
    scale(0.94);
}
</style>