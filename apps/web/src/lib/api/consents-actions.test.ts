import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { CONSENT_POLICY_VERSION_DEFAULT } from '@meeshy/shared/types/consents';

import { CONSENTS_QUERY_KEY, effectiveConsent, voiceConsentMissing, type GrantedConsents } from './consents';
import { performConsentEdit, type ConsentActionDeps } from './consents-actions';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * LES DROITS DE MA VOIX (#16419) — un consentement n'est EFFECTIF que si toute
 * sa chaîne l'est (`CONSENT_PARENT`, la loi que `ConsentValidationService`
 * applique côté passerelle), et il se bascule en OPTIMISTE par `PUT
 * /me/consents/{purpose}` : le cache peint change avant la réponse, un refus
 * ne défait que le geste refusé, hors ligne rien ne part.
 */

describe('effectiveConsent — un consentement vaut ce que vaut sa chaîne', () => {
  test('accordé avec tous ses ancêtres ⇒ effectif', () => {
    expect(effectiveConsent(['data-processing', 'voice-data', 'voice-profile'], 'voice-profile')).toBe(true);
  });

  test('accordé mais un ancêtre retiré ⇒ inactif, comme la passerelle le juge', () => {
    expect(effectiveConsent(['data-processing', 'voice-profile', 'voice-cloning'], 'voice-cloning')).toBe(false);
    expect(effectiveConsent(['voice-data'], 'voice-data')).toBe(false);
  });

  test('absent ⇒ inactif', () => {
    expect(effectiveConsent(['data-processing'], 'voice-data')).toBe(false);
  });
});

describe('voiceConsentMissing — la note sous mon vocal (miroir VoiceConsentGate iOS)', () => {
  test('manque tant que le profil vocal n’est pas effectif', () => {
    expect(voiceConsentMissing(['data-processing', 'voice-data'])).toBe(true);
    expect(voiceConsentMissing([])).toBe(true);
  });

  test('ne manque plus quand le profil vocal et sa chaîne sont accordés', () => {
    expect(voiceConsentMissing(['data-processing', 'voice-data', 'voice-profile'])).toBe(false);
  });
});

const deferred = () => {
  const box: { resolve: (value: ApiResult<unknown>) => void } = { resolve: () => undefined };
  const promise = new Promise<ApiResult<unknown>>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (value: ApiResult<unknown>) => box.resolve(value) };
};

const depsWith = (options: { readonly online: boolean; readonly answer: Promise<ApiResult<unknown>>; readonly seed?: GrantedConsents }) => {
  const queryClient = new QueryClient();
  if (options.seed !== undefined) queryClient.setQueryData(CONSENTS_QUERY_KEY, options.seed);
  const calls: HttpRequest[] = [];
  const transport = {
    request: (request: HttpRequest) => {
      calls.push(request);
      return options.answer;
    },
  } as unknown as HttpTransport;
  const deps: ConsentActionDeps = { transport, queryClient, isOnline: () => options.online };
  return { deps, calls, read: () => queryClient.getQueryData<GrantedConsents>(CONSENTS_QUERY_KEY) };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const servedEntry = (purpose: string, granted: boolean) => ({ purpose, granted, policyVersion: CONSENT_POLICY_VERSION_DEFAULT, source: 'server' });

describe('performConsentEdit — une bascule de consentement optimiste', () => {
  test('ACCORDER écrit PUT /me/consents/{purpose} avec la politique en vigueur, et peint la chaîne avant la réponse', async () => {
    const answer = deferred();
    const { deps, calls, read } = depsWith({ online: true, answer: answer.promise, seed: ['data-processing'] });
    const pending = performConsentEdit({ purpose: 'voice-cloning', granted: true, deps });
    await flush();
    expect([...(read() ?? [])].sort()).toEqual(['data-processing', 'voice-cloning', 'voice-data', 'voice-profile']);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe('PUT');
    expect(calls[0]?.path).toBe('/api/v1/me/consents/voice-cloning');
    expect(calls[0]?.body).toEqual({ granted: true, policyVersion: CONSENT_POLICY_VERSION_DEFAULT });
    answer.resolve({ ok: true, data: servedEntry('voice-cloning', true) });
    expect(await pending).toEqual({ status: 'saved' });
    expect(effectiveConsent(read() ?? [], 'voice-cloning')).toBe(true);
  });

  test('RETIRER ne touche que sa propre colonne, comme la passerelle', async () => {
    const seed: GrantedConsents = ['data-processing', 'voice-data', 'voice-profile', 'voice-cloning'];
    const { deps, calls, read } = depsWith({ online: true, answer: Promise.resolve({ ok: true, data: servedEntry('voice-data', false) }), seed });
    expect(await performConsentEdit({ purpose: 'voice-data', granted: false, deps })).toEqual({ status: 'saved' });
    expect(calls[0]?.body).toEqual({ granted: false, policyVersion: CONSENT_POLICY_VERSION_DEFAULT });
    expect([...(read() ?? [])].sort()).toEqual(['data-processing', 'voice-cloning', 'voice-profile']);
    expect(effectiveConsent(read() ?? [], 'voice-cloning')).toBe(false);
  });

  test('un REFUS rend le cache tel qu’il était pour ce geste', async () => {
    const answer = deferred();
    const { deps, read } = depsWith({ online: true, answer: answer.promise, seed: ['data-processing'] });
    const pending = performConsentEdit({ purpose: 'voice-profile', granted: true, deps });
    await flush();
    expect(effectiveConsent(read() ?? [], 'voice-profile')).toBe(true);
    answer.resolve({ ok: false, status: 409, error: 'Politique périmée' });
    expect(await pending).toEqual({ status: 'refused', error: 'Politique périmée' });
    expect(read()).toEqual(['data-processing']);
  });

  test('le retour arrière ne défait PAS une bascule voisine confirmée entre-temps', async () => {
    const first = deferred();
    const { deps, read, calls } = depsWith({ online: true, answer: first.promise, seed: ['data-processing', 'voice-data'] });
    const refused = performConsentEdit({ purpose: 'voice-cloning', granted: true, deps });
    await flush();
    const neighbour: ConsentActionDeps = {
      ...deps,
      transport: {
        request: (request: HttpRequest) => {
          calls.push(request);
          return Promise.resolve({ ok: true, data: servedEntry('voice-data', false) });
        },
      } as unknown as HttpTransport,
    };
    expect(await performConsentEdit({ purpose: 'voice-data', granted: false, deps: neighbour })).toEqual({ status: 'saved' });
    first.resolve({ ok: false, status: 500, error: 'Panne' });
    await refused;
    expect([...(read() ?? [])].sort()).toEqual(['data-processing']);
  });

  test('HORS LIGNE, rien ne part et rien ne change', async () => {
    const { deps, calls, read } = depsWith({ online: false, answer: Promise.resolve({ ok: true, data: {} }), seed: ['data-processing'] });
    expect(await performConsentEdit({ purpose: 'voice-data', granted: true, deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
    expect(read()).toEqual(['data-processing']);
  });
});
