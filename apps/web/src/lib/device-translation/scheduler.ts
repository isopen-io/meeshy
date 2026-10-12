import { deviceCacheKey, type DeviceTranslationCache } from './cache';
import type { DeviceTranslator } from './engine';
import { deviceTranslationTarget } from './target';

export type OfferedMessage = {
  readonly id: string;
  readonly conversationId: string;
  readonly content: string;
  readonly originalLanguage: string | null | undefined;
  readonly translatedLanguages: readonly string[];
  /** Chiffré et pas encore déchiffré sur cet appareil : il n'y a pas de clair à traduire. */
  readonly encrypted: boolean;
  /**
   * Le serveur lit déjà ce texte (`sharedTranslationServerReadsMessage`) : seul
   * un tel message se partage aux autres membres et se demande à la passerelle.
   * Un clair que le serveur ne lit pas — un message de bout en bout, une
   * conversation dont le mode est inconnu — se traduit sur l'appareil et y reste.
   */
  readonly shareable: boolean;
  /**
   * La version du texte que l'appareil traduit (`sharedTranslationSourceVersion`) :
   * `original`, ou l'instant de la dernière modification. `null` quand la date
   * ne se lit pas — l'appareil ne sait pas ce qu'il traduit, et ne partage pas.
   */
  readonly sourceVersion: string | null;
};

export type DeliveredTranslation = {
  readonly messageId: string;
  readonly source: string;
  readonly target: string;
  readonly text: string;
  readonly engine: string;
};

type Job = {
  readonly key: string;
  readonly messageId: string;
  readonly text: string;
  readonly source: string;
  readonly target: string;
  /** Le message d'où le travail vient : sa livraison le nomme, le partage en lit le texte original et la conversation. */
  readonly origin: OfferedMessage;
};

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
 *
 * **Une traduction livrée n'est pas une traduction acquise.** Le fil se recharge
 * depuis le serveur (revalidation à l'ouverture), qui ne connaît pas les
 * traductions de l'appareil : elles disparaissent de la page. Un message offert
 * sans sa traduction est donc livré de nouveau, depuis le cache et sans calcul ;
 * c'est idempotent (le puits fusionne par langue), et une livraison qui n'a pas
 * encore atterri au moment de l'offre suivante n'en coûte qu'une de plus.
 *
 * Chaque livraison nomme le message d'où elle vient (`origin`) : le partage aux
 * autres membres lie la traduction au texte EXACT qui a été traduit, pas à celui
 * que le fil porte peut-être déjà modifié quand la livraison arrive.
 */
export function createDeviceTranslationScheduler(params: {
  readonly translator: DeviceTranslator;
  readonly cache: DeviceTranslationCache;
  readonly deliver: (translation: DeliveredTranslation, origin: OfferedMessage) => void;
}) {
  const { translator, cache, deliver } = params;
  let pending: Job[] = [];
  let running: Promise<void> | null = null;
  let active: string | null = null;

  const run = async (job: Job): Promise<void> => {
    const cached = await cache.read(job.key);
    if (cached !== undefined) {
      deliver({ messageId: job.messageId, source: job.source, target: job.target, ...cached }, job.origin);
      return;
    }
    try {
      const result = await translator.translate(job.text, { source: job.source, target: job.target });
      await cache.write(job.key, result);
      deliver({ messageId: job.messageId, source: job.source, target: job.target, ...result }, job.origin);
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
        if (key === active) continue;
        jobs.push({ key, messageId: message.id, text: message.content, origin: message, ...pair });
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
