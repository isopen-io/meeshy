import { describe, expect, test } from 'bun:test';

import { createDeviceTranslationCache, createMemoryStore, deviceCacheKey } from './cache';
import type { DeviceTranslator } from './engine';
import { createDeviceTranslationScheduler, type DeliveredTranslation, type OfferedMessage } from './scheduler';

const message = (over: Partial<OfferedMessage> = {}): OfferedMessage => ({
  id: 'm1',
  content: 'habari yako',
  originalLanguage: 'sw',
  translatedLanguages: [],
  encrypted: false,
  ...over,
});

const recordingTranslator = (calls: string[], supported: (target: string) => boolean = () => true): DeviceTranslator => ({
  supports: (_source, target) => supported(target),
  translate: async (text, { target }) => {
    calls.push(`${text}>${target}`);
    return { text: `${target}:${text}`, engine: 'nllb' };
  },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createDeviceTranslationScheduler — l’appareil traduit ce que le serveur n’a pas servi (#9898)', () => {
  test('un message sans traduction vers le rang 1 est traduit et livré, une seule fois', async () => {
    const calls: string[] = [];
    const delivered: DeliveredTranslation[] = [];
    const scheduler = createDeviceTranslationScheduler({
      translator: recordingTranslator(calls),
      cache: createDeviceTranslationCache({ store: createMemoryStore() }),
      deliver: (translation) => delivered.push(translation),
    });

    scheduler.offer({ messages: [message()], preferredLanguages: ['fr'] });
    scheduler.offer({ messages: [message()], preferredLanguages: ['fr'] });
    await scheduler.idle();

    expect(calls).toEqual(['habari yako>fr']);
    expect(delivered).toEqual([{ messageId: 'm1', source: 'sw', target: 'fr', text: 'fr:habari yako', engine: 'nllb' }]);
  });

  test('le cache sert sans recalcul : un fil rouvert se peint traduit tout de suite', async () => {
    const store = createMemoryStore();
    const first: string[] = [];
    const firstScheduler = createDeviceTranslationScheduler({
      translator: recordingTranslator(first),
      cache: createDeviceTranslationCache({ store }),
      deliver: () => {},
    });
    firstScheduler.offer({ messages: [message()], preferredLanguages: ['fr'] });
    await firstScheduler.idle();

    const second: string[] = [];
    const delivered: DeliveredTranslation[] = [];
    const reopened = createDeviceTranslationScheduler({
      translator: recordingTranslator(second),
      cache: createDeviceTranslationCache({ store }),
      deliver: (translation) => delivered.push(translation),
    });
    reopened.offer({ messages: [message()], preferredLanguages: ['fr'] });
    await reopened.idle();

    expect(second).toEqual([]);
    expect(delivered.map((d) => d.text)).toEqual(['fr:habari yako']);
  });

  test('un message modifié est retraduit : la clé du cache porte une empreinte du texte', () => {
    expect(deviceCacheKey({ messageId: 'm1', target: 'fr', text: 'a' })).not.toBe(deviceCacheKey({ messageId: 'm1', target: 'fr', text: 'b' }));
  });

  test('rien n’est calculé pour un message déjà servi, vide ou chiffré sans clair', async () => {
    const calls: string[] = [];
    const scheduler = createDeviceTranslationScheduler({
      translator: recordingTranslator(calls),
      cache: createDeviceTranslationCache({ store: createMemoryStore() }),
      deliver: () => {},
    });
    scheduler.offer({
      messages: [
        message({ id: 'served', translatedLanguages: ['fr'] }),
        message({ id: 'empty', content: '   ' }),
        message({ id: 'sealed', encrypted: true }),
      ],
      preferredLanguages: ['fr'],
    });
    await scheduler.idle();
    expect(calls).toEqual([]);
  });

  test('les plus récents d’abord : le bas du fil est traduit avant l’historique', async () => {
    const calls: string[] = [];
    const scheduler = createDeviceTranslationScheduler({
      translator: recordingTranslator(calls),
      cache: createDeviceTranslationCache({ store: createMemoryStore() }),
      deliver: () => {},
    });
    scheduler.offer({
      messages: [message({ id: 'old', content: 'zamani' }), message({ id: 'new', content: 'sasa' })],
      preferredLanguages: ['fr'],
    });
    await scheduler.idle();
    expect(calls).toEqual(['sasa>fr', 'zamani>fr']);
  });

  test('une nouvelle offre remplace la file : on ne traduit pas un fil qu’on a quitté', async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const translator: DeviceTranslator = {
      supports: () => true,
      translate: async (text, { target }) => {
        calls.push(text);
        await gate;
        return { text: `${target}:${text}`, engine: 'nllb' };
      },
    };
    const scheduler = createDeviceTranslationScheduler({
      translator,
      cache: createDeviceTranslationCache({ store: createMemoryStore() }),
      deliver: () => {},
    });
    scheduler.offer({ messages: [message({ id: 'a1', content: 'a1' }), message({ id: 'a2', content: 'a2' })], preferredLanguages: ['fr'] });
    await settle();
    scheduler.offer({ messages: [message({ id: 'b1', content: 'b1' })], preferredLanguages: ['fr'] });
    release();
    await scheduler.idle();
    expect(calls).toEqual(['a2', 'b1']);
  });

  test('un échec du moteur ne bloque pas la file et n’est pas mis en cache', async () => {
    const delivered: DeliveredTranslation[] = [];
    const translator: DeviceTranslator = {
      supports: () => true,
      translate: async (text, { target }) => {
        if (text === 'casse') throw new Error('mémoire insuffisante');
        return { text: `${target}:${text}`, engine: 'nllb' };
      },
    };
    const scheduler = createDeviceTranslationScheduler({
      translator,
      cache: createDeviceTranslationCache({ store: createMemoryStore() }),
      deliver: (translation) => delivered.push(translation),
    });
    scheduler.offer({ messages: [message({ id: 'ok', content: 'sawa' }), message({ id: 'ko', content: 'casse' })], preferredLanguages: ['fr'] });
    await scheduler.idle();
    expect(delivered.map((d) => d.messageId)).toEqual(['ok']);
  });
});
