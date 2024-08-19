<template>
  <a-tooltip
      overlayClassName="line-tooltip"
      trigger="click"
      placement="right"
      v-model:visible="iState.visible"
  >
        <span
            class="item"
            :style="{
                'border-top-right-radius': 0,
                'border-top-left-radius': 0,
                'padding-bottom': '2px',
                'padding-top': 0,
                color: iState.visible ? 'rgb(23, 125, 220)' : '',
            }"
            :title="$$('btn_setting')"
        >
            <EllipsisOutlined style="font-size: 14px; border-top: 1px solid #4e4e4e" />
        </span>
    <template #title>
      <div class="tool-btn-tooltip">
        <div
            :title="$$('title_3d_line')"
            class="tool-btn"
        >
          <i class="iconfont icon-3dline"></i>
        </div>
      </div>
    </template>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { EllipsisOutlined } from '@ant-design/icons-vue';
import { reactive } from 'vue';
import { useInjectEditor } from '../../state';
import * as locale from './lang';

// ***************Props and Emits***************
const iState = reactive({
  visible: false,
});
// ***************Props and Emits***************
const editor = useInjectEditor();
let $$ = editor.bindLocale(locale);
</script>

<style scoped>
.tool-btn-tooltip {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tool-btn {
  margin: 4px 0;
  cursor: pointer;
}
.icon-3dline:before {
  content: '\e900'; /* Assurez-vous que cette icône est définie dans votre fichier de police d'icônes */
}
</style>
