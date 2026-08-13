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


/*
  ============================================================
  CHARACTER VIEWPORT
  ============================================================

  Live2D vẫn nằm trong một vùng
  500 x 700 giống BrowserWindow cũ.

  Nhưng BrowserWindow thật bây giờ
  phủ toàn màn hình và KHÔNG di chuyển.

  Khi user kéo:
  chỉ div character-shell di chuyển.
*/

const CHARACTER_VIEW_WIDTH =
  500


const CHARACTER_VIEW_HEIGHT =
  700


/*
  Giữ lại ít nhất 40px character-shell
  trên màn hình để không kéo mất hoàn toàn.

  Muốn cho phép kéo xa hơn:
  giảm xuống 20, 10 hoặc 1.
*/
const MIN_VISIBLE_PIXELS =
  40


/*
  Vị trí character-shell
  trong BrowserWindow full-screen.
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
        `${CHARACTER_VIEW_WIDTH}px`,

      height:
        `${CHARACTER_VIEW_HEIGHT}px`,

      transform:
        `translate3d(${characterX.value}px, ${characterY.value}px, 0)`
    })
  )


/*
  Live2DStage cần biết
  character-shell đang nằm ở đâu.

  Nó dùng offset này để convert:

  cursor full-screen
        ↓
  cursor local 500x700
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
  GENERAL HELPERS
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


/*
  ============================================================
  CHARACTER POSITION LIMIT
  ============================================================

  Cho phép character-shell đi ra
  ngoài màn hình.

  Ví dụ:

  y = -200

  nghĩa là 200px phía trên
  character-shell bị che bởi
  mép màn hình.
*/

function clampCharacterPosition(
  x: number,
  y: number
): {
  x: number
  y: number
} {
  const minX =
    -CHARACTER_VIEW_WIDTH +
    MIN_VISIBLE_PIXELS


  const maxX =
    window.innerWidth -
    MIN_VISIBLE_PIXELS


  const minY =
    -CHARACTER_VIEW_HEIGHT +
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


/*
  Vị trí mặc định:
  gần góc dưới-phải màn hình.
*/

function initializeCharacterPosition():
  void {
  const position =
    clampCharacterPosition(
      window.innerWidth -
        CHARACTER_VIEW_WIDTH -
        24,

      window.innerHeight -
        CHARACTER_VIEW_HEIGHT -
        24
    )


  characterX.value =
    position.x


  characterY.value =
    position.y
}


/*
  Nếu resolution / kích thước window
  thay đổi thì đảm bảo character
  không mất hoàn toàn khỏi viewport.
*/

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


/*
  ============================================================
  DELETABLE MODELS
  ============================================================
*/

const deletableModelIds =
  computed<string[]>(
    () =>
      importedModels
        .value
        .map(
          (
            model
          ) =>
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
            (
              item
            ) =>
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


/*
  ============================================================
  LOAD IMPORTED MODELS
  ============================================================
*/

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

  QUAN TRỌNG:

  modelBounds là tọa độ LOCAL
  trong character-shell 500x700.

  Vì vậy KHÔNG dùng window.innerWidth
  để tính vị trí controls nữa.
*/

const reactionControlStyle =
  computed(
    () => {
      const bounds =
        modelBounds.value


      if (
        !bounds
      ) {
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
        CHARACTER_VIEW_WIDTH
      ) {
        left =
          bounds.x -
          controlWidth -
          gap
      }


      left =
        clamp(
          left,
          8,
          CHARACTER_VIEW_WIDTH -
            controlWidth
        )


      top =
        clamp(
          top,
          8,
          CHARACTER_VIEW_HEIGHT -
            150
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


      if (
        !bounds
      ) {
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


      /*
        Không đủ chỗ phải
        → chuyển sang trái.
      */

      if (
        left +
          panelWidth >
        CHARACTER_VIEW_WIDTH
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
          CHARACTER_VIEW_WIDTH -
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
          CHARACTER_VIEW_HEIGHT -
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


/*
  ============================================================
  MODEL HOVER
  ============================================================
*/

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


  if (
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
    isModelHovered.value
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


/*
  ============================================================
  SELECT MODEL
  ============================================================
*/

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


    /*
      User Cancel.
    */

    if (
      !imported
    ) {
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
          (
            item
          ) =>
            item.id ===
            imported.id
        )


    if (
      !exists
    ) {
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
  model:
    CharacterConfig
): Promise<void> {
  const importedModel =
    importedModels
      .value
      .find(
        (
          item
        ) =>
          item.id ===
          model.id
      )


  /*
    Built-in model
    không được xóa.
  */

  if (
    !importedModel
  ) {
    console.warn(
      '[Models] Cannot delete built-in model:',
      model.id
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
    model.id


  try {
    const deleted =
      await window.api
        .deleteModel(
          model.id
        )


    /*
      User Cancel.
    */

    if (
      !deleted
    ) {
      console.log(
        '[Models] Delete cancelled:',
        model.name
      )

      return
    }


    /*
      Nếu xóa model đang dùng
      → trở về Akari.
    */

    if (
      currentCharacterId.value ===
      model.id
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
          (
            item
          ) =>
            item.id !==
            model.id
        )


    modelPickerOpen.value =
      true


    controlsVisible.value =
      true


    console.log(
      '[Models] Deleted from UI:',
      model.name
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
  CHARACTER DRAG ZONE SETTINGS
  ============================================================

  Đây là vùng nhỏ trên thân
  dùng để kéo character-shell.

  KHÔNG kéo BrowserWindow.
*/

const MODEL_DRAG_ZONE_WIDTH_RATIO =
  0.32


const MODEL_DRAG_ZONE_HEIGHT_RATIO =
  0.30


/*
  28% từ đỉnh model.
*/

const MODEL_DRAG_ZONE_TOP_RATIO =
  0.28


/*
  Min / max vùng kéo.
*/

const MODEL_DRAG_ZONE_MIN_WIDTH =
  55


const MODEL_DRAG_ZONE_MAX_WIDTH =
  115


const MODEL_DRAG_ZONE_MIN_HEIGHT =
  75


const MODEL_DRAG_ZONE_MAX_HEIGHT =
  155


/*
  ============================================================
  DRAG ZONE POSITION
  ============================================================
*/

const modelDragZoneStyle =
  computed(
    () => {
      const bounds =
        modelBounds.value


      if (
        !bounds ||
        bounds.width <=
          0 ||
        bounds.height <=
          0
      ) {
        return {
          display:
            'none'
        }
      }


      /*
        Width.
      */

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


      /*
        Height.
      */

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


      /*
        Căn giữa ngang.
      */

      const left =
        bounds.x +
        (
          bounds.width -
          width
        ) /
        2


      /*
        Đặt ở phần thân model.
      */

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
  CHARACTER DRAG
  ============================================================

  Đây là thay đổi quan trọng.

  BrowserWindow:
    KHÔNG DI CHUYỂN.

  character-shell:
    translate3d(x, y, 0)

  → tránh flicker transparent WebGL.
*/

let characterDrag:
  CharacterDragState | null =
    null


/*
  Position chờ apply ở frame tiếp theo.
*/

let pendingCharacterPosition:
  {
    x: number
    y: number
  } | null =
    null


let characterDragFrame:
  number | null =
    null


/*
  Apply position đúng 1 lần/frame.
*/

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


/*
  Queue vị trí mới.

  requestAnimationFrame giúp
  drag mượt và tránh Vue update
  quá nhiều lần trong một frame.
*/

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
  DRAG START
  ============================================================
*/

function startCharacterDrag(
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


  if (
    reactionWheelOpen.value ||
    modelPickerOpen.value
  ) {
    return
  }


  /*
    Không start lần nữa.
  */

  if (
    characterDrag
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


  /*
    Trong khi drag,
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


  console.log(
    '[CharacterDrag] Started'
  )
}


/*
  ============================================================
  DRAG MOVE
  ============================================================
*/

function moveCharacterDrag(
  event: PointerEvent
): void {
  if (
    !characterDrag
  ) {
    return
  }


  if (
    event.pointerId !==
    characterDrag.pointerId
  ) {
    return
  }


  /*
    Nếu chuột trái không còn giữ
    → kết thúc drag.
  */

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


  /*
    clientX/clientY là tọa độ
    trong BrowserWindow full-screen.

    BrowserWindow đứng yên
    nên delta này rất ổn định.
  */

  const deltaX =
    event.clientX -
    characterDrag.startPointerX


  const deltaY =
    event.clientY -
    characterDrag.startPointerY


  const nextX =
    characterDrag.startCharacterX +
    deltaX


  const nextY =
    characterDrag.startCharacterY +
    deltaY


  queueCharacterPosition(
    nextX,
    nextY
  )
}


/*
  ============================================================
  DRAG END
  ============================================================
*/

function stopCharacterDrag(
  event?:
    PointerEvent
): void {
  if (
    !characterDrag
  ) {
    return
  }


  if (
    event &&
    event.pointerId !==
      characterDrag.pointerId
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
    Apply position cuối ngay lập tức.
  */

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


  const dragState =
    characterDrag


  characterDrag =
    null


  try {
    if (
      dragState
        .element
        .hasPointerCapture(
          dragState.pointerId
        )
    ) {
      dragState
        .element
        .releasePointerCapture(
          dragState.pointerId
        )
    }
  }
  catch {
    /*
      Ignore.
    */
  }


  console.log(
    '[CharacterDrag] Finished:',
    {
      x:
        characterX.value,

      y:
        characterY.value
    }
  )


  /*
    Sau khi thả chuột,
    kiểm tra lại click-through.
  */

  void syncMousePassthrough()
}


/*
  ============================================================
  MOUSE PASSTHROUGH
  ============================================================

  Vì BrowserWindow bây giờ
  phủ toàn màn hình:

  nếu không làm click-through,
  desktop bên dưới sẽ không click được.

  Logic:

  Cursor ở vùng interactive:
    ignore = false

  Cursor ở transparent area:
    ignore = true
*/


let mousePassthroughTimer:
  number | null =
    null


let mousePassthroughPending =
  false


let lastIgnoreMouseState:
  boolean | null =
    null


/*
  Chỉ gửi IPC khi state thực sự đổi.

  Không spam IPC 30 lần/giây.
*/

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
  DETECT INTERACTIVE DOM
  ============================================================
*/

/*
  ============================================================
  HIT TEST
  ============================================================

  Không dùng elementFromPoint()
  để quyết định mouse passthrough nữa.

  Ta kiểm tra trực tiếp bounding rect
  của các vùng interactive.
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


function isCursorOverInteractiveDom(
  x: number,
  y: number
): boolean {
  const selectors = [
    '.model-drag-zone',
    '.model-resize-handle',
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


    /*
      Element đang hidden
      thì bỏ qua.
    */
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
  Cho toàn bộ phần model trở thành
  vùng có thể bật mouse interaction.

  Nhờ vậy khi cursor tới gần:
  - model
  - resize handle

  Electron sẽ ngừng click-through
  trước khi user click.
*/
function isCursorOverModelArea(
  x: number,
  y: number
): boolean {
  const bounds =
    modelBounds.value


  if (
    !bounds
  ) {
    return false
  }


  /*
    Convert full-screen coordinate
    sang local character-shell.
  */

  const localX =
    x -
    characterX.value


  const localY =
    y -
    characterY.value


  /*
    Mở rộng thêm 40px
    để resize handle nằm ngoài bounds
    vẫn bắt mouse được.
  */

  const padding =
    40


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
  /*
    Không cho chạy chồng nhiều IPC.
  */

  if (
    mousePassthroughPending
  ) {
    return
  }


  /*
    Đang kéo character:
    luôn nhận mouse.
  */

  if (
    characterDrag
  ) {
    applyIgnoreMouseState(
      false
    )

    return
  }


  mousePassthroughPending =
    true


  try {
    /*
      Cursor relative với
      BrowserWindow full-screen.
    */

    const cursor =
      await window.api
        .getCursorPosition()


    /*
      document.elementFromPoint()
      dùng tọa độ viewport CSS.

      BrowserWindow đứng yên full-screen
      nên cursor.x/y khớp với viewport.
    */

    /*
  Không dựa vào elementFromPoint nữa.

  Kiểm tra bằng:
  1. model bounds
  2. bounding rect DOM controls
*/

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


const interactive =
  overModel ||
  overInteractiveDom


    /*
      interactive = true
        → ignore false.

      interactive = false
        → ignore true.
    */

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
    /*
      Đặt character ban đầu.
    */

    initializeCharacterPosition()


    /*
      Load imported models.
    */

    await loadImportedModels()


    /*
      Window resize.
    */

    window.addEventListener(
      'resize',
      handleWindowResize
    )


    /*
      Pointer fallback.

      Nếu pointerup xảy ra
      ngoài drag zone.
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
      Khoảng 30 FPS.

      Timer này KHÔNG di chuyển window.

      Nó chỉ kiểm tra:
      cursor có đang ở vùng interactive
      hay không.

      Vì applyIgnoreMouseState()
      có cache nên IPC chỉ gửi
      khi true/false thực sự đổi.
    */

    mousePassthroughTimer =
      window.setInterval(
        () => {
          void syncMousePassthrough()
        },

        33
      )


    /*
      Sync ngay lần đầu.
    */

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


    pendingCharacterPosition =
      null
  }
)
</script>


<template>
  <main class="desktop-stage">

    <!--
      =========================================================
      CHARACTER SHELL
      =========================================================

      Đây là vùng 500x700.

      BrowserWindow không di chuyển.

      Toàn bộ:
      - Live2D
      - resize
      - controls
      - Model Picker
      - Reaction Wheel

      đều nằm trong shell này.
    -->

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
           CHARACTER DRAG ZONE
           =====================

           Đây là vùng duy nhất
           để kéo character.

           KHÔNG dùng:
           -webkit-app-region: drag

           KHÔNG di chuyển:
           BrowserWindow
      -->

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
           CONTROL BUTTONS
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

          <!-- React -->

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


          <!-- Models -->

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


          <!-- Reset -->

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
  FULL-SCREEN TRANSPARENT HOST
  ============================================================
*/

.desktop-stage {
  position: fixed;

  inset: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;

  background:
    transparent;

  /*
    Toàn host mặc định
    không nhận PointerEvent.
  */
  pointer-events:
    none;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  CHARACTER SHELL
  ============================================================

  Đây chính là vùng 500x700 cũ.

  Nó được di chuyển bằng
  translate3d().
*/

.character-shell {
  position: absolute;

  left: 0;
  top: 0;

  background:
    transparent;

  overflow:
    visible;

  /*
    Shell không tự bắt click.

    Chỉ những child cụ thể bên dưới
    có pointer-events:auto.
  */
  pointer-events:
    none;

  user-select:
    none;

  will-change:
    transform;

  /*
    BrowserWindow không drag native.
  */
  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  LIVE2D
  ============================================================

  Canvas không cần nhận PointerEvent.

  Live2DStage tự theo dõi cursor
  bằng window.api.getCursorPosition().
*/

:deep(.live2d-stage) {
  pointer-events:
    none;
}


/*
  Nhưng resize handle
  PHẢI nhận PointerEvent.
*/

:deep(.model-resize-handle) {
  /*
    Resize handle phải luôn
    nằm trên drag zone.
  */
  z-index:
    20000 !important;

  pointer-events:
    auto !important;

  visibility:
    visible;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  MODEL DRAG ZONE
  ============================================================

  Vùng transparent nhỏ trên thân.

  Kéo zone này:
    → thay characterX/Y
    → CSS translate3d

  BrowserWindow đứng yên.
*/

.model-drag-zone {
  position: absolute;

  z-index: 40;

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
  Nếu muốn nhìn vùng drag để debug,
  tạm thời đổi:

  background: transparent;

  thành:

  background:
    rgba(255, 0, 0, 0.25);
*/


/*
  ============================================================
  CHARACTER CONTROLS
  ============================================================
*/

.character-controls {
  position: absolute;

  z-index: 9000;

  width: 100px;

  display: flex;

  flex-direction: column;

  gap: 6px;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


.control-button {
  width: 100px;

  min-height: 36px;

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
  ============================================================
  REACT BUTTON
  ============================================================
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
  ============================================================
  MODELS BUTTON
  ============================================================
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
  ============================================================
  RESET BUTTON
  ============================================================
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
  position: absolute;

  z-index: 12000;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  REACTION WHEEL
  ============================================================

  Wrapper giữ ReactionWheel
  nằm trong character-shell 500x700.
*/

.reaction-wheel-container {
  position: absolute;

  inset: 0;

  z-index: 11000;

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