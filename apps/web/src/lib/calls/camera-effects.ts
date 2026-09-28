import { blurCapable, cameraSourceOf, effectsUsedOf, forgetCameraSource, needsFramePipeline, registerCameraSource, type VideoEffects } from './video-effects';
import type { EffectsPipeline } from './video-effects-pipeline';

/**
 * **LA CAMÉRA ET SES EFFETS, VUS DU MOTEUR** (#8442) — le moteur ne sait rien
 * des filtres : pour chaque caméra qu'il s'apprête à envoyer, il demande
 * `wrap` ; quand l'utilisateur change un effet, `refresh` ; quand il relâche
 * une piste, `release`. Si la piste rendue change, il la remplace sur chaque
 * lien (`replaceTrack`) : pas de renégociation, pas d'image perdue.
 *
 * Le traitement n'est bâti qu'au PREMIER effet de couleur ou de visage, puis réglé ; revenir
 * à « naturel » le garde (il laisse alors passer chaque image telle quelle) :
 * rebâtir coûterait un échange de piste à chaque hésitation.
 */

export type CameraEffectsPort = {
  readonly wrap: (camera: MediaStreamTrack) => Promise<MediaStreamTrack>;
  readonly refresh: (sent: MediaStreamTrack) => Promise<MediaStreamTrack>;
  readonly release: (sent: MediaStreamTrack) => void;
  readonly used: () => readonly string[];
};

export type PipelineFactory = (camera: MediaStreamTrack, effects: VideoEffects) => EffectsPipeline;

type CameraEffectsDeps = {
  readonly effects: () => VideoEffects;
  readonly colorSupported: () => boolean;
  readonly loadPipeline: () => Promise<PipelineFactory>;
};

export const PASSTHROUGH_EFFECTS: CameraEffectsPort = {
  wrap: async (camera) => camera,
  refresh: async (sent) => sent,
  release: (sent) => sent.stop(),
  used: () => [],
};

type BlurConstraint = MediaTrackConstraintSet & { readonly backgroundBlur?: boolean };

export function createCameraEffects(deps: CameraEffectsDeps): CameraEffectsPort {
  const pipelines = new WeakMap<MediaStreamTrack, EffectsPipeline>();

  const applyBlur = (camera: MediaStreamTrack, effects: VideoEffects): void => {
    if (!blurCapable(camera)) return;
    const blur: BlurConstraint = { backgroundBlur: effects.blur };
    void camera.applyConstraints({ advanced: [blur] }).catch(() => undefined);
  };

  const build = async (camera: MediaStreamTrack, effects: VideoEffects): Promise<MediaStreamTrack> => {
    if (!needsFramePipeline(effects) || !deps.colorSupported()) return camera;
    const factory = await deps.loadPipeline().catch(() => null);
    if (factory === null || camera.readyState === 'ended') return camera;
    const pipeline = factory(camera, effects);
    pipelines.set(pipeline.output, pipeline);
    registerCameraSource(pipeline.output, camera);
    return pipeline.output;
  };

  return {
    wrap: async (camera) => {
      const effects = deps.effects();
      applyBlur(camera, effects);
      return build(camera, effects);
    },
    refresh: async (sent) => {
      const effects = deps.effects();
      const camera = cameraSourceOf(sent);
      applyBlur(camera, effects);
      const pipeline = pipelines.get(sent);
      if (pipeline === undefined) return build(camera, effects);
      pipeline.update(effects);
      return sent;
    },
    release: (sent) => {
      const pipeline = pipelines.get(sent);
      if (pipeline !== undefined) {
        pipeline.stop();
        pipelines.delete(sent);
      }
      cameraSourceOf(sent).stop();
      forgetCameraSource(sent);
      sent.stop();
    },
    used: () => effectsUsedOf(deps.effects()),
  };
}
