/**
 * vendor/three-fire/fire.js — plain-JS port of the vanilla WebGL entry point of
 * typeWolffo/THREE.Fire (MIT License, Copyright (c) typeWolffo; based on the
 * original THREE.Fire by mattatz).
 *
 * WHAT WAS PORTED (no behavior change):
 *   - FireShader (volumetric ray-march + ashima simplex noise, GLSL) verbatim.
 *   - Fire mesh class (BoxGeometry volume + ShaderMaterial + update/dispose).
 * WHAT WAS ADAPTED for this repo (no runtime deps, offline, file:// safe):
 *   - TypeScript types/interfaces stripped (repo has no build step).
 *   - Import source is the vendored './three.module.min.js' via import map.
 *   - Texture is caller-supplied (see fireTexture() in js/launch-view.js).
 *
 * DEVIATIONS from upstream (documented, visual-compositing only):
 *   - depthTest: true (upstream uses false). Our plume flies next to/in front
 *     of vehicle geometry; testing false lets the fire draw through the rocket.
 *   - iterations/octaves are constructor params (same mechanism: shader defines).
 *
 * Upstream: https://github.com/typeWolffo/THREE.Fire
 * Paper: Alfred et al., "Real-Time procedural volumetric fire".
 */
import * as THREE from 'three';

export const FireShader = {
  defines: {
    ITERATIONS: '20',
    OCTAVES: '3',
  },

  uniforms: {
    fireTex: { value: null },
    color: { value: new THREE.Color(0xeeeeee) },
    time: { value: 0.0 },
    seed: { value: 0.0 },
    invModelMatrix: { value: new THREE.Matrix4() },
    scale: { value: new THREE.Vector3(1, 1, 1) },
    noiseScale: { value: new THREE.Vector4(1, 2, 1, 0.3) },
    magnitude: { value: 1.3 },
    lacunarity: { value: 2.0 },
    gain: { value: 0.5 },
  },

  vertexShader: /* glsl */ `
    varying vec3 vWorldPos;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    }
  `,

  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform float time;
    uniform float seed;
    uniform mat4 invModelMatrix;
    uniform vec3 scale;
    uniform vec4 noiseScale;
    uniform float magnitude;
    uniform float lacunarity;
    uniform float gain;
    uniform sampler2D fireTex;

    varying vec3 vWorldPos;

    // GLSL simplex noise function by ashima
    vec3 mod289(vec3 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec4 mod289(vec4 x) {
      return x - floor(x * (1.0 / 289.0)) * 289.0;
    }

    vec4 permute(vec4 x) {
      return mod289(((x * 34.0) + 1.0) * x);
    }

    vec4 taylorInvSqrt(vec4 r) {
      return 1.79284291400159 - 0.85373472095314 * r;
    }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);

      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);

      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;

      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));

      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);

      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);

      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);

      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    float turbulence(vec3 p) {
      float sum = 0.0;
      float freq = 1.0;
      float amp = 1.0;

      for(int i = 0; i < OCTAVES; i++) {
        sum += abs(snoise(p * freq)) * amp;
        freq *= lacunarity;
        amp *= gain;
      }

      return sum;
    }

    vec4 samplerFire(vec3 p, vec4 scale) {
      vec2 st = vec2(sqrt(dot(p.xz, p.xz)), p.y);

      if(st.x <= 0.0 || st.x >= 1.0 || st.y <= 0.0 || st.y >= 1.0) {
        return vec4(0.0);
      }

      p.y -= (seed + time) * scale.w;
      p *= scale.xyz;

      st.y += sqrt(st.y) * magnitude * turbulence(p);

      if(st.y <= 0.0 || st.y >= 1.0) {
        return vec4(0.0);
      }

      return texture2D(fireTex, st);
    }

    vec3 localize(vec3 p) {
      return (invModelMatrix * vec4(p, 1.0)).xyz;
    }

    void main() {
      vec3 rayPos = vWorldPos;
      vec3 rayDir = normalize(rayPos - cameraPosition);
      float rayLen = 0.0288 * length(scale.xyz);

      vec4 col = vec4(0.0);

      for(int i = 0; i < ITERATIONS; i++) {
        rayPos += rayDir * rayLen;
        vec3 lp = localize(rayPos);
        lp.y += 0.5;
        lp.xz *= 2.0;
        col += samplerFire(lp, noiseScale);
      }

      // Apply color tint to the fire
      col.rgb *= color;
      col.a = col.r;
      gl_FragColor = col;
    }
  `,
};

/**
 * Volumetric fire mesh (WebGL/GLSL). Flame rises along local +Y inside a
 * unit box — rotate the mesh PI about X for a downward rocket plume.
 */
export class FireMesh extends THREE.Mesh {
  constructor(opts) {
    const o = opts || {};
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.ShaderMaterial({
      defines: {
        ITERATIONS: String(o.iterations || 20),
        OCTAVES: String(o.octaves || 3),
      },
      uniforms: {
        fireTex: { value: o.fireTex || null },
        color: { value: new THREE.Color(o.color !== undefined ? o.color : 0xeeeeee) },
        time: { value: 0.0 },
        seed: { value: Math.random() * 19.19 },
        invModelMatrix: { value: new THREE.Matrix4() },
        scale: { value: new THREE.Vector3(1, 1, 1) },
        noiseScale: { value: new THREE.Vector4(...(o.noiseScale || [1, 2, 1, 0.3])) },
        magnitude: { value: o.magnitude !== undefined ? o.magnitude : 1.3 },
        lacunarity: { value: o.lacunarity !== undefined ? o.lacunarity : 2.0 },
        gain: { value: o.gain !== undefined ? o.gain : 0.5 },
      },
      vertexShader: FireShader.vertexShader,
      fragmentShader: FireShader.fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true, // deviation: plumes fly beside vehicle geometry
    });
    super(geometry, material);
    this._time = 0;
    this.userData.baseColor = new THREE.Color(o.color !== undefined ? o.color : 0xeeeeee);
  }

  update(time) {
    const u = this.material.uniforms;
    if (time !== undefined) {
      this._time = time;
      u.time.value = time;
    }
    this.updateMatrixWorld();
    u.invModelMatrix.value.copy(this.matrixWorld).invert();
    u.scale.value.copy(this.scale);
  }

  dispose() {
    if (this.geometry) this.geometry.dispose();
    if (this.material) this.material.dispose();
  }
}
