// Shared look: tone mapping, lights, sky. Used by the game and by the model stand so both see the same light.
import { ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, type Scene, SRGBColorSpace, type WebGLRenderer } from "three";

export const SKY = 0x8fc7ef;

export function lights(scene: Scene, renderer: WebGLRenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = SRGBColorSpace;
  // sky fill from above, green bounce from the meadow
  scene.add(new HemisphereLight(0xd8ecff, 0x5b7a3a, 1.45));
  // late-morning sun from the front-left, a cool rim from behind to lift units off the grass
  const key = new DirectionalLight(0xfff1d8, 2.5);
  key.position.set(-7, 14, 9);
  const rim = new DirectionalLight(0xa8ccff, 1.1);
  rim.position.set(6, 7, -10);
  scene.add(key, rim);
}

export function sky(scene: Scene) {
  scene.background = new Color(SKY);
}
