import { useInjectEditor } from '../../state';
import { IItem } from './type';
import { AnnotateObject } from 'pc-render';
import { Event as EditorEvent } from 'pc-editor';
import * as _ from 'lodash';
import * as locale from './lang';

export default function useTrackItem() {
    let editor = useInjectEditor();
    let pc = editor.pc;
    let $$ = editor.bindLocale(locale);

    function onEdit(item: IItem) {
        editor.viewManager.showClassView(item.id);
    }

    function onSelect(item: IItem) {
        let annotate3D = pc.getAnnotate3D();
        let annotate2D = pc.getAnnotate2D();
        let annotateLines3D = pc.getAnnotateLines3D();
        let annotatePoints3D = pc.getAnnotatePoints3D(); // Ajoutez cette ligne pour récupérer les points 3D

        let objects = [
            ...annotate3D,
            ...annotate2D,
            ...annotateLines3D,
            ...annotatePoints3D, // Ajoutez les points 3D à la sélection
        ].filter((e) => e.userData.trackId === item.id);

        editor.pc.selectObject(objects);
    }

    function onDelete(item: IItem) {
        let { name } = item;

        editor
            .showConfirm({
                title: $$('msg-delete-title'),
                subTitle: $$('msg-track-delete', { n: item.data.length, name }),
                okText: $$('msg-delete-title'),
                cancelText: $$('msg-cancel-title'),
                okDanger: true,
            })
            .then(
                () => {
                    let idMap = {} as Record<string, boolean>;
                    item.data.forEach((e) => {
                        idMap[e.id] = true;
                    });

                    let objects: AnnotateObject[] = [];
                    let annotate3D = pc.getAnnotate3D();
                    let annotate2D = pc.getAnnotate2D();
                    let annotateLines3D = pc.getAnnotateLines3D();
                    let annotatePoints3D = pc.getAnnotatePoints3D(); // Ajoutez cette ligne pour récupérer les points 3D

                    [...annotate3D, ...annotate2D, ...annotateLines3D, ...annotatePoints3D].forEach((object) => {
                        let id = object.uuid;
                        if (idMap[id]) objects.push(object);
                    });

                    if (objects.length > 0) {
                        editor.cmdManager.execute('delete-object', [{ objects: objects }]);
                    }
                },
                () => {},
            );
    }

    function onToggleVisible(item: IItem) {
        let visible = !item.visible;
        item.visible = visible;

        let idMap = {} as Record<string, boolean>;
        item.data.forEach((e) => {
            idMap[e.id] = true;
        });

        let annotate3D = pc.getAnnotate3D();
        let annotate2D = pc.getAnnotate2D();
        let annotateLines3D = pc.getAnnotateLines3D();
        let annotatePoints3D = pc.getAnnotatePoints3D(); // Ajoutez cette ligne pour récupérer les points 3D

        let objects = [
            ...annotate3D,
            ...annotate2D,
            ...annotateLines3D,
            ...annotatePoints3D, // Ajoutez les points 3D à la gestion de la visibilité
        ].filter((object) => idMap[object.uuid]);

        if (objects.length > 0) {
            editor.cmdManager.execute('toggle-visible', { objects, visible: visible });
        }
    }

    return {
        onEdit,
        onSelect,
        onDelete,
        onToggleVisible,
    };
}