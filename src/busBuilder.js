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

  // White emissive material with glow
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 0.5,
    roughness: 0.05,
    metalness: 0.1
  });

  const arrowMesh = new THREE.Mesh(geo, mat);
  arrowMesh.castShadow = true;

  // Dark background plate for contrast
  const baseGeo = new THREE.ExtrudeGeometry(shape, { ...extrudeSettings, depth: 0.04 });
  baseGeo.rotateX(Math.PI / 2);
  baseGeo.scale(1.15, 1.0, 1.15);
  const baseMat = new THREE.MeshBasicMaterial({ color: 0x0f172a });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.position.y = -0.02;

  const arrowGroup = new THREE.Group();
  arrowGroup.add(baseMesh);
  arrowGroup.add(arrowMesh);

  return arrowGroup;
}

/**
 * Creates a rounded box shape for realistic bus bodies
 */
function createRoundedBoxGeo(width, height, depth, radius = 0.15) {
  // Use a standard box but we'll add separate rounded trim pieces
  return new THREE.BoxGeometry(width, height, depth, 2, 2, 2);
}

/**
 * Creates a detailed, realistic 3D Bus Mesh
 * @param {string} colorKey 
 * @param {string} direction 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
 * @param {number} length Grid unit length (1, 2, or 3)
 * @param {number} maxCapacity Number of passengers the bus can hold
 */
export function createBus3D(colorKey = 'blue', direction = 'UP', length = 2, maxCapacity = 3) {
  const group = new THREE.Group();

  const width = 1.55;
  const height = 1.15;
  const depth = length * 1.7;

  const hexColor = BUS_COLORS[colorKey] || 0x3b82f6;
  const darkerHex = darkenColor(hexColor, 0.7);
  const lighterHex = lightenColor(hexColor, 1.25);

  // 1. Bus Main Body - Rounded appearance
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.18,
    metalness: 0.35
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = height / 2 + 0.28;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // 2. Lower body panel / skirt (darker shade)
  const skirtHeight = 0.18;
  const skirtGeo = new THREE.BoxGeometry(width + 0.04, skirtHeight, depth + 0.02);
  const skirtMat = new THREE.MeshStandardMaterial({
    color: darkerHex,
    roughness: 0.4,
    metalness: 0.2
  });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.y = 0.28 + skirtHeight / 2 - 0.02;
  skirt.castShadow = true;
  group.add(skirt);

  // 3. Bus Roof Cap (slightly lighter, rounded feel)
  const roofHeight = height + 0.3;
  const roofGeo = new THREE.BoxGeometry(width * 0.92, 0.14, depth * 0.92);
  const roofMat = new THREE.MeshStandardMaterial({
    color: lighterHex,
    roughness: 0.25,
    metalness: 0.15
  });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = roofHeight;
  roofMesh.castShadow = true;
  group.add(roofMesh);

  // 4. Rounded roof edge trim
  const trimGeo = new THREE.BoxGeometry(width + 0.06, 0.06, depth + 0.04);
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.1,
    metalness: 0.6,
    transparent: true,
    opacity: 0.3
  });
  const trimMesh = new THREE.Mesh(trimGeo, trimMat);
  trimMesh.position.y = roofHeight - 0.05;
  group.add(trimMesh);

  // 5. Bold White Direction Arrow Printed on Roof
  // Make arrow smaller and shift forward to make room for dots
  const arrowMesh = createBoldArrowMesh(0.65, Math.min(depth * 0.4, 0.9));
  arrowMesh.position.set(0, roofHeight + 0.1, -depth * 0.15);
  group.add(arrowMesh);

  // 6. Front Windshield (curved glass look)
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x1e293b,
    roughness: 0.05,
    metalness: 0.9,
    transmission: 0.6,
    transparent: true,
    opacity: 0.88,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1
  });

  const windshieldGeo = new THREE.BoxGeometry(width * 0.86, height * 0.5, 0.06);
  const windshield = new THREE.Mesh(windshieldGeo, glassMat);
  windshield.position.set(0, height * 0.7 + 0.28, -depth / 2 - 0.01);
  group.add(windshield);

  // Front bumper
  const bumperGeo = new THREE.BoxGeometry(width * 0.95, 0.12, 0.12);
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.3,
    metalness: 0.7
  });
  const frontBumper = new THREE.Mesh(bumperGeo, bumperMat);
  frontBumper.position.set(0, 0.35, -depth / 2 - 0.04);
  group.add(frontBumper);

  // 7. Back Window + rear bumper
  const backWindow = new THREE.Mesh(windshieldGeo, glassMat);
  backWindow.position.set(0, height * 0.7 + 0.28, depth / 2 + 0.01);
  group.add(backWindow);

  const rearBumper = new THREE.Mesh(bumperGeo, bumperMat);
  rearBumper.position.set(0, 0.35, depth / 2 + 0.04);
  group.add(rearBumper);

  // 8. Side Windows with chrome frames
  const sideWindowGeo = new THREE.BoxGeometry(0.06, height * 0.38, depth * 0.68);
  const leftWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  leftWindow.position.set(-width / 2 - 0.01, height * 0.68 + 0.28, 0);
  group.add(leftWindow);

  const rightWindow = new THREE.Mesh(sideWindowGeo, glassMat);
  rightWindow.position.set(width / 2 + 0.01, height * 0.68 + 0.28, 0);
  group.add(rightWindow);

  // Chrome window frame strips
  const chromeFrameMat = new THREE.MeshStandardMaterial({
    color: 0xd4d4d8,
    roughness: 0.1,
    metalness: 0.9
  });
  const frameGeo = new THREE.BoxGeometry(0.04, 0.04, depth * 0.72);
  
  const leftFrameTop = new THREE.Mesh(frameGeo, chromeFrameMat);
  leftFrameTop.position.set(-width / 2 - 0.02, height * 0.68 + 0.28 + height * 0.19, 0);
  group.add(leftFrameTop);

  const rightFrameTop = new THREE.Mesh(frameGeo, chromeFrameMat);
  rightFrameTop.position.set(width / 2 + 0.02, height * 0.68 + 0.28 + height * 0.19, 0);
  group.add(rightFrameTop);

  // 9. Headlights (round, with glow)
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfffde7,
    emissive: 0xfff59d,
    emissiveIntensity: 0.8,
    roughness: 0.1
  });
  const lightGeo = new THREE.SphereGeometry(0.1, 16, 16);

  const leftLight = new THREE.Mesh(lightGeo, headlightMat);
  leftLight.position.set(-width * 0.35, height * 0.38, -depth / 2 - 0.04);
  group.add(leftLight);

  const rightLight = new THREE.Mesh(lightGeo, headlightMat);
  rightLight.position.set(width * 0.35, height * 0.38, -depth / 2 - 0.04);
  group.add(rightLight);

  // Taillights (red)
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff1744,
    emissive: 0xff1744,
    emissiveIntensity: 0.5,
    roughness: 0.2
  });

  const leftTaillight = new THREE.Mesh(lightGeo, taillightMat);
  leftTaillight.position.set(-width * 0.35, height * 0.38, depth / 2 + 0.04);
  group.add(leftTaillight);

  const rightTaillight = new THREE.Mesh(lightGeo, taillightMat);
  rightTaillight.position.set(width * 0.35, height * 0.38, depth / 2 + 0.04);
  group.add(rightTaillight);

  // 10. Front grille
  const grilleMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 0.5,
    metalness: 0.4
  });
  const grilleGeo = new THREE.BoxGeometry(width * 0.5, 0.18, 0.04);
  const grille = new THREE.Mesh(grilleGeo, grilleMat);
  grille.position.set(0, 0.5, -depth / 2 - 0.03);
  group.add(grille);

  // 11. Wheels with detailed rims and hubcaps
  const wheelRadius = 0.3;
  const wheelWidth = 0.2;
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  wheelGeo.rotateZ(Math.PI / 2);

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.75 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe4e4e7, metalness: 0.85, roughness: 0.15 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xa3a3a3, metalness: 0.9, roughness: 0.1 });

  const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.6, wheelRadius * 0.6, wheelWidth + 0.02, 16);
  rimGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(wheelRadius * 0.2, wheelRadius * 0.2, wheelWidth + 0.04, 8);
  hubGeo.rotateZ(Math.PI / 2);

  const wheelPositions = [
    [-width / 2 - 0.06, wheelRadius, -depth * 0.32],
    [width / 2 + 0.06, wheelRadius, -depth * 0.32],
    [-width / 2 - 0.06, wheelRadius, depth * 0.32],
    [width / 2 + 0.06, wheelRadius, depth * 0.32]
  ];

  const wheels = [];
  wheelPositions.forEach(pos => {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    const hub = new THREE.Mesh(hubGeo, hubMat);
    wheelGroup.add(tire);
    wheelGroup.add(rim);
    wheelGroup.add(hub);
    wheelGroup.position.set(...pos);
    group.add(wheelGroup);
    wheels.push(wheelGroup);
  });

  // 12. Passenger Count Indicators (Exact number of dots based on capacity)
  const capacityGroup = new THREE.Group();
  capacityGroup.position.set(0, roofHeight + 0.18, depth * 0.25);

  const dotGeo = new THREE.SphereGeometry(0.1, 16, 16);
  const emptyDotMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 });
  const filledDotMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.7 });

  const dots = [];
  const spacing = 0.28;
  const startX = -((maxCapacity - 1) * spacing) / 2; // Center the dots
  for (let i = 0; i < maxCapacity; i++) {
    const dot = new THREE.Mesh(dotGeo, emptyDotMat);
    dot.position.set(startX + (i * spacing), 0, 0);
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

// Color utility helpers
function darkenColor(hex, factor) {
  const r = ((hex >> 16) & 0xff) * factor;
  const g = ((hex >> 8) & 0xff) * factor;
  const b = (hex & 0xff) * factor;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function lightenColor(hex, factor) {
  const r = Math.min(255, ((hex >> 16) & 0xff) * factor);
  const g = Math.min(255, ((hex >> 8) & 0xff) * factor);
  const b = Math.min(255, (hex & 0xff) * factor);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}
