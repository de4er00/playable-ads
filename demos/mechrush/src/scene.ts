// Shared look: tone mapping, lights, sky. Used by the game and by the model stand so both see the same light.
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  type Scene,
  SRGBColorSpace,
  type WebGLRenderer,
} from "three";

export const SKY = { top: 0x3d6fc4, horizon: 0xf2c7a1, fog: 0xe8b996 };

export function lights(scene: Scene, renderer: WebGLRenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  // sky fill from above, warm bounce from the canyon below
  scene.add(new HemisphereLight(0xcfe2ff, 0x6b4f3a, 1.35));
  // warm key light from the front-left, a cool rim from behind to separate units from the road
  const key = new DirectionalLight(0xfff0dc, 2.6);
  key.position.set(-6, 12, 8);
  const rim = new DirectionalLight(0x9cc2ff, 1.4);
  rim.position.set(5, 6, -10);
  scene.add(key, rim);
}

export function atmosphere(scene: Scene) {
  scene.background = new Color(SKY.horizon);
  scene.fog = new Fog(SKY.fog, 45, 120);
}
