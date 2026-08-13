<script setup lang="ts">
import type {
  CharacterConfig
} from '@renderer/characters/types'


const props =
  defineProps<{
    models:
      CharacterConfig[]

    selectedId:
      string

    defaultId:
      string

    importing:
      boolean

    /*
      Chỉ ID nằm trong đây
      mới có nút delete.

      Akari built-in sẽ không
      nằm trong deletableIds.
    */
    deletableIds:
      string[]

    /*
      ID model đang xóa.
    */
    deletingId:
      string | null
  }>()


const emit =
  defineEmits<{
    (
      event:
        'select',

      model:
        CharacterConfig
    ): void


    (
      event:
        'import'
    ): void


    (
      event:
        'delete',

      model:
        CharacterConfig
    ): void


    (
      event:
        'close'
    ): void
  }>()


function canDelete(
  modelId: string
): boolean {
  return props
    .deletableIds
    .includes(
      modelId
    )
}
</script>


<template>
  <div
    class="model-picker"
    @click.stop
  >
    <!-- ==================================================
         HEADER
         ================================================== -->
    <div class="picker-header">
      <div class="title-area">
        <h2>
          Models
        </h2>

        <p>
          Choose your character
        </p>
      </div>


      <button
        type="button"
        class="close-button"
        title="Close"
        @click="
          emit('close')
        "
      >
        ×
      </button>
    </div>


    <!-- ==================================================
         MODEL LIST
         ================================================== -->
    <div class="model-list">
      <div
        v-for="
          model in models
        "
        :key="
          model.id
        "
        class="model-item"
        :class="{
          selected:
            selectedId ===
            model.id
        }"
      >
        <!--
          Phần click để SELECT MODEL.
        -->
        <button
          type="button"
          class="model-select-button"
          @click="
            emit(
              'select',
              model
            )
          "
        >
          <!-- AVATAR -->
          <div class="model-avatar">
            {{
              model.name
                .charAt(0)
                .toUpperCase()
            }}
          </div>


          <!-- MODEL INFO -->
          <div class="model-info">
            <strong>
              {{
                model.name
              }}
            </strong>


            <span
              v-if="
                model.id ===
                defaultId
              "
              class="
                model-badge
                default-badge
              "
            >
              Default
            </span>


            <span
              v-else-if="
                canDelete(
                  model.id
                )
              "
              class="
                model-badge
                imported-badge
              "
            >
              Imported
            </span>
          </div>
        </button>


        <!-- ==================================================
             RIGHT SIDE ACTIONS
             ================================================== -->
        <div class="model-actions">
          <!-- DELETE BUTTON -->
          <button
            v-if="
              canDelete(
                model.id
              )
            "
            type="button"
            class="delete-button"
            :disabled="
              deletingId ===
              model.id
            "
            :title="
              `Delete ${model.name}`
            "
            @click.stop="
              emit(
                'delete',
                model
              )
            "
          >
            <span
              v-if="
                deletingId !==
                model.id
              "
            >
              ×
            </span>

            <span v-else>
              …
            </span>
          </button>


          <!-- CURRENT MODEL -->
          <span
            v-if="
              selectedId ===
              model.id
            "
            class="selected-check"
          >
            ✓
          </span>
        </div>
      </div>
    </div>


    <!-- DIVIDER -->
    <div class="divider" />


    <!-- ==================================================
         IMPORT MODEL
         ================================================== -->
    <button
      type="button"
      class="import-button"
      :disabled="
        importing
      "
      @click="
        emit('import')
      "
    >
      <span class="plus">
        +
      </span>

      <span>
        {{
          importing
            ? 'Importing...'
            : 'Import Model'
        }}
      </span>
    </button>


    <p class="import-hint">
      Select a Live2D
      <strong>.model3.json</strong>
      file.
    </p>
  </div>
</template>


<style scoped>
.model-picker {
  width: 290px;

  box-sizing: border-box;

  padding: 18px;

  border:
    1px solid
    rgba(255, 255, 255, 0.15);

  border-radius: 24px;

  background:
    rgba(18, 17, 29, 0.95);

  backdrop-filter:
    blur(20px);

  box-shadow:
    0 18px 50px
    rgba(0, 0, 0, 0.45);

  color: white;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  HEADER
  ============================================================
*/

.picker-header {
  display: flex;

  align-items:
    flex-start;

  justify-content:
    space-between;

  gap: 12px;
}


.title-area h2 {
  margin: 0;

  font-size: 24px;

  line-height: 1;
}


.title-area p {
  margin:
    6px 0 0;

  color:
    rgba(255, 255, 255, 0.55);

  font-size: 12px;
}


.close-button {
  width: 38px;
  height: 38px;

  display: flex;

  align-items: center;

  justify-content: center;

  flex-shrink: 0;

  padding: 0;

  border: 0;

  border-radius: 50%;

  background:
    rgba(255, 255, 255, 0.07);

  color: white;

  font-size: 24px;

  font-weight: 600;

  line-height: 1;

  cursor: pointer;

  transition:
    background 0.15s ease,
    transform 0.15s ease;

  -webkit-app-region:
    no-drag;
}


.close-button:hover {
  background:
    rgba(255, 255, 255, 0.14);

  transform:
    scale(1.05);
}


/*
  ============================================================
  MODEL LIST
  ============================================================
*/

.model-list {
  display: flex;

  flex-direction: column;

  gap: 10px;

  margin-top: 18px;
}


.model-item {
  min-height: 72px;

  display: flex;

  align-items: center;

  box-sizing: border-box;

  overflow: hidden;

  border:
    1px solid
    transparent;

  border-radius: 18px;

  background:
    rgba(255, 255, 255, 0.055);

  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}


.model-item:hover {
  background:
    rgba(255, 255, 255, 0.09);
}


.model-item.selected {
  border-color:
    rgba(142, 93, 255, 0.95);

  background:
    rgba(103, 66, 189, 0.28);
}


/*
  Phần chính để chọn model.
*/
.model-select-button {
  min-width: 0;

  flex: 1;

  display: flex;

  align-items: center;

  gap: 12px;

  align-self: stretch;

  padding:
    10px 4px 10px 10px;

  border: 0;

  background:
    transparent;

  color: white;

  text-align: left;

  cursor: pointer;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  AVATAR
  ============================================================
*/

.model-avatar {
  width: 50px;
  height: 50px;

  flex:
    0 0 50px;

  display: flex;

  align-items: center;

  justify-content: center;

  border-radius: 15px;

  background:
    linear-gradient(
      135deg,
      #8758e8,
      #d64db7
    );

  color: white;

  font-size: 21px;

  font-weight: 700;
}


/*
  ============================================================
  MODEL INFO
  ============================================================
*/

.model-info {
  min-width: 0;

  display: flex;

  flex-direction: column;

  align-items:
    flex-start;

  gap: 5px;
}


.model-info strong {
  max-width: 120px;

  overflow: hidden;

  text-overflow: ellipsis;

  white-space: nowrap;

  font-size: 16px;
}


.model-badge {
  display: inline-flex;

  align-items: center;

  padding:
    2px 7px;

  border-radius:
    999px;

  font-size: 10px;

  line-height: 1.2;
}


.default-badge {
  background:
    rgba(82, 196, 111, 0.25);

  color:
    #a3f3ad;
}


.imported-badge {
  background:
    rgba(255, 255, 255, 0.08);

  color:
    rgba(255, 255, 255, 0.5);
}


/*
  ============================================================
  MODEL RIGHT ACTIONS
  ============================================================
*/

.model-actions {
  flex:
    0 0 auto;

  display: flex;

  align-items: center;

  gap: 7px;

  padding-right: 10px;
}


/*
  ============================================================
  DELETE
  ============================================================
*/

.delete-button {
  width: 30px;
  height: 30px;

  display: flex;

  align-items: center;

  justify-content: center;

  padding: 0;

  border:
    1px solid
    rgba(255, 76, 96, 0.34);

  border-radius: 9px;

  background:
    rgba(255, 55, 78, 0.09);

  color:
    #ff576d;

  font-size: 21px;

  font-weight: 700;

  line-height: 1;

  cursor: pointer;

  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    transform 0.15s ease;

  -webkit-app-region:
    no-drag;
}


.delete-button:hover:not(
  :disabled
) {
  background:
    rgba(255, 55, 78, 0.22);

  border-color:
    rgba(255, 86, 105, 0.8);

  transform:
    scale(1.07);
}


.delete-button:active:not(
  :disabled
) {
  transform:
    scale(0.95);
}


.delete-button:disabled {
  opacity: 0.4;

  cursor: default;
}


/*
  ============================================================
  SELECTED CHECK
  ============================================================
*/

.selected-check {
  width: 20px;

  flex:
    0 0 20px;

  color:
    #aa83ff;

  font-size: 23px;

  font-weight: 700;

  text-align: center;
}


/*
  ============================================================
  DIVIDER
  ============================================================
*/

.divider {
  height: 1px;

  margin:
    16px 0;

  background:
    rgba(255, 255, 255, 0.13);
}


/*
  ============================================================
  IMPORT BUTTON
  ============================================================
*/

.import-button {
  width: 100%;

  height: 55px;

  display: flex;

  align-items: center;

  justify-content: center;

  gap: 9px;

  padding: 0;

  border:
    1px solid
    rgba(180, 130, 255, 0.55);

  border-radius: 16px;

  background:
    linear-gradient(
      135deg,
      rgba(100, 64, 190, 0.95),
      rgba(161, 62, 157, 0.95)
    );

  color: white;

  font-size: 15px;

  font-weight: 700;

  cursor: pointer;

  transition:
    opacity 0.15s ease,
    transform 0.15s ease;

  -webkit-app-region:
    no-drag;
}


.import-button:hover:not(
  :disabled
) {
  transform:
    translateY(-1px);
}


.import-button:disabled {
  opacity: 0.5;

  cursor: default;
}


.plus {
  font-size: 24px;

  line-height: 1;
}


.import-hint {
  margin:
    10px 0 0;

  text-align: center;

  color:
    rgba(255, 255, 255, 0.38);

  font-size: 10px;
}
</style>