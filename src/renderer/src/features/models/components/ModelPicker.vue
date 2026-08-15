<script setup lang="ts">
import type {
  CharacterConfig
} from '../../../characters/types'


/*
  ============================================================
  PROPS
  ============================================================
*/

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

    deletableIds:
      string[]

    deletingId:
      string | null
  }>()


/*
  ============================================================
  EMITS
  ============================================================
*/

const emit =
  defineEmits<{
    select:
      [model: CharacterConfig]

    import:
      []

    delete:
      [model: CharacterConfig]

    close:
      []
  }>()


/*
  ============================================================
  HELPERS
  ============================================================
*/

function isSelected(
  model: CharacterConfig
): boolean {
  return (
    model.id ===
    props.selectedId
  )
}


function isDefault(
  model: CharacterConfig
): boolean {
  return (
    model.id ===
    props.defaultId
  )
}


function isDeletable(
  model: CharacterConfig
): boolean {
  return props
    .deletableIds
    .includes(
      model.id
    )
}


function isDeleting(
  model: CharacterConfig
): boolean {
  return (
    props.deletingId ===
    model.id
  )
}


/*
  ============================================================
  MODEL SELECT
  ============================================================
*/

function selectModel(
  model: CharacterConfig
): void {
  if (
    isDeleting(
      model
    )
  ) {
    return
  }


  emit(
    'select',
    model
  )
}


/*
  ============================================================
  MODEL DELETE
  ============================================================

  Chỉ model KHÔNG được chọn
  mới hiện nút ×.

  Vì vậy selected model
  không thể vừa có ✓ vừa có ×.
*/

function deleteModel(
  event: MouseEvent,
  model: CharacterConfig
): void {
  event.preventDefault()
  event.stopPropagation()


  if (
    isSelected(
      model
    )
  ) {
    return
  }


  if (
    !isDeletable(
      model
    )
  ) {
    return
  }


  if (
    isDeleting(
      model
    )
  ) {
    return
  }


  emit(
    'delete',
    model
  )
}
</script>


<template>
  <section class="model-picker">

    <!--
      =========================================================
      HEADER
      =========================================================
    -->

    <header class="model-picker__header">

      <div class="model-picker__heading">

        <h2 class="model-picker__title">
          Models
        </h2>

        <p class="model-picker__subtitle">
          Choose your character
        </p>

      </div>


      <button
        class="model-picker__close"
        type="button"
        title="Close"
        @click="emit('close')"
      >
        ×
      </button>

    </header>


    <!--
      =========================================================
      MODEL LIST
      =========================================================
    -->

    <div class="model-picker__list">

      <button
        v-for="model in models"
        :key="model.id"
        class="model-card"
        :class="{
          'model-card--selected':
            isSelected(model),

          'model-card--deleting':
            isDeleting(model)
        }"
        type="button"
        @click="
          selectModel(
            model
          )
        "
      >

        <!-- =====================
             AVATAR
             ===================== -->

        <div class="model-card__avatar">
          {{
            model.name
              .charAt(0)
              .toUpperCase()
          }}
        </div>


        <!-- =====================
             INFO
             ===================== -->

        <div class="model-card__content">

          <div class="model-card__name">
            {{ model.name }}
          </div>


          <div class="model-card__meta">

            <span
              v-if="
                isDefault(
                  model
                )
              "
              class="
                model-card__badge
                model-card__badge--default
              "
            >
              Default
            </span>


            <span
              v-else-if="
                isDeletable(
                  model
                )
              "
              class="
                model-card__badge
                model-card__badge--imported
              "
            >
              Imported
            </span>

          </div>

        </div>


        <!--
          =====================================================
          RIGHT ACTION
          =====================================================

          QUAN TRỌNG:

          selected
               ↓
               ✓

          imported + not selected
               ↓
               ×

          Không bao giờ hiện cả hai.
        -->

        <div class="model-card__action">

          <!-- =====================
               SELECTED
               ===================== -->

          <span
            v-if="
              isSelected(
                model
              )
            "
            class="
              model-card__status-icon
              model-card__status-icon--selected
            "
            title="Selected"
          >
            ✓
          </span>


          <!-- =====================
               DELETE
               ===================== -->

          <button
            v-else-if="
              isDeletable(
                model
              )
            "
            class="
              model-card__status-icon
              model-card__status-icon--delete
            "
            :class="{
              'model-card__status-icon--loading':
                isDeleting(
                  model
                )
            }"
            type="button"
            :disabled="
              isDeleting(
                model
              )
            "
            title="Delete model"
            @click="
              deleteModel(
                $event,
                model
              )
            "
          >
            {{
              isDeleting(model)
                ? '…'
                : '×'
            }}
          </button>

        </div>

      </button>

    </div>


    <!--
      =========================================================
      IMPORT
      =========================================================
    -->

    <div class="model-picker__footer">

      <button
        class="model-picker__import"
        type="button"
        :disabled="importing"
        @click="
          emit(
            'import'
          )
        "
      >

        <span class="model-picker__import-plus">
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


      <p class="model-picker__hint">
        Select a Live2D .model3.json file.
      </p>

    </div>

  </section>
</template>


<style scoped>
/*
  ============================================================
  PICKER
  ============================================================
*/

.model-picker {
  width:
    330px;

  max-height:
    620px;

  padding:
    22px;

  box-sizing:
    border-box;

  display:
    flex;

  flex-direction:
    column;

  gap:
    18px;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.08
    );

  border-radius:
    26px;

  background:
    rgba(
      22,
      21,
      34,
      0.94
    );

  color:
    white;

  box-shadow:
    0 18px 50px
    rgba(
      0,
      0,
      0,
      0.38
    );

  backdrop-filter:
    blur(
      22px
    );

  overflow:
    hidden;

  -webkit-app-region:
    no-drag;
}


/*
  ============================================================
  HEADER
  ============================================================
*/

.model-picker__header {
  display:
    flex;

  align-items:
    flex-start;

  justify-content:
    space-between;

  gap:
    16px;
}


.model-picker__heading {
  min-width:
    0;
}


.model-picker__title {
  margin:
    0;

  color:
    white;

  font-size:
    28px;

  font-weight:
    800;

  line-height:
    1.1;
}


.model-picker__subtitle {
  margin:
    6px 0 0;

  color:
    rgba(
      255,
      255,
      255,
      0.55
    );

  font-size:
    13px;
}


/*
  ============================================================
  CLOSE
  ============================================================
*/

.model-picker__close {
  width:
    46px;

  height:
    46px;

  flex:
    0 0 auto;

  padding:
    0;

  border:
    none;

  border-radius:
    50%;

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
      0.07
    );

  color:
    white;

  font-size:
    28px;

  font-weight:
    700;

  line-height:
    1;

  cursor:
    pointer;

  -webkit-app-region:
    no-drag;

  transition:
    transform 120ms ease,
    background 120ms ease;
}


.model-picker__close:hover {
  transform:
    scale(
      1.07
    );

  background:
    rgba(
      255,
      255,
      255,
      0.12
    );
}


/*
  ============================================================
  LIST
  ============================================================
*/

.model-picker__list {
  display:
    flex;

  flex-direction:
    column;

  gap:
    10px;

  overflow-y:
    auto;

  padding-right:
    2px;
}


/*
  ============================================================
  MODEL CARD
  ============================================================
*/

.model-card {
  position:
    relative;

  width:
    100%;

  min-height:
    90px;

  padding:
    12px;

  border:
    1px solid
    transparent;

  border-radius:
    20px;

  display:
    flex;

  align-items:
    center;

  gap:
    14px;

  background:
    rgba(
      255,
      255,
      255,
      0.055
    );

  color:
    white;

  text-align:
    left;

  cursor:
    pointer;

  -webkit-app-region:
    no-drag;

  transition:
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease;
}


.model-card:hover {
  background:
    rgba(
      255,
      255,
      255,
      0.085
    );
}


.model-card--selected {
  border-color:
    rgba(
      151,
      88,
      255,
      0.95
    );

  background:
    linear-gradient(
      135deg,
      rgba(
        124,
        67,
        210,
        0.25
      ),
      rgba(
        98,
        55,
        165,
        0.14
      )
    );
}


.model-card--deleting {
  opacity:
    0.58;
}


/*
  ============================================================
  AVATAR
  ============================================================
*/

.model-card__avatar {
  width:
    62px;

  height:
    62px;

  flex:
    0 0 62px;

  border-radius:
    14px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  background:
    linear-gradient(
      135deg,
      #a35ce0,
      #9847cc
    );

  color:
    white;

  font-size:
    28px;

  font-weight:
    800;
}


/*
  ============================================================
  INFO
  ============================================================
*/

.model-card__content {
  min-width:
    0;

  flex:
    1;
}


.model-card__name {
  overflow:
    hidden;

  color:
    white;

  font-size:
    19px;

  font-weight:
    750;

  line-height:
    1.2;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;
}


.model-card__meta {
  min-height:
    20px;

  margin-top:
    5px;
}


/*
  ============================================================
  BADGE
  ============================================================
*/

.model-card__badge {
  display:
    inline-flex;

  align-items:
    center;

  min-height:
    18px;

  padding:
    1px 7px;

  border-radius:
    6px;

  font-size:
    11px;

  line-height:
    1.2;
}


.model-card__badge--default {
  background:
    rgba(
      80,
      180,
      90,
      0.32
    );

  color:
    #9ee7a5;
}


.model-card__badge--imported {
  background:
    rgba(
      255,
      255,
      255,
      0.08
    );

  color:
    rgba(
      255,
      255,
      255,
      0.55
    );
}


/*
  ============================================================
  RIGHT ACTION
  ============================================================
*/

.model-card__action {
  width:
    36px;

  height:
    46px;

  flex:
    0 0 36px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;
}


/*
  ============================================================
  ✓ / × SHARED STYLE
  ============================================================

  Cả hai dùng CHUNG:
  - size
  - font
  - màu
  - background
  - không có viền đỏ

  Khác nhau duy nhất là ký tự.
*/

.model-card__status-icon {
  width:
    36px;

  height:
    46px;

  padding:
    0;

  border:
    none;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  background:
    transparent;

  color:
    #a875ff;

  font-family:
    Arial,
    sans-serif;

  font-size:
    31px;

  font-weight:
    700;

  line-height:
    1;

  text-align:
    center;
}


/*
  ============================================================
  SELECTED ✓
  ============================================================
*/

.model-card__status-icon--selected {
  /*
    Span nên không có cursor button.
  */

  cursor:
    default;

  text-shadow:
    0 0 12px
    rgba(
      165,
      112,
      255,
      0.25
    );
}


/*
  ============================================================
  DELETE ×
  ============================================================

  Giống tick nhưng có thể click.
*/

.model-card__status-icon--delete {
  cursor:
    pointer;

  -webkit-app-region:
    no-drag;

  transition:
    transform 110ms ease,
    opacity 110ms ease,
    text-shadow 110ms ease;
}


.model-card__status-icon--delete:hover {
  transform:
    scale(
      1.14
    );

  text-shadow:
    0 0 12px
    rgba(
      165,
      112,
      255,
      0.52
    );
}


.model-card__status-icon--delete:active {
  transform:
    scale(
      0.90
    );
}


.model-card__status-icon--delete:disabled {
  cursor:
    default;

  opacity:
    0.45;
}


.model-card__status-icon--loading {
  font-size:
    24px;
}


/*
  ============================================================
  FOOTER
  ============================================================
*/

.model-picker__footer {
  padding-top:
    2px;

  border-top:
    1px solid
    rgba(
      255,
      255,
      255,
      0.07
    );
}


/*
  ============================================================
  IMPORT BUTTON
  ============================================================
*/

.model-picker__import {
  width:
    100%;

  min-height:
    68px;

  margin-top:
    16px;

  padding:
    0 20px;

  border:
    none;

  border-radius:
    18px;

  display:
    flex;

  align-items:
    center;

  justify-content:
    center;

  gap:
    9px;

  background:
    linear-gradient(
      135deg,
      #6d47c6,
      #9b44ad
    );

  color:
    white;

  font-size:
    17px;

  font-weight:
    800;

  cursor:
    pointer;

  -webkit-app-region:
    no-drag;

  transition:
    transform 130ms ease,
    filter 130ms ease;
}


.model-picker__import:hover:not(:disabled) {
  transform:
    translateY(
      -1px
    );

  filter:
    brightness(
      1.08
    );
}


.model-picker__import:active:not(:disabled) {
  transform:
    scale(
      0.985
    );
}


.model-picker__import:disabled {
  cursor:
    default;

  opacity:
    0.55;
}


.model-picker__import-plus {
  font-size:
    28px;

  font-weight:
    900;

  line-height:
    1;
}


/*
  ============================================================
  HINT
  ============================================================
*/

.model-picker__hint {
  margin:
    10px 0 0;

  color:
    rgba(
      255,
      255,
      255,
      0.42
    );

  font-size:
    11px;

  text-align:
    center;
}


/*
  ============================================================
  SCROLLBAR
  ============================================================
*/

.model-picker__list::-webkit-scrollbar {
  width:
    5px;
}


.model-picker__list::-webkit-scrollbar-track {
  background:
    transparent;
}


.model-picker__list::-webkit-scrollbar-thumb {
  border-radius:
    999px;

  background:
    rgba(
      255,
      255,
      255,
      0.14
    );
}
</style>