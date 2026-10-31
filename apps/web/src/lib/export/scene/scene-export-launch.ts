import { currentDeviceLocale } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { browserFileDeliveryHost } from '@/lib/media/file-delivery-host';
import { resolveReaderLanguages } from '@/lib/reader';

import * as exportJobs from './scene-export-jobs';
import type { SceneExportMode, SceneExportResult } from './scene-export-run';
import { gestureAudioContext, type SceneExportSubject } from './scene-export-subject';

/**
 * **« SAUVEGARDER » ET « IMAGER » D'UNE PUBLICATION, AU GESTE** (#13873) —
 * le départ SYNCHRONE d'un export : le contexte audio naît dans le geste
 * (sans quoi Safari le laisse muet), le job entre au bandeau global
 * (`SceneExportTray`), puis le moteur se charge et tourne pendant que
 * l'utilisateur continue d'utiliser l'app. L'issue se dit au bandeau.
 */

export type SceneExportRunner = (input: {
  readonly subject: SceneExportSubject;
  readonly mode: SceneExportMode;
  readonly audioContext: AudioContext | null;
  readonly preferredLanguages: readonly string[];
  readonly job: exportJobs.SceneExportJobHandle;
}) => Promise<SceneExportResult>;

export type SceneExportLaunchDeps = {
  readonly online: () => boolean;
  readonly preferredLanguages: () => readonly string[];
  readonly audioContext: () => AudioContext | null;
  readonly run: SceneExportRunner;
};

/** Le Prisme du lecteur À L'INSTANT du geste — la même descente que `useReaderLanguages`. */
export function currentReaderLanguages(): readonly string[] {
  const { session } = sessionStore.getState();
  return resolveReaderLanguages({ source: apiDeps.source, session, deviceLocale: currentDeviceLocale() });
}

const browserRunner: SceneExportRunner = async (input) => {
  const [{ startSceneExport }, { currentGallerySaver }] = await Promise.all([
    import('./scene-export-browser'),
    import('@/lib/gallery/gallery-saver'),
  ]);
  return startSceneExport({
    subject: input.subject,
    mode: input.mode,
    audioContext: input.audioContext,
    preferredLanguages: input.preferredLanguages,
    placeHere: translate(currentInterfaceLanguage(), 'scene.place.here'),
    host: browserFileDeliveryHost(),
    gallerySaver: currentGallerySaver(),
    chooseLength: input.job.chooseLength,
    signal: input.job.signal,
    onProgress: input.job.report,
    onDelivering: input.job.lockDelivery,
  });
};

const browserLaunchDeps: SceneExportLaunchDeps = {
  online: () => typeof navigator === 'undefined' || navigator.onLine,
  preferredLanguages: currentReaderLanguages,
  audioContext: () => gestureAudioContext(),
  run: browserRunner,
};

export function launchSceneExport(params: {
  readonly subject: SceneExportSubject;
  readonly mode: SceneExportMode;
  readonly deps?: SceneExportLaunchDeps;
}): Promise<SceneExportResult | 'offline' | 'busy'> {
  const deps = params.deps ?? browserLaunchDeps;
  if (!deps.online()) {
    exportJobs.announce('offline');
    return Promise.resolve('offline');
  }
  const job = exportJobs.start(params.subject.key);
  if (job === null) {
    exportJobs.announce('busy');
    return Promise.resolve('busy');
  }
  const audioContext = deps.audioContext();
  return deps
    .run({ subject: params.subject, mode: params.mode, audioContext, preferredLanguages: deps.preferredLanguages(), job })
    .catch((): SceneExportResult => (job.signal.aborted ? 'cancelled' : 'failed'))
    .then((result) => {
      job.finish();
      exportJobs.announce(result);
      return result;
    });
}
