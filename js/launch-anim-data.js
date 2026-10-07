// js/launch-anim-data.js
// Launch ascent animation DATA ONLY. Pure data, no functions, no state.
// Everything is a pure function of f in [0,1]  (f = MET / endMet, linear in wall time).
//
// INTERPOLATION CONTRACT (the two things I need from your interpolator):
//   1. interp = 'pchip': monotone cubic (Fritsch-Carlson) between keys, NOT per-segment smoothstep.
//      Per-segment smoothstep forces zero velocity at every key, so a dense curve pulses.
//      Applies to cameras (pos, look, shake), rocket.rise, rocket.x, rocket.rotZ.
//   2. cut: true on a camera key = hard cut. Do NOT interpolate from the previous key; start a fresh
//      pchip segment at this key. The key just before each cut repeats the outgoing shot (0.0008 f earlier),
//      so if you ignore `cut` the fallback is a 2-frame whip instead of a 10-unit sweep.
//
// UNITS: display units, Y-up, origin pad centre. rocket.rise is an OFFSET above the stack's base y = 1.0.
// Rocket world base = (rocket.x, 1.0 + rocket.rise, 0). Nose axis = (-sin rotZ, cos rotZ, 0). Vehicle centre = base + 6 * axis.
// Camera FOV 48, near 0.1, far 800 (unchanged). `shake` is NORMALISED 0..1: multiply by your existing shake amplitude.
//
// DESIGN NOTE: tower clear (stack base above the 14.9 tower top) lands at f = 0.075 (~MET 40 s), not f = 0.43 as the
// old rise^1.78 curve did. Staging at f = 0.15-0.42 now happens high above the pad instead of beside the tower.

export const LAUNCH_ANIM = {
  version: 1,
  interp: 'pchip',
  ascentWall: 42,   // seconds. Ballistic time tau = (f - f0) * ascentWall ALWAYS (reduced-motion must not change shape)

  cameras: [
    // Shot 1  PAD HERO       f 0.00-0.06  starts on the approved pad shot (14,3,19)->(0,6,0); slow push, tilt follows base+5*axis
    // Shot 2  CLIMB          f 0.06-0.12  crane up out of the pad, blends into the chase offset (no cut)
    // Shot 3  CHASE-WIDE     f 0.12-0.46  D 27->29, azimuth 37 deg -> 20 deg off +Z, looks 1.2 below vehicle centre so debris falls INTO frame
    //                                     held wide on purpose: staging for every vehicle lands inside f 0.15-0.42 (see staging.byLv)
    // Shot 4  PROFILE-TRACK  f 0.46-0.68  CUT. Side-on from +Z, D 30->24, subject biased right so the pitch-over has nose room
    // Shot 5  ORBIT          f 0.68-0.88  CUT. Upper-stack orbit D 20->17, 126 deg arc, low elevation, looks at the top of the stack
    // Shot 6  SECO / SEP     f 0.88-1.00  continuous. Orbit continues, pulls back D 17->22, look point rides up to the departing payload
    { f: 0, pos: [14.0,3.0,19.0], look: [0.0,6.0,0.0], shake: 0.9 },
    { f: 0.02, pos: [13.53,2.92,18.38], look: [0.0,6.07,0.0], shake: 0.99 },
    { f: 0.04, pos: [12.67,2.78,17.22], look: [0.0,7.88,0.0], shake: 0.85 },
    { f: 0.06, pos: [12.2,2.7,16.6], look: [0.0,13.0,0.0], shake: 0.63 },
    { f: 0.08, pos: [13.27,6.01,17.87], look: [-0.1,21.92,0.0], shake: 0.4 },
    { f: 0.1, pos: [15.04,19.44,20.23], look: [-0.54,31.09,0.0], shake: 0.3 },
    { f: 0.12, pos: [15.47,33.19,21.49], look: [-1.19,37.78,0.0], shake: 0.3 },
    { f: 0.16, pos: [14.12,43.0,21.87], look: [-2.42,46.37,0.0], shake: 0.1 },
    { f: 0.2, pos: [12.32,49.69,22.55], look: [-3.7,52.7,0.0], shake: 0.01 },
    { f: 0.24, pos: [10.09,55.19,23.41], look: [-5.08,58.01,0.0], shake: 0.0 },
    { f: 0.28, pos: [7.59,59.86,24.34], look: [-6.49,62.52,0.0], shake: 0.0 },
    { f: 0.32, pos: [4.97,63.91,25.24], look: [-7.91,66.48,0.0], shake: 0.0 },
    { f: 0.36, pos: [2.4,67.57,26.03], look: [-9.35,70.09,0.0], shake: 0.0 },
    { f: 0.4, pos: [0.05,70.96,26.66], look: [-10.8,73.43,0.0], shake: 0.0 },
    { f: 0.44, pos: [-1.91,74.09,27.1], look: [-12.26,76.54,0.0], shake: 0.0 },
    { f: 0.4592, pos: [-2.69,75.6,27.24], look: [-13.01,78.06,0.0], shake: 0.0 },
    { f: 0.46, pos: [-12.64,79.5,30.0], look: [-16.51,78.76,0.0], shake: 0.0, cut: true },
    { f: 0.5, pos: [-14.17,82.53,28.91], look: [-18.06,81.77,0.0], shake: 0.0 },
    { f: 0.54, pos: [-15.72,85.45,27.82], look: [-19.61,84.65,0.0], shake: 0.0 },
    { f: 0.58, pos: [-17.26,88.19,26.73], look: [-21.14,87.35,0.0], shake: 0.0 },
    { f: 0.62, pos: [-18.78,90.77,25.64], look: [-22.65,89.9,0.0], shake: 0.0 },
    { f: 0.66, pos: [-20.27,93.21,24.55], look: [-24.14,92.29,0.0], shake: 0.0 },
    { f: 0.6792, pos: [-21.01,94.37,24.0], look: [-24.88,93.45,0.0], shake: 0.0 },
    { f: 0.68, pos: [-33.89,97.77,15.3], look: [-22.65,96.1,0.0], shake: 0.0, cut: true },
    { f: 0.72, pos: [-36.52,99.95,13.79], look: [-24.14,98.29,0.0], shake: 0.0 },
    { f: 0.76, pos: [-40.23,101.84,9.53], look: [-25.53,100.26,0.0], shake: 0.0 },
    { f: 0.8, pos: [-42.94,103.51,3.14], look: [-26.85,102.07,0.0], shake: 0.0 },
    { f: 0.84, pos: [-43.24,105.02,-3.93], look: [-28.06,103.66,0.0], shake: 0.0 },
    { f: 0.88, pos: [-41.15,106.36,-10.06], look: [-29.12,104.99,0.0], shake: 0.0 },
    { f: 0.92, pos: [-38.49,107.84,-15.25], look: [-30.78,107.1,0.0], shake: 0.0 },
    { f: 0.96, pos: [-36.02,109.35,-19.55], look: [-32.73,109.54,0.0], shake: 0.0 },
    { f: 0.98, pos: [-35.25,109.98,-20.87], look: [-33.54,110.5,0.0], shake: 0.0 },
    { f: 1.0, pos: [-35.16,110.44,-21.36], look: [-35.74,113.26,0.0], shake: 0.0 },
  ],

  rocket: {
    rise: [   // offset above base y=1.0. Holds 0 until f=0.016 (MET 9 s hold-down), then accelerates; peak ~527 u/f at f~0.08
      [0, 0.0],
      [0.016, 0.0],
      [0.03, 0.6],
      [0.045, 2.8],
      [0.06, 7.0],
      [0.075, 13.5],
      [0.09, 21.0],
      [0.105, 27.14],
      [0.12, 32.0],
      [0.15, 38.77],
      [0.2, 47.0],
      [0.25, 53.57],
      [0.3, 59.0],
      [0.375, 65.95],
      [0.45, 72.0],
      [0.55, 79.49],
      [0.65, 86.0],
      [0.75, 91.6],
      [0.85, 96.0],
      [0.93, 98.47],
      [1, 100.0],
    ],
    x: [      // gravity-turn drift toward -X (trench side). Integral of tan(rotZ) * d(rise): nose and path agree
      [0, 0.0],
      [0.07, 0.0],
      [0.09, -0.123],
      [0.12, -0.71],
      [0.16, -1.625],
      [0.2, -2.626],
      [0.25, -4.014],
      [0.3, -5.482],
      [0.375, -7.805],
      [0.45, -10.244],
      [0.55, -13.775],
      [0.65, -17.289],
      [0.75, -20.658],
      [0.85, -23.542],
      [0.93, -25.278],
      [1, -26.417],
    ],
    rotZ: [   // pitch-over starts after tower clear; 0.65 rad at SECO (cap 0.68 respected)
      [0, 0.0],
      [0.07, 0.0],
      [0.09, 0.03],
      [0.12, 0.08],
      [0.16, 0.133],
      [0.2, 0.18],
      [0.25, 0.238],
      [0.3, 0.29],
      [0.375, 0.355],
      [0.45, 0.41],
      [0.55, 0.47],
      [0.65, 0.52],
      [0.75, 0.563],
      [0.85, 0.6],
      [0.93, 0.628],
      [1, 0.65],
    ],
  },

  staging: {
    // Defaults below are NOMINAL f windows (SLS/F9-like). Per-vehicle truth is byLv (MET seconds): window_f = MET / endMet.
    // Cameras are one generic track, so shots 3-5 are framed wide enough to hold any of these windows.
    booster: { window: [0.244, 0.278], out: 16, tilt: 0.85, drift: [30, 40],
               ballistic: { dv: [2.4, -0.3, 0], g: -5.5, spin: 0.9 } },
    stage1:  { window: [0.278, 0.300], drop: 38, side: 4, drift: [8, 60],
               ballistic: { dv: [0.5, -0.9, 0], g: -4.5, spin: 0.18 } },
    fairing: { window: [0.340, 0.370], out: 14, drop: 12, drift: [20, 50],
               ballistic: { dv: [3.0, -0.4, 0], g: -4.0, spin: 0.7 } },
    las:     { window: [0.363, 0.393], up: 14,
               ballistic: { dv: [0.6, 3.2, 0], g: -2.2, spin: 0.5 } },
    stagger551: 0.0021,                        // 1.5 s / 700 s
    payload: { window: [0.975, 1.0], away: 3.4 },   // replaces the stateful '+0.045/frame' with a pure function of f

    // OPTIONAL `ballistic` (replaces out/drop/drift when present). World position of a debris piece:
    //   p(f) = p_sep + (v_vehicle(f0) + dv) * tau + 0.5 * [0, g, 0] * tau^2,   tau = (f - f0) * ascentWall
    // dv is in units/s relative to the vehicle, in the piece's local frame [outward, up, depth] (outward = away from stack axis, sign by side).
    // g in units/s^2 (display gravity, art value). spin in rad/s (tumble). v_vehicle(f0) = d(base)/df at f0 divided by ascentWall.
    // p_sep is the piece's position at its window start f0.

    byLv: {   // MET seconds, verbatim from the verified table. Keys absent = event does not exist for that vehicle.
      f9:      { endMet: 540, maxQ: 65, stage1: [150,162], fairing: [175,200] },
      fhr:     { endMet: 540, maxQ: 69, booster: [150,162], stage1: [211,224], fairing: [247,262] },
      fhe:     { endMet: 540, maxQ: 69, booster: [150,162], stage1: [211,224], fairing: [247,262] },
      av401:   { endMet: 800, maxQ: 87, stage1: [244,260], fairing: [268,284] },
      av551:   { endMet: 700, maxQ: 46, booster: [106,122], stage1: [266,280], fairing: [203,222] },
      vc4:     { endMet: 660, maxQ: 60, booster: [100,115], stage1: [300,315], fairing: [330,358] },
      vc6:     { endMet: 660, maxQ: 50, booster: [100,115], stage1: [280,295], fairing: [320,348] },
      ng:      { endMet: 780, maxQ: 70, stage1: [190,205], fairing: [220,246] },
      sls:     { endMet: 540, maxQ: 70, booster: [132,150], stage1: [483,497], fairing: [191,207], las: [196,212] },
      saturn5: { endMet: 700, maxQ: 75, stage1: [150,165], las: [180,196], stage2: [545,560] },
    },
  },

  fx: {
    // Nominal f windows; per-vehicle, centre plumeDip/collar on byLv.maxQ (+/-12 s MET) and deluge ends at MET 15.
    plumeDip: [0.080, 0.125],     // throttle bucket x0.75
    collar:   [0.075, 0.130],     // condensation collar, body-radius sized
    smoke:    [0.000, 0.090],     // trench smoke births; low-hugging, height fade, bloom peaks age 0.35 (~MET 9, tower-clear), tail to age 2
    deluge:   [0.000, 0.028],     // ends at MET 15
    fireLight: { trenchToPlume: [0.030, 0.075] },   // handoff done by tower clear; plume->vac-blue at each vehicle's MECO; dies at f = 1
  },
};
