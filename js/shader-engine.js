// shaderEngine.js — Three.js procedural WebGL planet for AETHER
// ---------------------------------------------------------------------------
// Performance-minded shader engine with quality tiers (desktop/mobile).

// Simplex 3D noise (Ashima Arts / Stefan Gustavson, MIT)
const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+2.0*C.xxx;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
        i.z+vec4(0.0,i1.z,i2.z,1.0))
      +i.y+vec4(0.0,i1.y,i2.y,1.0))
      +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 xx=x_*ns.x+ns.yyyy;
  vec4 yy=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(xx)-abs(yy);
  vec4 b0=vec4(xx.xy,yy.xy);
  vec4 b1=vec4(xx.zw,yy.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=inversesqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const VERTEX_SHADER = /* glsl */`
${NOISE_GLSL}
varying vec3 vNormal;
varying vec3 vLocal;
varying float vElev;
uniform float uTime;
uniform float uOpticalDepth;
uniform float uIntensity;
uniform float uDetail;

// 2-octave fbm only. 3rd octave costs ~50% more vertex ALU for negligible detail.
float fbm2(vec3 p){
  return 0.5*snoise(p) + 0.25*snoise(p*2.03);
}

void main(){
  vNormal = normalize(normalMatrix * normal);
  vLocal = position;

  float continents = fbm2(position * 1.6 + vec3(0.0, uTime*0.04, 0.0));
  float detail = uDetail * 0.5 * snoise(position * 4.1 + vec3(uTime*0.02,0.0,0.0));
  float h = (continents + detail) * 0.055 * uIntensity;
  h *= mix(1.0, 0.45, clamp(uOpticalDepth/8.0, 0.0, 1.0));

  vec3 displaced = position + normal * h;
  vElev = h;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */`
varying vec3 vNormal;
varying vec3 vLocal;
varying float vElev;

uniform float uSurfaceTemp;
uniform float uOpticalDepth;
uniform vec3  uStarDir;
uniform vec3  uStarColor;
uniform float uTime;

void main(){
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uStarDir);
  float lambert = max(dot(N, L), 0.0);
  float wrap = max(dot(N, L)*0.5+0.5, 0.0);
  float lat = abs(vLocal.y / length(vLocal));

  vec3 deepOcean = vec3(0.01, 0.06, 0.22);
  vec3 ocean     = vec3(0.05, 0.25, 0.55);
  vec3 coast     = vec3(0.10, 0.45, 0.65);
  vec3 grass     = vec3(0.22, 0.52, 0.22);
  vec3 desert    = vec3(0.70, 0.55, 0.32);
  vec3 rock      = vec3(0.40, 0.33, 0.28);
  vec3 ice       = vec3(0.92, 0.95, 1.00);
  vec3 lava      = vec3(0.95, 0.30, 0.05);
  vec3 runaway   = vec3(0.75, 0.28, 0.05);

  vec3 surface = mix(deepOcean, ocean, wrap);
  float land = smoothstep(0.003, 0.012, vElev);
  surface = mix(surface, coast, smoothstep(0.0, 0.008, vElev));
  vec3 lowland = mix(grass, desert, clamp((uSurfaceTemp-280.0)/120.0, 0.0, 1.0));
  surface = mix(surface, lowland, land);
  surface = mix(surface, rock, smoothstep(0.02, 0.05, vElev) * 0.6);

  float cap = smoothstep(0.85, 0.97, lat);
  surface = mix(surface, ice, cap * (1.0 - smoothstep(300.0, 330.0, uSurfaceTemp)));

  float cold = 1.0 - smoothstep(200.0, 270.0, uSurfaceTemp);
  surface = mix(surface, ice, cold * (1.0 - land*0.4));

  float hot = smoothstep(320.0, 373.0, uSurfaceTemp);
  float runawayT = smoothstep(373.0, 520.0, uSurfaceTemp);
  surface = mix(surface, desert, hot*0.5);
  surface = mix(surface, mix(lava, runaway, smoothstep(420.0, 600.0, uSurfaceTemp)), runawayT);

  vec3 hazeCool = vec3(0.35, 0.60, 1.0);
  vec3 hazeHot  = vec3(1.0, 0.55, 0.20);
  vec3 haze = mix(hazeCool, hazeHot, smoothstep(300.0, 450.0, uSurfaceTemp));
  float hazeDensity = clamp(uOpticalDepth/6.0, 0.0, 0.95);

  vec3 lit = surface * (0.18 + lambert*0.82) * uStarColor;
  vec3 V = normalize(cameraPosition - vLocal);
  float limb = pow(1.0 - max(dot(N,V),0.0), 2.5);
  lit += haze * limb * 0.22 * uStarColor;
  lit = mix(lit, haze*0.7, hazeDensity*0.32);

  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N,H),0.0), 40.0) * (1.0 - land) * lambert;
  lit += uStarColor * spec * 0.35;

  float night = 1.0 - wrap;
  lit += vec3(1.0, 0.3, 0.05) * night * runawayT * 0.5;

  lit = pow(lit, vec3(0.95));
  gl_FragColor = vec4(lit, 1.0);
}
`;

const ATMO_VERT = /* glsl */`
varying vec3 vNormal;
varying vec3 vLocal;
void main(){
  vNormal = normalize(normalMatrix * normal);
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const ATMO_FRAG = /* glsl */`
varying vec3 vNormal;
varying vec3 vLocal;
uniform vec3 uAtmoColor;
uniform vec3 uStarDir;
uniform float uIntensity;
void main(){
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vLocal);
  float rim = pow(1.0 - max(dot(N,V),0.0), 2.2);
  float lit = max(dot(N, normalize(uStarDir))*0.5+0.6, 0.0);
  float alpha = rim * lit * uIntensity;
  gl_FragColor = vec4(uAtmoColor, alpha);
}
`;

function detectQuality() {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Opera Mini/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints && navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
  const lowMem = (navigator.deviceMemory && navigator.deviceMemory <= 2);
  const smallViewport = window.innerWidth * window.innerHeight < 900000; // < ~1000x900
  const dpr = Math.min(window.devicePixelRatio || 1, (isMobile || smallViewport) ? 1.0 : 1.5);
  const segments = (isMobile || smallViewport) ? 40 : (lowMem ? 56 : 64);
  const starCount = (isMobile || smallViewport) ? 500 : 900;
  const detail = (isMobile || smallViewport) ? 0.0 : 1.0;
  const powerPreference = (isMobile || smallViewport) ? 'low-power' : 'high-performance';
  return { isMobile, dpr, segments, starCount, detail, powerPreference };
}

export class ShaderEngine {
  constructor(container) {
    this.container = container;
    this.quality = detectQuality();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.planet = null;
    this.atmo = null;
    this.starField = null;
    this.material = null;
    this.atmoMat = null;
    this.starLight = null;

    // Orbit state
    this._yaw = 0.4;
    this._pitch = 0.2;
    this._dist = 4.6;
    this._targetYaw = this._yaw;
    this._targetPitch = this._pitch;
    this._targetDist = this._dist;
    this._dragging = false;
    this._lastX = 0; this._lastY = 0;
    this._gyro = { beta: 0, gamma: 0, active: false };
    this._fps = 60;
    this._frameTimes = [];
    this.reduceMotion = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setupScene() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 200);
    this.updateCamera();

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,  // AA is biggest per-frame cost; the planet looks fine without
      alpha: true,
      powerPreference: this.quality.powerPreference
    });
    this.renderer.setPixelRatio(this.quality.dpr);
    this.renderer.setSize(w, h, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    // Handle WebGL context loss gracefully
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('AETHER: WebGL context lost. Planet visualization paused.');
    });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.info('AETHER: WebGL context restored. Rebuilding scene.');
      this.buildPlanet();
      this.buildStarfield();
    });

    this.starLight = new THREE.DirectionalLight(0xfff3c2, 1.6);
    this.starLight.position.set(5, 2, 4);
    this.scene.add(this.starLight);
    this.scene.add(new THREE.AmbientLight(0x223355, 0.35));

    this.buildPlanet();
    this.buildStarfield();
    this.bindOrbitControls();
  }

  buildPlanet() {
    const geo = new THREE.SphereGeometry(1.5, this.quality.segments, this.quality.segments);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSurfaceTemp:  { value: 288.0 },
        uOpticalDepth: { value: 1.5 },
        uStarDir:      { value: new THREE.Vector3(5,2,4).normalize() },
        uStarColor:    { value: new THREE.Color(0xfff3c2) },
        uTime:         { value: 0.0 },
        uIntensity:    { value: 1.0 },
        uDetail:       { value: this.quality.detail }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER
    });
    this.planet = new THREE.Mesh(geo, this.material);
    this.scene.add(this.planet);

    const atmoGeo = new THREE.SphereGeometry(1.68, Math.floor(this.quality.segments*0.7), Math.floor(this.quality.segments*0.7));
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        uAtmoColor: { value: new THREE.Color(0x4db8ff) },
        uStarDir:   { value: new THREE.Vector3(5,2,4).normalize() },
        uIntensity: { value: 0.8 }
      },
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false
    });
    this.atmo = new THREE.Mesh(atmoGeo, this.atmoMat);
    this.scene.add(this.atmo);
  }

  buildStarfield() {
    const N = this.quality.starCount;
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 60 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i*3  ] = r * Math.sin(phi) * Math.cos(theta);
      pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i*3+2] = r * Math.cos(phi);
      const tint = 0.7 + Math.random()*0.3;
      const b = Math.random() < 0.2 ? 0.6 : 1.0;
      col[i*3  ] = tint * (Math.random()<0.1 ? 1.0 : 0.9);
      col[i*3+1] = tint * 0.95;
      col[i*3+2] = tint * b;
    }
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.15, vertexColors: true, transparent: true, opacity: 0.85,
      sizeAttenuation: true, depthWrite: false
    });
    this.starField = new THREE.Points(geom, mat);
    this.scene.add(this.starField);
  }

  bindOrbitControls() {
    const dom = this.renderer.domElement;

    const onDown = (e) => {
      this._dragging = true;
      dom.setPointerCapture?.(e.pointerId ?? 1);
      const p = this._point(e);
      this._lastX = p.x; this._lastY = p.y;
      e.preventDefault();
    };
    const onMove = (e) => {
      const p = this._point(e);
      if (this._dragging) {
        const dx = p.x - this._lastX;
        const dy = p.y - this._lastY;
        this._lastX = p.x; this._lastY = p.y;
        this._targetYaw   -= dx * 0.005;
        this._targetPitch = Math.max(-1.2, Math.min(1.2, this._targetPitch + dy * 0.005));
      }
    };
    const onUp = (e) => {
      this._dragging = false;
      dom.releasePointerCapture?.(e.pointerId ?? 1);
    };
    const onWheel = (e) => {
      e.preventDefault();
      this._targetDist = Math.max(2.5, Math.min(9, this._targetDist + e.deltaY * 0.003));
    };

    // PointerEvents unify mouse + touch + pen across all devices
    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
  }

  _point(e) {
    return { x: e.clientX, y: e.clientY };
  }

  setGyro(active, beta = 0, gamma = 0) {
    this._gyro.active = active;
    this._gyro.beta = beta;
    this._gyro.gamma = gamma;
  }
  setGyroOrient(beta, gamma) {
    this._gyro.beta = beta;
    this._gyro.gamma = gamma;
  }

  setStarClass(teff, colorHex) {
    if (!colorHex || !this.material) return;
    try {
      const color = new THREE.Color(colorHex);
      if (this.starLight) this.starLight.color.copy(color);
      this.material.uniforms.uStarColor.value.copy(color);
    } catch (_) {}
  }

  updateCamera() {
    const dist = this._dist; let yaw = this._yaw, pitch = this._pitch;

    if (this._gyro.active) {
      const g = THREE.MathUtils.clamp(this._gyro.gamma, -1.2, 1.2);
      const b = THREE.MathUtils.clamp((this._gyro.beta - 45 * Math.PI/180), -0.8, 0.8);
      yaw = g;
      pitch = -b;
    }

    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    this.camera.position.set(
      dist * cp * Math.sin(yaw),
      dist * sp,
      dist * cp * Math.cos(yaw)
    );
    this.camera.lookAt(0,0,0);
    // keep shader light direction in sync (cheap)
    if (this.material) {
      this.material.uniforms.uStarDir.value.set(5, 2, 4).normalize();
      if (this.atmoMat) this.atmoMat.uniforms.uStarDir.value.copy(this.material.uniforms.uStarDir.value);
    }
  }

  // Cached uniforms to avoid THREE.Color allocation per frame
  _lastPlanet = { t:-1, tau:-1, terrain:-1, atmo:null, star:null };

  setPlanetState({ surfaceTemp, opticalDepth, mode: _mode, starColorHex, terrainIntensity=1.0, atmoColorHex }) {
    if (!this.material) return;
    const u = this.material.uniforms;
    u.uSurfaceTemp.value  = surfaceTemp;
    u.uOpticalDepth.value = opticalDepth;
    u.uIntensity.value    = terrainIntensity;

    // Only update star color when it actually changed
    if (starColorHex && starColorHex !== this._lastPlanet.star) {
      this._lastPlanet.star = starColorHex;
      try {
        const col = new THREE.Color(starColorHex);
        u.uStarColor.value.copy(col);
        if (this.starLight) this.starLight.color.copy(col);
      } catch (_) {}
    }
    if (atmoColorHex && this.atmoMat && atmoColorHex !== this._lastPlanet.atmo) {
      this._lastPlanet.atmo = atmoColorHex;
      this.atmoMat.uniforms.uAtmoColor.value = new THREE.Color(atmoColorHex);
    }
    if (this.atmoMat) {
      this.atmoMat.uniforms.uIntensity.value = 0.5 + Math.min(0.8, opticalDepth * 0.08);
    }
  }

  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(dt, t) {
    this._yaw   += (this._targetYaw   - this._yaw)   * 0.08;
    this._pitch += (this._targetPitch - this._pitch) * 0.08;
    this._dist  += (this._targetDist  - this._dist)  * 0.08;
    if (!this._dragging && !this._gyro.active) {
      this._targetYaw += dt * 0.08;
    }
    this.updateCamera();

    if (!this.reduceMotion) {
      this.planet.rotation.y += dt * 0.05;
      this.atmo.rotation.y = this.planet.rotation.y;
      if (this.starField) this.starField.rotation.y += dt * 0.005;
    }

    this.material.uniforms.uTime.value = t;

    this.renderer.render(this.scene, this.camera);

    this._frameTimes.push(performance.now());
    const cutoff = performance.now() - 1000;
    while (this._frameTimes.length && this._frameTimes[0] < cutoff) this._frameTimes.shift();
    this._fps = this._frameTimes.length;
  }

  get fps() { return this._fps; }
  get isMobile() { return this.quality.isMobile; }
}
