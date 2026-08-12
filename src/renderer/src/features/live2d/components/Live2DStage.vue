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
  MotionPriority
} from 'pixi-live2d-display/cubism4'

import type {
  CharacterConfig
} from '../../../characters/types'

import type {
  Live2DAction
} from '../types'


/*
  Patch PixiJS để chạy với CSP của Electron.
*/
installUnsafeEval({
  ShaderSystem
})


/*
  ============================
  TYPES
  ============================
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
}


type Model3Json = {
  FileReferences?: {
    Expressions?: Model3Expression[]

    Motions?: Record<
      string,
      Model3Motion[]
    >
  }
}


/*
  ============================
  PROPS / EVENTS
  ============================
*/

const props = defineProps<{
  character: CharacterConfig
}>()


const emit = defineEmits<{
  hoverChange: [hovered: boolean]

  actionsReady: [actions: Live2DAction[]]

  modelBoundsChange: [bounds: ModelBounds]
}>()


/*
  ============================
  PIXI / LIVE2D
  ============================
*/

const container =
  ref<HTMLDivElement | null>(null)


let app:
  PIXI.Application | null = null


let model:
  Live2DModel | null = null


/*
  Dùng để tránh race condition
  khi đổi model.
*/
let loadVersion = 0


/*
  ============================
  CURSOR TRACKING
  ============================
*/

let cursorTrackingTimer:
  number | null = null


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
    Chỉ emit khi trạng thái thay đổi.
  */
  if (
    hovered !==
    lastHoverState
  ) {
    lastHoverState =
      hovered


    emit(
      'hoverChange',
      hovered
    )
  }
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
      Cho model nhìn theo chuột.
    */
    model.focus(
      cursor.x,
      cursor.y
    )


    /*
      Kiểm tra chuột có nằm
      trên model hay không.
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
    cursorTrackingTimer !== null
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
    cursorTrackingTimer === null
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
  ============================
  ACTION DISCOVERY
  ============================
*/

function fileNameWithoutExtension(
  path: string
): string {
  const fileName =
    path
      .split('/')
      .pop() ?? path


  return fileName.replace(
    /\.exp3\.json$/i,
    ''
  )
}


async function discoverActions(
  modelUrl: string
): Promise<Live2DAction[]> {
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


  const actions:
    Live2DAction[] = []


  /*
    ==========================
    EXPRESSIONS
    ==========================
  */

  const expressions =
    json
      .FileReferences
      ?.Expressions ?? []


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
    ==========================
    MOTIONS
    ==========================
  */

  const motions:
    Record<
      string,
      Model3Motion[]
    > =
      json
        .FileReferences
        ?.Motions ?? {}


  Object.entries(
    motions
  ).forEach(
    ([
      group,
      groupMotions
    ]) => {
      /*
        Idle không hiện trong
        Reaction Wheel.
      */
      if (
        group.toLowerCase() ===
        'idle'
      ) {
        return
      }


      groupMotions.forEach(
        (
          _motion,
          index
        ) => {
          const label =
            groupMotions.length > 1
              ? `${group} ${index + 1}`
              : group


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


  return actions
}


/*
  ============================
  RUN REACTION
  ============================
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
    Expression.
  */
  if (
    action.type ===
    'expression'
  ) {
    await model.expression(
      action.name
    )

    return
  }


  /*
    Motion.
  */
  await model.motion(
    action.group,
    action.index,
    MotionPriority.FORCE
  )
}


/*
  ============================
  RESET REACTION
  ============================

  QUAN TRỌNG:
  Hàm này nằm ngoài runAction().
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
    Dừng Love / Shock / motion
    đang chạy.
  */
  motionManager
    .stopAllMotions()


  /*
    Reset expression:
    EyesLove,
    EyesCry,
    SignAngry,
    SignShock...
  */
  motionManager
    .expressionManager
    ?.resetExpression()


  /*
    Chạy lại Idle đầu tiên
    trong group Idle.
  */
  await model.motion(
    'Idle',
    0,
    MotionPriority.IDLE
  )
}


/*
  Cho App.vue gọi được:
  - runAction()
  - resetReaction()
*/
defineExpose({
  runAction,
  resetReaction
})


/*
  ============================
  MODEL BOUNDS
  ============================
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
  ============================
  MODEL TRANSFORM
  ============================
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
  model.scale.set(1)


  const modelWidth =
    model.width


  const modelHeight =
    model.height


  if (
    modelWidth <= 0 ||
    modelHeight <= 0
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
    props.character
      .transform
      .scale


  model.scale.set(
    finalScale
  )


  model.position.set(
    app.screen.width *
      props.character
        .transform
        .x,

    app.screen.height *
      props.character
        .transform
        .y
  )


  /*
    Gửi bounds cho App.vue
    để React/Reset bám gần model.
  */
  emitModelBounds()
}


/*
  ============================
  UNLOAD MODEL
  ============================
*/

function unloadCurrentModel():
  void {
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


  if (
    model.parent
  ) {
    model.parent.removeChild(
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
  ============================
  LOAD CHARACTER
  ============================
*/

async function loadCharacter(
  character: CharacterConfig
): Promise<void> {
  if (!app) {
    return
  }


  const currentLoadVersion =
    ++loadVersion


  unloadCurrentModel()


  try {
    console.log(
      '[Live2D] Loading:',
      character.name
    )


    const newModel =
      await Live2DModel.from(
        character.modelUrl,
        {
          autoInteract:
            false
        }
      )


    /*
      Nếu model khác được yêu cầu
      trong lúc đang load.
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


    model =
      newModel


    /*
      Anchor giữa model.
    */
    model.anchor.set(
      0.5,
      0.5
    )


    /*
      Add vào PIXI Stage.
    */
    app.stage.addChild(
      model
    )


    /*
      Scale + position.
    */
    fitCurrentModel()


    /*
      Đọc Expressions + Motions
      từ model3.json.
    */
    const actions =
      await discoverActions(
        character.modelUrl
      )


    console.log(
      '[Live2D] Actions:',
      actions
    )


    emit(
      'actionsReady',
      actions
    )


    console.log(
      '[Live2D] Loaded:',
      character.name
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
  ============================
  INIT PIXI
  ============================
*/

onMounted(
  async () => {
    if (
      !container.value
    ) {
      return
    }


    /*
      Cho pixi-live2d-display
      truy cập PIXI.
    */
    ;(window as any).PIXI =
      PIXI


    Live2DModel
      .registerTicker(
        PIXI.Ticker
      )


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
      PixiJS 6 typing fix.
    */
    const canvas = app.view as unknown as HTMLCanvasElement

    container.value.appendChild(
      canvas
    )


    /*
      Khi window resize,
      fit lại model.
    */
    window.addEventListener(
      'resize',
      fitCurrentModel
    )


    /*
      Load model ban đầu.
    */
    await loadCharacter(
      props.character
    )


    /*
      Bắt đầu nhìn theo chuột.
    */
    startCursorTracking()
  }
)


/*
  ============================
  CHARACTER CHANGE
  ============================
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
  ============================
  DESTROY
  ============================
*/

onBeforeUnmount(
  () => {
    stopCursorTracking()


    /*
      Hủy load request cũ.
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

  background: transparent;
}
</style>