import {
    MainRenderView,
    CreateAction,
    Image2DRenderView,
    Box,
    Points,
    Event,
    utils,
    ITransform,
} from 'pc-render';
import * as THREE from 'three';
import * as _ from 'lodash';
import Editor from '../../../Editor';
import { define } from '../define';
import { getTransformFrom3Point, getMiniBox, getMiniBox1 } from '../../../utils';
import { IAnnotationInfo, StatusType, IUserData, Const, IObject } from '../../../type';
import EditorEvent from '../../../config/event';

function showLoading(position: THREE.Vector3, view: MainRenderView) {
    const wrap = document.createElement('div');
    wrap.className = 'loading-3d-wrap';
    const iconDiv = document.createElement('div');
    const icon = document.createElement('i');
    const msg = document.createElement('div');
    msg.className = 'loading-msg';
    icon.className = 'iconfont icon-loading loading create-status';
    iconDiv.appendChild(msg);
    iconDiv.appendChild(icon);
    wrap.appendChild(iconDiv);
    const update = () => {
        const pos = new THREE.Vector3().copy(position);
        const camera = view.camera;
        const matrix = utils.get(THREE.Matrix4, 1);
        matrix.copy(camera.projectionMatrix);
        matrix.multiply(camera.matrixWorldInverse);
        pos.applyMatrix4(matrix);
        const invisible = Math.abs(pos.z) > 1 || pos.x < -1 || pos.x > 1 || pos.y > 1 || pos.y < -1;
        iconDiv.style.display = invisible ? 'none' : 'block';
        pos.x = ((pos.x + 1) / 2) * view.width;
        pos.y = (-(pos.y - 1) / 2) * view.height;
        iconDiv.style.transform = `translate(${pos.x - 8}px, ${pos.y + 8}px) translateY(-100%)`;
    };
    const init = () => {
        view.container.appendChild(wrap);
        view.addEventListener(Event.RENDER_AFTER, update);
        update();
    };

    const clear = () => {
        view.removeEventListener(Event.RENDER_AFTER, update);
        view.container.removeChild(wrap);
    };
    const updateMsg = (message: string) => {
        msg.innerText = message;
    };
    init();
    return { clear, updateMsg };
}

export const createObjectWith3 = define({
    valid(editor: Editor) {
        let state = editor.state;
        return !state.config.showSingleImgView && state.modeConfig.actions['createObjectWith3'];
    },
    end(editor: Editor) {
        let action = this.action as CreateAction;
        action.end();
        editor.state.status = StatusType.Default;
    },
    execute(editor: Editor) {
        let view = editor.pc.renderViews.find((e) => e instanceof MainRenderView) as MainRenderView;
        if (view) {
            let action = view.getAction('create-obj') as CreateAction;
            this.action = action;

            editor.state.status = StatusType.Create;
            const config = editor.state.config;
            const isAIbox = config.boxMethod === 'AI';
            let points = editor.pc.groupPoints.children[0] as Points;
            let positions = points.geometry.attributes['position'] as THREE.BufferAttribute;
            return new Promise<any>((resolve) => {
                action.start(
                    {
                        type: isAIbox ? 'box' : 'points-3',
                        startClick: !isAIbox,
                        startMouseDown: isAIbox,
                    },
                    async (data: THREE.Vector2[]) => {
                        let transform: Required<
                            Pick<ITransform, 'position' | 'rotation' | 'scale'>
                        >;
                        if (isAIbox) {
                            const { clear, updateMsg } = showLoading(
                                view.canvasToWorld(
                                    new THREE.Vector2(
                                        (data[1].x + data[0].x) / 2,
                                        (data[1].y + data[0].y) / 2,
                                    ),
                                ),
                                view,
                            );
                            const createTask = editor.taskManager.createTask;
                            const projectPos = data.map((e) => view.getProjectPos(e));
                            const worldPos = data.map((e) => view.canvasToWorld(e));
                            const headAngle = Math.atan2(
                                worldPos[1].y - worldPos[0].y,
                                worldPos[1].x - worldPos[0].x,
                            );
                            const matrix = new THREE.Matrix4();
                            matrix.copy(view.camera.projectionMatrix);
                            matrix.multiply(view.camera.matrixWorldInverse);
                            const taskData = await createTask
                                .create(
                                    positions,
                                    projectPos,
                                    matrix,
                                    headAngle,
                                    true,
                                    config.heightRange,
                                )
                                .catch(() => {
                                    return { data: undefined, frameId: undefined };
                                });
                            const result = taskData.data as Required<ITransform>;
                            const frameId = taskData.frameId;
                            if (result && frameId == editor.getCurrentFrame().id) {
                                transform = {
                                    position: new THREE.Vector3().copy(result.position),
                                    scale: new THREE.Vector3().copy(result.scale),
                                    rotation: new THREE.Euler().copy(result.rotation),
                                };
                            } else {
                                data.splice(1, -1, new THREE.Vector2(data[0].x, data[1].y));
                                const _projectPos = data.map((e) => view.canvasToWorld(e));
                                transform = getTransformFrom3Point(_projectPos);
                            }
                            clear();
                        } else {
                            let projectPos = data.map((e) => view.canvasToWorld(e));
                            transform = getTransformFrom3Point(projectPos);
                            transform.scale.z = 2;
                            transform.position.z = editor.pc.ground.plane.constant + 1;

                            getMiniBox1(transform, positions, editor.state.config.heightRange);
                        }

                        transform.scale.x = Math.max(0.2, transform.scale.x);
                        transform.scale.y = Math.max(0.2, transform.scale.y);
                        transform.scale.z = Math.max(0.2, transform.scale.z);
                        // debugger;

                        let userData = {
                            resultStatus: Const.True_Value,
                            resultType: Const.Dynamic,
                        } as IUserData;

                        const classConfig = editor.getClassType(editor.state.currentClass);

                        if (classConfig) {
                            userData.classType = classConfig.name;
                            userData.classId = classConfig.id;
                        }
                        if (editor.currentTrack) {
                            const object3d = editor.pc.getAnnotate3D().find((e) => {
                                return (
                                    e instanceof Box &&
                                    !(e as any).isHolder &&
                                    e.userData.trackId == editor.currentTrack
                                );
                            });
                            if (!object3d) {
                                userData.trackId = editor.currentTrack as string;
                                userData.trackName = editor.currentTrackName;
                            }
                        }

                        let box = editor.createAnnotate3D(
                            transform.position,
                            transform.scale,
                            transform.rotation,
                            userData,
                        );

                        let trackObject: Partial<IObject> = {
                            trackId: userData.trackId,
                            trackName: userData.trackName,
                            classType: userData.classType,
                            classId: userData.classId,
                        };

                        editor.state.config.showClassView = true;

                        editor.cmdManager.withGroup(() => {
                            editor.cmdManager.execute('add-object', box);
                            if (editor.state.isSeriesFrame) {
                                editor.cmdManager.execute('add-track', trackObject);
                            }

                            editor.cmdManager.execute('select-object', box);
                        });

                        resolve(box);
                    },
                );
            });
        }
    },
});


// Fonction utilitaire pour créer une ligne 3D à partir de deux points
function create3DLineFromPoints(start: THREE.Vector3, end: THREE.Vector3) {
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Vert par défaut
    const line = new THREE.Line(geometry, material);

    return line;
}

function create3DLineAnnotation(editor: Editor, points2D: THREE.Vector2[]) {
    if (!editor.pc) {
        console.error('editor.pc is not initialized');
        return null;
    }

    let view = editor.pc.renderViews.find((e) => e instanceof MainRenderView) as MainRenderView;

    if (!view) {
        console.error('MainRenderView is not available');
        return null;
    }

    // Convertir les points 2D en points 3D en utilisant la vue principale
    const points3D = points2D.map(point2D => {
        return view.canvasToWorld(point2D);
    });

    // Créer les points 3D annotés
    const points = points3D.map((point3D, index) => {
        return createPointAnnotation(editor, point3D, {
            trackId: editor.createTrackId(),
            trackName: `Line-${editor.idCount}-${index}`,
            classType: editor.state.currentClass,
            classId: editor.classMap.get(editor.state.currentClass)?.id,
            isAnnotation: true,
        });
    });

    // Créer la géométrie de la ligne entre les points
    const geometry = new THREE.BufferGeometry().setFromPoints(points3D);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Couleur verte

    const line = new THREE.Line(geometry, material);

    // Ajouter la ligne à la scène
    editor.pc.scene.add(line);
    editor.pc.render();

    return { points, line };
}


function createPointAnnotation(editor: Editor, position: THREE.Vector3, userData: any): THREE.Mesh {
    console.log('Editor:', editor);
    console.log('Editor.pc:', editor.pc);

    if (!editor.pc) {
        throw new Error('editor.pc is not initialized');
    }

    // Suite de la fonction
    const pointGeometry = new THREE.SphereGeometry(0.1, 16, 16);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const point = new THREE.Mesh(pointGeometry, pointMaterial);

    point.position.copy(position);

    if (!userData) {
        userData = {};
    }

    point.userData = userData;
    point.userData.isPoint = true;

    editor.pc.scene.add(point);

    if (editor.pc.annotations) {
        editor.pc.annotations.push(point);
    } else {
        console.warn("Annotations array is not defined in editor.pc.");
    }

    return point;
}


export const create3DLine = define({
    valid(editor: Editor) {
        let state = editor.state;
        return !state.config.showSingleImgView && state.modeConfig.actions['create3DLine'];
    },
    end(editor: Editor) {
        let action = this.action as CreateAction;
        if (action) action.end();
        editor.state.status = StatusType.Default;
    },
    async execute(editor: Editor) {
        if (!editor.pc) {
            console.error("editor.pc is not initialized");
            return;
        }

        let view = editor.pc.renderViews.find((e) => e instanceof MainRenderView) as MainRenderView;
        if (view) {
            let action = view.getAction('create-obj') as CreateAction;
            this.action = action;

            editor.state.status = StatusType.Create;

            return new Promise<any>((resolve) => {
                action.start(
                    {
                        type: 'point-line', // Utilise point-line pour capturer plusieurs points
                        startClick: true,
                        startMouseDown: false,
                    },
                    async (data: THREE.Vector2[]) => {
                        if (data.length < 2) {
                            console.error('Not enough points to create a line.');
                            resolve(null);
                            return;
                        }



                        // Créer la ligne 3D et les points 3D avec les coordonnées 2D fournies
                        const { points, line } = create3DLineAnnotation(editor, data);

                        // Utiliser CmdManager pour gérer la création et la sélection de la ligne et des points
                        editor.cmdManager.withGroup(() => {
                            editor.cmdManager.execute('add-object', line);
                            points.forEach(point => {
                                editor.cmdManager.execute('add-object', point);
                            });

                            if (editor.state.isSeriesFrame) {
                                let trackObject: Partial<IObject> = {
                                    trackId: line.userData.trackId,
                                    trackName: line.userData.trackName,
                                    classType: line.userData.classType,
                                    classId: line.userData.classId,
                                };
                                editor.cmdManager.execute('add-track', trackObject);
                            }

                            editor.cmdManager.execute('select-object', [...points, line]);
                        });

                        resolve({ points, line });
                    }
                );
            });
        }
    },
});

export const createAnnotation = define({
    valid(editor: Editor) {
        let state = editor.state;
        return !state.config.showSingleImgView && state.modeConfig.actions['createAnnotation'];
    },
    end(editor: Editor) {
        let action = this.action as CreateAction;
        if (action) action.end();

        editor.showModal(false);
        editor.state.status = StatusType.Default;
    },
    execute(editor: Editor, args?: { object: Box }) {
        let view = editor.pc.renderViews.find((e) => e instanceof MainRenderView) as MainRenderView;
        let state = editor.state;

        editor.state.status = StatusType.Create;

        if (view) {
            return new Promise<any>(async (resolve) => {
                if (args && args.object) {
                    this.action = null;
                    await create(args.object);
                    resolve(null);
                } else {
                    let action = view.getAction('create-obj') as CreateAction;
                    this.action = action;

                    action.start(
                        { type: 'points-1', trackLine: false },
                        async (data: THREE.Vector2[]) => {
                            let obj = view.getObjectByCanvas(data[0]);
                            if (obj) {
                                await create(obj);
                            } else {
                                await create(view.canvasToWorld(data[0]));
                            }
                            resolve(null);
                        },
                    );
                }
            });
        }

        async function create(data: THREE.Object3D | THREE.Vector3) {
            let result;
            let isObject = data instanceof THREE.Object3D;
            let object = data as THREE.Object3D;
            let custom = isObject
                ? { id: object.userData.id, uuid: object.uuid }
                : (data as THREE.Vector3).clone();

            try {
                result = await editor.showModal('annotation', {
                    title: '',
                    data: { type: isObject ? 'object' : 'position', custom },
                });
            } catch (e) {
                console.log('cancel');
            }
        }
    },
});
