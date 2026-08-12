<script setup lang="ts">
import type {
  CharacterConfig
} from '../../../characters/types'


const props = defineProps<{
  models: CharacterConfig[]

  selectedId: string

  defaultId: string

  importing: boolean
}>()


const emit = defineEmits<{
  select: [model: CharacterConfig]

  import: []

  close: []
}>()


function getInitial(
  name: string
): string {
  return (
    name
      .trim()
      .charAt(0)
      .toUpperCase() ||
    '?'
  )
}
</script>


<template>
  <div
    class="model-picker"
    @pointerdown.stop
  >
    <!-- HEADER -->
    <div class="model-picker-header">
      <div>
        <div class="model-picker-title">
          Models
        </div>

        <div class="model-picker-subtitle">
          Choose your character
        </div>
      </div>

      <button
        class="close-button"
        type="button"
        @click="emit('close')"
      >
        ×
      </button>
    </div>


    <!-- MODEL LIST -->
    <div class="model-list">

      <button
        v-for="model in props.models"
        :key="model.id"
        class="model-item"
        :class="{
          selected:
            model.id ===
            props.selectedId
        }"
        type="button"
        @click="
          emit(
            'select',
            model
          )
        "
      >
        <!-- Avatar placeholder -->
        <div class="model-avatar">
          {{
            getInitial(
              model.name
            )
          }}
        </div>


        <div class="model-info">
          <div class="model-name">
            {{ model.name }}
          </div>

          <div
            v-if="
              model.id ===
              props.defaultId
            "
            class="model-badge"
          >
            Default
          </div>

          <div
            v-else
            class="model-type"
          >
            Imported
          </div>
        </div>


        <div
          v-if="
            model.id ===
            props.selectedId
          "
          class="selected-mark"
        >
          ✓
        </div>
      </button>

    </div>


    <div class="separator" />


    <!-- IMPORT -->
    <button
      class="import-button"
      type="button"
      :disabled="props.importing"
      @click="emit('import')"
    >
      <span class="import-icon">
        +
      </span>

      <span>
        {{
          props.importing
            ? 'Importing...'
            : 'Import Model'
        }}
      </span>
    </button>


    <div class="import-help">
      Select a Live2D
      <strong>.model3.json</strong>
      file.
    </div>
  </div>
</template>


<style scoped>
.model-picker {
  width: 235px;

  max-height: 430px;

  padding: 14px;

  border:
    1px solid
    rgba(
      255,
      255,
      255,
      0.16
    );

  border-radius: 20px;

  background:
    rgba(
      20,
      20,
      30,
      0.94
    );

  box-shadow:
    0 12px 40px
    rgba(
      0,
      0,
      0,
      0.42
    );

  backdrop-filter:
    blur(18px);

  color: white;

  -webkit-app-region:
    no-drag;

  user-select:
    none;
}


.model-picker-header {
  display: flex;

  align-items: center;

  justify-content:
    space-between;

  margin-bottom: 12px;
}


.model-picker-title {
  font-size: 18px;

  font-weight: 800;
}


.model-picker-subtitle {
  margin-top: 2px;

  color:
    rgba(
      255,
      255,
      255,
      0.5
    );

  font-size: 10px;
}


.close-button {
  width: 30px;
  height: 30px;

  border: none;

  border-radius: 50%;

  background:
    rgba(
      255,
      255,
      255,
      0.08
    );

  color: white;

  font-size: 20px;

  cursor: pointer;

  -webkit-app-region:
    no-drag;
}


.close-button:hover {
  background:
    rgba(
      255,
      255,
      255,
      0.16
    );
}


.model-list {
  max-height: 260px;

  overflow-y: auto;

  display: flex;

  flex-direction: column;

  gap: 6px;
}


.model-item {
  width: 100%;

  min-height: 58px;

  padding:
    7px
    9px;

  border:
    1px solid
    transparent;

  border-radius: 14px;

  background:
    rgba(
      255,
      255,
      255,
      0.04
    );

  color: white;

  display: flex;

  align-items: center;

  text-align: left;

  cursor: pointer;

  -webkit-app-region:
    no-drag;

  transition:
    background 120ms ease,
    border 120ms ease,
    transform 120ms ease;
}


.model-item:hover {
  background:
    rgba(
      255,
      255,
      255,
      0.09
    );

  transform:
    translateX(2px);
}


.model-item.selected {
  border-color:
    rgba(
      150,
      100,
      255,
      0.72
    );

  background:
    rgba(
      120,
      75,
      220,
      0.22
    );
}


.model-avatar {
  width: 40px;
  height: 40px;

  flex:
    0 0 40px;

  border-radius: 12px;

  display: flex;

  align-items: center;

  justify-content: center;

  background:
    linear-gradient(
      135deg,
      rgba(
        130,
        90,
        255,
        1
      ),
      rgba(
        235,
        85,
        180,
        1
      )
    );

  font-size: 17px;

  font-weight: 800;
}


.model-info {
  min-width: 0;

  flex: 1;

  margin-left: 10px;
}


.model-name {
  overflow: hidden;

  text-overflow:
    ellipsis;

  white-space:
    nowrap;

  font-size: 13px;

  font-weight: 700;
}


.model-badge {
  display: inline-block;

  margin-top: 3px;

  padding:
    2px
    6px;

  border-radius: 8px;

  background:
    rgba(
      90,
      205,
      135,
      0.16
    );

  color:
    rgb(
      130,
      235,
      165
    );

  font-size: 9px;
}


.model-type {
  margin-top: 3px;

  color:
    rgba(
      255,
      255,
      255,
      0.42
    );

  font-size: 9px;
}


.selected-mark {
  margin-left: 8px;

  color:
    rgb(
      170,
      130,
      255
    );

  font-size: 17px;

  font-weight: 800;
}


.separator {
  height: 1px;

  margin:
    12px
    0;

  background:
    rgba(
      255,
      255,
      255,
      0.10
    );
}


.import-button {
  width: 100%;

  height: 44px;

  border:
    1px solid
    rgba(
      160,
      120,
      255,
      0.42
    );

  border-radius: 13px;

  background:
    linear-gradient(
      135deg,
      rgba(
        100,
        70,
        210,
        0.72
      ),
      rgba(
        180,
        65,
        165,
        0.72
      )
    );

  color: white;

  display: flex;

  align-items: center;

  justify-content: center;

  gap: 7px;

  font-size: 12px;

  font-weight: 700;

  cursor: pointer;

  -webkit-app-region:
    no-drag;
}


.import-button:hover:not(
  :disabled
) {
  filter:
    brightness(1.15);
}


.import-button:disabled {
  opacity: 0.55;

  cursor: wait;
}


.import-icon {
  font-size: 20px;

  line-height: 1;
}


.import-help {
  margin-top: 7px;

  color:
    rgba(
      255,
      255,
      255,
      0.38
    );

  font-size: 9px;

  text-align: center;
}
</style>