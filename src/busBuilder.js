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
 * Creates a bold 3D arrow geometry for bus roofs
 */
function createBoldArrowMesh(width = 0.8, depth = 1.0) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const d = depth / 2;
  const stemW = w * 0.45;
  const headLength = d * 0.55;

  // Draw arrow shape pointing in negative Z direction (forward)
  shape.moveTo(0, -d);                     // Tip
  shape.lineTo(w, -d + headLength);        // Right Head corner
  shape.lineTo(stemW, -d + headLength);    // Right Inner notch
  shape.lineTo(stemW, d);                  // Right Stem base
  shape.lineTo(-stemW, d);                 // Left Stem base
  shape.lineTo(-stemW, -d + headLength);   // Left Inner notch
  shape.lineTo(-w, -d + headLength);       // Left Head corner
  shape.closePath();

  const extrudeSettings = {
    depth: 0.08,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.03,
    bevelThickness: 0.03
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(Math.PI / 2); // Lay flat on XZ plane

  // White emissive material with dark border background
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.4,
    roughness: 0.1,
    metalness: 0.1
  });

  const arrowMesh = new THREE.Mesh(geo, mat);
  arrowMesh.castShadow = true;

  // Dark background base outline plate for maximum contrast
  const baseGeo = new THREE.ExtrudeGeometry(shape, { ...extrudeSettings, depth: 0.04 });
  baseGeo.rotateX(Math.PI / 2);
  baseGeo.scale(1.12, 1.0, 1.12);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.02;

  const arrowGroup = new THREE.Group();
  arrowGroup.add(baseMesh);
  arrowGroup.add(arrowMesh);

  return arrowGroup;
}

/**
 * Creates a detailed 3D Bus Mesh
 * @param {string} colorKey 
 * @param {string} direction 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
 * @param {number} length Grid unit length (1, 2, or 3)
 */
export function createBus3D(colorKey = 'blue', direction = 'UP', length = 2) {
  const group = new THREE.Group();

  const width = 1.6;
  const height = 1.2;
  const depth = length * 1.7;

  const hexColor = BUS_COLORS[colorKey] || 0x3b82f6;

  // 1. Bus Main Body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.25,
    metalness: 0.2
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = height / 2 + 0.25;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Bus Roof Cap
  const roofHeight = height + 0.26;
  const roofGeo = new THREE.BoxGeometry(width * 0.94, 0.12, depth * 0.94);
  const roofMat = new THREE.MeshStandardMaterial({ color: hexColor, roughness: 0.3 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = roofHeight;
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // 3. Bold White Direction Arrow Printed on Roof
  const arrowMesh = createBoldArrowMesh(0.85, Math.min(depth * 0.6, 1.2));
  arrowMesh.position.set(0, roofHeight + 0.08, 0);
  group.add(arrowMesh);

  // 4. Windows & Windshield
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.1,
    metalness: 0.8,
    transmission: 0.5,
    transparent: true,
    opacity: 0.85
  });

  // Front Windshield
  const windshieldGeo = new THREE.BoxGeometry(width * 0.88, height * 0.45, 0.08);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, height * 0.65 + 0.25, -depth / 2 - 0.01);
  group.add(windshield);

  // Back Window
  const backWindow = new THREE.Mesh(windshieldGeo, glassMat);
  backWindow.position.set(0, height * 0.65 + 0.25, depth / 2 + 0.01);
  group.add(backWindow);

  // Side Windows
  const sideWindowGeo = new THREE.BoxGeometry(0.08, height * 0.35, depth * 0.7);
  const leftWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  leftWindow.position.set(-width / 2 - 0.01, height * 0.65 + 0.25, 0);
  group.add(leftWindow);

  const rightWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  rightWindow.position.set(width / 2 + 0.01, height * 0.65 + 0.25, 0);
  group.add(rightWindow);

  // 5. Headlights & Taillights
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb });
  const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16);
  lightGeo.rotateX(Math.PI / 2);

  const leftLight = new THREE.Mesh(lightGeo, headlightMat);
  leftLight.position.set(-width * 0.35, height * 0.35, -depth / 2 - 0.02);
  group.add(leftLight);

  const rightLight = new THREE.Mesh(lightGeo, headlightMat);
  rightLight.position.set(width * 0.35, height * 0.35, -depth / 2 - 0.02);
  group.add(rightLight);

  // 6. Wheels
  const wheelRadius = 0.32;
  const wheelWidth = 0.22;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  wheelGeo.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, metalness: 0.8, roughness: 0.2 });

  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.55, wheelRadius * 0.55, wheelWidth + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-width / 2 - 0.04, wheelRadius, -depth * 0.3],
    [width / 2 + 0.04, wheelRadius, -depth * 0.3],
    [-width / 2 - 0.04, wheelRadius, depth * 0.3],
    [width / 2 + 0.04, wheelRadius, depth * 0.3]
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

  // 7. Passenger Count Indicators (3 Dots on Roof Base)
  const capacityGroup = new THREE.Group();
  capacityGroup.position.set(0, roofHeight + 0.16, depth * 0.3);

  const dotGeo = new THREE.SphereGeometry(0.1, 16, 16);
  const emptyDotMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const filledDotMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.6 });

  const dots = [];
  const spacing = 0.28;
  for (let i = 0; i < 3; i++) {
    const dot = new THREE.Mesh(dotGeo, emptyDotMat);
    dot.position.set((i - 1) * spacing, 0, 0);
    dot.castShadow = true;
    capacityGroup.add(dot);
    dots.push(dot);
  }
  group.add(capacityGroup);

  // Apply Direction Rotation so arrow and headlights point in exact movement direction
  let rotationY = 0;
  if (direction === 'UP') rotationY = 0;                  // Point forward towards negative Z (UP)
  else if (direction === 'DOWN') rotationY = Math.PI;     // Point forward towards positive Z (DOWN)
  else if (direction === 'LEFT') rotationY = Math.PI / 2;  // Point forward towards negative X (LEFT)
  else if (direction === 'RIGHT') rotationY = -Math.PI / 2; // Point forward towards positive X (RIGHT)

  group.rotation.y = rotationY;

  // Metadata attached to 3D object
  group.userData = {
    colorKey,
    direction,
    length,
    wheels,
    arrowMesh,
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
