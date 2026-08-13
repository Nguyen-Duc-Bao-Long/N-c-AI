<script setup lang="ts">
import {
  computed,
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


/*
  ============================================================
  MODEL LIBRARY
  ============================================================
*/

/*
  Built-in models.

  Hiện tại chỉ có Akari.
*/
const builtInModels:
  CharacterConfig[] =
    Object.values(
      characters
    )


/*
  Models user đã import.
*/
const importedModels =
  ref<CharacterConfig[]>([])


/*
  Built-in + Imported.
*/
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

  Chỉ importedModels mới được xóa.

  Akari built-in không nằm trong
  danh sách này nên ModelPicker
  sẽ không hiện dấu X ở Akari.
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


/*
  Model hiện đang trong
  quá trình delete.
*/
const deletingModelId =
  ref<string | null>(
    null
  )


/*
  Model mặc định luôn là Akari.
*/
const currentCharacterId =
  ref<string>(
    DEFAULT_CHARACTER_ID
  )


/*
  Config character hiện tại.
*/
const currentCharacter =
  computed<CharacterConfig>(
    () => {
      const found =
        availableModels.value
          .find(
            (
              item
            ) =>
              item.id ===
              currentCharacterId.value
          )


      /*
        Nếu model hiện tại không tồn tại,
        fallback về Akari.
      */
      return (
        found ??
        characters[
          DEFAULT_CHARACTER_ID
        ]
      )
    }
  )


/*
  Load danh sách imported model
  khi app bắt đầu.
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
  LIVE2D STAGE
  ============================================================
*/

const live2dStage =
  ref<Live2DStageHandle | null>(
    null
  )


const actions =
  ref<Live2DAction[]>([])


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
  computed(() => {
    const bounds =
      modelBounds.value


    if (!bounds) {
      return {
        left:
          '65%',

        top:
          '38%'
      }
    }


    const gap =
      8


    let left =
      bounds.x +
      bounds.width +
      gap


    let top =
      bounds.y +
      bounds.height *
        0.30


    /*
      Nếu không đủ chỗ bên phải,
      đặt controls bên trái model.
    */
    if (
      left + 105 >
      window.innerWidth
    ) {
      left =
        bounds.x -
        105 -
        gap
    }


    left =
      Math.max(
        8,
        Math.min(
          left,
          window.innerWidth -
            105
        )
      )


    top =
      Math.max(
        8,
        Math.min(
          top,
          window.innerHeight -
            150
        )
      )


    return {
      left:
        `${left}px`,

      top:
        `${top}px`
    }
  })


/*
  ============================================================
  MODEL PICKER POSITION
  ============================================================
*/

const modelPickerStyle =
  computed(() => {
    const bounds =
      modelBounds.value


    /*
      ModelPicker.vue mới có width 290px.
    */
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


    /*
      Không đủ chỗ bên phải
      → panel sang trái model.
    */
    if (
      left +
        panelWidth >
      window.innerWidth
    ) {
      left =
        bounds.x -
        panelWidth -
        gap
    }


    left =
      Math.max(
        8,
        Math.min(
          left,
          window.innerWidth -
            panelWidth -
            8
        )
      )


    let top =
      bounds.y +
      bounds.height *
        0.10


    top =
      Math.max(
        8,
        Math.min(
          top,
          window.innerHeight -
            450
        )
      )


    return {
      left:
        `${left}px`,

      top:
        `${top}px`
    }
  })


/*
  ============================================================
  UI STATE
  ============================================================
*/

const controlsVisible =
  ref(false)


/*
  Ghi nhớ con trỏ hiện tại
  có đang nằm trên model hay không.
*/
const isModelHovered =
  ref(false)


const reactionWheelOpen =
  ref(false)


const modelPickerOpen =
  ref(false)


const modelImporting =
  ref(false)


let hideControlsTimer:
  number | null =
    null


function clearHideTimer():
  void {
  if (
    hideControlsTimer === null
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
  /*
    Luôn lưu trạng thái hover hiện tại.
  */
  isModelHovered.value =
    hovered


  /*
    Hủy timer cũ để tránh timer
    từ thao tác trước ẩn menu sai lúc.
  */
  clearHideTimer()


  /*
    Nếu chuột đang nằm trên model,
    luôn hiện controls.
  */
  if (hovered) {
    controlsVisible.value =
      true

    return
  }


  /*
    Nếu Reaction Wheel hoặc
    Model Picker đang mở,
    không được ẩn controls.
  */
  if (
    reactionWheelOpen.value ||
    modelPickerOpen.value
  ) {
    return
  }


  /*
    Khi thật sự ra khỏi model,
    chờ một chút để người dùng
    có thể rê sang buttons.
  */
  hideControlsTimer =
    window.setTimeout(
      () => {
        /*
          Kiểm tra LẠI trạng thái
          trước khi ẩn.

          Điều này tránh race condition.
        */
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
  /*
    Nếu vẫn hover model thì
    không được phép ẩn menu.
  */
  if (
    isModelHovered.value
  ) {
    controlsVisible.value =
      true

    return
  }


  /*
    Nếu có panel đang mở
    cũng không được ẩn.
  */
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
        /*
          Kiểm tra lại sau 300ms.
        */
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


  /*
    Hủy timer cũ từ trước khi
    Reaction Wheel mở.
  */
  clearHideTimer()


  /*
    Nếu chuột hiện vẫn nằm trên model,
    controls phải xuất hiện lại ngay.
  */
  if (
    isModelHovered.value
  ) {
    controlsVisible.value =
      true

    return
  }


  /*
    Nếu chuột không nằm trên model
    thì mới cho phép tự ẩn.
  */
  scheduleControlsHide()
}


async function selectAction(
  action: Live2DAction
): Promise<void> {
  /*
    Không cho controls biến mất
    trong lúc action đang bắt đầu.
  */
  keepControlsVisible()


  await live2dStage.value
    ?.runAction(
      action
    )


  closeReactionWheel()
}


async function resetReaction():
  Promise<void> {
  clearHideTimer()


  await live2dStage.value
    ?.resetReaction()


  reactionWheelOpen.value =
    false


  /*
    Sau Reset vẫn giữ controls
    nếu chuột đang nằm trên model.
  */
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


  /*
    Live2DStage đang watch
    props.character.id,
    nên chỉ cần đổi ID.
  */
  currentCharacterId.value =
    selectedModel.id


  /*
    Reaction của model cũ
    phải xóa ngay.
  */
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
      User bấm Cancel.
    */
    if (!imported) {
      return
    }


    console.log(
      '[Models] Model imported:',
      imported
    )


    /*
      Tránh duplicate
      trong UI hiện tại.
    */
    const exists =
      importedModels.value
        .some(
          (
            item
          ) =>
            item.id ===
            imported.id
        )


    if (!exists) {
      importedModels.value.push(
        imported
      )
    }


    /*
      Chuyển ngay sang model
      vừa import.
    */
    currentCharacterId.value =
      imported.id


    /*
      Xóa actions model cũ.
    */
    actions.value =
      []


    /*
      Đóng Model Picker.
    */
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

  Luồng:

  ModelPicker
      ↓
  @delete
      ↓
  deleteModel()
      ↓
  window.api.deleteModel(id)
      ↓
  preload
      ↓
  IPC models:delete
      ↓
  main/index.ts
      ↓
  xóa folder + index.json
*/

async function deleteModel(
  model: CharacterConfig
): Promise<void> {
  /*
    Chỉ model nằm trong
    importedModels mới được xóa.

    Như vậy Akari built-in
    không thể bị xóa.
  */
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


  if (
    !importedModel
  ) {
    console.warn(
      '[Models] Cannot delete built-in model:',
      model.id
    )

    return
  }


  /*
    Nếu đang có một model
    được delete thì không chạy thêm.
  */
  if (
    deletingModelId.value !==
    null
  ) {
    return
  }


  deletingModelId.value =
    model.id


  try {
    /*
      Gọi backend.

      Backend sẽ hiện hộp thoại:

      Cancel / Delete
    */
    const deleted =
      await window.api
        .deleteModel(
          model.id
        )


    /*
      User chọn Cancel.
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
      Nếu model đang bị xóa
      chính là model đang hiển thị...
    */
    if (
      currentCharacterId.value ===
      model.id
    ) {
      /*
        Đóng Reaction Wheel cũ.
      */
      reactionWheelOpen.value =
        false


      /*
        Xóa React actions
        của model bị xóa.
      */
      actions.value =
        []


      /*
        Chuyển về model mặc định Akari.
      */
      currentCharacterId.value =
        DEFAULT_CHARACTER_ID
    }


    /*
      Xóa model khỏi danh sách
      trong Vue ngay lập tức.
    */
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


    /*
      Giữ Model Picker mở để user
      thấy model vừa biến mất.
    */
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
  STARTUP
  ============================================================
*/

onMounted(
  async () => {
    await loadImportedModels()
  }
)
</script>


<template>
  <main class="desktop-stage">

    <div class="character-area">

      <!-- =====================
           LIVE2D
           ===================== -->

      <Live2DStage
        ref="live2dStage"

        :character="
          currentCharacter
        "

        @hover-change="
          handleModelHover
        "

        @actions-ready="
          handleActionsReady
        "

        @model-bounds-change="
          handleModelBounds
        "
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

          :style="
            reactionControlStyle
          "

          @mouseenter="
            keepControlsVisible
          "

          @mouseleave="
            scheduleControlsHide
          "
        >

          <!-- React -->
          <button
            v-if="
              actions.length > 0
            "

            class="
              control-button
              react-button
            "

            type="button"

            @click="
              openReactionWheel
            "
          >
            <span class="button-icon">
              ✦
            </span>

            React
          </button>


          <!-- Models -->
          <button
            class="
              control-button
              models-button
            "

            type="button"

            @click="
              openModelPicker
            "
          >
            <span class="button-icon">
              ◉
            </span>

            Models
          </button>


          <!-- Reset -->
          <button
            class="
              control-button
              reset-button
            "

            type="button"

            @click="
              resetReaction
            "
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
        v-if="
          modelPickerOpen
        "

        class="model-picker-container"

        :style="
          modelPickerStyle
        "
      >

        <ModelPicker
          :models="
            availableModels
          "

          :selected-id="
            currentCharacterId
          "

          :default-id="
            DEFAULT_CHARACTER_ID
          "

          :importing="
            modelImporting
          "

          :deletable-ids="
            deletableModelIds
          "

          :deleting-id="
            deletingModelId
          "

          @select="
            selectModel
          "

          @import="
            importModel
          "

          @delete="
            deleteModel
          "

          @close="
            closeModelPicker
          "
        />

      </div>


      <!-- =====================
           REACTION WHEEL
           ===================== -->

      <ReactionWheel
        v-if="
          reactionWheelOpen
        "

        :actions="
          actions
        "

        @select="
          selectAction
        "

        @close="
          closeReactionWheel
        "
      />

    </div>

  </main>
</template>


<style scoped>
.desktop-stage {
  position: fixed;

  inset: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;

  background:
    transparent;
}


.character-area {
  position: absolute;

  inset: 0;

  width: 100%;
  height: 100%;

  cursor: move;

  -webkit-app-region:
    drag;

  user-select:
    none;
}


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

  color: white;

  display: flex;

  align-items: center;

  justify-content:
    center;

  gap: 7px;

  font-size: 12px;

  font-weight: 700;

  cursor: pointer;

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
  font-size: 16px;
}


/*
  React nổi bật nhất.
*/
.react-button {
  min-height: 44px;

  font-size: 14px;

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
  Models.
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
  Reset ít nổi bật hơn.
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
  opacity: 1;
}


/*
  ============================================================
  MODEL PICKER
  ============================================================
*/

.model-picker-container {
  position: absolute;

  z-index: 12000;

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
  opacity: 0;

  transform:
    translateX(-5px)
    scale(0.94);
}
</style>