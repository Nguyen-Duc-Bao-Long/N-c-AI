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

  hasPose: boolean

  /*
    Motion đầu tiên không phải Idle.

    Với model kiểu Hiyori:
    dùng một lần sau khi load
    để áp dụng PartOpacity.
  */
  initializationMotion:
    RuntimeMotionRef | null
}


/*
  ============================================================
  PROPS / EVENTS
  ============================================================
*/

const props =
  defineProps<{
    character: CharacterConfig
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
  PIXI / LIVE2D STATE
  ============================================================
*/

const container =
  ref<HTMLDivElement | null>(
    null
  )


let app:
  PIXI.Application | null =
    null


let model:
  Live2DModel | null =
    null


/*
  Runtime metadata
  của model hiện tại.
*/

let currentModelHasIdle =
  false


let currentModelHasPose =
  false


let currentInitializationMotion:
  RuntimeMotionRef | null =
    null


/*
  Dùng để tránh race condition
  khi đổi model liên tục.
*/
let loadVersion =
  0


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
  x: number,
  y: number
): void {
  if (!model) {
    return
  }


  const bounds =
    model.getBounds()


  const hovered =
    bounds.contains(
      x,
      y
    )


  /*
    Chỉ emit khi trạng thái
    hover thực sự thay đổi.
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
  if (
    !model ||
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
      Model nhìn theo chuột.
    */
    model.focus(
      cursor.x,
      cursor.y
    )


    /*
      Detect hover.
    */
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


  /*
    Khoảng 30 FPS.
  */
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


  /*
    Happy.exp3.json
          ↓
    Happy

    Happy.motion3.json
          ↓
    Happy
  */
  return fileName.replace(
    /\.(?:exp3|motion3)\.json$/i,
    ''
  )
}


/*
  ============================================================
  DISCOVER MODEL RUNTIME
  ============================================================

  Đọc model3.json trước khi
  Live2DModel.from().

  Xác định:

  - Expressions
  - Motions
  - Idle
  - Pose
  - initialization motion
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


  /*
    Không tách "as Model3Json"
    xuống dòng để tránh Vue parser lỗi.
  */
  const json: Model3Json = await response.json()


  const fileReferences =
    json.FileReferences


  const actions:
    Live2DAction[] =
      []


  /*
    ==========================================================
    POSE
    ==========================================================
  */

  const hasPose =
    typeof fileReferences?.Pose ===
      'string' &&
    fileReferences.Pose.length >
      0


  /*
    ==========================================================
    EXPRESSIONS
    ==========================================================
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
      let name: string


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
    ==========================================================
    MOTIONS
    ==========================================================
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
      /*
        Ignore group rỗng.
      */
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
        ======================================================
        IDLE
        ======================================================

        Idle là motion hệ thống,
        không hiện trong React.
      */

      if (
        group
          .toLowerCase() ===
        'idle'
      ) {
        hasIdleMotion =
          true

        return
      }


      /*
        ======================================================
        REACT MOTIONS
        ======================================================
      */

      groupMotions.forEach(
        (
          motion,
          index
        ) => {
          /*
            Motion đầu tiên không phải Idle
            được dùng để initialize model
            không có Pose + không có Idle.
          */
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


          let label: string


          /*
            Nếu một group có nhiều motion:

            Happy 1
            Happy 2

            Nếu chỉ một:

            Happy
          */
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


          /*
            Nếu group tên quá chung,
            hiển thị tên file.
          */
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


  /*
    ==========================================================
    DEBUG
    ==========================================================
  */

  console.log(
    '[Live2D] Has Idle:',
    hasIdleMotion
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

    hasPose,

    initializationMotion
  }
}


/*
  ============================================================
  INITIALIZE MODEL
  ============================================================

  Dành cho model kiểu Hiyori:

  - không có Pose
  - không có Idle
  - motion có PartOpacity

  Sau khi setOpacityFromMotion = true,
  chạy motion đầu tiên một lần để
  PartArmA / PartArmB nhận opacity.
*/

async function initializeMotionOnlyModel():
  Promise<void> {
  if (!model) {
    return
  }


  /*
    Model có Pose:
    để Pose tự quản lý PartOpacity.
  */
  if (
    currentModelHasPose
  ) {
    return
  }


  /*
    Model có Idle thật:
    không cần initialization workaround.
  */
  if (
    currentModelHasIdle
  ) {
    return
  }


  if (
    !currentInitializationMotion
  ) {
    console.log(
      '[Live2D] No initialization motion'
    )

    return
  }


  console.log(
    '[Live2D] Initializing no-pose/no-idle model:',
    currentInitializationMotion
  )


  try {
    /*
      FORCE để chắc chắn motion chạy.

      Với Hiyori:
      curve PartArmA / PartArmB
      sẽ được áp dụng.
    */
    await model.motion(
      currentInitializationMotion.group,
      currentInitializationMotion.index,
      MotionPriority.FORCE
    )


    console.log(
      '[Live2D] Initialization motion started'
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
  RUN REACTION
  ============================================================
*/

async function runAction(
  action: Live2DAction
): Promise<void> {
  if (!model) {
    return
  }


  console.log(
    '[Live2D] Run action:',
    action
  )


  /*
    ==========================================================
    EXPRESSION
    ==========================================================
  */

  if (
    action.type ===
    'expression'
  ) {
    try {
      await model.expression(
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
    MOTION
    ==========================================================

    *.motion3.json luôn chạy
    bằng model.motion().

    Không quan trọng file nằm trong:

    animations/
    motions/
    expressions/
  */

  try {
    await model.motion(
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
  if (!model) {
    return
  }


  console.log(
    '[Live2D] Reset reaction'
  )


  const motionManager =
    model
      .internalModel
      .motionManager


  /*
    Dừng motion hiện tại.
  */
  motionManager
    .stopAllMotions()


  /*
    Reset Expression.
  */
  motionManager
    .expressionManager
    ?.resetExpression()


  /*
    ==========================================================
    CASE 1
    MODEL CÓ IDLE
    ==========================================================
  */

  if (
    currentModelHasIdle
  ) {
    try {
      await model.motion(
        'Idle',
        0,
        MotionPriority.IDLE
      )


      console.log(
        '[Live2D] Idle restarted'
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
    ==========================================================
    CASE 2
    KHÔNG IDLE + KHÔNG POSE
    ==========================================================

    Ví dụ Hiyori.

    Chạy lại initialization motion
    để phục hồi PartOpacity.
  */

  if (
    !currentModelHasPose &&
    currentInitializationMotion
  ) {
    try {
      await model.motion(
        currentInitializationMotion.group,
        currentInitializationMotion.index,
        MotionPriority.FORCE
      )


      console.log(
        '[Live2D] Initialization motion restarted:',
        currentInitializationMotion
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
    ==========================================================
    CASE 3
    KHÔNG CÓ BASELINE
    ==========================================================

    Reload model.
  */

  console.log(
    '[Live2D] No Idle/init motion - reload model'
  )


  await loadCharacter(
    props.character
  )
}


/*
  App.vue có thể gọi:

  live2dStage.runAction()
  live2dStage.resetReaction()
*/
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
  if (!model) {
    return
  }


  const bounds =
    model.getBounds()


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
  MODEL TRANSFORM
  ============================================================
*/

function fitCurrentModel():
  void {
  if (
    !app ||
    !model
  ) {
    return
  }


  /*
    Reset scale trước khi đo.
  */
  model.scale.set(
    1
  )


  const modelWidth =
    model.width


  const modelHeight =
    model.height


  if (
    modelWidth <=
      0 ||
    modelHeight <=
      0
  ) {
    return
  }


  const scaleX =
    app.screen.width /
    modelWidth


  const scaleY =
    app.screen.height /
    modelHeight


  const fitScale =
    Math.min(
      scaleX,
      scaleY
    )


  const finalScale =
    fitScale *
    props
      .character
      .transform
      .scale


  model.scale.set(
    finalScale
  )


  model.position.set(
    app.screen.width *
      props
        .character
        .transform
        .x,

    app.screen.height *
      props
        .character
        .transform
        .y
  )


  emitModelBounds()
}


/*
  ============================================================
  UNLOAD CURRENT MODEL
  ============================================================
*/

function unloadCurrentModel():
  void {
  /*
    Reset runtime metadata.
  */

  currentModelHasIdle =
    false


  currentModelHasPose =
    false


  currentInitializationMotion =
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


  if (!model) {
    return
  }


  /*
    Dừng motion trước khi destroy.
  */
  try {
    model
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
    model.parent
  ) {
    model.parent
      .removeChild(
        model
      )
  }


  model.destroy({
    children:
      true,

    texture:
      true,

    baseTexture:
      true
  })


  model =
    null
}


/*
  ============================================================
  LOAD CHARACTER
  ============================================================
*/

async function loadCharacter(
  character:
    CharacterConfig
): Promise<void> {
  if (!app) {
    return
  }


  const currentLoadVersion =
    ++loadVersion


  /*
    Xóa model cũ.
  */
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
      ========================================================
      STEP 1
      ĐỌC MODEL3.JSON
      ========================================================
    */

    const runtimeInfo =
      await discoverModelRuntime(
        character.modelUrl
      )


    /*
      Nếu user chọn model khác
      trong lúc fetch.
    */
    if (
      currentLoadVersion !==
      loadVersion
    ) {
      return
    }


    /*
      ========================================================
      STEP 2
      CONFIGURE PART OPACITY
      ========================================================

      Có Pose:
        Pose quản lý opacity.

      Không có Pose:
        motion3 được phép quản lý
        PartOpacity trực tiếp.

      Hiyori:
        hasPose = false
        → true
    */

    config.cubism4.setOpacityFromMotion =
      !runtimeInfo.hasPose


    console.log(
      '[Live2D] setOpacityFromMotion:',
      config.cubism4.setOpacityFromMotion
    )


    /*
      ========================================================
      STEP 3
      LOAD LIVE2D MODEL
      ========================================================
    */

    const newModel =
      await Live2DModel.from(
        character.modelUrl,
        {
          autoInteract:
            false
        }
      )


    /*
      Nếu user đổi model
      trong lúc load.
    */
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
      Model hiện tại.
    */
    model =
      newModel


    /*
      Runtime metadata.
    */
    currentModelHasIdle =
      runtimeInfo.hasIdleMotion


    currentModelHasPose =
      runtimeInfo.hasPose


    currentInitializationMotion =
      runtimeInfo.initializationMotion


    console.log(
      '[Live2D] Runtime state:',
      {
        hasIdle:
          currentModelHasIdle,

        hasPose:
          currentModelHasPose,

        initializationMotion:
          currentInitializationMotion
      }
    )


    /*
      Anchor giữa model.
    */
    model.anchor.set(
      0.5,
      0.5
    )


    /*
      Add vào Pixi Stage.
    */
    app.stage.addChild(
      model
    )


    /*
      Scale + position.
    */
    fitCurrentModel()


    /*
      ========================================================
      STEP 4
      SEND REACT ACTIONS
      ========================================================
    */

    console.log(
      '[Live2D] Actions:',
      runtimeInfo.actions
    )


    emit(
      'actionsReady',
      runtimeInfo.actions
    )


    /*
      ========================================================
      STEP 5
      INITIALIZE PART OPACITY
      ========================================================

      Với Hiyori:

      - no Pose
      - no Idle
      - có PartArmA / PartArmB
        trong motion3

      → chạy motion đầu tiên một lần.
    */

    await initializeMotionOnlyModel()


    /*
      Nếu user đổi model
      trong khi initialize.
    */
    if (
      currentLoadVersion !==
      loadVersion
    ) {
      return
    }


    /*
      Recalculate bounds.
    */
    emitModelBounds()


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
    if (
      !container.value
    ) {
      return
    }


    /*
      Expose PIXI.
    */
    ;(window as any).PIXI =
      PIXI


    /*
      Register Pixi ticker.
    */
    Live2DModel
      .registerTicker(
        PIXI.Ticker
      )


    /*
      Create Pixi Application.
    */
    app =
      new PIXI.Application({
        resizeTo:
          container.value,

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


    /*
      Keep cast on one line.
    */
    const canvas = app.view as unknown as HTMLCanvasElement


    container
      .value
      .appendChild(
        canvas
      )


    /*
      Resize.
    */
    window.addEventListener(
      'resize',
      fitCurrentModel
    )


    /*
      Load initial model.
    */
    await loadCharacter(
      props.character
    )


    /*
      Cursor tracking.
    */
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

  async () => {
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


    /*
      Hủy request load cũ.
    */
    loadVersion++


    window.removeEventListener(
      'resize',
      fitCurrentModel
    )


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
  />
</template>


<style scoped>
.live2d-stage {
  position: absolute;

  inset: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;

  background:
    transparent;
}
</style>