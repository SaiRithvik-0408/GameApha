import * as THREE from 'three';

export const BUS_COLORS = {
  red: 0xef4444,
  blue: 0x3b82f6,
  green: 0x22c55e,
  yellow: 0xeab308,
  purple: 0xa855f7,
  orange: 0xf97316,
  cyan: 0x06b6d4,
  pink: 0xec4899
};

/**
 * Creates a detailed 3D Bus Mesh
 * @param {string} colorKey 
 * @param {string} direction 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
 * @param {number} length Grid unit length (default 2)
 */
export function createBus3D(colorKey = 'blue', direction = 'UP', length = 2) {
  const group = new THREE.Group();

  const width = 1.6;
  const height = 1.3;
  const depth = length * 1.8;

  const hexColor = BUS_COLORS[colorKey] || 0x3b82f6;

  // 1. Bus Main Body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.2,
    metalness: 0.3
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = height / 2 + 0.3;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Bus Roof Top Cap
  const roofGeo = new THREE.BoxGeometry(width * 0.96, 0.2, depth * 0.96);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = height + 0.35;
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // 3. Windows & Windshield
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.1,
    metalness: 0.9,
    transmission: 0.6,
    transparent: true,
    opacity: 0.85
  });

  // Front Windshield
  const windshieldGeo = new THREE.BoxGeometry(width * 0.9, height * 0.45, 0.08);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, height * 0.7 + 0.3, -depth / 2 - 0.01);
  group.add(windshield);

  // Back Window
  const backWindow = new THREE.Mesh(windshieldGeo, glassMat);
  backWindow.position.set(0, height * 0.7 + 0.3, depth / 2 + 0.01);
  group.add(backWindow);

  // Side Windows (Left & Right)
  const sideWindowGeo = new THREE.BoxGeometry(0.08, height * 0.35, depth * 0.7);
  const leftWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  leftWindow.position.set(-width / 2 - 0.01, height * 0.7 + 0.3, 0);
  group.add(leftWindow);

  const rightWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  rightWindow.position.set(width / 2 + 0.01, height * 0.7 + 0.3, 0);
  group.add(rightWindow);

  // 4. Glowing Headlights & Taillights
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
  const lightGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 16);
  lightGeo.rotateX(Math.PI / 2);

  const leftLight = new THREE.Mesh(lightGeo, headlightMat);
  leftLight.position.set(-width * 0.35, height * 0.4, -depth / 2 - 0.02);
  group.add(leftLight);

  const rightLight = new THREE.Mesh(lightGeo, headlightMat);
  rightLight.position.set(width * 0.35, height * 0.4, -depth / 2 - 0.02);
  group.add(rightLight);

  // Taillights
  const tailLightMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const leftTail = new THREE.Mesh(lightGeo, tailLightMat);
  leftTail.position.set(-width * 0.35, height * 0.4, depth / 2 + 0.02);
  group.add(leftTail);

  const rightTail = new THREE.Mesh(lightGeo, tailLightMat);
  rightTail.position.set(width * 0.35, height * 0.4, depth / 2 + 0.02);
  group.add(rightTail);

  // 5. Wheels
  const wheelRadius = 0.35;
  const wheelWidth = 0.25;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  wheelGeo.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, metalness: 0.8, roughness: 0.2 });

  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, wheelWidth + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-width / 2 - 0.05, wheelRadius, -depth * 0.3],
    [width / 2 + 0.05, wheelRadius, -depth * 0.3],
    [-width / 2 - 0.05, wheelRadius, depth * 0.3],
    [width / 2 + 0.05, wheelRadius, depth * 0.3]
  ];

  const wheels = [];
  wheelPositions.forEach(pos => {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheelGroup.add(tire);
    wheelGroup.add(rim);
    wheelGroup.position.set(...pos);
    group.add(wheelGroup);
    wheels.push(wheelGroup);
  });

  // 6. Floating 3D Direction Arrow
  const arrowGroup = new THREE.Group();

  const arrowConeGeo = new THREE.ConeGeometry(0.35, 0.7, 16);
  arrowConeGeo.rotateX(-Math.PI / 2);

  const arrowMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffd700,
    emissiveIntensity: 0.6,
    metalness: 0.5,
    roughness: 0.1
  });

  const arrowMesh = new THREE.Mesh(arrowConeGeo, arrowMat);
  arrowMesh.castShadow = true;
  arrowGroup.add(arrowMesh);

  // Arrow position above roof
  arrowGroup.position.set(0, height + 1.1, 0);
  group.add(arrowGroup);

  // 7. Passenger Count Visual Indicators on Roof
  const capacityGroup = new THREE.Group();
  capacityGroup.position.set(0, height + 0.48, 0);

  const dotGeo = new THREE.SphereGeometry(0.12, 16, 16);
  const emptyDotMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5 });
  const filledDotMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.5 });

  const dots = [];
  const spacing = 0.35;
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(dotGeo, emptyDotMat);
    dot.position.set((i - 1) * spacing, 0, 0);
    dot.castShadow = true;
    capacityGroup.add(dot);
    dots.push(dot);
  }
  group.add(capacityGroup);

  // Apply Direction Rotation
  let rotationY = 0;
  if (direction === 'UP') rotationY = Math.PI; // Face negative Z
  else if (direction === 'DOWN') rotationY = 0; // Face positive Z
  else if (direction === 'LEFT') rotationY = -Math.PI / 2; // Face negative X
  else if (direction === 'RIGHT') rotationY = Math.PI / 2; // Face positive X

  group.rotation.y = rotationY;

  // Metadata attached to 3D object
  group.userData = {
    colorKey,
    direction,
    length,
    wheels,
    arrowGroup,
    dots,
    emptyDotMat,
    filledDotMat,
    bodyMesh,
    updateCapacity: (count) => {
      dots.forEach((dot, idx) => {
        dot.material = idx < count ? filledDotMat : emptyDotMat;
        dot.scale.setScalar(idx < count ? 1.3 : 1.0);
      });
    }
  };

  return group;
}
