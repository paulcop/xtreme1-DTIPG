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

    private points: THREE.Object3D[] = []; // Store the points directly


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

        handleHack(this);

        this.initEvent();

        this.pc.addEventListener('update-lines', (event) => {
            this.updateLines(event.data.object);
            });

        // util
        this.blurPage = _.throttle(this.blurPage.bind(this), 40);
    }

    initEvent() {
        let config = this.state.config;

        this.pc.addEventListener(RenderEvent.CLICK, (event) => {
            const intersects = this.pc.getIntersects(event);
            if (intersects.length > 0) {
                console.log('Intersected object:', intersects[0].object);
                if (intersects[0].object.userData.isPoint) {
                    console.log('Point clicked:', intersects[0].object);
                    this.selectPoint(intersects[0].object);
                } else if (intersects[0].object instanceof Box) {
                    console.log('Box clicked:', intersects[0].object);
                    this.selectBox(intersects[0].object);
                }
            } else {
                console.log('No intersection detected');
            }
        });

        // Gestion de la sélection des objets
        this.pc.addEventListener(RenderEvent.SELECT, (data) => {
            console.log('RenderEvent.SELECT triggered:', data);

            let selection = this.pc.selection;
            let selectedObject = selection.find((annotate) => annotate instanceof THREE.Object3D);

            // Vérifier si l'objet sélectionné est un point ou une boîte
            if (selectedObject) {
                console.log('Selected Object:', selectedObject);

                // Si c'est une boîte ou un point, activer la translation si nécessaire
                if (config.activeTranslate && (selectedObject instanceof Box || selectedObject.userData.isPoint)) {
                    console.log('Activating translation for:', selectedObject);
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

            let objects = [...annotate3D, ...annotate2D].filter(
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

    /// Create a new group of points with a given name
    createPointGroup(groupName: string): { pointsGroup: THREE.Group; linesGroup: THREE.Group } {
        if (this.pointGroups[groupName]) {
            console.warn(`Group ${groupName} already exists!`);
            return this.pointGroups[groupName];
        }

        const pointsGroup = new THREE.Group();
        pointsGroup.name = `${groupName}-points`;

        const linesGroup = new THREE.Group();
        linesGroup.name = `${groupName}-lines`;

        this.pc.scene.add(pointsGroup);
        this.pc.scene.add(linesGroup);

        this.pointGroups[groupName] = { pointsGroup, linesGroup };
        return this.pointGroups[groupName];
    }

    // Add a point to a group and connect it with the previous point
    addPointToGroup(point: THREE.Object3D, groupName: string) {
        const group = this.pointGroups[groupName];
        if (!group) {
            console.error(`Group ${groupName} does not exist!`);
            return;
        }

        // Add the point to the pointsGroup
        group.pointsGroup.add(point);
        point.userData.groupName = groupName;

        // If there's more than one point, connect with the previous point
        if (group.pointsGroup.children.length > 1) {
            const previousPoint = group.pointsGroup.children[group.pointsGroup.children.length - 2];
            const line = this.createLineBetweenPoints(previousPoint, point);
            group.linesGroup.add(line);
        }

        this.pc.render();
    }

    // Move a point within a group and update the connected lines
    movePointInGroup(point: THREE.Object3D, newPosition: THREE.Vector3, groupName: string) {
        const group = this.pointGroups[groupName];
        if (!group) {
            console.error(`Group ${groupName} does not exist!`);
            return;
        }

        point.position.copy(newPosition);

        const pointIndex = group.pointsGroup.children.indexOf(point);
        if (pointIndex > 0) {
            const prevLine = group.linesGroup.children[pointIndex - 1];
            prevLine.geometry.setFromPoints([
                group.pointsGroup.children[pointIndex - 1].position,
                point.position,
            ]);
        }
        if (pointIndex < group.pointsGroup.children.length - 1) {
            const nextLine = group.linesGroup.children[pointIndex];
            nextLine.geometry.setFromPoints([
                point.position,
                group.pointsGroup.children[pointIndex + 1].position,
            ]);
        }

        this.pc.render();
    }


    // Method to update lines between a list of points
    updateLinesBetweenPoints(points: THREE.Object3D[]) {
        if (points.length < 2) return;

        // Clear any existing lines
        this.clearExistingLines();

        // Create and add lines between the points
        for (let i = 1; i < points.length; i++) {
            const prevPoint = points[i - 1];
            const currPoint = points[i];

            // Vérification des points
            if (!prevPoint || !currPoint) {
                console.error('Un des points est undefined:', { prevPoint, currPoint });
                continue; // Passe à l'itération suivante si un point est undefined
            }

            const line = this.createLineBetweenPoints(prevPoint, currPoint);
            this.addToScene(line);
        }
    }

    // Update lines between all points in the list
    updateLines() {
        this.clearExistingLines();  // Clear any existing lines from the scene

        if (this.points.length > 1) {
            for (let i = 1; i < this.points.length; i++) {
                const line = this.createLineBetweenPoints(this.points[i - 1], this.points[i]);
                this.addToScene(line);
            }
        }
    }

    // Create a line between two points
    createLineBetweenPoints(point1: THREE.Object3D, point2: THREE.Object3D): THREE.Line {
        // Vérification des points
        if (!point1 || !point2) {
            throw new Error('Les points fournis à createLineBetweenPoints ne peuvent pas être undefined');
        }

        console.log(`Point1 position:`, point1.position);
        console.log(`Point2 position:`, point2.position);

        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        const geometry = new THREE.BufferGeometry().setFromPoints([
            point1.position,
            point2.position
        ]);
        return new THREE.Line(geometry, material);
    }

    // Clear existing lines from the scene
    clearExistingLines() {
        const lines = this.pc.scene.children.filter((obj) => obj instanceof THREE.Line);
        lines.forEach((line) => {
            this.pc.scene.remove(line);
        });
        this.pc.render(); // Re-render the scene
    }

    // Method to handle point selection
    selectPoint(point: THREE.Object3D) {
        this.pc.selectObject(point);
        this.updateSelectedPoint(point);
    }

    // Update the selected point's properties (e.g., color)
    updateSelectedPoint(point: THREE.Object3D) {
        point.userData.isSelected = true;
        (point.material as THREE.MeshBasicMaterial).color.setHex(0x0000ff); // Change color to blue when selected
        this.pc.render();
    }

    // Method to handle point movement
    moveSelectedPoint(newPosition: THREE.Vector3) {
        const selectedObject = this.pc.selection[0];
        if (selectedObject && selectedObject.userData.isPoint) {
            console.log("moveSelectedPoint called with newPosition:", newPosition);

            // Find the group that contains this point
            const group = Object.values(this.pointGroups).find(g => g.children.includes(selectedObject));
            if (group) {
                const groupName = group.name;
                this.movePointInGroup(selectedObject, newPosition, groupName);
            } else {
                console.error("Point not found in any group");
            }
        }
    }

    // Method to remove a selected point from the scene
    deleteSelectedPoint() {
        if (this.pc.selection.length === 1) {
            const selectedPoint = this.pc.selection[0];
            if (selectedPoint.userData.isPoint) {
                const pointIndex = this.points.indexOf(selectedPoint);
                if (pointIndex > -1) {
                    this.points.splice(pointIndex, 1);
                    this.removeObjectFromScene(selectedPoint);

                    // Update lines dynamically after removing the point
                    this.updateLines();
                }
            }
        }
    }

    // Remove an object from the scene
    removeObjectFromScene(object: THREE.Object3D) {
        this.pc.scene.remove(object);
        this.pc.render();
    }

    // Add an object to the scene
    addToScene(object: THREE.Object3D) {
        if (!this.pc.scene) {
            console.error("Point cloud scene is not initialized.");
            return;
        }

        this.pc.scene.add(object);
        this.pc.render();
    }

    // Get the clicked point in the point cloud
    getClickedPoint(event): THREE.Vector3 | null {
        const intersects = this.pc.getIntersects(event);
        if (intersects.length > 0) {
            return intersects[0].point;
        }
        return null;
    }

    // Méthode pour effacer le mode actuel (clear current mode)
    clearCurrentMode() {
        this.dispatchEvent({ type: Event.CLEAR_MODE });
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

            if (obj instanceof Box) {
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
            console.log('translation de truc')
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
