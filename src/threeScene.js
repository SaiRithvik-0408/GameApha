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
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    // 2. Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a); // Dark sleek background
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.025);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );

    // Position Camera for isometric top-down gameplay view
    this.camera.position.set(0, 15, 14);
    this.camera.lookAt(0, -0.5, -1);

    // 3. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff5ea, 1.4);
    dirLight.position.set(12, 22, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -12;
    dirLight.shadow.camera.right = 12;
    dirLight.shadow.camera.top = 12;
    dirLight.shadow.camera.bottom = -12;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    // Raycaster for touch/click interaction
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.initEnvironment();

    window.addEventListener('resize', () => this.onWindowResize());
  }

  initEnvironment() {
    // 1. Main Parking Ground (Asphalt Floor)
    const groundGeo = new THREE.PlaneGeometry(30, 30);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 2. 6x6 Grid Base Platform
    const gridGeo = new THREE.BoxGeometry(11, 0.1, 11);
    const gridMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.2
    });
    const gridBase = new THREE.Mesh(gridGeo, gridMat);
    gridBase.position.set(0, 0.05, 1);
    gridBase.receiveShadow = true;
    this.scene.add(gridBase);

    // Grid Cell Lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
    const gridSize = 6;
    const cellSize = 1.8;
    const startX = -((gridSize * cellSize) / 2) + cellSize / 2;
    const startZ = -((gridSize * cellSize) / 2) + cellSize / 2 + 1;

    for (let r = 0; r <= gridSize; r++) {
      const points = [];
      const z = -((gridSize * cellSize) / 2) + r * cellSize + 1;
      points.push(new THREE.Vector3(-gridSize * cellSize / 2, 0.11, z));
      points.push(new THREE.Vector3(gridSize * cellSize / 2, 0.11, z));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
    }

    for (let c = 0; c <= gridSize; c++) {
      const points = [];
      const x = -((gridSize * cellSize) / 2) + c * cellSize;
      points.push(new THREE.Vector3(x, 0.11, -gridSize * cellSize / 2 + 1));
      points.push(new THREE.Vector3(x, 0.11, gridSize * cellSize / 2 + 1));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeo, lineMat);
      this.scene.add(line);
    }

    // 3. Passenger Station Boarding Platform (Top Front)
    const platformGeo = new THREE.BoxGeometry(13, 0.3, 3);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.3,
      metalness: 0.2
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.set(0, 0.15, -6);
    platform.receiveShadow = true;
    platform.castShadow = true;
    this.scene.add(platform);

    // Decorative Canopy Roof
    const canopyGeo = new THREE.BoxGeometry(13.4, 0.2, 3.4);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.set(0, 3.5, -6);
    canopy.castShadow = true;
    this.scene.add(canopy);

    // Pillars supporting canopy
    const pillarGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 16);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 });
    [-6, 6].forEach(px => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 1.75, -6);
      pillar.castShadow = true;
      this.scene.add(pillar);
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
