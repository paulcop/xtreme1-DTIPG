import { Line, BufferGeometry, LineBasicMaterial, Vector3 } from 'three';
import { AnnotateObject } from 'pc-render';

class AnnotateLine3D extends AnnotateObject {
    constructor(start: Vector3, end: Vector3, userData: any) {
        const geometry = new BufferGeometry().setFromPoints([start, end]);
        const material = new LineBasicMaterial({ color: 0xff0000 }); // Rouge pour la visibilité

        const line = new Line(geometry, material);
        super(line); // Appelle le constructeur de base avec la géométrie de la ligne

        this.userData = userData; // Stocke les informations spécifiques de l'utilisateur, comme trackId, classType, etc.
    }
}
