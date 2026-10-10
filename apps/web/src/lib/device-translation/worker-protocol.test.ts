import { describe, expect, test } from 'bun:test';

import type { EmbeddedTranslator } from './engine';
import { createWorkerHost, createWorkerTranslator, type WorkerPort, type WorkerReply, type WorkerRequest } from './worker-protocol';

const rejection = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('la promesse a été tenue');
};

const echoEngine: EmbeddedTranslator = {
  name: 'nllb',
  supports: () => true,
  translate: async (text, { target }) => {
    if (text === 'boum') throw new Error('mémoire insuffisante');
    return `${target}:${text}`;
  },
};

/** Le Worker et sa page, reliés sans thread : ce qui part d'un côté arrive de l'autre. */
const linked = () => {
  let toPage: (reply: WorkerReply) => void = () => {};
  const host = createWorkerHost({ engine: echoEngine, post: (reply) => toPage(reply) });
  const port: WorkerPort = {
    postMessage: (request: WorkerRequest) => void host.receive(request),
    addEventListener: (_type, listener) => {
      toPage = (reply) => listener({ data: reply });
    },
  };
  return createWorkerTranslator({ port, name: 'nllb' });
};

describe('le protocole page ↔ Worker de la traduction sur l’appareil (#9898)', () => {
  test('une traduction aller-retour', async () => {
    expect(await linked().translate('habari', { source: 'sw', target: 'fr' })).toBe('fr:habari');
  });

  test('deux demandes simultanées reçoivent chacune leur réponse', async () => {
    const translator = linked();
    const [a, b] = await Promise.all([
      translator.translate('a', { source: 'en', target: 'fr' }),
      translator.translate('b', { source: 'en', target: 'sw' }),
    ]);
    expect([a, b]).toEqual(['fr:a', 'sw:b']);
  });

  test('l’échec du moteur revient en rejet, avec sa cause', async () => {
    expect(await rejection(linked().translate('boum', { source: 'en', target: 'fr' }))).toBe('mémoire insuffisante');
  });

  test('la page sait seule ce que le modèle couvre, sans réveiller le Worker', () => {
    const port: WorkerPort = {
      postMessage: () => {
        throw new Error('réveillé');
      },
      addEventListener: () => {},
    };
    const translator = createWorkerTranslator({ port, name: 'nllb' });
    expect(translator.supports('ff', 'fr')).toBe(true);
    expect(translator.supports('fr', 'ewo')).toBe(false);
  });
});
