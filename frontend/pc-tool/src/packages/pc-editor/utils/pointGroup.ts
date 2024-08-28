import * as THREE from 'three';

class PointGroup {
    group: THREE.Group;
    points: THREE.Object3D[] = [];
    lines: THREE.Line[] = [];

    constructor(public name: string) {
        this.group = new THREE.Group();
        this.group.name = name;
    }

    addPoint(point: THREE.Object3D) {
        this.points.push(point);
        this.group.add(point);

        // If there's more than one point, create a line to the previous point
        if (this.points.length > 1) {
            const previousPoint = this.points[this.points.length - 2];
            const line = this.createLineBetweenPoints(previousPoint, point);
            this.lines.push(line);
            this.group.add(line);
        }
    }

    removePoint(point: THREE.Object3D) {
        const index = this.points.indexOf(point);
        if (index !== -1) {
            this.points.splice(index, 1);
            this.group.remove(point);

            // Remove the line connected to this point
            if (index > 0) {
                const line = this.lines[index - 1];
                this.lines.splice(index - 1, 1);
                this.group.remove(line);
            }
            if (index < this.lines.length) {
                const line = this.lines[index];
                this.lines.splice(index, 1);
                this.group.remove(line);
            }
        }
    }

    createLineBetweenPoints(point1: THREE.Object3D, point2: THREE.Object3D): THREE.Line {
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
        const geometry = new THREE.BufferGeometry().setFromPoints([
            point1.position,
            point2.position,
        ]);
        return new THREE.Line(geometry, material);
    }

    movePoint(point: THREE.Object3D, newPosition: THREE.Vector3) {
        const index = this.points.indexOf(point);
        if (index !== -1) {
            point.position.copy(newPosition);
            if (index > 0) {
                const prevLine = this.lines[index - 1];
                prevLine.geometry.setFromPoints([
                    this.points[index - 1].position,
                    point.position,
                ]);
            }
            if (index < this.lines.length) {
                const nextLine = this.lines[index];
                nextLine.geometry.setFromPoints([
                    point.position,
                    this.points[index + 1].position,
                ]);
            }
        }
    }
}

export default PointGroup;
