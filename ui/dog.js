// Procedural low-poly golden retriever. No asset files, every part is a
// three.js primitive, so the coat color and every animation stay customizable.
import * as THREE from './vendor/three.module.min.js';

const COATS = {
  golden: '#d59a52',
  cream: '#e6d0a8',
  red: '#b46a3c',
  chocolate: '#6d4a32',
};

function coatPalette(coat) {
  const base = new THREE.Color(COATS[coat] || coat || COATS.golden);
  const light = base.clone().offsetHSL(0.01, -0.05, 0.18); // chest, muzzle, paws
  const dark = base.clone().offsetHSL(-0.01, 0.02, -0.1); // ears, tail base
  return { base, light, dark };
}

function mat(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function sphere(material, r, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 22), material);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function heartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff7d9c';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(6, 36, 8, 12, 24, 12);
  g.bezierCurveTo(30, 12, 32, 18, 32, 20);
  g.bezierCurveTo(32, 18, 34, 12, 40, 12);
  g.bezierCurveTo(56, 12, 58, 36, 32, 56);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export class Dog {
  constructor(coat) {
    const { base, light, dark } = coatPalette(coat);
    const coatMat = mat(base);
    const lightMat = mat(light);
    const darkMat = mat(dark);
    const noseMat = mat('#241a14', 0.5);
    const eyeMat = mat('#2a1c10', 0.35);

    this.group = new THREE.Group();
    const dog = new THREE.Group();
    this.dog = dog;
    this.group.add(dog);

    // -- body (seated) --
    this.haunch = sphere(coatMat, 0.62, 1.15, 0.8, 1.0, 0, 0.58, -0.12);
    this.torso = sphere(coatMat, 0.5, 0.95, 1.3, 0.85, 0, 1.02, 0.08);
    this.torso.rotation.x = -0.12;
    this.chest = sphere(lightMat, 0.34, 0.85, 1.1, 0.7, 0, 0.92, 0.4);
    dog.add(this.haunch, this.torso, this.chest);

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.5, 6, 14), coatMat);
      leg.position.set(side * 0.22, 0.42, 0.42);
      leg.castShadow = true;
      const paw = sphere(lightMat, 0.13, 1, 0.65, 1.5, side * 0.22, 0.09, 0.52);
      const hindPaw = sphere(lightMat, 0.14, 1, 0.55, 1.5, side * 0.45, 0.08, 0.22);
      dog.add(leg, paw, hindPaw);
    }

    // -- head --
    const head = new THREE.Group();
    head.position.set(0, 1.78, 0.18);
    this.head = head;
    head.add(sphere(coatMat, 0.46, 0.95, 0.9, 0.9, 0, 0, 0));
    head.add(sphere(lightMat, 0.3, 0.85, 0.72, 1.1, 0, -0.1, 0.36));
    head.add(sphere(noseMat, 0.09, 1, 0.78, 0.8, 0, 0.02, 0.66));
    // open, panting mouth
    head.add(sphere(noseMat, 0.11, 1.2, 0.5, 0.7, 0, -0.28, 0.42));
    this.tongue = sphere(mat('#e98a9c', 0.6), 0.08, 0.9, 1.4, 0.55, 0, -0.34, 0.5);
    this.tongue.rotation.x = 0.5;
    head.add(this.tongue);

    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = sphere(eyeMat, 0.066, 1, 1, 0.8, side * 0.17, 0.12, 0.36);
      const shine = sphere(mat('#ffffff', 0.2), 0.02, 1, 1, 1, side * 0.15, 0.15, 0.41);
      head.add(eye, shine);
      this.eyes.push(eye);
    }

    this.ears = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.38, 0.26, 0.0);
      const flap = sphere(darkMat, 0.21, 0.62, 1.15, 0.34, 0, -0.22, 0);
      pivot.add(flap);
      pivot.rotation.z = side * 0.55;
      pivot.userData.side = side;
      head.add(pivot);
      this.ears.push(pivot);
    }
    dog.add(head);

    // -- tail: chained segments so the wag whips --
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.72, -0.66);
    this.tailSegs = [];
    let parent = this.tail;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, 0.05, -0.15);
      seg.rotation.x = -0.22;
      const m = i >= 3 ? lightMat : darkMat;
      seg.add(sphere(m, 0.11 - i * 0.014, 1, 1, 1.4, 0, 0, -0.05));
      parent.add(seg);
      parent = seg;
      this.tailSegs.push(seg);
    }
    dog.add(this.tail);

    // -- soft contact shadow pool --
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 48),
      new THREE.ShadowMaterial({ opacity: 0.4 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.group.add(ground);

    // -- hearts (spawned on a happy answer) --
    this.hearts = [];
    this.heartTex = null;

    this.mode = 'enter';
    this.modeTime = 0;
    // Animation targets, lerped every frame so mode changes feel organic.
    this.cur = { tailSpeed: 6, tailAmp: 0.5, earDroop: 0, headTiltZ: 0, bodyDrop: 0 };
    this.tgt = { ...this.cur };
    this.blinkAt = 2.5;
    this.blinkT = -1;
    this.spin = 0;
    this.t = 0;
    this.dog.position.x = -6;
  }

  setMode(mode) {
    this.mode = mode;
    this.modeTime = 0;
    const t = this.tgt;
    if (mode === 'idle') Object.assign(t, { tailSpeed: 6, tailAmp: 0.5, earDroop: 0, headTiltZ: 0, bodyDrop: 0 });
    if (mode === 'ask') Object.assign(t, { tailSpeed: 4, tailAmp: 0.35, earDroop: -0.12, headTiltZ: 0.3, bodyDrop: 0 });
    if (mode === 'happy') {
      Object.assign(t, { tailSpeed: 14, tailAmp: 0.75, earDroop: -0.1, headTiltZ: 0, bodyDrop: 0 });
      this.spin = Math.PI * 2;
    }
    if (mode === 'sad') Object.assign(t, { tailSpeed: 1.6, tailAmp: 0.18, earDroop: 0.35, headTiltZ: 0.24, bodyDrop: 0.08 });
    if (mode === 'leave') Object.assign(t, { tailSpeed: 8, tailAmp: 0.6, earDroop: 0, headTiltZ: 0, bodyDrop: 0 });
  }

  spawnHearts(scene) {
    if (!this.heartTex) this.heartTex = heartTexture();
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.heartTex, transparent: true, opacity: 0.95 })
      );
      const scale = 0.22 + (i % 3) * 0.08;
      s.scale.set(scale, scale, 1);
      s.position.set((i / 4 - 1) * 0.9, 1.4 + (i % 3) * 0.3, 0.6);
      s.userData = { vy: 0.55 + (i % 4) * 0.14, vx: ((i % 5) - 2) * 0.07, life: 0 };
      scene.add(s);
      this.hearts.push(s);
    }
  }

  update(dt) {
    this.t += dt;
    this.modeTime += dt;
    const t = this.t;

    // ease current params toward the mode targets
    const k = Math.min(1, dt * 4);
    for (const key of Object.keys(this.cur)) {
      this.cur[key] += (this.tgt[key] - this.cur[key]) * k;
    }
    const c = this.cur;

    // entrance / exit walk
    if (this.mode === 'enter') {
      this.dog.position.x = Math.min(0, this.dog.position.x + dt * 3.2);
      this.dog.position.y = Math.abs(Math.sin(t * 11)) * 0.05;
      this.dog.rotation.z = Math.sin(t * 11) * 0.03;
      if (this.dog.position.x >= 0) this.setMode('idle');
    } else if (this.mode === 'leave') {
      this.dog.position.x += dt * 3.6;
      this.dog.position.y = Math.abs(Math.sin(t * 11)) * 0.05;
    } else if (this.mode === 'happy') {
      // bouncy hops with squash-and-stretch, plus one full spin
      const hop = Math.abs(Math.sin(this.modeTime * 5.2));
      this.dog.position.y = hop * 0.32;
      this.dog.scale.y = 1 + (hop - 0.5) * 0.1;
      if (this.spin > 0) {
        const step = dt * 7;
        this.dog.rotation.y += step;
        this.spin -= step;
        if (this.spin <= 0) this.dog.rotation.y = 0;
      }
    } else {
      // settle toward the mode's posture (sad mode sits a little lower)
      this.dog.position.y += (-c.bodyDrop - this.dog.position.y) * k;
      this.dog.rotation.z *= 1 - k;
      this.dog.scale.y += (1 - this.dog.scale.y) * k;
    }

    // breathing
    const breathe = 1 + Math.sin(t * 2.4) * 0.015;
    this.torso.scale.set(0.95, 1.3 * breathe, 0.85);

    // head: gentle look-around, mode tilt
    this.head.rotation.y = Math.sin(t * 0.45) * 0.14;
    this.head.rotation.x = Math.sin(t * 0.31) * 0.06 + c.bodyDrop;
    this.head.rotation.z += (c.headTiltZ * Math.sin(this.modeTime * 0.9 + 1) - this.head.rotation.z) * k * 1.5;

    // panting tongue
    this.tongue.position.y = -0.34 + Math.sin(t * 9) * 0.012;
    this.tongue.scale.y = 1.4 + Math.sin(t * 9) * 0.08;

    // ears: sway + droop
    for (const ear of this.ears) {
      const side = ear.userData.side;
      ear.rotation.z = side * (0.55 + c.earDroop) + Math.sin(t * 3 + side) * 0.04;
    }

    // tail wag with per-segment phase lag
    this.tail.rotation.y = Math.sin(t * c.tailSpeed) * c.tailAmp;
    this.tailSegs.forEach((seg, i) => {
      seg.rotation.y = Math.sin(t * c.tailSpeed - (i + 1) * 0.55) * c.tailAmp * 0.45;
    });

    // blink
    if (this.blinkT < 0 && t > this.blinkAt) this.blinkT = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const s = this.blinkT < 0.13 ? 0.08 : 1;
      for (const eye of this.eyes) eye.scale.y = s;
      if (this.blinkT > 0.15) {
        this.blinkT = -1;
        this.blinkAt = t + 2.2 + Math.random() * 2.8;
      }
    }

    // hearts drift up and fade
    for (let i = this.hearts.length - 1; i >= 0; i--) {
      const h = this.hearts[i];
      h.userData.life += dt;
      h.position.y += h.userData.vy * dt;
      h.position.x += h.userData.vx * dt;
      h.material.opacity = Math.max(0, 0.95 - h.userData.life * 0.45);
      if (h.material.opacity <= 0) {
        h.removeFromParent();
        h.material.dispose();
        this.hearts.splice(i, 1);
      }
    }
  }
}

export function createScene(canvas, coat) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 1.7, 7.4);
  camera.lookAt(0, 1.15, 0);

  scene.add(new THREE.HemisphereLight('#8fa3c7', '#241b12', 0.6));
  const key = new THREE.DirectionalLight('#ffd9a8', 1.5);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.bottom = -4;
  key.shadow.camera.top = 4;
  // wide enough to cover the walk-in/walk-out path
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  scene.add(key);
  const rim = new THREE.DirectionalLight('#7a9cff', 0.55);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const dog = new Dog(coat);
  scene.add(dog.group);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    dog.update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { dog, scene };
}
