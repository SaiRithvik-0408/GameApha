import * as THREE from 'three';
import { BUS_COLORS } from './busBuilder.js';

/**
 * Creates a stylized 3D Passenger character mesh
 * @param {string} colorKey 
 */
export function createPassenger3D(colorKey = 'blue') {
  const group = new THREE.Group();
  const hexColor = BUS_COLORS[colorKey] || 0x3b82f6;

  // Head
  const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.4 });
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.05;
  head.castShadow = true;
  group.add(head);

  // Hair/Cap
  const hairGeo = new THREE.SphereGeometry(0.26, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 1.06;
  group.add(hair);

  // Body / Shirt
  const bodyGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.5, 16);
  const shirtMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.3,
    metalness: 0.1
  });
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 0.65;
  body.castShadow = true;
  group.add(body);

  // Pants / Legs
  const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.4, 12);
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });

  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.1, 0.2, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.1, 0.2, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Attach metadata
  group.userData = {
    colorKey,
    head,
    body,
    leftLeg,
    rightLeg,
    animTime: Math.random() * 10
  };

  return group;
}
