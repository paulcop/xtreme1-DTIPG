import { reactive, onMounted, onBeforeUnmount, watch } from 'vue';
import { useClipboard } from '@vueuse/core';
import { AttrType, IClassType, Event, utils, IUserData, Const } from 'pc-editor';
import { AnnotateObject, Box, Rect } from 'pc-render';
import { useInjectState } from '../../state';
import { IState, IInstanceItem, MsgType, IControl } from './type';
import { useInjectEditor } from '../../state';
import * as _ from 'lodash';
import * as THREE from 'three';
import * as locale from './lang';
import useControl from './useControl';

let SOURCE_CLASS = 'edit_class';
// type IEmit = (event: 'close', ...args: any[]) => void;

export default function useEditClass() {
    const { copy } = useClipboard();
    let editor = useInjectEditor();
    let editorState = useInjectState();
    let control = useControl();
    // object
    let trackAttrs = {} as Record<string, any>;
    let trackObject = {} as AnnotateObject;
    let tempObjects = [] as AnnotateObject[];
    // lang
    let $$ = editor.bindLocale(locale);

    let state = reactive<IState>({
        activeTab: ['attribute', 'objects', 'cuboid'],
        showType: 'select',
        // batch
        batchVisible: true,
        isBatch: false,
        batchTrackIds: [],
        instances: [],
        filterInstances: [],
        modelClass: '',
        confidenceRange: [0.2, 1],
        //
        objectId: '',
        trackId: '',
        trackName: '',
        trackVisible: false,
        isStandard: false,
        resultStatus: '',
        resultType: '',
        resultInstances: [],
        annotateType: '',
        classType: '',
        isClassStandard: false,
        isInvisible: false,
        attrs: [],
        // msg
        showMsgType: '',
        //
    });
    watch(
        () => [state.confidenceRange, state.instances],
        () => {
            let [min, max] = state.confidenceRange;
            let filterInstances = state.instances.filter((e) => {
                let confidence = e.confidence || 0;
                return confidence >= min && confidence <= max;
            });
            let objectMap = {} as Record<string, AnnotateObject>;
            tempObjects.forEach((e) => {
                objectMap[e.uuid] = e;
            });
            let noVisible = filterInstances.filter((e) => !objectMap[e.id].visible);
            state.filterInstances = filterInstances;
            state.batchVisible = noVisible.length === 0;
        },
    );

    let update = _.debounce(() => {
        if (!control.needUpdate()) return;
        clear();
        console.log('class edit update');
        if (state.isBatch) {
            showBatchObject(state.batchTrackIds);
        } else {
            showObject(state.trackId);
        }
    }, 100);

    onMounted(() => {
        editor.addEventListener(Event.SHOW_CLASS_INFO, (data: any) => {
            let trackIds = data.data.id;
            state.showType = 'msg';
            handleObject(trackIds);
        });
        editor.addEventListener(Event.ANNOTATE_SELECT, onSelect);
        editor.addEventListener(Event.ANNOTATE_REMOVE, syncUpdate);
        editor.addEventListener(Event.ANNOTATE_ADD, syncUpdate);
        editor.addEventListener(Event.ANNOTATE_CHANGE, syncUpdate);
    });

    onBeforeUnmount(() => {
        editor.removeEventListener(Event.ANNOTATE_SELECT, onSelect);
        editor.removeEventListener(Event.ANNOTATE_REMOVE, syncUpdate);
        editor.removeEventListener(Event.ANNOTATE_ADD, syncUpdate);
        editor.removeEventListener(Event.ANNOTATE_CHANGE, syncUpdate);
    });

    function onClearMergeSplit() {
        if (
            state.showMsgType === 'split' ||
            state.showMsgType === 'merge-from' ||
            state.showMsgType === 'merge-to'
        ) {
            state.showMsgType = '';
        }
    }

    function onSelect(data: any) {
        let selection = data.data.curSelection as AnnotateObject[];
        if (selection.length > 0) {
            state.showType = 'select';
            handleObject(selection[0].userData.trackId);
        } else {
            if (state.showType === 'select') close();
        }
    }

    function syncUpdate() {
        if (editor.eventSource === SOURCE_CLASS) return;
        update();
    }

    function handleObject(trackId: string | string[]) {
        if (Array.isArray(trackId)) {
            state.batchTrackIds = trackId;
            state.isBatch = true;
        } else {
            state.trackId = trackId;
            state.isBatch = false;
        }
        update();
    }

    function clear() {
        state.batchVisible = true;
        state.classType = '';
        state.isClassStandard = false;
        state.isStandard = false;
        state.isInvisible = false;
        state.resultType = '';
        state.resultStatus = '';
        state.resultInstances = [];
        state.objectId = '';
        state.trackName = '';
        state.trackVisible = false;
        state.annotateType = '';

        state.modelClass = '';
        state.instances = [];
        state.attrs = [];
        state.showMsgType = '';

        // state.trackId = '';
        // state.isBatch = false;
    }

    function close() {
        // emit('close');
        control.close();
    }

    function showObject(trackId: string) {
        let annotate2d = editor.pc.getAnnotate2D();
        let annotate3d = editor.pc.getAnnotate3D();
        let annotatePoints = editor.pc.getAnnotatePoints3D();

        let info = getAnnotateByTrackId([...annotate3d, ...annotate2d, ...annotatePoints], trackId);

        if (info.annotate3D.length === 0 && info.annotate2D.length === 0 && info.annotatePoints.length === 0) {
            close();
            return;
        }

        let object = info.annotate3D.length > 0 ? info.annotate3D[0] : (info.annotate2D.length > 0 ? info.annotate2D[0] : info.annotatePoints[0]);
        let userData = editor.getObjectUserData(object);

        state.objectId = object.uuid;
        state.modelClass = userData.modelClass || '';
        state.classType = userData.classId || userData.classType || '';
        state.trackId = userData.trackId || '';
        state.trackName = userData.trackName || '';

        trackObject = object;
        tempObjects = [...info.annotate3D, ...info.annotate2D, ...info.annotatePoints];

        let trackVisible = false;
        let rectTitle = $$('rect-title');
        let boxTitle = $$('box-title');
        let pointTitle = $$('point-title');
        state.resultInstances = tempObjects.map((e) => {
            let userData = e.userData as Required<IUserData>;
            let is3D = e instanceof Box;
            let isPoint = userData.isPoint;
            let info = is3D ? $$('cloud-object') : (isPoint ? pointTitle : $$('image-object'));

            if (e.visible) trackVisible = true;

            return {id: e.uuid, name: userData.id.slice(-4), info, confidence: 0};
        });

        state.trackVisible = trackVisible;
        if (state.classType) {
            updateAttrInfo(userData, state.classType);
            updateClassInfo();
        }
    }

    function updateAttrInfo(userData: IUserData, classType: string) {
        let classConfig = editor.getClassType(classType);
        if (!classConfig) return;
        let attrs = userData.attrs || {};
        // let newAttrs = classConfig.attrs.map((e) => {
        //     let defaultValue = e.type === AttrType.MULTI_SELECTION ? [] : '';
        //     // The array type may be a single value
        //     if (e.type === AttrType.MULTI_SELECTION && attrs[e.id] && !Array.isArray(attrs[e.id])) {
        //         attrs[e.id] = [attrs[e.id]];
        //     }
        //     let value = e.id in attrs ? attrs[e.id] : defaultValue;
        //     return { ...e, value };
        // });
        // state.attrs = newAttrs;
        state.attrs = utils.copyClassAttrs(classConfig, attrs);
        trackAttrs = JSON.parse(JSON.stringify(attrs));
    }

    function onInstanceRemove(item: IInstanceItem) {
        state.instances = state.instances.filter((e) => e.id !== item.id);
        tempObjects = tempObjects.filter((e) => e.uuid !== item.id);
    }

    function onToggleObjectsVisible() {
        let visible = !state.batchVisible;
        state.batchVisible = visible;

        let objects = getFilterObjects();
        if (objects.length > 0) {
            // pc.setVisible(objects, visible);
            editor.cmdManager.execute('toggle-visible', { objects: objects, visible });
        }
    }

    function getFilterObjects() {
        let insMap = {};
        state.filterInstances.forEach((e) => (insMap[e.id] = true));
        let objects = tempObjects.filter((e) => insMap[e.uuid]);
        return objects;
    }

    function onRemoveObjects() {
        if (tempObjects.length === 0) return;
        editor
            .showConfirm({ title: $$('msg-delete-title'), subTitle: $$('msg-delete-subtitle') })
            .then(
                () => {
                    let objects = getFilterObjects();
                    editor.cmdManager.execute('delete-object', [{ objects: objects }]);

                    let [min, max] = state.confidenceRange;
                    state.instances = state.instances.filter(
                        (e) => !(e.confidence >= min && e.confidence <= max),
                    );
                    if (state.instances.length === 0) close();
                },
                () => {},
            );
    }

    function updateClassInfo() {
        let classConfig = editor.getClassType(state.classType);
        if (!classConfig) return;

        state.isClassStandard = classConfig.type === 'standard';
    }

    function onClassChange() {
        if (state.isBatch) {
            updateClassMulti();
            return;
        }

        updateClassInfo();

        // let classConfig = editor.getClassType(state.classType);
        // let size3D = undefined;
        const { isSeriesFrame, frameIndex, frames } = editor.state;
        let classConfig = editor.getClassType(state.classType);
        let userData = {
            classType: classConfig?.name,
            classId: classConfig?.id,
            attrs: {},
            resultStatus: Const.True_Value,
        } as IUserData;

        editor.cmdManager.withGroup(() => {
            editor.trackManager.setTrackData(state.trackId, {
                userData: { classType: userData.classType, classId: userData.classId },
            });

            editor.trackManager.setDataByTrackId(
                state.trackId,
                {
                    userData: userData,
                },
                isSeriesFrame ? frames : [editor.getCurrentFrame()],
            );
        });

        state.resultStatus = Const.True_Value;
        updateAttrInfo(trackObject.userData, state.classType);
    }

    function updateClassMulti() {
        let { frameIndex, frames } = editor.state;

        let objects = getFilterObjects();
        let trackIdMap = {};
        objects.forEach((e) => (trackIdMap[e.userData.trackId] = true));
        let ids = Object.keys(trackIdMap);
        if (ids.length === 0) return;

        let classConfig = editor.getClassType(state.classType);
        editor.cmdManager.execute('update-object-user-data', {
            objects: tempObjects,
            data: {
                classType: classConfig?.name,
                classId: classConfig?.id,
            },
        });
    }

    // attr
    let updateTrackAttr = _.debounce(() => {
        editor.withEventSource(SOURCE_CLASS, () => {
            let attrs = JSON.parse(JSON.stringify(trackAttrs));
            editor.cmdManager.execute('update-object-user-data', {
                objects: tempObjects,
                data: { attrs },
            });
        });
    }, 100);

    function onAttChange(name: string, value: any) {
        trackAttrs[name] = value;
        updateTrackAttr();
        state.resultStatus = Const.True_Value;
    }

    function onObjectInstanceRemove(item: IInstanceItem) {
        state.showType = 'msg';
        let annotate = tempObjects.find((e) => e.uuid === item.id);
        tempObjects = tempObjects.filter((e) => e.uuid !== item.id);
        if (annotate) {
            editor.cmdManager.withGroup(() => {
                if (tempObjects.length > 0) {
                    editor.cmdManager.execute('select-object', tempObjects);
                }
                editor.cmdManager.execute('delete-object', annotate);
            });
        }

        if (tempObjects.length === 0) {
            close();
        }
    }

    function copyAttrFrom(trackId: string) {
        // console.log(trackId);
        let box = editor.pc.getAnnotate3D().find((e) => e.userData.trackId === trackId) as Box;
        if (box) {
            let attrs = JSON.parse(JSON.stringify(box.userData.attrs));
            editor.cmdManager.execute('update-object-user-data', {
                objects: tempObjects,
                data: { attrs: attrs },
            });
            trackObject.userData.attrs = attrs;
            updateAttrInfo(trackObject.userData, state.classType);
            editor.showMsg('success', $$('msg-copy-success'));
        } else {
            editor.showMsg('error', $$('msg-no-object'));
        }
    }

    function onToggleTrackVisible() {
        let visible = !state.trackVisible;
        state.trackVisible = visible;

        let objects = tempObjects;
        state.showType = 'msg';
        editor.cmdManager.execute('toggle-visible', { objects, visible });
    }

    function onCopy() {
        copy(state.trackId);
        editor.showMsg('success', $$('copy-success'));
    }

    return {
        state,
        update,
        control,
        onAttChange,
        onClassChange,
        onInstanceRemove,
        onToggleObjectsVisible,
        onRemoveObjects,
        // onObjectStatusChange,
        onObjectInstanceRemove,
        copyAttrFrom,
        // copyAttrTo,
        onToggleTrackVisible,
        // toggleStandard,
    };
}

function getAnnotateByTrackId(annotates: AnnotateObject[], trackId: string) {
    let annotate3D = [] as AnnotateObject[];
    let annotate2D = [] as AnnotateObject[];
    let annotatePoints = [] as AnnotateObject[];

    annotates.forEach((obj) => {
        let userData = obj.userData as Required<IUserData>;
        if (userData.trackId !== trackId) return;

        if (obj instanceof Box) {
            annotate3D.push(obj);
        } else if (obj instanceof Rect) {
            annotate2D.push(obj);
        } else if (userData.isPoint) {
            annotatePoints.push(obj);
        }
    });

    // Iterate over the point groups and find points with matching trackId
    const pointGroups = Object.values(editor.pointGroups);
    pointGroups.forEach(({ pointsGroup }) => {
        pointsGroup.children.forEach((point: AnnotateObject) => {
            const userData = point.userData as Required<IUserData>;
            if (userData.trackId === trackId) {
                annotatePoints.push(point);
            }
        });
    });

    return { annotate2D, annotate3D, annotatePoints };
}


function get2DIndex(viewId: string) {
    return parseInt((viewId.match(/[0-9]{1,5}$/) as any)[0]);
}

function getControl() {}
