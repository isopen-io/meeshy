import { describe, expect, test } from 'bun:test';

import { localZoomFor, sentZoom, setLocalZoom, selfZoomStore } from './self-zoom';

/**
 * LE ZOOM NUMÉRIQUE DE L'IMAGE ENVOYÉE (#8441) — il tient pour l'appel et la
 * caméra en cours : se retourner, ou l'appel suivant, repart de 1×. Le moteur
 * lit le zoom qui s'applique à la caméra qu'il envoie.
 */

describe('le zoom envoyé', () => {
  test('celui de l’appel et de la caméra en cours', () => {
    setLocalZoom('call-a', 'user', 2);
    expect(sentZoom(selfZoomStore.getState(), { callId: 'call-a', facing: 'user' })).toBe(2);
    expect(localZoomFor(selfZoomStore.getState(), 'call-a', 'user')).toBe(2);
  });

  test('se retourner, ou un autre appel, repart de 1×', () => {
    setLocalZoom('call-a', 'user', 3);
    expect(sentZoom(selfZoomStore.getState(), { callId: 'call-a', facing: 'environment' })).toBe(1);
    expect(sentZoom(selfZoomStore.getState(), { callId: 'call-b', facing: 'user' })).toBe(1);
  });

  test('sans appel, aucun zoom', () => {
    expect(sentZoom(selfZoomStore.getState(), null)).toBe(1);
  });
});
