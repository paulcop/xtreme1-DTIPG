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
            @click="create3DLine"
        >
          <i class="iconfont icon-polyline"></i>
        </div>
        <div
            :title="$$('add_new_group')"
            class="tool-btn"
            @click="addNewLineGroup"
        >
          <span class="icon iconfont icon-add"></span>
          <span>{{ groupPointscount }}</span>
        </div>
        <div
            :title="$$('add_select_point')"
            class="tool-btn"
            @click="addSelectPoint"
        >
          <span class="icon iconfont icon-tianjiapizhu"></span>
        </div>
      </div>
    </template>
  </a-tooltip>
</template>

<script lang="ts" setup>
import { EllipsisOutlined } from '@ant-design/icons-vue';
import { reactive, ref } from 'vue';
import { useInjectEditor } from '../../state';
import * as locale from './lang';
import {IActionName} from "pc-editor";

// ***************Props and Emits***************
const iState = reactive({
  visible: false // Encapsuler visible dans un objet
});

// Injecter l'éditeur
const editor = useInjectEditor();
let $$ = editor.bindLocale(locale);

// Utilisation de ref pour rendre groupPointscount réactif
const groupPointscount = ref(editor.pc.groupPointscount || 0); // Initialiser avec la valeur actuelle ou 0

const create3DLine = () => { // Gestion de l'action create3DLine
  stopOtherCreateAction('create3DLine');
  editor.actionManager.execute('create3DLine'); // Appelle l'action pour créer une ligne 3D
};

// Méthode pour ajouter un nouveau groupe de lignes
const addNewLineGroup = () => {
  groupPointscount.value += 1;  // Incrémenter le compteur réactif
  editor.pc.groupPointscount = groupPointscount.value; // Mettre à jour également l'éditeur si nécessaire
  console.log('New line group added:', groupPointscount.value);
};

// Nouvelle méthode pour appeler addSelectPoint
const addSelectPoint = () => {
  if (editor.pc.selection.length > 0 && editor.pc.selection[0].userData.isPoint) {
    console.log('Point selected');
    stopOtherCreateAction('addPointSelect');
    editor.actionManager.execute('addPointSelect');
  }
  else {
    stopOtherCreateAction('create3DLine');
    editor.actionManager.execute('create3DLine');
  }
};

const stopOtherCreateAction = (name: string) => {
  if (editor.actionManager.currentAction) {
    let action = editor.actionManager.currentAction;
    if (action.name === name) return;
    if (createActions.indexOf(action.name as IActionName) >= 0) {
      editor.actionManager.stopCurrentAction();
    }
  }
}
</script>

<style scoped>
.tool-btn-tooltip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 8px;
  background-color: #f9f9f9;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start; /* Aligner le contenu à gauche */
  padding: 8px 12px;
  border-radius: 4px;
  background-color: #ffffff;
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  width: 100%;
}

.tool-btn:hover {
  background-color: rgb(23, 125, 220);
  color: #ffffff; /* Blanc sur fond bleu au survol */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.tool-btn span {
  margin-left: 8px;
  font-size: 14px;
  color: #333; /* Assurer que le texte reste sombre */
}

.iconfont {
  font-size: 18px;
  margin-right: 8px;
  vertical-align: middle; /* Assurer l'alignement vertical des icônes */
}

.item {
  display: flex;
  align-items: center;
}

.item .iconfont {
  margin-right: 4px; /* Réduire l'espace si nécessaire */
}

.tool-btn:hover .iconfont {
  color: #ffffff; /* Assurer que les icônes deviennent blanches au survol */
}
</style>
