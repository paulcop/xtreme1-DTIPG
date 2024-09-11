import {
    RenderView,
    PointCloud,
    Event as RenderEvent,
    TransformControlsAction,
    AnnotateObject,
    Box,
} from 'pc-render';
import { Vector2Of4 } from 'pc-render';
import CmdManager from './common/CmdManager';
import HotkeyManager from './common/HotkeyManager';
import ActionManager from './common/ActionManager';
import ViewManager from './common/ViewManager';
import ConfigManager from './common/ConfigManager';
import DataManager from './common/DataManager';
import BusinessManager from './common/BusinessManager';
import LoadManager from './common/LoadManager';
import DataResource from './common/DataResource';
import ModelManager from './common/ModelManager';
import PlayManager from './common/PlayManager';
import TrackManager from './common/TrackManager';

import { getDefaultState } from './state';
import type { IState } from './state';
import {
    IUserData,
    IClassType,
    IImgViewConfig,
    LangType,
    IFrame,
    Const,
    IResultSource,
} from './type';
import { IModeType, OPType, IModeConfig } from './config/type';
import handleHack from './hack';
import * as _ from 'lodash';
import * as THREE from 'three';
import Event from './config/event';
import { nanoid } from 'nanoid';
import Mustache from 'mustache';
import BSError from './common/BSError';
import * as locale from './lang';
import PointGroup from './utils/pointGroup';
import * as utils from './utils';
import { RegisterFn, ModalFn, MsgFn, ConfirmFn, LoadingFn } from './uitype';
import TaskManager from './common/TaskManager/TaskManager';
import {forEach} from "lodash";

type LocaleType = typeof locale;

export default class Editor extends THREE.EventDispatcher {
    activeView: RenderView | null = null;
    idCount: number = 1;
    pc: PointCloud;
    state: IState;
    currentTrack?: string;
    currentTrackName: string = '';
    currentClass: string = '';
    frameMap: Map<string, IFrame> = new Map();
    frameIndexMap: Map<string, number> = new Map();
    classMap: Map<string, IClassType> = new Map();
    needUpdateFilter: boolean = true;
    eventSource: string = '';
    //groupPointscount: number = 0;

    cmdManager: CmdManager;
    hotkeyManager: HotkeyManager;
    actionManager: ActionManager;
    viewManager: ViewManager;
    configManager: ConfigManager;
    dataManager: DataManager;
    businessManager: BusinessManager;
    playManager: PlayManager;
    loadManager: LoadManager;
    dataResource: DataResource;
    modelManager: ModelManager;
    trackManager: TrackManager;
    taskManager: TaskManager;

    // ui
    registerModal: RegisterFn = () => {};
    showModal: ModalFn = () => Promise.resolve();
    showMsg: MsgFn = () => {};
    showConfirm: ConfirmFn = () => Promise.resolve();
    showLoading: LoadingFn = () => {};


    constructor() {
        super();

        this.state = getDefaultState();

        this.pc = new PointCloud(); // Initialisation de pc
        this.pc.initTween();

        this.cmdManager = new CmdManager(this);
        this.hotkeyManager = new HotkeyManager(this);
        this.actionManager = new ActionManager(this);
        this.viewManager = new ViewManager(this);
        this.configManager = new ConfigManager(this);
        this.dataManager = new DataManager(this);
        this.playManager = new PlayManager(this);
        this.loadManager = new LoadManager(this);
        this.dataResource = new DataResource(this);
        this.businessManager = new BusinessManager(this);
        this.modelManager = new ModelManager(this);
        this.trackManager = new TrackManager(this);
        this.taskManager = new TaskManager(this);
        this.pointGroups = {};
        //this.groupPointscount = 0;

        handleHack(this);

        this.initEvent();

        /*this.pc.addEventListener('update-lines', (event) => {
            this.updateLines(event.data.object);
            });*/

        // util
        this.blurPage = _.throttle(this.blurPage.bind(this), 40);
    }

    initEvent() {
        let config = this.state.config;

        // Gestion de la sélection des objets
        this.pc.addEventListener(RenderEvent.SELECT, (data) => {

            let selection = this.pc.selection;
            let selectedObject = selection.find((annotate) => annotate instanceof THREE.Object3D);

            // Vérifier si l'objet sélectionné est un point ou une boîte
            if (selectedObject) {
                console.log('Selected Object: ', selectedObject);

                // Si c'est une boîte ou un point, activer la translation si nécessaire
                if (config.activeTranslate && (selectedObject instanceof Box || selectedObject.userData.isPoint)) {
                    this.toggleTranslate(true, selectedObject);
                }
                this.updateTrack(); // Mettre à jour le suivi du point ou de la boîte
                this.dispatchEvent({ type: Event.ANNOTATE_SELECT, data: { ...data.data } });
            }
        });

        // Gestion des actions UNDO et REDO
        this.cmdManager.addEventListener(Event.UNDO, () => {
            console.log('Event.UNDO triggered');
            this.updateTrack();
        });

        this.cmdManager.addEventListener(Event.REDO, () => {
            console.log('Event.REDO triggered');
            this.updateTrack();
        });

        // Gestion du double-clic sur un objet pour sélectionner tous les objets du même trackId
        this.pc.addEventListener(RenderEvent.OBJECT_DBLCLICK, (data) => {
            console.log('RenderEvent.OBJECT_DBLCLICK triggered:', data);

            let object = data.data as AnnotateObject;
            let trackId = object.userData.trackId;

            console.log('Double-clicked Object Track ID:', trackId);

            let annotate3D = this.pc.getAnnotate3D();
            let annotate2D = this.pc.getAnnotate2D();
            let annotatePoints3D = this.pc.getAnnotatePoints3D();

            let objects = [...annotate3D, ...annotate2D, ...annotatePoints3D].filter(
                (e) => e.userData.trackId === trackId,
            );
            if (objects.length > 0) {
                console.log('Selecting all objects with Track ID:', trackId);
                this.pc.selectObject(objects);
            }
        });
    }


    updateTrack() {
        const selection = this.pc.selection;
        const userData =
            selection.length > 0 ? (selection[0].userData as Required<IUserData>) : undefined;
        if (selection.length > 0 && selection[0].userData.isPoint) {
            this.movePointInGroup(selection[0], selection[0].position, selection[0].userData.groupName);
        }

        this.setCurrentTrack(
            userData ? userData.trackId : undefined,
            userData ? userData.trackName : '',
        );
    }
    setCurrentTrack(trackId: string | undefined = undefined, trackName: string) {
        if (this.currentTrack !== trackId) {
            this.currentTrack = trackId;
            this.currentTrackName = trackName;
            this.dispatchEvent({ type: Event.CURRENT_TRACK_CHANGE, data: this.currentTrack });
        }
    }
    // locale
    lang<T extends keyof LocaleType['en']>(name: T, args?: Record<string, any>) {
        return this.getLocale(name, locale, args);
    }

    getLocale<T extends Record<LangType, Record<string, string>>, D extends keyof T['en']>(
        name: D,
        locale: T,
        args?: Record<string, any>,
    ) {
        let lang = this.state.lang;
        let langObject = locale[lang];
        if (!langObject) return '';
        let msg = langObject[name as any] || '';
        if (args) {
            msg = Mustache.render(msg, args);
        }
        return msg;
    }

    bindLocale<T extends Record<LangType, Record<string, string>>>(locale: T) {
        let bindGet = <D extends keyof T['en']>(name: D, args?: Record<string, any>) => {
            return this.getLocale(name, locale, args);
        };
        return bindGet;
    }

    withEventSource(source: string, fn: () => void) {
        this.eventSource = source;
        try {
            fn();
        } catch (e: any) {}
        this.eventSource = '';
    }

    async loadFrame(index: number, showLoading: boolean = true, force: boolean = false) {
        await this.loadManager.loadFrame(index, showLoading, force);
    }

    getCurrentFrame() {
        return this.state.frames[this.state.frameIndex];
    }
    // trackId
    createTrackId() {
        return nanoid(16);
    }

    // trackName
    getId() {
        // return THREE.MathUtils.generateUUID();
        return this.idCount++ + '';
    }

    // setCurrentTrack(trackId: string | null = null) {
    //     if (this.currentTrack !== trackId) {
    //         this.currentTrack = trackId;
    //         this.dispatchEvent({ type: Event.CURRENT_TRACK_CHANGE, data: this.currentTrack });
    //     }
    // }
    getCurTrack() {
        let box = this.pc.selection.find((object) => object instanceof Box);
        return box ? box.userData.trackId : '';
    }
    // create
    createAnnotate3D(
        position: THREE.Vector3,
        scale: THREE.Vector3,
        rotation: THREE.Euler,
        userData: IUserData = {},
    ) {
        let object = utils.createAnnotate3D(this, position, scale, rotation, userData);
        utils.setIdInfo(this, object.userData);
        return object;
    }

    //////////////////////////////////////////////////////////////////
    //   Line 3D annotation   //

    // Add a point to a group and connect it with the previous point
    addPoint(point: THREE.Object3D, groupName: string) {

        point.userData.groupName = groupName;
        this.pc.setVisible(point, true);

        this.pc.annotatePoints3D.add(point);
        const pointsInGroup = this.pc.annotatePoints3D.children;
        const index = pointsInGroup.indexOf(point);

        //console.log(`Adding point to group ${groupName}: `, pointsInGroup);

        if (index > 0) {
            console.log("numPoints > 1 :", index);
            const previousPoint = pointsInGroup[index - 1];
            if (previousPoint.userData.groupName == groupName) {
                const line = this.createLineBetweenPoints(previousPoint, point);

                // Set up the connections
                point.userData.prevPoint = previousPoint;
                point.userData.prevLine = line;
                previousPoint.userData.nextPoint = point;
                previousPoint.userData.nextLine = line;
            }

        }

        this.pc.render();
    }

    addPointToindex(point: THREE.Object3D, startPoint: THREE.Object3D) {
        point.userData.groupName = startPoint.userData.groupName;
        this.pc.setVisible(point, true);

        let index = this.pc.annotatePoints3D.children.indexOf(startPoint)

        this.pc.annotatePoints3D.add(point)

        // Vérifier que l'index est valide avant de déplacer
        if (index >= 0 && index < this.pc.annotatePoints3D.children.length) {
            // Retirer l'objet de sa position actuelle
            const removed = this.pc.annotatePoints3D.children.pop(); // Supprime l'objet ajouté à la fin
            if (removed) {
                // Insérer l'objet à la nouvelle position
                this.pc.annotatePoints3D.children.splice(index + 1, 0, removed);
            }
        }
        /*
        this.pc.annotatePoints3D.children.splice(index + 1, 0, point);
        point.parent = this.pc.annotatePoints3D;
        */

        const line = this.createLineBetweenPoints(startPoint, point);

        if (startPoint.userData.nextPoint) {
            point.userData.nextPoint = startPoint.userData.nextPoint;
            point.userData.nextLine = startPoint.userData.nextLine;
            //let nextPoint = this.pc.annotatePoints3D.children[index + 1];
            startPoint.userData.nextPoint.userData.prevPoint = point;
            startPoint.userData.nextLine.userData.prevLine = line;
        }

        // Set up the connections
        point.userData.prevPoint = startPoint;
        point.userData.prevLine = line;
        startPoint.userData.nextPoint = point;
        startPoint.userData.nextLine = line;

        this.pc.render();
    }

    // Move a point within a group and update the connected lines
    movePointInGroup(point: THREE.Object3D, newPosition: THREE.Vector3, groupName: string) {
        point.position.copy(newPosition);

        // Update the previous line
        if (point.userData.prevLine) {
            point.userData.prevLine.geometry.setFromPoints([
                point.userData.prevPoint.position,
                point.position,
            ]);
            point.userData.prevLine.geometry.attributes.position.needsUpdate = true;
        }

        // Update the next line
        if (point.userData.nextLine) {
            point.userData.nextLine.geometry.setFromPoints([
                point.position,
                point.userData.nextPoint.position,
            ]);
            point.userData.nextLine.geometry.attributes.position.needsUpdate = true;
        }

        this.pc.render();
    }

    // Remove a point from a group and update the lines
    removePointFromGroup(point: THREE.Object3D, groupName: string) {

        // Remove the previous line and update the previous point's next connection
        if (point.userData.prevLine) {
            if (point.userData.prevPoint) {
                point.userData.prevPoint.userData.nextLine = null;
                point.userData.prevPoint.userData.nextPoint = point.userData.nextPoint;
            }
        }

        // Remove the next line and update the next point's previous connection
        if (point.userData.nextLine) {
            if (point.userData.nextPoint) {
                point.userData.nextPoint.userData.prevLine = null;
                point.userData.nextPoint.userData.prevPoint = point.userData.prevPoint;
            }

            // If there's both a previous and next point, create a new line between them
            if (point.userData.prevPoint && point.userData.nextPoint) {
                const newLine = this.createLineBetweenPoints(
                    point.userData.prevPoint,
                    point.userData.nextPoint
                );
                point.userData.prevPoint.userData.nextLine = newLine;
                point.userData.nextPoint.userData.prevLine = newLine;
            }
        }

        // Finally, remove the point from the group
        this.pc.annotatePoints3D.remove(point);
        this.pc.render();
    }

    // Create a line between two points
    createLineBetweenPoints(point1: THREE.Object3D, point2: THREE.Object3D): THREE.Line {
        // Vérification des points
        if (!point1 || !point2) {
            throw new Error('Les points fournis à createLineBetweenPoints ne peuvent pas être undefined');
        }

        //console.log(`Point1 position:`, point1.position);
        //console.log(`Point2 position:`, point2.position);

        const material = new THREE.LineBasicMaterial({ color: 0xffffff });
        const geometry = new THREE.BufferGeometry().setFromPoints([
            point1.position,
            point2.position
        ]);

        let line = new THREE.Line(geometry, material);
        line.userData.isLine = true;
        line.isvisible = true;

        return line;
    }

    //  Fin de la ligne 3D annotation   //

    createAnnotateRect(center: THREE.Vector2, size: THREE.Vector2, userData: IUserData = {}) {
        let object = utils.createAnnotateRect(this, center, size, userData);
        utils.setIdInfo(this, object.userData);
        return object;
    }

    createAnnotateBox2D(positions1: Vector2Of4, positions2: Vector2Of4, userData: IUserData = {}) {
        let object = utils.createAnnotateBox2D(this, positions1, positions2, userData);
        utils.setIdInfo(this, object.userData);
        return object;
    }

    setFrames(frames: IFrame[]) {
        this.frameMap.clear();
        this.state.frames = frames;
        frames.forEach((e, index) => {
            this.frameMap.set(e.id + '', e);
            this.frameIndexMap.set(e.id + '', index);
        });
    }

    getFrameIndex(frameId: string) {
        return this.frameIndexMap.get(frameId + '') as number;
    }
    getFrame(frameId: string) {
        return this.frameMap.get(frameId + '') as IFrame;
    }

    getObjectUserData(object: AnnotateObject, frame?: IFrame) {
        // let { isSeriesFrame } = this.state;

        let userData = object.userData as Required<IUserData>;
        let trackId = userData.trackId as string;
        // if (isSeriesFrame) {
        //     let globalTrack = this.trackManager.getTrackObject(trackId) || {};
        //     Object.assign(userData, globalTrack);
        // }
        return userData;
    }

    updateObjectRenderInfo(objects: AnnotateObject[] | AnnotateObject) {
        if (!Array.isArray(objects)) objects = [objects];

        objects.forEach((obj) => {
            let frame = (obj as any).frame as IFrame;
            // TODO
            if (frame) frame.needSave = true;

            let userData = this.getObjectUserData(obj);
            let classConfig = this.getClassType(userData);


            if (obj instanceof Box || obj.userData.isPoint) {
                // obj.editConfig.resize = !userData.isStandard && userData.resultType !== Const.Fixed;
                obj.color.setStyle(classConfig ? classConfig.color : '#ffffff');
            } else {
                obj.color = classConfig ? classConfig.color : '#ffffff';
            }

            // obj.dashed = !!userData.invisibleFlag;
        });
        this.pc.render();
    }

    // set get
    setClassTypes(classTypes: IClassType[]) {
        this.classMap.clear();
        this.state.classTypes = classTypes;
        classTypes.forEach((e) => {
            this.classMap.set(e.name + '', e);
            this.classMap.set(e.id + '', e);
        });
    }

    getClassType(name: string | IUserData) {
        if (name instanceof Object) {
            let { classId, classType } = name;
            let key = classId || classType;
            return this.classMap.get(key + '') as IClassType;
        } else {
            return this.classMap.get(name + '') as IClassType;
        }
    }
    async getResultSources(frame?: IFrame): Promise<void> {}
    setSources(sources: IResultSource[]) {
        if (!sources) return;
        let { FILTER_ALL, withoutTaskId } = this.state.config;
        this.state.sources = sources;

        let sourceMap = {};
        sources.forEach((e) => {
            sourceMap[e.sourceId] = true;
        });

        this.state.sourceFilters = this.state.sourceFilters.filter((e) => sourceMap[e]);
        if (this.state.sourceFilters.length === 0) this.state.sourceFilters = [FILTER_ALL];
    }
    setMode(modeConfig: IModeConfig) {
        // this.state.mode = modeConfig.name || '';
        this.state.modeConfig = modeConfig;
        this.hotkeyManager.setHotKeyFromAction(this.state.modeConfig.actions);
        this.viewManager.updateViewStatus();
    }

    focusObject(object: THREE.Object3D) {
        let view = this.viewManager.getMainView();
        view.focusPosition(object.position);
    }

    focusPosition(position: THREE.Vector3) {
        let view = this.viewManager.getMainView();
        view.focusPosition(position);
    }

    setPointCloudData(data: any, ground: number, intensityRange?: [number, number]) {
        this.pc.setPointCloudData(data);
        this.configManager.updatePointConfig(ground, intensityRange);
        this.dispatchEvent({ type: Event.POINTS_CHANGE });
        // this.dispatchEvent({ type: Event.LOAD_POINT_AFTER });
    }

    frameChange(frames?: IFrame | IFrame[]) {
        frames = frames || this.state.frames;
        if (!Array.isArray(frames)) frames = [frames];

        frames.forEach((frame) => {
            frame.needSave = true;
        });
    }

    handleErr(err: BSError | Error, message: string = '') {
        if (err instanceof BSError) {
            utils.handleError(this, err);
        } else {
            utils.handleError(this, new BSError('', message, err));
        }
    }

    updateIDCounter() {
        let id = this.dataManager.getMaxId();
        this.idCount = id + 1;
    }

    reset() {
        this.state.frameIndex = -1;
        this.state.frames = [];
        this.dataManager.clear();
        this.dataResource.clear();
    }

    clear() {
        this.pc.selectObject();
        this.pc.clearData();
    }

    toggleTranslate(flag: boolean, object?: THREE.Object3D) {
        const view = this.viewManager.getMainView();
        const action = view.getAction('transform-control') as TransformControlsAction;

        // Rechercher un objet de type Box ou un point si aucun objet n'est spécifié
        const selectedObject = object || this.pc.selection.find(
            (annotate) => annotate instanceof Box || annotate.userData.isPoint
        );

        if (!selectedObject) {
            console.error('No object selected for transformation');
            return; // Sortir de la fonction si aucun objet valide n'est trouvé
        }

        if (flag) {
            //console.log('translation de truc')
            // Attach the object to the transform controls
            action.control.attach(selectedObject);

            // Ensure the transform controls are properly updated
            action.control.addEventListener('change', () => {
                this.pc.render();  // Re-render the scene when the object is transformed
            });

            // Handle translation by updating the object's position directly
            action.control.addEventListener('objectChange', () => {
                if (selectedObject.userData.isPoint) {
                    this.movePointInGroup(selectedObject, selectedObject.position, selectedObject.userData.groupName);
                }
            });

        } else {
            // Detach the object from the transform controls
            action.control.detach();
            action.control.removeEventListener('change', () => this.pc.render());
            action.control.removeEventListener('objectChange', () => this.movePointInGroup(selectedObject, selectedObject.position, selectedObject.userData.groupName));
        }
    }


    blurPage() {
        if (document.activeElement && document.activeElement !== document.body) {
            (document.activeElement as any).blur();
        }
    }

    selectObject(objects?: AnnotateObject | AnnotateObject[]) {
        this.pc.selectObject(objects || []);
    }

    selectByTrackId(trackId: string) {
        let annotate2D = this.pc.getAnnotate2D();
        let annotate3D = this.pc.getAnnotate3D();
        let annotatePoints3D = this.pc.getAnnotatePoints3D();

        let filters = [...annotate3D, ...annotate2D, ...annotatePoints3D].filter((e) => e.userData.trackId === trackId);
        this.pc.selectObject(filters);
    }

    updateSelect() {
        let { selection, selectionMap } = this.pc;
        let filterSelection = selection.filter((e) => selectionMap[e.uuid]);
        this.pc.selectObject(filterSelection);
    }
}
