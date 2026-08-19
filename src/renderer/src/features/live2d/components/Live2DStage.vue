<script setup lang="ts">
import {
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'

import * as PIXI from 'pixi.js'

import {
  ShaderSystem
} from '@pixi/core'

import {
  install as installUnsafeEval
} from '@pixi/unsafe-eval'

import {
  Live2DModel,
  MotionPriority,
  config
} from 'pixi-live2d-display/cubism4'

import type {
  CharacterConfig
} from '../../../characters/types'

import {
  analyzeMotion3Json
} from '../actionClassifier'

import type {
  MotionAnalysis
} from '../actionClassifier'

import {
  MultiActionController
} from '../multiActionController'

import type {
  MultiActionStateSnapshot
} from '../multiActionController'

import {
  ExpressionActionController,
  analyzeExpression3Json
} from '../expressionActionController'

import type {
  ExpressionAnalysis
} from '../expressionActionController'

import type {
  Live2DAction,
  Live2DActionMetadata,
  Live2DActionMode,
  Live2DExpressionAction,
  Live2DMotionAction
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


type RuntimeMotionActionInfo = {
  action:
    Live2DMotionAction

  analysis:
    MotionAnalysis | null
}


type RuntimeExpressionActionInfo = {
  action:
    Live2DExpressionAction

  analysis:
    ExpressionAnalysis | null
}


type ModelRuntimeInfo = {
  actions: Live2DAction[]

  expressionActions:
    RuntimeExpressionActionInfo[]

  motionActions:
    RuntimeMotionActionInfo[]

  hasIdleMotion: boolean

  idleMotionGroup:
    string | null

  hasPose: boolean

  initializationMotion:
    RuntimeMotionRef | null
}


/*
  Chỉ dùng những API Cubism cần cho
  MultiAction.

  Dùng index thay vì string ID trực tiếp
  để tương thích ổn định với Cubism 4.
*/

type CubismCoreModelAdapter = {
  getModel:
    () => {
      parameters: {
        count:
          number

        ids:
          ArrayLike<string>
      }

      parts: {
        count:
          number

        ids:
          ArrayLike<string>
      }
    }

  getParameterValueByIndex:
    (
      index: number
    ) => number

  setParameterValueByIndex:
    (
      index: number,
      value: number,
      weight?: number
    ) => void

  addParameterValueByIndex?:
    (
      index: number,
      value: number,
      weight?: number
    ) => void

  multiplyParameterValueByIndex?:
    (
      index: number,
      value: number,
      weight?: number
    ) => void

  getPartOpacityByIndex:
  (
    index: number
  ) => number

  setPartOpacityByIndex:
  (
    index: number,
    opacity: number
  ) => void
}


type ModelResizeCorner =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'


type SmoothActionTransition = {
  startedAt: number

  durationMs: number

  /*
    Giá trị model đang hiển thị
    ngay trước khi transition bắt đầu.

    null = sẽ lấy baseline ở frame đầu tiên.
  */
  startValue: number | null
}

type ModelResizeState = {
  pointerId: number

  corner:
    ModelResizeCorner

  startDistance: number

  startUserScale: number

  startOffsetX: number
  startOffsetY: number

  /*
    Góc đối diện được giữ cố định.

    Đây là tọa độ GLOBAL
    trong full-screen Pixi canvas.
  */
  fixedX: number
  fixedY: number

  element: HTMLElement
}


/*
  ============================================================
  SETTINGS
  ============================================================
*/

/*
  ============================================================
  ACTION SMOOTH TRANSITION
  ============================================================

  500ms tương đương FadeSecondsAmount = 0.5
  thường dùng trong VTube Studio.

  Đây KHÔNG phải delay.

  Action vẫn bắt đầu ngay lập tức,
  nhưng ảnh hưởng của action sẽ tăng dần
  từ trạng thái hiện tại -> action mới.
*/
const ACTION_TRANSITION_MS =
  500

/*
  Scale nhỏ nhất.
*/
const MIN_USER_SCALE =
  0.4


/*
  Scale lớn nhất.

  4 = 400%.

  Muốn lớn hơn nữa:
  5 = 500%
  6 = 600%
*/
const MAX_USER_SCALE =
  4


/*
  ============================================================
  MODEL FRAME
  ============================================================

  Padding thêm ngoài visual frame.

  0 = không thêm khoảng trống.
*/
const MODEL_FRAME_PADDING =
  0


/*
  model.getBounds() của một số Live2D
  lớn hơn artwork thật.

  Crop giúp đường đỏ ôm sát
  nhân vật hơn.

  Bạn có thể chỉnh 2 số này sau.
*/
const MODEL_FRAME_CROP_X =
  0.20


const MODEL_FRAME_CROP_Y =
  0.04


/*
  Khi cursor gần frame,
  frame không bị ẩn ngay.
*/
const MODEL_FRAME_HOVER_PADDING =
  18


/*
  ============================================================
  PROPS / EVENTS
  ============================================================
*/

const props =
  defineProps<{
    character:
      CharacterConfig

    /*
      Vị trí character-shell
      trong BrowserWindow full-screen.
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

    actionStateChange:
      [state: MultiActionStateSnapshot]

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


const modelFrameElement =
  ref<HTMLDivElement | null>(
    null
  )


const modelReady =
  ref(
    false
  )


const modelFrameReady =
  ref(
    false
  )


const modelFrameVisible =
  ref(
    false
  )


const isResizing =
  ref(
    false
  )


/*
  ============================================================
  PIXI STATE
  ============================================================
*/

let app:
  PIXI.Application | null =
    null


let model:
  Live2DModel | null =
    null


/*
  Scale tự động ban đầu
  để model vừa với vùng 500x700.
*/
let baseFitScale =
  1


/*
  Scale user điều khiển.
*/
let userScaleMultiplier =
  1


/*
  Offset riêng của model.

  Sau này phần Options X/Y
  có thể điều khiển 2 giá trị này.
*/
let manualOffsetX =
  0


let manualOffsetY =
  0


/*
  Runtime model.
*/

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


/*
  ============================================================
  MULTI ACTION STATE
  ============================================================
*/

const multiActionController =
  new MultiActionController()


const expressionActionController =
  new ExpressionActionController()


/*
  ============================================================
  SMOOTH ACTION TRANSITION STATE
  ============================================================

  Controller hiện tại tính ra TARGET cuối cùng.

  Layer này chỉ chịu trách nhiệm:

      trạng thái hiện tại
              ↓
         smooth 500ms
              ↓
        target action

  Nhờ vậy ta KHÔNG phá:
    - MultiAction
    - motion3 duration
    - expression toggle
    - Idle
    - Pose
    - physics
    - focus
*/

const runtimeActionById =
  new Map<
    string,
    Live2DAction
  >()


const parameterTransitions =
  new Map<
    string,
    SmoothActionTransition
  >()


const partOpacityTransitions =
  new Map<
    string,
    SmoothActionTransition
  >()


/*
  Giá trị thực tế mà custom action
  đã ghi ra frame trước.

  Cần cache lại vì frame tiếp theo
  Cubism sẽ chạy Idle / physics / focus
  trước applyMultiActionFrame().
*/
const lastAppliedParameterValues =
  new Map<
    string,
    number
  >()


const lastAppliedPartOpacityValues =
  new Map<
    string,
    number
  >()


/*
  Dùng để phát hiện:

    action vừa bật
    action vừa tắt
    oneshot vừa kết thúc
*/
const previousActiveActionIds =
  new Set<string>()


function easeActionTransition(
  value: number
): number {
  const t =
    clamp(
      value,
      0,
      1
    )


  /*
    Smoothstep.

    Đầu và cuối transition
    đều mềm hơn linear.
  */
  return (
    t *
    t *
    (
      3 -
      2 * t
    )
  )
}


function clearSmoothActionRuntime():
  void {
  runtimeActionById.clear()


  parameterTransitions.clear()


  partOpacityTransitions.clear()


  lastAppliedParameterValues.clear()


  lastAppliedPartOpacityValues.clear()


  previousActiveActionIds.clear()
}


function startSmoothTransitionForAction(
  actionId: string
): void {
  const action =
    runtimeActionById.get(
      actionId
    )


  if (!action) {
    return
  }


  /*
    metadata là optional trong Live2DAction type.

    Một số fallback/native action có thể không có metadata,
    vì vậy không được truy cập trực tiếp:

      action.metadata.parameterIds

    nếu chưa kiểm tra.
  */

  const metadata =
    action.metadata


  if (!metadata) {
    return
  }


  const parameterIds =
    metadata.parameterIds ??
    []


  const partOpacityIds =
    metadata.partOpacityIds ??
    []


  const now =
    performance.now()


  parameterIds.forEach(
    id => {
      parameterTransitions.set(
        id,
        {
          startedAt:
            now,

          durationMs:
            ACTION_TRANSITION_MS,

          /*
            Nếu parameter đang do một action khác
            điều khiển thì bắt đầu từ giá trị
            đang hiển thị hiện tại.

            Nếu chưa từng có action custom
            thì frame đầu tiên sẽ lấy Idle baseline.
          */
          startValue:
            lastAppliedParameterValues
              .get(
                id
              ) ??
            null
        }
      )
    }
  )


  partOpacityIds.forEach(
    id => {
      partOpacityTransitions.set(
        id,
        {
          startedAt:
            now,

          durationMs:
            ACTION_TRANSITION_MS,

          startValue:
            lastAppliedPartOpacityValues
              .get(
                id
              ) ??
            null
        }
      )
    }
  )
}


function resolveSmoothActionValue(
  id: string,

  baselineValue: number,

  targetValue: number,

  transitions:
    Map<
      string,
      SmoothActionTransition
    >,

  lastAppliedValues:
    Map<
      string,
      number
    >,

  now: number
): number {
  const transition =
    transitions.get(
      id
    )


  /*
    Không có transition
    -> controller được quyền ghi target
    trực tiếp như behavior cũ.
  */
  if (!transition) {
    lastAppliedValues.set(
      id,
      targetValue
    )


    return targetValue
  }


  if (
    transition.startValue ===
      null
  ) {
    transition.startValue =
      lastAppliedValues.get(
        id
      ) ??
      baselineValue
  }


  const duration =
    Math.max(
      1,
      transition.durationMs
    )


  const progress =
    (
      now -
      transition.startedAt
    ) /
    duration


  if (
    progress >=
      1
  ) {
    transitions.delete(
      id
    )


    lastAppliedValues.set(
      id,
      targetValue
    )


    return targetValue
  }


  const weight =
    easeActionTransition(
      progress
    )


  const startValue =
    transition.startValue


  const value =
    startValue +
    (
      targetValue -
      startValue
    ) *
    weight


  lastAppliedValues.set(
    id,
    value
  )


  return value
}


const parameterIndexById =
  new Map<
    string,
    number
  >()


const partIndexById =
  new Map<
    string,
    number
  >()


let beforeModelUpdateHandler:
  (() => void) | null =
    null


function getCombinedActionState():
  MultiActionStateSnapshot {
  const motionState =
    multiActionController.getState()


  return {
    activeToggleActionIds: [
      ...motionState.activeToggleActionIds,
      ...expressionActionController
        .getActiveActionIds()
    ],

    activeOneshotActionIds: [
      ...motionState.activeOneshotActionIds
    ]
  }
}


function handleControllerActionStateChange():
  void {
  const state =
    getCombinedActionState()


  const nextActiveActionIds =
    new Set<string>([
      ...state.activeToggleActionIds,

      ...state.activeOneshotActionIds
    ])


  /*
    ==========================================================
    ACTION VỪA BẬT
    ==========================================================

    Ví dụ:

      Idle
        ->
      Wave

    Wave sẽ fade-in thay vì snap.
  */

  nextActiveActionIds.forEach(
    actionId => {
      if (
        previousActiveActionIds.has(
          actionId
        )
      ) {
        return
      }


      startSmoothTransitionForAction(
        actionId
      )
    }
  )


  /*
    ==========================================================
    ACTION VỪA TẮT / ONESHOT VỪA KẾT THÚC
    ==========================================================

    Ví dụ:

      Wave
        ->
      Idle

    cũng smooth 500ms,
    không snap trở về Idle.
  */

  previousActiveActionIds.forEach(
    actionId => {
      if (
        nextActiveActionIds.has(
          actionId
        )
      ) {
        return
      }


      startSmoothTransitionForAction(
        actionId
      )
    }
  )


  previousActiveActionIds.clear()


  nextActiveActionIds.forEach(
    actionId => {
      previousActiveActionIds.add(
        actionId
      )
    }
  )


  emit(
    'actionStateChange',
    state
  )
}


const stopMultiActionStateSubscription =
  multiActionController.subscribe(
    handleControllerActionStateChange
  )


const stopExpressionActionStateSubscription =
  expressionActionController.subscribe(
    handleControllerActionStateChange
  )


/*
  Resize state.
*/

let modelResizeState:
  ModelResizeState | null =
    null


/*
  Frame cache.
*/

let lastModelFrameGlobal:
  ModelBounds | null =
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
  ============================================================
  LOCAL CHARACTER VIEWPORT
  ============================================================

  Character-shell vẫn là 500x700.

  Nó chỉ dùng để:
  - tính scale mặc định
  - tính transform mặc định

  Nó KHÔNG còn là kích thước
  của Pixi renderer.
*/

function getCharacterViewportSize():
  {
    width: number
    height: number
  } {
  const currentContainer =
    container.value


  if (!currentContainer) {
    return {
      width:
        500,

      height:
        700
    }
  }


  return {
    width:
      Math.max(
        1,
        currentContainer.clientWidth
      ),

    height:
      Math.max(
        1,
        currentContainer.clientHeight
      )
  }
}


/*
  ============================================================
  BASE MODEL POSITION
  ============================================================

  Pixi canvas giờ full-screen.

  Vì vậy position model phải là:

      character-shell screen position
              +
      local position trong 500x700
*/

function getBaseModelPosition():
  {
    x: number
    y: number
  } {
  const offset =
    getStageOffset()


  const viewport =
    getCharacterViewportSize()


  return {
    x:
      offset.x +
      viewport.width *
      props.character.transform.x,

    y:
      offset.y +
      viewport.height *
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


  const base =
    getBaseModelPosition()


  manualOffsetX =
    currentModel.position.x -
    base.x


  manualOffsetY =
    currentModel.position.y -
    base.y
}


function resetManualTransform():
  void {
  userScaleMultiplier =
    1


  manualOffsetX =
    0


  manualOffsetY =
    0


  modelResizeState =
    null


  isResizing.value =
    false
}


/*
  ============================================================
  FULL SCREEN CANVAS
  ============================================================

  Đây là phần FIX lỗi model bị cắt.

  Trước:

    Pixi canvas = 500 x 700

  Sau:

    Pixi canvas = toàn BrowserWindow

  Character-shell vẫn 500x700,
  nhưng chỉ dùng làm coordinate anchor.
*/

function syncCanvasPlacement():
  void {
  const currentApp =
    app


  if (!currentApp) {
    return
  }


  const canvas =
    currentApp.view as unknown as HTMLCanvasElement


  const offset =
    getStageOffset()


  /*
    Canvas nằm trong character-shell.

    Character-shell đã translate
    tới stageOffset.

    Vì vậy canvas phải dịch ngược
    -stageOffset để trở lại vị trí
    0,0 của BrowserWindow.
  */

  canvas.style.position =
    'absolute'


  canvas.style.left =
    `${-offset.x}px`


  canvas.style.top =
    `${-offset.y}px`


  canvas.style.width =
    `${window.innerWidth}px`


  canvas.style.height =
    `${window.innerHeight}px`


  canvas.style.pointerEvents =
    'none'


  canvas.style.zIndex =
    '0'
}


function resizeRendererToWindow():
  void {
  const currentApp =
    app


  if (!currentApp) {
    return
  }


  const width =
    Math.max(
      1,
      window.innerWidth
    )


  const height =
    Math.max(
      1,
      window.innerHeight
    )


  currentApp.renderer.resize(
    width,
    height
  )


  syncCanvasPlacement()


  /*
    Renderer resize không được
    tự scale lại model.

    Scale và position là 2 hệ thống riêng.
  */

  repositionModelFromState()


  emitModelBounds()


  syncModelFrame()
}


/*
  ============================================================
  REPOSITION MODEL
  ============================================================

  Khi character-shell được kéo,
  stageOffset thay đổi.

  Canvas vẫn đứng full-screen,
  nên model được cập nhật position
  theo stageOffset mới.
*/

function repositionModelFromState():
  void {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  const base =
    getBaseModelPosition()


  currentModel.position.set(
    base.x +
      manualOffsetX,

    base.y +
      manualOffsetY
  )
}


/*
  ============================================================
  POINTER → FULL SCREEN PIXI
  ============================================================

  Canvas Pixi bây giờ phủ toàn màn hình.

  PointerEvent.clientX/Y chính là
  Pixi screen coordinate.

  Không cần chia theo 500x700 nữa.
*/

function pointerToStage(
  event: PointerEvent
): {
  x: number
  y: number
} {
  return {
    x:
      event.clientX,

    y:
      event.clientY
  }
}


/*
  ============================================================
  VISUAL MODEL FRAME
  ============================================================
*/

function buildVisualFrame(
  bounds: ModelBounds
): ModelBounds {
  const cropRatioX =
    clamp(
      MODEL_FRAME_CROP_X,
      0,
      0.45
    )


  const cropRatioY =
    clamp(
      MODEL_FRAME_CROP_Y,
      0,
      0.45
    )


  const desiredWidth =
    bounds.width *
    (
      1 -
      cropRatioX * 2
    ) +
    MODEL_FRAME_PADDING * 2


  const desiredHeight =
    bounds.height *
    (
      1 -
      cropRatioY * 2
    ) +
    MODEL_FRAME_PADDING * 2


  const width =
    Math.max(
      40,
      desiredWidth
    )


  const height =
    Math.max(
      40,
      desiredHeight
    )


  const centerX =
    bounds.x +
    bounds.width / 2


  const centerY =
    bounds.y +
    bounds.height / 2


  return {
    x:
      centerX -
      width / 2,

    y:
      centerY -
      height / 2,

    width,

    height
  }
}


/*
  ============================================================
  GLOBAL MODEL FRAME
  ============================================================
*/

function getModelFrameGlobal():
  ModelBounds | null {
  const currentModel =
    model


  if (!currentModel) {
    return null
  }


  const bounds =
    currentModel.getBounds()


  if (
    !Number.isFinite(
      bounds.x
    ) ||
    !Number.isFinite(
      bounds.y
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


  return buildVisualFrame({
    x:
      bounds.x,

    y:
      bounds.y,

    width:
      bounds.width,

    height:
      bounds.height
  })
}


/*
  ============================================================
  SYNC DOM FRAME
  ============================================================

  Frame DOM nằm trong character-shell.

  Model bounds là GLOBAL,
  vì vậy phải trừ stageOffset
  để chuyển về LOCAL DOM coordinate.
*/

function syncModelFrame():
  void {
  const frameGlobal =
    getModelFrameGlobal()


  const frameElement =
    modelFrameElement.value


  if (
    !frameGlobal ||
    !frameElement
  ) {
    modelFrameReady.value =
      false


    lastModelFrameGlobal =
      null


    return
  }


  lastModelFrameGlobal =
    frameGlobal


  const offset =
    getStageOffset()


  const localX =
    frameGlobal.x -
    offset.x


  const localY =
    frameGlobal.y -
    offset.y


  frameElement.style.left =
    `${localX}px`


  frameElement.style.top =
    `${localY}px`


  frameElement.style.width =
    `${frameGlobal.width}px`


  frameElement.style.height =
    `${frameGlobal.height}px`


  modelFrameReady.value =
    true
}


/*
  ============================================================
  FRAME HIT TEST
  ============================================================
*/

function pointInsideModelFrame(
  x: number,
  y: number
): boolean {
  const frame =
    lastModelFrameGlobal ??
    getModelFrameGlobal()


  if (!frame) {
    return false
  }


  const padding =
    MODEL_FRAME_HOVER_PADDING


  return (
    x >=
      frame.x -
      padding &&

    x <=
      frame.x +
      frame.width +
      padding &&

    y >=
      frame.y -
      padding &&

    y <=
      frame.y +
      frame.height +
      padding
  )
}


/*
  ============================================================
  OPPOSITE CORNER
  ============================================================
*/

function getOppositeCorner(
  bounds: ModelBounds,
  movingCorner: ModelResizeCorner
): {
  x: number
  y: number
} {
  const left =
    bounds.x


  const top =
    bounds.y


  const right =
    bounds.x +
    bounds.width


  const bottom =
    bounds.y +
    bounds.height


  switch (
    movingCorner
  ) {
    /*
      Kéo top-left
      → bottom-right cố định.
    */

    case 'nw':
      return {
        x:
          right,

        y:
          bottom
      }


    /*
      Kéo top-right
      → bottom-left cố định.
    */

    case 'ne':
      return {
        x:
          left,

        y:
          bottom
      }


    /*
      Kéo bottom-left
      → top-right cố định.
    */

    case 'sw':
      return {
        x:
          right,

        y:
          top
      }


    /*
      Kéo bottom-right
      → top-left cố định.
    */

    case 'se':
      return {
        x:
          left,

        y:
          top
      }
  }
}


/*
  ============================================================
  RESIZE START
  ============================================================
*/

function startModelResize(
  event: PointerEvent,
  corner: ModelResizeCorner
): void {
  const currentModel =
    model


  if (
    !currentModel ||
    !app
  ) {
    return
  }


  if (
    event.button !==
    0
  ) {
    return
  }


  event.preventDefault()
  event.stopPropagation()


  const frame =
    getModelFrameGlobal()


  if (!frame) {
    return
  }


  const pointer =
    pointerToStage(
      event
    )


  const fixedCorner =
    getOppositeCorner(
      frame,
      corner
    )


  const startDistance =
    Math.hypot(
      pointer.x -
      fixedCorner.x,

      pointer.y -
      fixedCorner.y
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


  modelResizeState = {
    pointerId:
      event.pointerId,

    corner,

    startDistance,

    startUserScale:
      userScaleMultiplier,

    startOffsetX:
      manualOffsetX,

    startOffsetY:
      manualOffsetY,

    fixedX:
      fixedCorner.x,

    fixedY:
      fixedCorner.y,

    element
  }


  isResizing.value =
    true


  modelFrameVisible.value =
    true


  lastHoverState =
    true


  emit(
    'hoverChange',
    true
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
  RESIZE MOVE
  ============================================================
*/

function moveModelResize(
  event: PointerEvent
): void {
  const resize =
    modelResizeState


  const currentModel =
    model


  if (
    !resize ||
    !currentModel
  ) {
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
    stopModelResize(
      event
    )

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
      resize.fixedX,

      pointer.y -
      resize.fixedY
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
    resize.startDistance


  if (
    !Number.isFinite(
      ratio
    ) ||
    ratio <=
      0
  ) {
    return
  }


  /*
    ==========================================================
    SCALE MODEL
    ==========================================================

    Không giới hạn theo 500x700 nữa.
  */

  userScaleMultiplier =
    clamp(
      resize.startUserScale *
      ratio,

      MIN_USER_SCALE,

      MAX_USER_SCALE
    )


  currentModel.scale.set(
    baseFitScale *
    userScaleMultiplier
  )


  /*
    Reset về position
    lúc bắt đầu resize.
  */

  const base =
    getBaseModelPosition()


  currentModel.position.set(
    base.x +
      resize.startOffsetX,

    base.y +
      resize.startOffsetY
  )


  /*
    Frame mới sau scale.
  */

  const newFrame =
    getModelFrameGlobal()


  if (!newFrame) {
    return
  }


  const newFixedCorner =
    getOppositeCorner(
      newFrame,
      resize.corner
    )


  /*
    Giữ góc đối diện đứng yên.
  */

  currentModel.position.x +=
    resize.fixedX -
    newFixedCorner.x


  currentModel.position.y +=
    resize.fixedY -
    newFixedCorner.y


  /*
    QUAN TRỌNG:

    KHÔNG:
      keepModelInsideViewport()

    KHÔNG:
      clamp model vào 500x700

    KHÔNG:
      resize Pixi canvas

    Model được phép lớn tự do.
  */

  updateManualOffset()


  emitModelBounds()


  syncModelFrame()
}


/*
  ============================================================
  RESIZE END
  ============================================================
*/

function stopModelResize(
  event?: PointerEvent
): void {
  const resize =
    modelResizeState


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


  modelResizeState =
    null


  isResizing.value =
    false


  updateManualOffset()


  emitModelBounds()


  syncModelFrame()
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


function updateModelHover(
  cursorX: number,
  cursorY: number
): void {
  const currentModel =
    model


  if (!currentModel) {
    modelFrameVisible.value =
      false

    return
  }


  /*
    model.getBounds()
    giờ là GLOBAL coordinate.
  */

  const bounds =
    currentModel.getBounds()


  const frameHovered =
    modelFrameVisible.value &&
    pointInsideModelFrame(
      cursorX,
      cursorY
    )


  const hovered =
    isResizing.value ||

    bounds.contains(
      cursorX,
      cursorY
    ) ||

    frameHovered


  modelFrameVisible.value =
    hovered


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
    /*
      cursor hiện đã relative với
      full-screen BrowserWindow.

      Pixi canvas cũng full-screen.

      Vì vậy KHÔNG trừ stageOffset.
    */

    const cursor =
      await window.api
        .getCursorPosition()


    if (
      model !==
      currentModel
    ) {
      return
    }


    if (
      !isResizing.value
    ) {
      currentModel.focus(
        cursor.x,
        cursor.y
      )
    }


    updateModelHover(
      cursor.x,
      cursor.y
    )
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
  FILE NAME
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
  MOTION RESOURCE URL
  ============================================================
*/

function resolveModelResourceUrl(
  modelUrl: string,
  resourcePath: string
): string {
  const normalizedResourcePath =
    resourcePath.replace(
      /\\/g,
      '/'
    )


  const absoluteModelUrl =
    new URL(
      modelUrl,
      window.location.href
    )


  return new URL(
    normalizedResourcePath,
    absoluteModelUrl
  ).toString()
}


/*
  ============================================================
  FALLBACK MOTION METADATA
  ============================================================
*/

function createFallbackMotionMetadata(
  sourceFile:
    string | null
): Live2DActionMetadata {
  return {
    mode:
      'oneshot',

    suggestedMode:
      'oneshot',

    modeSource:
      'fallback',

    duration:
      null,

    loop:
      false,

    sourceFile,

    parameterIds:
      [],

    partOpacityIds:
      [],

    persistentScore:
      0
  }
}


/*
  ============================================================
  LOAD + ANALYZE EXPRESSION
  ============================================================

  *.exp3.json KHÔNG phải motion theo thời gian.

  Nó là một tập giá trị Parameter tĩnh với Blend:
    - Add
    - Multiply
    - Overwrite

  Vì vậy các expression kiểu:
    - Wave L
    - Wave R
    - Tail Up
    - Hat on
    - Glasses on

  sẽ được xem như toggle state và có thể cùng tồn tại.
*/

async function loadExpressionAnalysis(
  modelUrl: string,
  expressionFile?: string
): Promise<ExpressionAnalysis | null> {
  if (!expressionFile) {
    return null
  }


  try {
    const expressionUrl =
      resolveModelResourceUrl(
        modelUrl,
        expressionFile
      )


    const response =
      await fetch(
        expressionUrl
      )


    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      )
    }


    const expressionJson:
      unknown =
        await response.json()


    return analyzeExpression3Json(
      expressionJson
    )
  }
  catch (error) {
    console.warn(
      `[Live2D] Cannot analyze expression: ${expressionFile}`,
      error
    )


    return null
  }
}


/*
  ============================================================
  LOAD + ANALYZE MOTION
  ============================================================

  Bước 3 chỉ cần metadata.

  Từ Bước 6, MultiActionController cần
  toàn bộ parsed curve để tự evaluate
  motion theo thời gian.
*/

async function loadMotionAnalysis(
  modelUrl: string,
  motionFile?: string
): Promise<MotionAnalysis | null> {
  if (
    !motionFile
  ) {
    return null
  }


  try {
    const motionUrl =
      resolveModelResourceUrl(
        modelUrl,
        motionFile
      )


    const response =
      await fetch(
        motionUrl
      )


    if (
      !response.ok
    ) {
      throw new Error(
        `HTTP ${response.status}`
      )
    }


    const motionJson:
      unknown =
        await response.json()


    return analyzeMotion3Json(
      motionJson,
      motionFile
    )
  }
  catch (error) {
    console.warn(
      `[Live2D] Cannot analyze motion: ${motionFile}`,
      error
    )


    return null
  }
}


/*
  ============================================================
  MULTI ACTION SUPPORT CHECK
  ============================================================

  Motion không có Parameter hoặc PartOpacity
  sẽ tiếp tục dùng native MotionManager.

  Nhờ vậy các motion đặc biệt không có curve
  mà controller hiểu vẫn không bị mất chức năng.
*/

function supportsMultiAction(
  analysis:
    MotionAnalysis
): boolean {
  return analysis.curves.some(
    curve =>
      curve.target ===
        'Parameter' ||
      curve.target ===
        'PartOpacity'
  )
}


/*
  ============================================================
  DISCOVER MODEL
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
    POSE.
  */

  const hasPose =
    typeof fileReferences?.Pose ===
      'string' &&
    fileReferences.Pose.length >
      0


  /*
    EXPRESSIONS.

    QUAN TRỌNG:

    Model trong video của bạn dùng phần lớn action
    dưới dạng *.exp3.json chứ không phải motion3.json.

    Expression của Cubism là trạng thái Parameter tĩnh,
    nên mặc định ta coi chúng là toggle.
  */

  const expressions =
    fileReferences
      ?.Expressions ??
    []


  const expressionActionJobs:
    Promise<RuntimeExpressionActionInfo>[] =
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


      expressionActionJobs.push(
        (
          async (): Promise<RuntimeExpressionActionInfo> => {
            const analysis =
              await loadExpressionAnalysis(
                modelUrl,
                expression.File
              )


            const parameterIds =
              analysis
                ?.parameters
                .map(
                  parameter =>
                    parameter.id
                ) ??
              []


            const action:
              Live2DExpressionAction = {
                id:
                  `expression:${name}:${index}`,

                type:
                  'expression',

                label:
                  name,

                name,

                metadata: {
                  mode:
                    'toggle',

                  suggestedMode:
                    'toggle',

                  modeSource:
                    analysis
                      ? 'auto'
                      : 'fallback',

                  duration:
                    null,

                  loop:
                    false,

                  sourceFile:
                    expression.File ??
                    null,

                  parameterIds,

                  partOpacityIds:
                    [],

                  persistentScore:
                    analysis
                      ? 1
                      : 0
                }
              }


            console.log(
              `[Live2D] Expression ${index} "${name}"`,
              {
                file:
                  expression.File,

                parameters:
                  analysis
                    ?.parameters ??
                  [],

                multiAction:
                  Boolean(
                    analysis &&
                    analysis.parameters.length > 0
                  )
              }
            )


            return {
              action,
              analysis
            }
          }
        )()
      )
    }
  )


  /*
    MOTIONS.
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


  /*
    Mỗi motion được fetch + parse song song.
  */

  const motionActionJobs:
    Promise<RuntimeMotionActionInfo>[] =
      []


  for (
    const [
      group,
      groupMotions
    ] of Object.entries(
      motions
    )
  ) {
    if (
      !Array.isArray(
        groupMotions
      ) ||
      groupMotions.length ===
        0
    ) {
      continue
    }


    /*
      Idle vẫn do native MotionManager quản lý.

      MultiAction chỉ override đúng những
      Parameter / PartOpacity mà action active
      đang sử dụng.
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


      continue
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


        motionActionJobs.push(
          (
            async (): Promise<RuntimeMotionActionInfo> => {
              const analysis =
                await loadMotionAnalysis(
                  modelUrl,
                  motion.File
                )


              /*
                QUY TẮC CỐ ĐỊNH CỦA APP:

                  *.motion3.json
                    = ONESHOT

                  *.exp3.json
                    = TOGGLE

                actionClassifier.ts từ đây chỉ còn dùng để:
                  - parse curve
                  - đọc duration
                  - evaluate motion

                KHÔNG còn dùng persistentScore để quyết định
                action là oneshot hay toggle.
              */

              const analyzedMetadata =
                analysis
                  ?.metadata ??
                createFallbackMotionMetadata(
                  motion.File ??
                  null
                )


              const metadata:
                Live2DActionMetadata = {
                  ...analyzedMetadata,

                  mode:
                    'oneshot',

                  suggestedMode:
                    'oneshot',

                  /*
                    "override" ở đây có nghĩa app rule
                    override heuristic của classifier.
                  */

                  modeSource:
                    'override'
                }


              const action:
                Live2DMotionAction = {
                  id:
                    `motion:${group}:${index}`,

                  type:
                    'motion',

                  label,

                  group,

                  index,

                  metadata
                }


              console.log(
                `[Live2D] Motion ONESHOT ${group}[${index}] "${label}"`,
                {
                  mode:
                    metadata.mode,

                  suggestedMode:
                    metadata.suggestedMode,

                  duration:
                    metadata.duration,

                  loop:
                    metadata.loop,

                  persistentScore:
                    metadata.persistentScore,

                  parameterIds:
                    metadata.parameterIds,

                  partOpacityIds:
                    metadata.partOpacityIds,

                  sourceFile:
                    metadata.sourceFile,

                  multiAction:
                    analysis
                      ? supportsMultiAction(
                          analysis
                        )
                      : false
                }
              )


              return {
                action,

                analysis
              }
            }
          )()
        )
      }
    )
  }


  const [
    expressionActions,
    motionActions
  ] =
    await Promise.all([
      Promise.all(
        expressionActionJobs
      ),

      Promise.all(
        motionActionJobs
      )
    ])


  actions.push(
    ...expressionActions.map(
      item =>
        item.action
    ),

    ...motionActions.map(
      item =>
        item.action
    )
  )


  return {
    actions,

    expressionActions,

    motionActions,

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

  Giữ nguyên fix PartOpacity.
*/

async function initializeMotionOnlyModel():
  Promise<void> {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  if (
    currentModelHasPose ||
    currentModelHasIdle ||
    !currentInitializationMotion
  ) {
    return
  }


  try {
    await currentModel.motion(
      currentInitializationMotion.group,
      currentInitializationMotion.index,
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
  CUBISM TARGET INDEX
  ============================================================

  Ta cache index một lần khi load model.

  Không tìm ID lại mỗi frame.
*/

function clearCubismTargetIndices():
  void {
  parameterIndexById.clear()
  partIndexById.clear()
}


function rebuildCubismTargetIndices(
  targetModel:
    Live2DModel
): void {
  clearCubismTargetIndices()


  const coreModel =
    targetModel
      .internalModel
      .coreModel as unknown as CubismCoreModelAdapter


  const rawModel =
    coreModel.getModel()


  for (
    let index =
      0;

    index <
      rawModel
        .parameters
        .count;

    index++
  ) {
    const id =
      rawModel
        .parameters
        .ids[
          index
        ]


    if (
      typeof id ===
      'string'
    ) {
      parameterIndexById.set(
        id,
        index
      )
    }
  }


  for (
    let index =
      0;

    index <
      rawModel
        .parts
        .count;

    index++
  ) {
    const id =
      rawModel
        .parts
        .ids[
          index
        ]


    if (
      typeof id ===
      'string'
    ) {
      partIndexById.set(
        id,
        index
      )
    }
  }
}


/*
  ============================================================
  APPLY MULTI ACTION FRAME
  ============================================================

  pixi-live2d-display phát beforeModelUpdate
  sau motion / expression / focus / physics / pose.

  Vì vậy chỉ những curve đang active mới
  override giá trị cuối cùng của parameter.

  Những parameter không thuộc active action
  vẫn do Idle / focus / physics / pose quản lý.
*/

function applyMultiActionFrame(
  targetModel:
    Live2DModel
): void {
  if (
    model !==
    targetModel
  ) {
    return
  }


  /*
    ==========================================================
    CONTROLLER TARGET
    ==========================================================

    Controller vẫn làm nhiệm vụ cũ:

      - evaluate motion3 theo thời gian
      - merge MultiAction
      - tạo expression operations

    Nhưng ta KHÔNG ghi chúng thẳng
    vào Cubism nữa.

    Ta tạo một "target frame" trước,
    sau đó blend từ trạng thái hiện tại
    sang target.
  */

  const frame =
    multiActionController.getFrame()


  const expressionFrame =
    expressionActionController.getFrame()


  const hasMotionValues =
    Object.keys(
      frame.parameters
    ).length >
      0 ||
    Object.keys(
      frame.partOpacities
    ).length >
      0


  const hasExpressionValues =
    expressionFrame.operations.length >
      0


  const hasActiveTransition =
    parameterTransitions.size >
      0 ||
    partOpacityTransitions.size >
      0


  if (
    !hasMotionValues &&
    !hasExpressionValues &&
    !hasActiveTransition
  ) {
    return
  }


  const coreModel =
    targetModel
      .internalModel
      .coreModel as unknown as CubismCoreModelAdapter


  const now =
    performance.now()


  /*
    ==========================================================
    BUILD PARAMETER TARGET
    ==========================================================

    Thứ tự vẫn giống code cũ:

      1. motion
      2. expression

    Vì vậy behavior MultiAction cũ
    vẫn được giữ nguyên.
  */

  const targetParameterValues =
    new Map<
      string,
      number
    >()


  /*
    MOTION TARGET.
  */

  Object.entries(
    frame.parameters
  ).forEach(
    ([
      id,
      value
    ]) => {
      if (
        !Number.isFinite(
          value
        )
      ) {
        return
      }


      targetParameterValues.set(
        id,
        value
      )
    }
  )


  /*
    ==========================================================
    EXPRESSION TARGET
    ==========================================================

    Không apply thẳng Add / Multiply /
    Overwrite vào Cubism nữa.

    Ta tính kết quả cuối trước,
    sau đó mới smooth.
  */

  expressionFrame
    .operations
    .forEach(
      operation => {
        const id =
          operation.parameterId


        const index =
          parameterIndexById.get(
            id
          )


        if (
          index ===
          undefined
        ) {
          return
        }


        const currentValue =
          targetParameterValues.has(
            id
          )
            ? (
                targetParameterValues.get(
                  id
                ) as number
              )
            : coreModel
                .getParameterValueByIndex(
                  index
                )


        let nextValue =
          currentValue


        if (
          operation.blend ===
          'Multiply'
        ) {
          nextValue =
            currentValue *
            operation.value
        }
        else if (
          operation.blend ===
          'Overwrite'
        ) {
          nextValue =
            operation.value
        }
        else {
          /*
            Add.
          */

          nextValue =
            currentValue +
            operation.value
        }


        targetParameterValues.set(
          id,
          nextValue
        )
      }
    )


  /*
    ==========================================================
    APPLY SMOOTH PARAMETERS
    ==========================================================
  */

  const parameterIdsToApply =
    new Set<string>([
      ...targetParameterValues.keys(),

      ...parameterTransitions.keys()
    ])


  parameterIdsToApply.forEach(
    id => {
      const index =
        parameterIndexById.get(
          id
        )


      if (
        index ===
        undefined
      ) {
        parameterTransitions.delete(
          id
        )


        lastAppliedParameterValues.delete(
          id
        )


        return
      }


      /*
        Đây là giá trị sau khi:

          Idle
          focus
          physics
          pose
          native motion

        đã chạy trong frame hiện tại.

        Nó chính là baseline.
      */

      const baselineValue =
        coreModel
          .getParameterValueByIndex(
            index
          )


      /*
        Nếu action đã kết thúc thì
        target không còn trong Map.

        Khi đó target = baseline.

        Nhờ vậy action FADE OUT
        về Idle thay vì snap.
      */

      const targetValue =
        targetParameterValues.get(
          id
        ) ??
        baselineValue


      const outputValue =
        resolveSmoothActionValue(
          id,

          baselineValue,

          targetValue,

          parameterTransitions,

          lastAppliedParameterValues,

          now
        )


      coreModel
        .setParameterValueByIndex(
          index,
          outputValue
        )


      /*
        Transition fade-out đã hoàn tất
        và parameter không còn action nào dùng.

        Không cần cache nữa.
      */

      if (
        !targetParameterValues.has(
          id
        ) &&
        !parameterTransitions.has(
          id
        )
      ) {
        lastAppliedParameterValues.delete(
          id
        )
      }
    }
  )


  /*
    ==========================================================
    POSE PROTECTION
    ==========================================================

    Giữ nguyên fix Hiyori.

    Model có Pose:
      KHÔNG cho custom action
      tranh PartOpacity với Pose.
  */

  if (
    currentModelHasPose
  ) {
    partOpacityTransitions.clear()


    lastAppliedPartOpacityValues.clear()


    return
  }


  /*
    ==========================================================
    PART OPACITY TARGET
    ==========================================================
  */

  const targetPartOpacityValues =
    new Map<
      string,
      number
    >()


  Object.entries(
    frame.partOpacities
  ).forEach(
    ([
      id,
      value
    ]) => {
      if (
        !Number.isFinite(
          value
        )
      ) {
        return
      }


      targetPartOpacityValues.set(
        id,
        clamp(
          value,
          0,
          1
        )
      )
    }
  )


  const partOpacityIdsToApply =
    new Set<string>([
      ...targetPartOpacityValues.keys(),

      ...partOpacityTransitions.keys()
    ])


  partOpacityIdsToApply.forEach(
    id => {
      const index =
        partIndexById.get(
          id
        )


      if (
        index ===
        undefined
      ) {
        partOpacityTransitions.delete(
          id
        )


        lastAppliedPartOpacityValues.delete(
          id
        )


        return
      }


      const baselineValue =
        coreModel
          .getPartOpacityByIndex(
            index
          )


      const targetValue =
        targetPartOpacityValues.get(
          id
        ) ??
        baselineValue


      const outputValue =
        resolveSmoothActionValue(
          id,

          baselineValue,

          targetValue,

          partOpacityTransitions,

          lastAppliedPartOpacityValues,

          now
        )


      coreModel
        .setPartOpacityByIndex(
          index,
          clamp(
            outputValue,
            0,
            1
          )
        )


      if (
        !targetPartOpacityValues.has(
          id
        ) &&
        !partOpacityTransitions.has(
          id
        )
      ) {
        lastAppliedPartOpacityValues.delete(
          id
        )
      }
    }
  )
}


/*
  ============================================================
  MULTI ACTION MODEL HOOK
  ============================================================
*/

function detachMultiActionHook(
  targetModel:
    Live2DModel | null
): void {
  if (
    !targetModel ||
    !beforeModelUpdateHandler
  ) {
    beforeModelUpdateHandler =
      null


    return
  }


  try {
    targetModel
      .internalModel
      .off(
        'beforeModelUpdate',
        beforeModelUpdateHandler
      )
  }
  catch {
    /*
      Model đang destroy thì bỏ qua.
    */
  }


  beforeModelUpdateHandler =
    null
}


function attachMultiActionHook(
  targetModel:
    Live2DModel
): void {
  detachMultiActionHook(
    targetModel
  )


  const handler =
    () => {
      applyMultiActionFrame(
        targetModel
      )
    }


  beforeModelUpdateHandler =
    handler


  targetModel
    .internalModel
    .on(
      'beforeModelUpdate',
      handler
    )
}


/*
  ============================================================
  REGISTER MULTI ACTION EXPRESSIONS
  ============================================================
*/

function registerMultiActionExpressions(
  runtimeInfo:
    ModelRuntimeInfo
): void {
  expressionActionController.clearModel()


  runtimeInfo
    .expressionActions
    .forEach(
      item => {
        if (
          !item.analysis ||
          item.analysis.parameters.length ===
            0
        ) {
          return
        }


        expressionActionController
          .registerExpression(
            item.action,
            item.analysis
          )
      }
    )
}


/*
  ============================================================
  REGISTER MULTI ACTION MOTIONS
  ============================================================
*/

function registerMultiActionMotions(
  runtimeInfo:
    ModelRuntimeInfo
): void {
  multiActionController.clearModel()


  runtimeInfo
    .motionActions
    .forEach(
      item => {
        if (
          !item.analysis ||
          !supportsMultiAction(
            item.analysis
          )
        ) {
          return
        }


        multiActionController
          .registerMotion(
            item.action,
            item.analysis
          )


        /*
          Không cho motion3 bị classifier hoặc metadata
          biến thành toggle.

          File type là source of truth:
            motion3 = oneshot.
        */

        multiActionController
          .setModeOverride(
            item.action.id,
            'oneshot'
          )
      }
    )
}


/*
  ============================================================
  ACTION STATE API
  ============================================================
*/

function getActionState():
  MultiActionStateSnapshot {
  return getCombinedActionState()
}


function setActionModeOverride(
  actionId: string,
  _mode:
    Live2DActionMode | null
): void {
  /*
    Action mode không còn do user/classifier chọn.

    Quy tắc cố định:

      motion3 -> oneshot
      exp3    -> toggle

    API này vẫn được giữ để App.vue cũ không bị vỡ type,
    nhưng motion luôn bị ép về oneshot.
  */

  if (
    actionId.startsWith(
      'motion:'
    )
  ) {
    multiActionController
      .setModeOverride(
        actionId,
        'oneshot'
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


  if (
    !currentModel
  ) {
    return
  }


  /*
    ==========================================================
    MULTI ACTION EXPRESSION
    ==========================================================

    Đây là nguyên nhân lỗi thật trong video:

    Wave L / Wave R / Tail Up / Hat on...
    là *.exp3.json, không phải motion3.json.

    ExpressionManager mặc định chỉ chuyển từ expression
    hiện tại sang expression mới, nên action mới làm mất
    action trước.

    Quy tắc app:
      exp3 = toggle vĩnh viễn cho tới khi click lại.

    Nếu expression đã parse được, ta KHÔNG gọi
    currentModel.expression().
  */

  if (
    action.type ===
    'expression'
  ) {
    if (
      expressionActionController.hasAction(
        action.id
      )
    ) {
      /*
        Nếu trước đó từng fallback sang native
        ExpressionManager thì loại bỏ state native
        để nó không chồng lên custom multi-expression.
      */

      currentModel
        .internalModel
        .motionManager
        .expressionManager
        ?.resetExpression()


      const active =
        expressionActionController.trigger(
          action.id
        )


      /*
        Bắt đầu/restart transition ngay cả khi user click lại
        chính action đang active.

        Subscription phía trên vẫn xử lý trường hợp action
        tự tắt hoặc oneshot kết thúc.
      */

      startSmoothTransitionForAction(
        action.id
      )


      console.log(
        `[MultiExpression] ${action.label}`,
        {
          active,
          activeExpressionIds:
            expressionActionController
              .getActiveActionIds()
        }
      )


      return
    }


    /*
      File exp3 không đọc được:
      fallback về behavior cũ.
    */

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



  /*
    ==========================================================
    MULTI ACTION MOTION
    ==========================================================

    Nếu motion đã parse được curve:
      KHÔNG gọi currentModel.motion().

    Controller sẽ tự:
      - chạy motion đúng 1 lần
      - tự kết thúc sau Duration
      - evaluate mỗi frame
      - merge với action khác

    motion3 KHÔNG BAO GIỜ là toggle.
  */

  if (
    multiActionController.hasAction(
      action.id
    )
  ) {
    /*
      ========================================================
      EXCLUSIVE ONESHOT
      ========================================================

      Quy tắc:

        motion3 = oneshot

      Chỉ cho phép MỘT oneshot motion chạy tại một thời điểm.

      Nếu A đang chạy và user bấm B:

        A stop ngay
        -> state của A bị remove
        -> nút A tự tắt
        -> B bắt đầu ngay

      Expression (*.exp3.json) dùng controller riêng,
      vì vậy các toggle expression đang bật KHÔNG bị ảnh hưởng.

      Nếu user click lại chính action đang chạy,
      không stopAll() ở đây để trigger() có thể restart action đó
      theo behavior hiện tại của MultiActionController.
    */

    const currentMotionState =
      multiActionController.getState()


    const hasDifferentActiveOneshot =
      currentMotionState
        .activeOneshotActionIds
        .some(
          activeActionId =>
            activeActionId !==
            action.id
        )


    if (
      hasDifferentActiveOneshot
    ) {
      /*
        MultiActionController hiện chỉ quản lý motion3
        và app đã ép toàn bộ motion3 thành oneshot.

        Vì vậy stopAll() ở đây chính là:
          stop action ngắn cũ trước khi chạy action mới.

        Subscription sẽ emit state mới,
        nên App.vue / ModelPicker sẽ tự bỏ active
        khỏi nút action cũ.
      */

      multiActionController
        .stopAll()
    }


    /*
      Trigger action mới NGAY LẬP TỨC sau khi action cũ dừng.
      Không có setTimeout / delay.
    */

    const result =
      multiActionController.trigger(
        action.id
      )


    /*
      Luôn restart smooth transition khi click motion.

      - A -> B:
          B bắt đầu ngay, transition mềm từ pose hiện tại.

      - click lại A:
          restart transition dù activeActionIds có thể không đổi.
    */

    startSmoothTransitionForAction(
      action.id
    )


    if (
      result
    ) {
      console.log(
        `[MultiAction] ${action.label}`,
        {
          mode:
            result.mode,

          active:
            result.active,

          activeToggleActionIds:
            result
              .state
              .activeToggleActionIds,

          activeOneshotActionIds:
            result
              .state
              .activeOneshotActionIds
        }
      )
    }


    return
  }


  /*
    ==========================================================
    NATIVE FALLBACK
    ==========================================================

    Nếu motion3.json không đọc được,
    hoặc motion không có Parameter /
    PartOpacity curve mà controller hỗ trợ,
    giữ behavior cũ để action vẫn chạy.
  */

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


  /*
    Tắt toàn bộ toggle + oneshot
    trước khi reset native motion.
  */

  multiActionController
    .stopAll()


  expressionActionController
    .stopAll()


  const motionManager =
    currentModel
      .internalModel
      .motionManager


  motionManager
    .stopAllMotions()


  motionManager
    .expressionManager
    ?.resetExpression()


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


  await loadCharacter(
    props.character
  )
}


defineExpose({
  runAction,
  resetReaction,
  getActionState,
  setActionModeOverride
})


/*
  ============================================================
  EMIT MODEL BOUNDS
  ============================================================

  App.vue vẫn cần LOCAL bounds
  để đặt:
  - drag zone
  - React
  - Models
  - Reset

  Vì vậy lấy global bounds
  rồi trừ stageOffset.
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


  const offset =
    getStageOffset()


  emit(
    'modelBoundsChange',
    {
      x:
        bounds.x -
        offset.x,

      y:
        bounds.y -
        offset.y,

      width:
        bounds.width,

      height:
        bounds.height
    }
  )
}


/*
  ============================================================
  INITIAL FIT
  ============================================================

  Chỉ dùng để tính scale ban đầu.

  Dù Pixi canvas full-screen,
  model mặc định vẫn fit theo
  character viewport 500x700.
*/

function fitCurrentModel():
  void {
  const currentModel =
    model


  if (!currentModel) {
    return
  }


  const viewport =
    getCharacterViewportSize()


  currentModel.scale.set(
    1
  )


  const modelWidth =
    currentModel.width


  const modelHeight =
    currentModel.height


  if (
    modelWidth <=
      0 ||
    modelHeight <=
      0
  ) {
    return
  }


  const scaleX =
    viewport.width /
    modelWidth


  const scaleY =
    viewport.height /
    modelHeight


  baseFitScale =
    Math.min(
      scaleX,
      scaleY
    ) *
    props.character
      .transform
      .scale


  userScaleMultiplier =
    clamp(
      userScaleMultiplier,
      MIN_USER_SCALE,
      MAX_USER_SCALE
    )


  currentModel.scale.set(
    baseFitScale *
    userScaleMultiplier
  )


  repositionModelFromState()


  /*
    KHÔNG clamp vào 500x700.

    Đây là thay đổi quan trọng.
  */

  emitModelBounds()


  syncModelFrame()
}


/*
  ============================================================
  UNLOAD MODEL
  ============================================================
*/

function unloadCurrentModel():
  void {
  /*
    Xóa toàn bộ transition/action cache của model cũ.

    Nếu không clear ở đây:
      - transition cũ có thể leak sang model mới
      - runtimeActionById giữ metadata của model cũ
      - clearSmoothActionRuntime() bị báo unused
  */

  clearSmoothActionRuntime()


  /*
    Không để action model cũ leak sang
    model mới.
  */

  multiActionController
    .clearModel()


  clearCubismTargetIndices()


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


  modelFrameReady.value =
    false


  modelFrameVisible.value =
    false


  modelResizeState =
    null


  isResizing.value =
    false


  lastModelFrameGlobal =
    null


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


  multiActionController
    .clearModel()


  expressionActionController
    .clearModel()


  const currentModel =
    model


  if (!currentModel) {
    beforeModelUpdateHandler =
      null


    return
  }


  detachMultiActionHook(
    currentModel
  )


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
      Ignore cleanup error.
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
      ========================================================
      CACHE ACTION METADATA FOR SMOOTH TRANSITION
      ========================================================

      startSmoothTransitionForAction() cần biết mỗi action
      đang tác động lên Parameter / PartOpacity nào.

      Cache phải được tạo lại sau mỗi lần load character.
    */

    runtimeActionById.clear()


    runtimeInfo
      .actions
      .forEach(
        action => {
          runtimeActionById.set(
            action.id,
            action
          )
        }
      )


    previousActiveActionIds.clear()


    /*
      Hiyori PartOpacity fix.
    */

    config
      .cubism4
      .setOpacityFromMotion =
        !runtimeInfo.hasPose


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
      loadVersion ||
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


    /*
      Đăng ký parsed expressions + motions
      cho hai controller độc lập.
    */

    registerMultiActionExpressions(
      runtimeInfo
    )


    registerMultiActionMotions(
      runtimeInfo
    )


    /*
      Cache Parameter / Part index và gắn hook
      ngay trước Cubism model.update().
    */

    rebuildCubismTargetIndices(
      newModel
    )


    attachMultiActionHook(
      newModel
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


    fitCurrentModel()


    emit(
      'actionsReady',
      runtimeInfo.actions
    )


    await initializeMotionOnlyModel()


    if (
      currentLoadVersion !==
      loadVersion
    ) {
      return
    }


    emitModelBounds()


    syncModelFrame()
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
  STAGE OFFSET CHANGE
  ============================================================

  App.vue kéo character-shell
  bằng translate3d.

  Pixi canvas giờ full-screen,
  nên khi stageOffset thay đổi
  ta cập nhật cả:

  1. vị trí canvas
  2. vị trí model
*/

function handleStageOffsetChange():
  void {
  syncCanvasPlacement()


  repositionModelFromState()


  emitModelBounds()


  syncModelFrame()
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


    /*
      ========================================================
      FULL-SCREEN PIXI RENDERER
      ========================================================

      Không dùng:

        resizeTo: container

      vì container chỉ 500x700.

      Renderer phải phủ toàn BrowserWindow.
    */

    const newApp =
      new PIXI.Application({
        width:
          Math.max(
            1,
            window.innerWidth
          ),

        height:
          Math.max(
            1,
            window.innerHeight
          ),

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
      Đưa canvas về global 0,0.
    */

    syncCanvasPlacement()


    /*
      Khung đỏ đi theo model/motion.
    */

    newApp.ticker.add(
      syncModelFrame
    )


    window.addEventListener(
      'resize',
      resizeRendererToWindow
    )


    window.addEventListener(
      'pointerup',
      stopModelResize
    )


    window.addEventListener(
      'pointercancel',
      stopModelResize
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
  STAGE OFFSET WATCH
  ============================================================

  Character drag trong App.vue
  thay characterX/Y.

  Khi chúng đổi,
  model Pixi cũng phải đi theo.
*/

watch(
  () => [
    props.stageOffset?.x ??
      0,

    props.stageOffset?.y ??
      0
  ],

  () => {
    handleStageOffsetChange()
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
      resizeRendererToWindow
    )


    window.removeEventListener(
      'pointerup',
      stopModelResize
    )


    window.removeEventListener(
      'pointercancel',
      stopModelResize
    )


    if (
      app
    ) {
      app.ticker.remove(
        syncModelFrame
      )
    }


    unloadCurrentModel()


    stopMultiActionStateSubscription()


    stopExpressionActionStateSubscription()


    multiActionController
      .destroy()


    expressionActionController
      .destroy()


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

    <!--
      =========================================================
      MODEL FRAME
      =========================================================

      Khung đỏ tự bám theo model.

      4 nút tròn ở 4 góc:
      - NW
      - NE
      - SW
      - SE

      Giữ và kéo để scale model.
    -->

    <div
      v-show="
        modelReady &&
        modelFrameReady &&
        modelFrameVisible
      "
      ref="modelFrameElement"
      class="model-resize-frame"
    >

      <!--
        =======================================================
        TOP LEFT
        =======================================================
      -->

      <button
        class="
          model-resize-handle
          model-resize-handle--nw
        "
        type="button"
        title="Kéo để phóng to / thu nhỏ model"
        @pointerdown="
          startModelResize(
            $event,
            'nw'
          )
        "
        @pointermove="
          moveModelResize
        "
        @pointerup="
          stopModelResize
        "
        @pointercancel="
          stopModelResize
        "
      />


      <!--
        =======================================================
        TOP RIGHT
        =======================================================
      -->

      <button
        class="
          model-resize-handle
          model-resize-handle--ne
        "
        type="button"
        title="Kéo để phóng to / thu nhỏ model"
        @pointerdown="
          startModelResize(
            $event,
            'ne'
          )
        "
        @pointermove="
          moveModelResize
        "
        @pointerup="
          stopModelResize
        "
        @pointercancel="
          stopModelResize
        "
      />


      <!--
        =======================================================
        BOTTOM LEFT
        =======================================================
      -->

      <button
        class="
          model-resize-handle
          model-resize-handle--sw
        "
        type="button"
        title="Kéo để phóng to / thu nhỏ model"
        @pointerdown="
          startModelResize(
            $event,
            'sw'
          )
        "
        @pointermove="
          moveModelResize
        "
        @pointerup="
          stopModelResize
        "
        @pointercancel="
          stopModelResize
        "
      />


      <!--
        =======================================================
        BOTTOM RIGHT
        =======================================================
      -->

      <button
        class="
          model-resize-handle
          model-resize-handle--se
        "
        type="button"
        title="Kéo để phóng to / thu nhỏ model"
        @pointerdown="
          startModelResize(
            $event,
            'se'
          )
        "
        @pointermove="
          moveModelResize
        "
        @pointerup="
          stopModelResize
        "
        @pointercancel="
          stopModelResize
        "
      />

    </div>

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
    Cho khung và handle
    có thể vượt khỏi vùng 500x700.
  */

  overflow:
    visible;

  background:
    transparent;

  pointer-events:
    none;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  MODEL FRAME
  ============================================================
*/

.model-resize-frame {
  position:
    absolute;

  box-sizing:
    border-box;

  border:
    2px solid
    rgba(
      255,
      82,
      96,
      0.96
    );

  border-radius:
    12px;

  box-shadow:
    0 0 0 1px
    rgba(
      255,
      255,
      255,
      0.30
    );

  /*
    Bản thân đường đỏ không
    bắt chuột.

    4 nút tròn sẽ bắt chuột.
  */

  pointer-events:
    none;

  z-index:
    20000;
}


/*
  ============================================================
  RESIZE HANDLE - COMMON
  ============================================================

  4 chấm tròn ở 4 góc.
*/

.model-resize-handle {
  position:
    absolute;

  width:
    16px;

  height:
    16px;

  padding:
    0;

  /*
    Tâm của button nằm chính xác
    trên góc đường đỏ.
  */

  transform:
    translate(
      -50%,
      -50%
    );

  border:
    2px solid
    rgba(
      255,
      82,
      96,
      1
    );

  border-radius:
    50%;

  background:
    rgba(
      255,
      255,
      255,
      1
    );

  box-shadow:
    0 3px 10px
    rgba(
      0,
      0,
      0,
      0.30
    );

  z-index:
    21000;

  pointer-events:
    auto;

  touch-action:
    none;

  user-select:
    none;

  -webkit-app-region:
    no-drag;

  transition:
    transform 100ms ease,
    background 100ms ease,
    box-shadow 100ms ease;
}


/*
  ============================================================
  TOP LEFT
  ============================================================
*/

.model-resize-handle--nw {
  left:
    0;

  top:
    0;

  cursor:
    nwse-resize;
}


/*
  ============================================================
  TOP RIGHT
  ============================================================
*/

.model-resize-handle--ne {
  left:
    100%;

  top:
    0;

  cursor:
    nesw-resize;
}


/*
  ============================================================
  BOTTOM LEFT
  ============================================================
*/

.model-resize-handle--sw {
  left:
    0;

  top:
    100%;

  cursor:
    nesw-resize;
}


/*
  ============================================================
  BOTTOM RIGHT
  ============================================================
*/

.model-resize-handle--se {
  left:
    100%;

  top:
    100%;

  cursor:
    nwse-resize;
}


/*
  ============================================================
  HOVER
  ============================================================
*/

.model-resize-handle:hover {
  transform:
    translate(
      -50%,
      -50%
    )
    scale(
      1.18
    );

  background:
    rgba(
      255,
      230,
      233,
      1
    );

  box-shadow:
    0 4px 13px
    rgba(
      0,
      0,
      0,
      0.38
    );
}


/*
  ============================================================
  ACTIVE
  ============================================================

  Khi đang giữ chuột trên handle.
*/

.model-resize-handle:active {
  transform:
    translate(
      -50%,
      -50%
    )
    scale(
      1.08
    );

  background:
    rgba(
      255,
      205,
      211,
      1
    );
}
</style>