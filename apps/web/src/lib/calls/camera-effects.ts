import { cameraBlur, cameraSourceOf, effectsUsedOf, forgetCameraSource, frameSettings, needsFrames, registerCameraSource, type FrameSettings, type VideoEffects } from './video-effects';
import type { EffectsPipeline } from './video-effects-pipeline';

/**
 * **LA CAMÉRA ET SES EFFETS, VUS DU MOTEUR** (#8442) — le moteur ne sait rien
 * des filtres : pour chaque caméra qu'il s'apprête à envoyer, il demande
 * `wrap` ; quand l'utilisateur change un effet ou le zoom, `refresh` ; quand
 * il relâche une piste, `release`. Si la piste rendue change, il la remplace
 * sur chaque lien (`replaceTrack`) : pas de renégociation.
 *
 * Le traitement n'est bâti que quand une image doit changer — couleur,
 * visage, flou que la caméra ne fait pas (#8471), zoom numérique (#8441) —
 * puis réglé. Quand plus rien ne change l'image, il s'arrête et la caméra
 * repart BRUTE (#9099) : aucune image ne traverse de code pour rien. Un
 * traitement en cours de chargement est partagé : deux réglages rapprochés
 * n'en bâtissent qu'un.
 */

export type CameraEffectsPort = {
  readonly wrap: (camera: MediaStreamTrack) => Promise<MediaStreamTrack>;
  readonly refresh: (sent: MediaStreamTrack) => Promise<MediaStreamTrack>;
  readonly release: (sent: MediaStreamTrack) => void;
  readonly used: () => readonly string[];
};

export type PipelineFactory = (camera: MediaStreamTrack, settings: FrameSettings) => Promise<EffectsPipeline>;

type CameraEffectsDeps = {
  readonly effects: () => VideoEffects;
  /** Le zoom numérique de la caméra en cours (#8441) — 1× par défaut. */
  readonly zoom?: () => number;
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
  const building = new WeakMap<MediaStreamTrack, Promise<MediaStreamTrack>>();

  const settingsFor = (camera: MediaStreamTrack): FrameSettings => frameSettings(deps.effects(), { nativeBlur: cameraBlur(camera), zoom: deps.zoom?.() ?? 1 });

  const applyBlur = (camera: MediaStreamTrack): void => {
    if (!cameraBlur(camera)) return;
    const blur: BlurConstraint = { backgroundBlur: deps.effects().blur };
    void camera.applyConstraints({ advanced: [blur] }).catch(() => undefined);
  };

  const construct = async (camera: MediaStreamTrack): Promise<MediaStreamTrack> => {
    const factory = await deps.loadPipeline().catch(() => null);
    if (factory === null || camera.readyState === 'ended') return camera;
    const pipeline = await factory(camera, settingsFor(camera)).catch(() => null);
    if (pipeline === null) return camera;
    pipelines.set(pipeline.output, pipeline);
    registerCameraSource(pipeline.output, camera);
    return pipeline.output;
  };

  const build = (camera: MediaStreamTrack): Promise<MediaStreamTrack> => {
    if (!needsFrames(settingsFor(camera)) || !deps.colorSupported()) return Promise.resolve(camera);
    const pending = building.get(camera);
    if (pending !== undefined) return pending;
    const next = construct(camera).finally(() => building.delete(camera));
    building.set(camera, next);
    return next;
  };

  const dismantle = (sent: MediaStreamTrack, pipeline: EffectsPipeline): void => {
    pipeline.stop();
    pipelines.delete(sent);
    forgetCameraSource(sent);
  };

  return {
    wrap: async (camera) => {
      applyBlur(camera);
      return build(camera);
    },
    refresh: async (sent) => {
      const camera = cameraSourceOf(sent);
      applyBlur(camera);
      const pipeline = pipelines.get(sent);
      if (pipeline === undefined) return build(camera);
      const settings = settingsFor(camera);
      if (!needsFrames(settings)) {
        dismantle(sent, pipeline);
        return camera;
      }
      pipeline.update(settings);
      return sent;
    },
    release: (sent) => {
      const camera = cameraSourceOf(sent);
      const pipeline = pipelines.get(sent);
      if (pipeline !== undefined) dismantle(sent, pipeline);
      camera.stop();
      forgetCameraSource(sent);
      sent.stop();
    },
    used: () => effectsUsedOf(deps.effects()),
  };
}
