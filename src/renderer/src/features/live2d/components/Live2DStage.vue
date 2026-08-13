<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

import * as PIXI from 'pixi.js'

import { ShaderSystem } from '@pixi/core'
import { install as installUnsafeEval } from '@pixi/unsafe-eval'

import {
  Live2DModel,
  MotionPriority,
  config
} from 'pixi-live2d-display/cubism4'

import type {
  CharacterConfig
} from '../../../characters/types'

import type {
  Live2DAction
} from '../types'


/*
  ============================================================
  PIXI CSP PATCH
  ============================================================
*/

installUnsafeEval({
  ShaderSystem
})


/*
  ============================================================
  TYPES
  ============================================================
*/

type ModelBounds = {
  x: number
  y: number
  width: number
  height: number
}


type StageOffset = {
  x: number
  y: number
}


type Model3Expression = {
  Name?: string
  File?: string
}


type Model3Motion = {
  File?: string

  [key: string]: unknown
}


type Model3Json = {
  FileReferences?: {
    Expressions?: Model3Expression[]

    Motions?: Record<
      string,
      Model3Motion[]
    >

    Pose?: string

    [key: string]: unknown
  }

  [key: string]: unknown
}


type RuntimeMotionRef = {
  group: string
  index: number
  file?: string
}


type ModelRuntimeInfo = {
  actions: Live2DAction[]

  hasIdleMotion: boolean

  idleMotionGroup:
    string | null

  hasPose: boolean

  initializationMotion:
    RuntimeMotionRef | null
}


type ResizeDragState = {
  pointerId: number

  startDistance: number

  startUserScale: number

  startOffsetX: number
  startOffsetY: number

  fixedX: number
  fixedY: number
}


/*
  ============================================================
  SETTINGS
  ============================================================
*/

const MIN_USER_SCALE =
  0.6


/*
  Max cứng.

  Muốn sau này tăng khả năng
  phóng to thì chỉnh số này.
*/
const ABSOLUTE_MAX_USER_SCALE =
  4


const VIEWPORT_PADDING =
  5


const RESIZE_HANDLE_HIT_SIZE =
  46


/*
  Button 32px nên margin 18px
  giúp button không bị cắt.
*/
const RESIZE_HANDLE_MARGIN =
  18

  /*
  Đưa resize button vào gần
  phần nhìn thấy của model hơn.

  X càng lớn:
    button càng dịch sang trái.

  Y càng lớn:
    button càng dịch xuống dưới.
*/
const RESIZE_HANDLE_INSET_X =
  36


const RESIZE_HANDLE_INSET_Y =
  32


/*
  ============================================================
  PROPS / EMITS
  ============================================================
*/

const props =
  defineProps<{
    character:
      CharacterConfig

    /*
      Vị trí character-shell
      trong BrowserWindow fullscreen.

      App.vue truyền:
      :stage-offset="stageOffset"
    */
    stageOffset?:
      StageOffset
  }>()


const emit =
  defineEmits<{
    hoverChange:
      [hovered: boolean]

    actionsReady:
      [actions: Live2DAction[]]

    modelBoundsChange:
      [bounds: ModelBounds]
  }>()


/*
  ============================================================
  DOM STATE
  ============================================================
*/

const container =
  ref<HTMLDivElement | null>(
    null
  )


const resizeHandle =
  ref<HTMLButtonElement | null>(
    null
  )


const modelReady =
  ref(
    false
  )


const isResizing =
  ref(
    false
  )


/*
  Không hiện resize button
  cho tới khi tính được
  left/top hợp lệ.

  Fix lỗi button xuất hiện
  ở góc trái trên 0,0.
*/
const resizeHandlePositionReady =
  ref(
    false
  )

  /*
  Resize handle chỉ hiện
  khi cursor đang ở model
  hoặc đang ở chính resize handle.
*/
const resizeHandleVisible =
  ref(
    false
  )

/*
  ============================================================
  PIXI / LIVE2D
  ============================================================
*/

let app:
  PIXI.Application | null =
    null


let model:
  Live2DModel | null =
    null


let baseFitScale =
  1


let userScaleMultiplier =
  1


let manualOffsetX =
  0


let manualOffsetY =
  0


let currentModelHasIdle =
  false


let currentIdleMotionGroup:
  string | null =
    null


let currentModelHasPose =
  false


let currentInitializationMotion:
  RuntimeMotionRef | null =
    null


let loadVersion =
  0


let resizeDragState:
  ResizeDragState | null =
    null


/*
  ============================================================
  BASIC HELPERS
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


function getStageOffset():
  StageOffset {
  return {
    x:
      props.stageOffset?.x ??
      0,

    y:
      props.stageOffset?.y ??
      0
  }
}


/*
  BrowserWindow cursor
  → local coordinate
  của character-shell 500x700.
*/

function globalCursorToLocal(
  x: number,
  y: number
): {
  x: number
  y: number
} {
  const offset =
    getStageOffset()


  return {
    x:
      x -
      offset.x,

    y:
      y -
      offset.y
  }
}


/*
  ============================================================
  MODEL POSITION
  ============================================================
*/

function getBaseModelPosition():
  {
    x: number
    y: number
  } {
  const currentApp =
    app


  if (!currentApp) {
    return {
      x: 0,
      y: 0
    }
  }


  return {
    x:
      currentApp.screen.width *
      props.character.transform.x,

    y:
      currentApp.screen.height *
      props.character.transform.y
  }
}


function updateManualOffset():
  void {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  const basePosition =
    getBaseModelPosition()


  manualOffsetX =
    currentModel.position.x -
    basePosition.x


  manualOffsetY =
    currentModel.position.y -
    basePosition.y
}


function resetManualTransform():
  void {
  userScaleMultiplier =
    1


  manualOffsetX =
    0


  manualOffsetY =
    0


  resizeDragState =
    null


  isResizing.value =
    false
}


/*
  ============================================================
  MAX SCALE
  ============================================================
*/

function getEffectiveMaxUserScale():
  number {
  /*
    Không giới hạn theo viewport nữa.

    User có thể phóng model
    tới ABSOLUTE_MAX_USER_SCALE.
  */

  return ABSOLUTE_MAX_USER_SCALE
}


/*
  ============================================================
  KEEP MODEL INSIDE LOCAL 500x700
  ============================================================

  Đây chỉ giữ model trong
  character-shell.

  Nó KHÔNG ngăn cả character-shell
  đi ra ngoài màn hình.

  App.vue chịu trách nhiệm
  kéo character-shell.
*/

function keepModelInsideViewport():
  void {
  const currentModel =
    model


  const currentApp =
    app


  if (
    !currentModel ||
    !currentApp
  ) {
    return
  }


  const bounds =
    currentModel.getBounds()


  const left =
    bounds.x


  const right =
    bounds.x +
    bounds.width


  const top =
    bounds.y


  const bottom =
    bounds.y +
    bounds.height


  const minX =
    VIEWPORT_PADDING


  const maxX =
    currentApp.screen.width -
    VIEWPORT_PADDING


  const minY =
    VIEWPORT_PADDING


  const maxY =
    currentApp.screen.height -
    VIEWPORT_PADDING


  let dx =
    0


  let dy =
    0


  if (
    left <
    minX
  ) {
    dx =
      minX -
      left
  }
  else if (
    right >
    maxX
  ) {
    dx =
      maxX -
      right
  }


  if (
    top <
    minY
  ) {
    dy =
      minY -
      top
  }
  else if (
    bottom >
    maxY
  ) {
    dy =
      maxY -
      bottom
  }


  if (
    dx !== 0 ||
    dy !== 0
  ) {
    currentModel.position.x +=
      dx


    currentModel.position.y +=
      dy
  }


  updateManualOffset()
}


/*
  ============================================================
  RESIZE HANDLE POSITION
  ============================================================
*/

function getResizeHandlePosition():
  {
    x: number
    y: number
  } | null {
  const currentModel =
    model


  const currentApp =
    app


  if (
    !currentModel ||
    !currentApp
  ) {
    return null
  }


  const screenWidth =
    currentApp.screen.width


  const screenHeight =
    currentApp.screen.height


  /*
    PIXI chưa resize xong.
  */
  if (
    !Number.isFinite(
      screenWidth
    ) ||
    !Number.isFinite(
      screenHeight
    ) ||
    screenWidth <=
      RESIZE_HANDLE_MARGIN * 2 ||
    screenHeight <=
      RESIZE_HANDLE_MARGIN * 2
  ) {
    return null
  }


  const bounds =
    currentModel.getBounds()


 /*
  Bình thường top-right là:

  x = bounds.x + bounds.width
  y = bounds.y

  Nhưng Live2D model có thể có
  transparent/invisible bounds khá lớn.

  Vì vậy kéo button vào trong
  một chút để nó gần character hơn.
*/

const rawX =
  bounds.x +
  bounds.width -
  RESIZE_HANDLE_INSET_X


const rawY =
  bounds.y +
  RESIZE_HANDLE_INSET_Y


  /*
    Tránh button xuất hiện
    ở 0,0 khi bounds lỗi.
  */
  if (
    !Number.isFinite(
      rawX
    ) ||
    !Number.isFinite(
      rawY
    ) ||
    !Number.isFinite(
      bounds.width
    ) ||
    !Number.isFinite(
      bounds.height
    ) ||
    bounds.width <=
      0 ||
    bounds.height <=
      0
  ) {
    return null
  }


  return {
    x:
      clamp(
        rawX,
        RESIZE_HANDLE_MARGIN,
        screenWidth -
          RESIZE_HANDLE_MARGIN
      ),

    y:
      clamp(
        rawY,
        RESIZE_HANDLE_MARGIN,
        screenHeight -
          RESIZE_HANDLE_MARGIN
      )
  }
}


function syncResizeHandle():
  void {
  const handle =
    resizeHandle.value


  if (!handle) {
    return
  }


  const position =
    getResizeHandlePosition()


  /*
    Chưa có position hợp lệ
    → giấu button hoàn toàn.
  */
  if (!position) {
    resizeHandlePositionReady.value =
      false


    handle.style.visibility =
      'hidden'


    return
  }


  handle.style.left =
    `${position.x}px`


  handle.style.top =
    `${position.y}px`


  handle.style.visibility =
    'visible'


  resizeHandlePositionReady.value =
    true
}


/*
  ============================================================
  POINTER → LOCAL STAGE
  ============================================================
*/

function pointerToStage(
  event: PointerEvent
): {
  x: number
  y: number
} {
  const currentContainer =
    container.value


  const currentApp =
    app


  if (
    !currentContainer ||
    !currentApp
  ) {
    return {
      x: 0,
      y: 0
    }
  }


  const rect =
    currentContainer
      .getBoundingClientRect()


  const scaleX =
    rect.width > 0
      ?
      currentApp.screen.width /
      rect.width
      :
      1


  const scaleY =
    rect.height > 0
      ?
      currentApp.screen.height /
      rect.height
      :
      1


  return {
    x:
      (
        event.clientX -
        rect.left
      ) *
      scaleX,

    y:
      (
        event.clientY -
        rect.top
      ) *
      scaleY
  }
}


/*
  ============================================================
  RESIZE START
  ============================================================
*/

function onResizePointerDown(
  event: PointerEvent
): void {
  const currentModel =
    model


  if (
    !currentModel ||
    !app
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const pointer =
    pointerToStage(
      event
    )


  const bounds =
    currentModel.getBounds()


  /*
    Resize từ góc trên-phải.

    Giữ góc dưới-trái cố định.
  */

  const fixedX =
    bounds.x


  const fixedY =
    bounds.y +
    bounds.height


  const startDistance =
    Math.hypot(
      pointer.x -
        fixedX,

      pointer.y -
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


  resizeDragState = {
    pointerId:
      event.pointerId,

    startDistance,

    startUserScale:
      userScaleMultiplier,

    startOffsetX:
      manualOffsetX,

    startOffsetY:
      manualOffsetY,

    fixedX,

    fixedY
  }


  isResizing.value =
    true

  resizeHandleVisible.value =
  true

  lastHoverState =
    true


  emit(
    'hoverChange',
    true
  )


  const target =
    event.currentTarget as HTMLElement


  try {
    target.setPointerCapture(
      event.pointerId
    )
  }
  catch {
    /*
      Ignore.
    */
  }


  console.log(
    '[Live2D] Resize started'
  )
}


/*
  ============================================================
  RESIZE MOVE
  ============================================================
*/

function onResizePointerMove(
  event: PointerEvent
): void {
  const drag =
    resizeDragState


  const currentModel =
    model


  if (
    !drag ||
    !currentModel ||
    !app
  ) {
    return
  }


  if (
    event.pointerId !==
    drag.pointerId
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const pointer =
    pointerToStage(
      event
    )


  const currentDistance =
    Math.hypot(
      pointer.x -
        drag.fixedX,

      pointer.y -
        drag.fixedY
    )


  if (
    !Number.isFinite(
      currentDistance
    )
  ) {
    return
  }


  const ratio =
    currentDistance /
    drag.startDistance


  if (
    !Number.isFinite(
      ratio
    ) ||
    ratio <=
      0
  ) {
    return
  }


  const requestedScale =
    drag.startUserScale *
    ratio


  const effectiveMaxScale =
    getEffectiveMaxUserScale()


  userScaleMultiplier =
    clamp(
      requestedScale,
      MIN_USER_SCALE,
      effectiveMaxScale
    )


  /*
    Apply scale.
  */

  currentModel.scale.set(
    baseFitScale *
    userScaleMultiplier
  )


  /*
    Đưa model về position
    lúc bắt đầu resize.
  */

  const basePosition =
    getBaseModelPosition()


  currentModel.position.set(
    basePosition.x +
      drag.startOffsetX,

    basePosition.y +
      drag.startOffsetY
  )


  /*
    Giữ bottom-left cố định.
  */

  const scaledBounds =
    currentModel.getBounds()


  const deltaX =
    drag.fixedX -
    scaledBounds.x


  const deltaY =
    drag.fixedY -
    (
      scaledBounds.y +
      scaledBounds.height
    )


  currentModel.position.x +=
    deltaX


  currentModel.position.y +=
    deltaY


  /*
    Không để resize làm model
    vượt khỏi local canvas.
  */

  updateManualOffset()


  syncResizeHandle()


  emitModelBounds()
}


/*
  ============================================================
  RESIZE END
  ============================================================
*/

function finishResize(
  event: PointerEvent
): void {
  const drag =
    resizeDragState


  if (!drag) {
    return
  }


  if (
    event.pointerId !==
    drag.pointerId
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const target =
    event.currentTarget as HTMLElement


  try {
    if (
      target.hasPointerCapture(
        event.pointerId
      )
    ) {
      target.releasePointerCapture(
        event.pointerId
      )
    }
  }
  catch {
    /*
      Ignore.
    */
  }


  resizeDragState =
    null


  isResizing.value =
    false

  syncResizeHandle()


  emitModelBounds()


  console.log(
    '[Live2D] Resize finished:',
    {
      scale:
        userScaleMultiplier,

      max:
        getEffectiveMaxUserScale()
    }
  )
}


/*
  ============================================================
  CURSOR TRACKING
  ============================================================
*/

let cursorTrackingTimer:
  number | null =
    null


let cursorRequestPending =
  false


let lastHoverState =
  false


function pointInsideResizeHandle(
  x: number,
  y: number
): boolean {
  if (
    !modelReady.value ||
    !resizeHandlePositionReady.value
  ) {
    return false
  }


  const position =
    getResizeHandlePosition()


  if (!position) {
    return false
  }


  const half =
    RESIZE_HANDLE_HIT_SIZE /
    2


  return (
    x >=
      position.x -
        half &&

    x <=
      position.x +
        half &&

    y >=
      position.y -
        half &&

    y <=
      position.y +
        half
  )
}


function updateModelHover(
  x: number,
  y: number
): void {
  const currentModel =
    model


  if (!currentModel) {
    resizeHandleVisible.value =
      false

    return
  }


  const bounds =
    currentModel.getBounds()


  /*
    Cursor được tính là đang hover nếu:

    1. đang resize
    2. đang nằm trên model
    3. đang nằm trên resize button

    Điều số 3 rất quan trọng:
    khi rê từ model sang button,
    button sẽ KHÔNG biến mất.
  */

  const hovered =
    isResizing.value ||

    bounds.contains(
      x,
      y
    ) ||

    pointInsideResizeHandle(
      x,
      y
    )


  /*
    Điều khiển visibility
    của resize button.
  */

  resizeHandleVisible.value =
    hovered


  /*
    Phần này tiếp tục gửi hover
    sang App.vue để React /
    Models / Reset hoạt động
    như trước.
  */

  if (
    hovered ===
    lastHoverState
  ) {
    return
  }


  lastHoverState =
    hovered


  emit(
    'hoverChange',
    hovered
  )
}


async function updateCursorFocus():
  Promise<void> {
  const currentModel =
    model


  if (
    !currentModel ||
    cursorRequestPending
  ) {
    return
  }


  cursorRequestPending =
    true


  try {
    const cursor =
      await window.api
        .getCursorPosition()


    /*
      Model có thể bị đổi
      trong lúc await IPC.
    */
    if (
      model !==
      currentModel
    ) {
      return
    }


    const localCursor =
      globalCursorToLocal(
        cursor.x,
        cursor.y
      )


    if (
      !isResizing.value
    ) {
      currentModel.focus(
        localCursor.x,
        localCursor.y
      )
    }


    updateModelHover(
      localCursor.x,
      localCursor.y
    )


    syncResizeHandle()
  }
  catch (error) {
    console.error(
      '[Live2D] Cursor tracking failed:',
      error
    )
  }
  finally {
    cursorRequestPending =
      false
  }
}


function startCursorTracking():
  void {
  if (
    cursorTrackingTimer !==
    null
  ) {
    return
  }


  cursorTrackingTimer =
    window.setInterval(
      () => {
        void updateCursorFocus()
      },

      33
    )
}


function stopCursorTracking():
  void {
  if (
    cursorTrackingTimer ===
    null
  ) {
    return
  }


  window.clearInterval(
    cursorTrackingTimer
  )


  cursorTrackingTimer =
    null
}


/*
  ============================================================
  FILE NAME HELPER
  ============================================================
*/

function fileNameWithoutExtension(
  path: string
): string {
  const fileName =
    path
      .replace(
        /\\/g,
        '/'
      )
      .split('/')
      .pop() ??
    path


  return fileName.replace(
    /\.(?:exp3|motion3)\.json$/i,
    ''
  )
}


/*
  ============================================================
  DISCOVER MODEL RUNTIME
  ============================================================
*/

async function discoverModelRuntime(
  modelUrl: string
): Promise<ModelRuntimeInfo> {
  const response =
    await fetch(
      modelUrl
    )


  if (!response.ok) {
    throw new Error(
      `Cannot read model settings: ${response.status}`
    )
  }


  const json:
    Model3Json =
      await response.json()


  const fileReferences =
    json.FileReferences


  const actions:
    Live2DAction[] =
      []


  /*
    POSE
  */

  const hasPose =
    typeof fileReferences?.Pose ===
      'string' &&
    fileReferences.Pose.length >
      0


  /*
    EXPRESSIONS
  */

  const expressions =
    fileReferences
      ?.Expressions ??
    []


  expressions.forEach(
    (
      expression,
      index
    ) => {
      let name:
        string


      if (
        expression.Name
      ) {
        name =
          expression.Name
      }
      else if (
        expression.File
      ) {
        name =
          fileNameWithoutExtension(
            expression.File
          )
      }
      else {
        name =
          `Expression ${index + 1}`
      }


      actions.push({
        id:
          `expression:${name}:${index}`,

        type:
          'expression',

        label:
          name,

        name
      })
    }
  )


  /*
    MOTIONS
  */

  const motions:
    Record<
      string,
      Model3Motion[]
    > =
      fileReferences
        ?.Motions ??
      {}


  let hasIdleMotion =
    false


  let idleMotionGroup:
    string | null =
      null


  let initializationMotion:
    RuntimeMotionRef | null =
      null


  Object.entries(
    motions
  ).forEach(
    ([
      group,
      groupMotions
    ]) => {
      if (
        !Array.isArray(
          groupMotions
        ) ||
        groupMotions.length ===
          0
      ) {
        return
      }


      /*
        Idle không hiện
        trong Reaction Wheel.
      */

      if (
        group
          .toLowerCase() ===
        'idle'
      ) {
        hasIdleMotion =
          true


        idleMotionGroup ??=
          group


        return
      }


      groupMotions.forEach(
        (
          motion,
          index
        ) => {
          if (
            !initializationMotion
          ) {
            initializationMotion = {
              group,

              index,

              file:
                motion.File
            }
          }


          let label:
            string


          if (
            groupMotions.length >
            1
          ) {
            label =
              `${group} ${index + 1}`
          }
          else {
            label =
              group
          }


          if (
            motion.File &&
            (
              group ===
                'Motion' ||
              group ===
                'Motions'
            )
          ) {
            label =
              fileNameWithoutExtension(
                motion.File
              )
          }


          actions.push({
            id:
              `motion:${group}:${index}`,

            type:
              'motion',

            label,

            group,

            index
          })
        }
      )
    }
  )


  console.log(
    '[Live2D] Has Idle:',
    hasIdleMotion
  )


  console.log(
    '[Live2D] Idle group:',
    idleMotionGroup
  )


  console.log(
    '[Live2D] Has Pose:',
    hasPose
  )


  console.log(
    '[Live2D] Expressions:',
    expressions.length
  )


  console.log(
    '[Live2D] Motion groups:',
    Object.keys(
      motions
    )
  )


  console.log(
    '[Live2D] Initialization motion:',
    initializationMotion
  )


  return {
    actions,

    hasIdleMotion,

    idleMotionGroup,

    hasPose,

    initializationMotion
  }
}


/*
  ============================================================
  HIYORI INITIALIZATION
  ============================================================

  PHẢI GIỮ.

  Hiyori có motion điều khiển
  PartOpacity nhưng không Pose.

  Nếu bỏ logic này có thể
  quay lại lỗi nhiều tay.
*/

async function initializeMotionOnlyModel():
  Promise<void> {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  if (
    currentModelHasPose
  ) {
    return
  }


  if (
    currentModelHasIdle
  ) {
    return
  }


  const initialization =
    currentInitializationMotion


  if (!initialization) {
    return
  }


  console.log(
    '[Live2D] Initializing no-pose/no-idle model:',
    initialization
  )


  try {
    await currentModel.motion(
      initialization.group,
      initialization.index,
      MotionPriority.FORCE
    )
  }
  catch (error) {
    console.warn(
      '[Live2D] Initialization motion failed:',
      error
    )
  }
}


/*
  ============================================================
  RUN ACTION
  ============================================================
*/

async function runAction(
  action: Live2DAction
): Promise<void> {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  console.log(
    '[Live2D] Run action:',
    action
  )


  if (
    action.type ===
    'expression'
  ) {
    try {
      await currentModel.expression(
        action.name
      )
    }
    catch (error) {
      console.error(
        `[Live2D] Expression failed: ${action.name}`,
        error
      )
    }


    return
  }


  try {
    await currentModel.motion(
      action.group,
      action.index,
      MotionPriority.FORCE
    )
  }
  catch (error) {
    console.error(
      `[Live2D] Motion failed: ${action.group}[${action.index}]`,
      error
    )
  }
}


/*
  ============================================================
  RESET REACTION
  ============================================================
*/

async function resetReaction():
  Promise<void> {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  console.log(
    '[Live2D] Reset reaction'
  )


  const motionManager =
    currentModel
      .internalModel
      .motionManager


  motionManager
    .stopAllMotions()


  motionManager
    .expressionManager
    ?.resetExpression()


  /*
    MODEL CÓ IDLE.
  */

  if (
    currentModelHasIdle &&
    currentIdleMotionGroup
  ) {
    try {
      await currentModel.motion(
        currentIdleMotionGroup,
        0,
        MotionPriority.IDLE
      )
    }
    catch (error) {
      console.warn(
        '[Live2D] Idle restart failed:',
        error
      )
    }


    return
  }


  /*
    MODEL HIYORI:
    không Pose + có initialization motion.
  */

  if (
    !currentModelHasPose &&
    currentInitializationMotion
  ) {
    try {
      await currentModel.motion(
        currentInitializationMotion.group,
        currentInitializationMotion.index,
        MotionPriority.FORCE
      )
    }
    catch (error) {
      console.warn(
        '[Live2D] Initialization restart failed:',
        error
      )
    }


    return
  }


  /*
    Không có baseline
    → reload.
  */

  await loadCharacter(
    props.character
  )
}


defineExpose({
  runAction,
  resetReaction
})


/*
  ============================================================
  MODEL BOUNDS
  ============================================================
*/

function emitModelBounds():
  void {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  const bounds =
    currentModel.getBounds()


  emit(
    'modelBoundsChange',
    {
      x:
        bounds.x,

      y:
        bounds.y,

      width:
        bounds.width,

      height:
        bounds.height
    }
  )
}


/*
  ============================================================
  FIT MODEL
  ============================================================
*/

function fitCurrentModel():
  void {
  const currentModel =
    model


  const currentApp =
    app


  if (
    !currentModel ||
    !currentApp
  ) {
    return
  }


  /*
    Scale = 1 để đo
    kích thước gốc.
  */

  currentModel.scale.set(
    1
  )


  const modelWidth =
    currentModel.width


  const modelHeight =
    currentModel.height


  if (
    modelWidth <= 0 ||
    modelHeight <= 0
  ) {
    return
  }


  const availableWidth =
    Math.max(
      1,

      currentApp.screen.width -
      VIEWPORT_PADDING * 2
    )


  const availableHeight =
    Math.max(
      1,

      currentApp.screen.height -
      VIEWPORT_PADDING * 2
    )


  const scaleX =
    availableWidth /
    modelWidth


  const scaleY =
    availableHeight /
    modelHeight


  const fitScale =
    Math.min(
      scaleX,
      scaleY
    )


  baseFitScale =
    fitScale *
    props.character.transform.scale


  const effectiveMaxScale =
    getEffectiveMaxUserScale()


  userScaleMultiplier =
    clamp(
      userScaleMultiplier,
      MIN_USER_SCALE,
      effectiveMaxScale
    )


  currentModel.scale.set(
    baseFitScale *
    userScaleMultiplier
  )


  const basePosition =
    getBaseModelPosition()


  currentModel.position.set(
    basePosition.x +
      manualOffsetX,

    basePosition.y +
      manualOffsetY
  )


  keepModelInsideViewport()


  emitModelBounds()


  syncResizeHandle()
}


/*
  ============================================================
  UNLOAD
  ============================================================
*/

function unloadCurrentModel():
  void {
  currentModelHasIdle =
    false


  currentIdleMotionGroup =
    null


  currentModelHasPose =
    false


  currentInitializationMotion =
    null


  modelReady.value =
    false


  resizeHandlePositionReady.value =
    false

  resizeHandleVisible.value =
    false

  resizeDragState =
    null


  isResizing.value =
    false


  lastHoverState =
    false


  emit(
    'hoverChange',
    false
  )


  emit(
    'actionsReady',
    []
  )


  const currentModel =
    model


  if (!currentModel) {
    return
  }


  /*
    Set null trước khi destroy
    để async cursor tracking
    không dùng model cũ.
  */

  model =
    null


  try {
    currentModel
      .internalModel
      .motionManager
      .stopAllMotions()
  }
  catch {
    /*
      Ignore.
    */
  }


  if (
    currentModel.parent
  ) {
    currentModel
      .parent
      .removeChild(
        currentModel
      )
  }


  currentModel.destroy({
    children:
      true,

    texture:
      true,

    baseTexture:
      true
  })
}


/*
  ============================================================
  LOAD CHARACTER
  ============================================================
*/

async function loadCharacter(
  character: CharacterConfig
): Promise<void> {
  const currentApp =
    app


  if (!currentApp) {
    return
  }


  const currentLoadVersion =
    ++loadVersion


  unloadCurrentModel()


  try {
    console.log(
      '============================================================'
    )


    console.log(
      '[Live2D] Loading:',
      character.name
    )


    /*
      STEP 1:
      đọc model3.json.
    */

    const runtimeInfo =
      await discoverModelRuntime(
        character.modelUrl
      )


    if (
      currentLoadVersion !==
      loadVersion
    ) {
      return
    }


    /*
      STEP 2:
      HIYORI PART OPACITY FIX.

      Có Pose:
        Pose quản lý opacity.

      Không Pose:
        cho motion quản lý opacity.
    */

    config.cubism4.setOpacityFromMotion =
      !runtimeInfo.hasPose


    console.log(
      '[Live2D] setOpacityFromMotion:',
      config.cubism4.setOpacityFromMotion
    )


    /*
      STEP 3:
      load Live2D.
    */

    const newModel =
      await Live2DModel.from(
        character.modelUrl,

        {
          autoInteract:
            false
        }
      )


    if (
      currentLoadVersion !==
      loadVersion
    ) {
      newModel.destroy({
        children:
          true,

        texture:
          true,

        baseTexture:
          true
      })


      return
    }


    /*
      App có thể đã destroy
      trong thời gian model load.
    */

    if (
      app !==
      currentApp
    ) {
      newModel.destroy({
        children:
          true,

        texture:
          true,

        baseTexture:
          true
      })


      return
    }


    model =
      newModel


    currentModelHasIdle =
      runtimeInfo.hasIdleMotion


    currentIdleMotionGroup =
      runtimeInfo.idleMotionGroup


    currentModelHasPose =
      runtimeInfo.hasPose


    currentInitializationMotion =
      runtimeInfo.initializationMotion


    console.log(
      '[Live2D] Runtime state:',
      {
        hasIdle:
          currentModelHasIdle,

        idleGroup:
          currentIdleMotionGroup,

        hasPose:
          currentModelHasPose,

        initializationMotion:
          currentInitializationMotion
      }
    )


    newModel.anchor.set(
      0.5,
      0.5
    )


    currentApp.stage.addChild(
      newModel
    )


    modelReady.value =
      true


    /*
      Fit model trước.
    */

    fitCurrentModel()


    emit(
      'actionsReady',
      runtimeInfo.actions
    )


    /*
      Hiyori / no-pose initialization.
    */

    await initializeMotionOnlyModel()


    if (
      currentLoadVersion !==
      loadVersion
    ) {
      return
    }


    /*
      Motion có thể thay đổi
      PartOpacity/bounds.
    */

    keepModelInsideViewport()


    emitModelBounds()


    syncResizeHandle()


    console.log(
      '[Live2D] Loaded:',
      character.name
    )


    console.log(
      '============================================================'
    )
  }
  catch (error) {
    console.error(
      '[Live2D] Failed:',
      error
    )
  }
}


/*
  ============================================================
  INIT PIXI
  ============================================================
*/

onMounted(
  async () => {
    const currentContainer =
      container.value


    if (!currentContainer) {
      return
    }


    ;(window as any).PIXI =
      PIXI


    Live2DModel.registerTicker(
      PIXI.Ticker
    )


    const newApp =
      new PIXI.Application({
        resizeTo:
          currentContainer,

        backgroundAlpha:
          0,

        antialias:
          true,

        autoDensity:
          true,

        resolution:
          Math.min(
            window.devicePixelRatio ||
              1,

            2
          )
      })


    app =
      newApp


    const canvas =
      newApp.view as unknown as HTMLCanvasElement


    currentContainer.appendChild(
      canvas
    )


    /*
      Handle position được sync
      theo Pixi ticker.

      Không phụ thuộc hoàn toàn
      vào cursor polling.
    */

    newApp.ticker.add(
      syncResizeHandle
    )


    window.addEventListener(
      'resize',
      fitCurrentModel
    )


    await loadCharacter(
      props.character
    )


    startCursorTracking()
  }
)


/*
  ============================================================
  CHARACTER CHANGE
  ============================================================
*/

watch(
  () =>
    props.character.id,

  async (
    newCharacterId,
    oldCharacterId
  ) => {
    if (
      newCharacterId !==
      oldCharacterId
    ) {
      resetManualTransform()
    }


    await loadCharacter(
      props.character
    )
  }
)


/*
  ============================================================
  DESTROY
  ============================================================
*/

onBeforeUnmount(
  () => {
    stopCursorTracking()


    loadVersion++


    window.removeEventListener(
      'resize',
      fitCurrentModel
    )


    /*
      Remove ticker callback
      trước khi destroy app.
    */

    if (
      app
    ) {
      app.ticker.remove(
        syncResizeHandle
      )
    }


    unloadCurrentModel()


    if (
      app
    ) {
      app.destroy(
        true,

        {
          children:
            true,

          texture:
            true,

          baseTexture:
            true
        }
      )
    }


    app =
      null
  }
)
</script>


<template>
  <div
    ref="container"
    class="live2d-stage"
  >
    <button
      v-show="
        modelReady &&
        resizeHandlePositionReady &&
        resizeHandleVisible
      "
      ref="resizeHandle"
      class="model-resize-handle"
      :class="{
        'model-resize-handle--active':
          isResizing
      }"
      type="button"
      title="Kéo để phóng to / thu nhỏ model"
      @pointerdown="onResizePointerDown"
      @pointermove="onResizePointerMove"
      @pointerup="finishResize"
      @pointercancel="finishResize"
    >
      <span class="model-resize-handle__icon">
        ⤢
      </span>
    </button>
  </div>
</template>


<style scoped>
/*
  ============================================================
  LIVE2D STAGE
  ============================================================
*/

.live2d-stage {
  position:
    absolute;

  inset:
    0;

  width:
    100%;

  height:
    100%;

  /*
    QUAN TRỌNG:

    Không dùng hidden ở DOM container,
    nếu không resize button có thể
    bị cắt ở mép.

    Canvas Pixi vẫn có kích thước
    500x700 riêng.
  */
  overflow:
    visible;

  background:
    transparent;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  RESIZE HANDLE
  ============================================================
*/

.model-resize-handle {
  position:
    absolute;

  width:
    32px;

  height:
    32px;

  padding:
    0;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  transform:
    translate(
      -50%,
      -50%
    );

  border:
    2px solid
    rgba(
      255,
      255,
      255,
      0.9
    );

  border-radius:
    9px;

  background:
    rgba(
      80,
      65,
      120,
      0.88
    );

  color:
    white;

  box-shadow:
    0 4px 14px
    rgba(
      0,
      0,
      0,
      0.32
    );

  cursor:
    nesw-resize;

  z-index:
    20000;

  touch-action:
    none;

  user-select:
    none;

  pointer-events:
    auto;

  -webkit-app-region:
    no-drag;

  transition:
    transform 120ms ease,
    background 120ms ease;
}


.model-resize-handle:hover {
  background:
    rgba(
      142,
      78,
      220,
      0.95
    );

  transform:
    translate(
      -50%,
      -50%
    )
    scale(
      1.08
    );
}


.model-resize-handle--active {
  background:
    rgba(
      166,
      91,
      240,
      1
    );

  transform:
    translate(
      -50%,
      -50%
    )
    scale(
      1.12
    );
}


.model-resize-handle__icon {
  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  font-size:
    22px;

  font-weight:
    600;

  line-height:
    1;

  /*
    Căn glyph ⤢ vào giữa button.
  */
  transform:
    translateY(-1px);

  pointer-events:
    none;
}
</style>