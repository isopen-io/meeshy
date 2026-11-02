import { EventEmitter } from 'node:events';

import { describe, expect, test } from 'bun:test';

import { documentNetwork } from './document-network.mjs';

/**
 * LE RÉSEAU QUI COMPTE EST CELUI DU DOCUMENT COURANT (#12783) — voir le
 * doc-comment de `document-network.mjs` pour la mesure CI qui motive la règle.
 * Une fausse page rejoue les événements de Playwright dans leur ordre réel.
 */

const page = () => {
  const emitter = new EventEmitter();
  const mainFrame = { name: 'principal' };
  const childFrame = { name: 'iframe' };
  const request = (url: string, options: { navigation?: boolean; frame?: object } = {}) => ({
    url: () => url,
    isNavigationRequest: () => options.navigation ?? false,
    frame: () => options.frame ?? mainFrame,
  });
  const fake = {
    on: (event: string, listener: (...args: unknown[]) => void) => emitter.on(event, listener),
    mainFrame: () => mainFrame,
  };
  return { fake, emitter, mainFrame, childFrame, request };
};

describe('documentNetwork', () => {
  test('une requête en vol tient le réseau occupé, et son retour le rend au repos', () => {
    const { fake, emitter, request } = page();
    const network = documentNetwork(fake as never);
    const chunk = request('http://x/assets/a.js');

    emitter.emit('request', chunk);
    expect(network()).toBeUndefined();
    expect(network.enVol()).toEqual(['/assets/a.js']);

    emitter.emit('requestfinished', chunk);
    expect(network()).toBe('1');
  });

  test('un échec rend aussi la requête : elle ne retient plus le réseau', () => {
    const { fake, emitter, request } = page();
    const network = documentNetwork(fake as never);
    const chunk = request('http://x/assets/a.js');

    emitter.emit('request', chunk);
    emitter.emit('requestfailed', chunk);

    expect(network()).toBe('1');
  });

  test('une requête du document QUITTÉ dont aucun événement ne revient n’empoisonne pas le document suivant', () => {
    const { fake, emitter, mainFrame, request } = page();
    const network = documentNetwork(fake as never);
    const orpheline = request('http://x/assets/call-pip.js');
    const document = request('http://x/me/progression/badges', { navigation: true });

    emitter.emit('request', orpheline);
    emitter.emit('request', document);
    emitter.emit('framenavigated', mainFrame);
    emitter.emit('requestfinished', document);

    expect(network.enVol()).toEqual([]);
    expect(network()).toBe('2');
  });

  test('le nouveau document garde sa propre requête en vol jusqu’à son retour', () => {
    const { fake, emitter, mainFrame, request } = page();
    const network = documentNetwork(fake as never);
    const document = request('http://x/me/progression', { navigation: true });

    emitter.emit('request', document);
    emitter.emit('framenavigated', mainFrame);

    expect(network.enVol()).toEqual(['/me/progression']);
    emitter.emit('requestfinished', document);
    expect(network()).toBe('1');
  });

  test('les requêtes parties APRÈS l’installation du document comptent', () => {
    const { fake, emitter, mainFrame, request } = page();
    const network = documentNetwork(fake as never);
    const document = request('http://x/me/progression', { navigation: true });
    const chunk = request('http://x/assets/progression.js');

    emitter.emit('request', document);
    emitter.emit('framenavigated', mainFrame);
    emitter.emit('requestfinished', document);
    emitter.emit('request', chunk);

    expect(network()).toBeUndefined();
    expect(network.enVol()).toEqual(['/assets/progression.js']);
  });

  test('une navigation dans le MÊME document (pushState, sans requête de navigation) n’efface rien', () => {
    const { fake, emitter, mainFrame, request } = page();
    const network = documentNetwork(fake as never);
    const chunk = request('http://x/assets/progression.js');

    emitter.emit('request', chunk);
    emitter.emit('framenavigated', mainFrame);

    expect(network()).toBeUndefined();
    expect(network.enVol()).toEqual(['/assets/progression.js']);
  });

  test('la navigation d’un cadre enfant n’efface pas ce que le document principal attend', () => {
    const { fake, emitter, childFrame, request } = page();
    const network = documentNetwork(fake as never);
    const chunk = request('http://x/assets/progression.js');
    const iframe = request('http://x/embed', { navigation: true, frame: childFrame });

    emitter.emit('request', chunk);
    emitter.emit('request', iframe);
    emitter.emit('framenavigated', childFrame);

    expect(network.enVol()).toEqual(['/assets/progression.js', '/embed']);
  });
});
