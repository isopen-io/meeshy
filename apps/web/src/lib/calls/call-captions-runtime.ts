import { currentDeviceLocale } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { resolveReaderLanguages } from '@/lib/reader';

import { createCaptions, type CaptionsContext, type CaptionsPort } from './call-captions-controller';
import { browserSpeech, recognitionOf } from './call-speech';

/**
 * **LES SOUS-TITRES DANS LE NAVIGATEUR** (#8048) — l'entrée du chunk
 * `call_captions` (`budgets.json`), chargée par `engine-defaults.ts` au premier
 * besoin d'un appel : aucun octet de sous-titres ne pèse sur le moteur
 * (`call_engine`), ni sur qui ne passe aucun appel.
 *
 * La langue PARLÉE est le rang 1 du Prisme du lecteur — la même descente que
 * celle par laquelle la passerelle résout la langue de ses auditeurs
 * (`resolveUserLanguage`, `call-transcription-relay.ts`), jamais une langue
 * reconstruite ici.
 */

function spokenLanguage(): string {
  const languages = resolveReaderLanguages({ source: apiDeps.source, session: sessionStore.getState().session, deviceLocale: currentDeviceLocale() });
  return languages[0] ?? 'fr';
}

function viewerName(): string {
  return resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).displayName;
}

let sequence = 0;

function utteranceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  sequence += 1;
  return `w-${Date.now().toString(36)}-${sequence}`;
}

export function createBrowserCaptions(ctx: CaptionsContext): CaptionsPort {
  return createCaptions(ctx, {
    speech: browserSpeech(typeof window === 'undefined' ? null : recognitionOf(window)),
    language: spokenLanguage,
    viewerName,
    newId: utteranceId,
  });
}
