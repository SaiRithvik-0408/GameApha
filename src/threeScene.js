import * as THREE from 'three';

export class GameScene {
  constructor(container) {
    this.container = container;

    // 1. Renderer Setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdbeafe); // Bright daylight background sky
    this.scene.fog = new THREE.FogExp2(0xdbeafe, 0.015);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );

    // Position Camera for top-down isometric gameplay view matching reference images
    this.camera.position.set(0, 18, 15);
    this.camera.lookAt(0, -0.5, 0.5);

    // 3. Lighting (Enhanced for punchy, vibrant look)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.8);
    dirLight.position.set(20, 30, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 80;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.02;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x7dd3fc, 0.6);
    fillLight.position.set(-15, 15, -15);
    this.scene.add(fillLight);

    // Raycaster for touch/click interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.createSkybox();
    this.initEnvironment();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  createSkybox() {
    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const fragmentShader = `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + offset).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;
    const uniforms = {
      topColor: { value: new THREE.Color(0x38bdf8) }, // Bright blue sky
      bottomColor: { value: new THREE.Color(0xfdf4ff) }, // Soft pinkish horizon
      offset: { value: 33 },
      exponent: { value: 0.6 }
    };
    const skyGeo = new THREE.SphereGeometry(80, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  initEnvironment() {
    // 1. Main Asphalt Ground
    const groundGeo = new THREE.PlaneGeometry(40, 40);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Clean light grey pavement like reference image
      roughness: 0.7,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. Upper Grass & Park Terrain (Top Section matching Reference Image)
    const grassGeo = new THREE.PlaneGeometry(40, 12);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x86efac, // Bright park green grass
      roughness: 0.9
    });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0.02, -10);
    grass.receiveShadow = true;
    this.scene.add(grass);

    // Curved Winding Pedestrian Pathway on Top Grass
    const pathCurve = new THREE.EllipseCurve(
      0, -10,            // ax, aY
      6, 3.5,            // xRadius, yRadius
      0, Math.PI,        // aStartAngle, aEndAngle
      false,             // aClockwise
      0                  // aRotation
    );

    const points = pathCurve.getPoints(50);
    const pathGeo = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0.04, p.y))
    );
    const pathMat = new THREE.LineBasicMaterial({ color: 0xfef08a, linewidth: 8 }); // Yellow path outline
    const pathLine = new THREE.Line(pathGeo, pathMat);
    this.scene.add(pathLine);

    // 3. Grid Base Platform (Lower Section)
    const gridGeo = new THREE.BoxGeometry(10.5, 0.08, 10.5);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.6
    });
    const gridBase = new THREE.Mesh(gridGeo, gridMat);
    gridBase.position.set(0, 0.04, 3.5);
    gridBase.receiveShadow = true;
    this.scene.add(gridBase);

    // Subtle Grid Tile Lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcbd5e6, transparent: true, opacity: 0.4 });
    const gridSize = 5;
    const cellSize = 2.0;

    for (let r = 0; r <= gridSize; r++) {
      const pts = [];
      const z = -((gridSize * cellSize) / 2) + r * cellSize + 3.5;
      pts.push(new THREE.Vector3(-gridSize * cellSize / 2, 0.09, z));
      pts.push(new THREE.Vector3(gridSize * cellSize / 2, 0.09, z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.scene.add(line);
    }

    for (let c = 0; c <= gridSize; c++) {
      const pts = [];
      const x = -((gridSize * cellSize) / 2) + c * cellSize;
      pts.push(new THREE.Vector3(x, 0.09, -gridSize * cellSize / 2 + 3.5));
      pts.push(new THREE.Vector3(x, 0.09, gridSize * cellSize / 2 + 3.5));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.scene.add(line);
    }

    // 4. Angled Parking Slot Outlines on Asphalt Roadway (Matching Reference Image)
    const numDocks = 6;
    const dockWidth = 1.6;
    const startDockX = -4.8;
    const dockZ = -4.5;

    for (let i = 0; i < numDocks; i++) {
      const slotX = startDockX + i * dockWidth;

      // Draw angled yellow/white slot boundary rectangle
      const slotRectGeo = new THREE.PlaneGeometry(1.5, 2.6);
      const isVIP = false;
      const slotRectMat = new THREE.MeshStandardMaterial({
        color: isVIP ? 0xfacc15 : 0x64748b, // Yellow for VIP, grey/white for standard
        roughness: 0.5,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      });
      const slotMesh = new THREE.Mesh(slotRectGeo, slotRectMat);
      slotMesh.rotation.x = -Math.PI / 2;
      slotMesh.rotation.z = Math.PI / 12; // Slight diagonal angle matching reference image
      slotMesh.position.set(slotX, 0.03, dockZ);
      slotMesh.receiveShadow = true;
      this.scene.add(slotMesh);
    }
    
    this.createScenery();
  }

  createScenery() {
    // Low-poly trees around the park
    const treePositions = [
      { x: -12, z: -14 }, { x: -8, z: -16 }, { x: -15, z: -8 },
      { x: 12, z: -13 }, { x: 9, z: -17 }, { x: 16, z: -9 },
      { x: -10, z: -5 }, { x: 11, z: -4 }
    ];

    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.5, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    
    const leavesGeo = new THREE.IcosahedronGeometry(1.2, 0);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.8, flatShading: true });

    treePositions.forEach(pos => {
      const tree = new THREE.Group();
      
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.75;
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      
      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 2.0;
      leaves.castShadow = true;
      leaves.receiveShadow = true;
      
      tree.add(trunk);
      tree.add(leaves);
      
      // Randomize scale and rotation a bit
      const scale = 0.8 + Math.random() * 0.5;
      tree.scale.set(scale, scale, scale);
      tree.rotation.y = Math.random() * Math.PI;
      
      tree.position.set(pos.x, 0.02, pos.z);
      this.scene.add(tree);
    });
  }

  onWindowResize() {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
