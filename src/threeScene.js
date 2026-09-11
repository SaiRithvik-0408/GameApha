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

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.5);
    dirLight.position.set(15, 25, 12);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-12, 12, -12);
    this.scene.add(fillLight);

    // Raycaster for touch/click interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.initEnvironment();

    window.addEventListener('resize', () => this.onWindowResize());
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
    const gridGeo = new THREE.BoxGeometry(11.5, 0.08, 11.5);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.6
    });
    const gridBase = new THREE.Mesh(gridGeo, gridMat);
    gridBase.position.set(0, 0.04, 1.5);
    gridBase.receiveShadow = true;
    this.scene.add(gridBase);

    // Subtle Grid Tile Lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0xcbd5e6, transparent: true, opacity: 0.4 });
    const gridSize = 6;
    const cellSize = 1.8;

    for (let r = 0; r <= gridSize; r++) {
      const pts = [];
      const z = -((gridSize * cellSize) / 2) + r * cellSize + 1.5;
      pts.push(new THREE.Vector3(-gridSize * cellSize / 2, 0.09, z));
      pts.push(new THREE.Vector3(gridSize * cellSize / 2, 0.09, z));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.scene.add(line);
    }

    for (let c = 0; c <= gridSize; c++) {
      const pts = [];
      const x = -((gridSize * cellSize) / 2) + c * cellSize;
      pts.push(new THREE.Vector3(x, 0.09, -gridSize * cellSize / 2 + 1.5));
      pts.push(new THREE.Vector3(x, 0.09, gridSize * cellSize / 2 + 1.5));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
      this.scene.add(line);
    }

    // 4. Angled Parking Slot Outlines on Asphalt Roadway (Matching Reference Image)
    const numDocks = 6;
    const dockWidth = 1.8;
    const startDockX = -4.5;
    const dockZ = -4.2;

    for (let i = 0; i < numDocks; i++) {
      const slotX = startDockX + i * dockWidth;

      // Draw angled yellow/white slot boundary rectangle
      const slotRectGeo = new THREE.PlaneGeometry(1.5, 2.6);
      const isVIP = i === 0;
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
