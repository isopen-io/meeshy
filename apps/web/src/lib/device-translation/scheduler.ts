import { deviceCacheKey, type DeviceTranslationCache } from './cache';
import type { DeviceTranslator } from './engine';
import { deviceTranslationTarget } from './target';

export type OfferedMessage = {
  readonly id: string;
  readonly content: string;
  readonly originalLanguage: string | null | undefined;
  readonly translatedLanguages: readonly string[];
  /** Chiffré et pas encore déchiffré sur cet appareil : il n'y a pas de clair à traduire. */
  readonly encrypted: boolean;
};

export type DeliveredTranslation = {
  readonly messageId: string;
  readonly source: string;
  readonly target: string;
  readonly text: string;
  readonly engine: string;
};

type Job = { readonly key: string; readonly messageId: string; readonly text: string; readonly source: string; readonly target: string };

/**
 * **LA FILE DE TRADUCTION DE L'APPAREIL** (#9898) — un seul calcul à la fois
 * (le modèle occupe un cœur et quelques centaines de Mo), les messages les
 * plus récents d'abord, le cache avant le moteur.
 *
 * Une nouvelle offre REMPLACE ce qui attend : le lecteur qui change de fil
 * n'attend pas que l'historique du précédent soit traduit. Le calcul en cours
 * va à son terme, son résultat reste en cache. Un échec ne bloque pas la
 * suite et ne s'inscrit pas en cache : le message retentera à la prochaine
 * offre.
 */
export function createDeviceTranslationScheduler(params: {
  readonly translator: DeviceTranslator;
  readonly cache: DeviceTranslationCache;
  readonly deliver: (translation: DeliveredTranslation) => void;
}) {
  const { translator, cache, deliver } = params;
  const settled = new Set<string>();
  let pending: Job[] = [];
  let running: Promise<void> | null = null;
  let active: string | null = null;

  const run = async (job: Job): Promise<void> => {
    const cached = await cache.read(job.key);
    if (cached !== undefined) {
      deliver({ messageId: job.messageId, source: job.source, target: job.target, ...cached });
      settled.add(job.key);
      return;
    }
    try {
      const result = await translator.translate(job.text, { source: job.source, target: job.target });
      await cache.write(job.key, result);
      settled.add(job.key);
      deliver({ messageId: job.messageId, source: job.source, target: job.target, ...result });
    } catch {
      return;
    }
  };

  const kick = (): void => {
    if (running !== null) return;
    running = (async () => {
      for (let job = pending.shift(); job !== undefined; job = pending.shift()) {
        active = job.key;
        await run(job);
        active = null;
      }
    })().finally(() => {
      running = null;
      if (pending.length > 0) kick();
    });
  };

  return {
    offer: (offer: { readonly messages: readonly OfferedMessage[]; readonly preferredLanguages: readonly string[] }): void => {
      const jobs: Job[] = [];
      for (const message of [...offer.messages].reverse()) {
        if (message.encrypted || message.content.trim() === '') continue;
        const pair = deviceTranslationTarget({
          preferredLanguages: offer.preferredLanguages,
          originalLanguage: message.originalLanguage,
          translatedLanguages: message.translatedLanguages,
          canTranslate: translator.supports,
        });
        if (pair === null) continue;
        const key = deviceCacheKey({ messageId: message.id, target: pair.target, text: message.content });
        if (settled.has(key) || key === active) continue;
        jobs.push({ key, messageId: message.id, text: message.content, ...pair });
      }
      pending = jobs;
      kick();
    },
    idle: async (): Promise<void> => {
      while (running !== null) await running;
    },
  };
}

export type DeviceTranslationScheduler = ReturnType<typeof createDeviceTranslationScheduler>;
