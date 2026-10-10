import type { SharedTranslation, SharedTranslationEnvelope, SharedTranslationInner } from '@meeshy/shared/types/shared-translation';
import type { TranslationEvent } from '@meeshy/shared/types/socketio-events/translation';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import type { SharedTranslationBinding, SharedTranslationKeySource } from '@meeshy/shared/utils/shared-translation-seal';

import { attempted } from './attempted';
import { textStamp } from './cache';
import { createRecentKeys, createRecentMap } from './recent-keys';
import type { OfferedMessage } from './scheduler';
import { SHARED_TRANSLATION_REQUEST_LIMITS, isSharedTranslation, type SharedTranslationsOutcome } from './shared-translations-api';
import { deviceTranslationTarget } from './target';

/**
 * **LIRE CE QUE LES AUTRES MEMBRES ONT TRADUIT** (#9899) — tout lecteur, avec ou
 * sans traduction sur l'appareil. Un membre dont l'appareil a traduit un message
 * vers SA langue l'a partagé, scellé (`share.ts`) ; le fil ouvert relit ces
 * partages, les ouvre depuis le texte du message et les sert par le puits des
 * traductions du serveur (`applyMessageTranslation`) : le Prisme les redescend à
 * la peinture, aucune peau ne sait d'où elles viennent.
 *
 * Deux portes, une loi (`consume`) :
 * - **à l'ouverture** (`offer`) : les messages dont le rang 1 du lecteur n'est ni
 *   servi ni la langue d'origine — la même question que la file de l'appareil
 *   (`deviceTranslationTarget`), moins ce que CET appareil sait traduire — sont
 *   demandés à la passerelle, cent par requête, les plus récents d'abord ;
 * - **en direct** (`receive`) : `message:translation-shared`, tant que le fil est
 *   ouvert.
 *
 * Ce qui s'applique : un message qui n'est pas le sien et n'est pas protégé (le
 *   fil n'offre que ceux-là : `offeredMessagesOf`), une langue du lecteur que le
 *   message ne porte pas déjà, et une enveloppe qui s'ouvre depuis LE texte que
 *   l'appareil lit — un message modifié depuis ne s'ouvre pas. Un partage qui ne
 *   s'ouvre pas est ignoré, jamais deviné.
 *
 * **Rien de ce qu'on a ouvert ne se perd à la revalidation.** Le fil se recharge
 * depuis le serveur, qui ne connaît pas ces traductions : elles disparaissent de
 * la page. Ce qu'on a ouvert est gardé en mémoire (bornée) et REPEINT quand le
 * message revient sans sa traduction — sans nouvelle requête, c'est ce que
 * `asked` interdit.
 *
 * **Une panne n'est jamais vue.** Un refus définitif (4xx : route absente d'une
 * passerelle plus ancienne, fil interdit) n'est pas redemandé pour cette
 * conversation ; une panne (réseau, 5xx, limite de débit) attend
 * {@link SHARED_TRANSLATION_COOLDOWN_MS} — le fil change à chaque message reçu,
 * et chaque changement ne doit pas être une requête de plus vers un serveur qui
 * vient de répondre mal.
 *
 * Le module ne connaît ni le réseau, ni le scellement, ni le cache de requêtes :
 * ses ports les lui donnent (`shared-translations-session.ts`).
 */
export type OpenPort = (params: {
  readonly binding: SharedTranslationBinding;
  readonly key: SharedTranslationKeySource;
  readonly envelope: SharedTranslationEnvelope;
}) => Promise<SharedTranslationInner | null>;

export type SharedTranslationReceiverPorts = {
  readonly fetch: (params: {
    readonly conversationId: string;
    readonly messageIds: readonly string[];
    readonly languages: readonly string[];
  }) => Promise<SharedTranslationsOutcome>;
  readonly open: OpenPort;
  readonly apply: (event: TranslationEvent) => void | Promise<void>;
  readonly now?: () => number;
};

export const SHARED_TRANSLATION_COOLDOWN_MS = 30_000;

const ASKED_LIMIT = 2_000;
const OPENED_LIMIT = 500;

/** Les langues du lecteur telles que la passerelle les stocke (normalisées), sans doublon ni vide, dans l'ordre du prisme, bornées à ce qu'elle accepte. */
export const sharedTranslationLanguages = (readerLanguages: readonly string[]): readonly string[] => [
  ...new Set(readerLanguages.filter((code) => code.trim() !== '').map(normalizeLanguageForDedup)),
].slice(0, SHARED_TRANSLATION_REQUEST_LIMITS.languages);

/**
 * Une traduction partagée prend la forme d'une traduction serveur : l'identité
 * du partage (`shared:<id>`), la langue d'origine et le moteur de qui l'a
 * calculée — ce que `translationModel` rend lisible.
 */
export const sharedTranslationEventOf = (share: SharedTranslation, inner: SharedTranslationInner): TranslationEvent => {
  const id = `shared:${share.id}`;
  return {
    messageId: share.messageId,
    translations: [
      {
        id,
        messageId: share.messageId,
        sourceLanguage: inner.sourceLanguage,
        targetLanguage: share.targetLanguage,
        translatedContent: inner.text,
        translationModel: inner.engine,
        cacheKey: id,
        cached: true,
      },
    ],
  };
};

const wantsSharedTranslation = (message: OfferedMessage, languages: readonly string[]): boolean =>
  !message.encrypted &&
  message.content.trim() !== '' &&
  deviceTranslationTarget({
    preferredLanguages: languages,
    originalLanguage: message.originalLanguage,
    translatedLanguages: message.translatedLanguages,
    canTranslate: () => true,
  }) !== null;

/** Ce que le message n'a pas à recevoir : les langues qu'il porte déjà, et celle dans laquelle il est écrit. */
const coveredLanguages = (message: OfferedMessage): ReadonlySet<string> =>
  new Set([...message.translatedLanguages, message.originalLanguage ?? ''].map(normalizeLanguageForDedup));

const batchesOf = <T>(items: readonly T[], size: number): readonly (readonly T[])[] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

type Snapshot = { readonly messages: ReadonlyMap<string, OfferedMessage>; readonly languages: readonly string[] };

export function createSharedTranslationReceiver(ports: SharedTranslationReceiverPorts) {
  const now = ports.now ?? Date.now;
  const snapshots = new Map<string, Snapshot>();
  const asked = createRecentKeys(ASKED_LIMIT);
  const opened = createRecentMap<TranslationEvent>(OPENED_LIMIT);
  const refused = new Set<string>();
  const coolingUntil = new Map<string, number>();

  const askKey = (message: OfferedMessage, languages: readonly string[]): string => `${message.id}|${textStamp(message.content)}|${languages.join(',')}`;
  const slotKey = (message: OfferedMessage, language: string): string => `${message.id}|${language}|${textStamp(message.content)}`;
  const latest = (message: OfferedMessage): OfferedMessage => snapshots.get(message.conversationId)?.messages.get(message.id) ?? message;
  const emit = (event: TranslationEvent): Promise<void> =>
    attempted(async () => {
      await ports.apply(event);
    }, undefined);

  const repaint = async (message: OfferedMessage, languages: readonly string[]): Promise<void> => {
    const covered = coveredLanguages(message);
    const known = languages.map((language) => (covered.has(language) ? undefined : opened.get(slotKey(message, language)))).find((event) => event !== undefined);
    if (known !== undefined) await emit(known);
  };

  const consume = async (share: SharedTranslation, message: OfferedMessage, languages: readonly string[]): Promise<void> => {
    const language = normalizeLanguageForDedup(share.targetLanguage);
    if (!languages.includes(language) || coveredLanguages(latest(message)).has(language)) return;
    if (share.envelope.kdf !== 'message-content' || opened.has(slotKey(message, language))) return;

    const inner = await attempted<SharedTranslationInner | null>(
      () =>
        ports.open({
          binding: { conversationId: message.conversationId, messageId: message.id, targetLanguage: share.targetLanguage, sourceContent: message.content },
          key: { kdf: 'message-content' },
          envelope: share.envelope,
        }),
      null,
    );
    if (inner === null) return;
    const event = sharedTranslationEventOf(share, inner);
    opened.set(slotKey(message, language), event);
    await emit(event);
  };

  const offer = async (params: {
    readonly conversationId: string;
    readonly messages: readonly OfferedMessage[];
    readonly readerLanguages: readonly string[];
  }): Promise<void> => {
    const { conversationId, messages } = params;
    const languages = sharedTranslationLanguages(params.readerLanguages);
    snapshots.set(conversationId, { messages: new Map(messages.map((message) => [message.id, message])), languages });

    const wanted = messages.filter((message) => wantsSharedTranslation(message, languages));
    for (const message of wanted) await repaint(message, languages);

    if (refused.has(conversationId) || now() < (coolingUntil.get(conversationId) ?? 0)) return;
    const batches = batchesOf(
      wanted.filter((message) => !asked.has(askKey(message, languages))).reverse(),
      SHARED_TRANSLATION_REQUEST_LIMITS.messageIds,
    );
    for (const message of batches.flat()) asked.add(askKey(message, languages));

    for (const [index, batch] of batches.entries()) {
      const outcome = await attempted<SharedTranslationsOutcome>(
        () => ports.fetch({ conversationId, messageIds: batch.map((message) => message.id), languages }),
        { status: 'failed' },
      );
      if (outcome.status !== 'ok') {
        for (const message of batches.slice(index).flat()) asked.delete(askKey(message, languages));
        if (outcome.status === 'refused') refused.add(conversationId);
        else coolingUntil.set(conversationId, now() + SHARED_TRANSLATION_COOLDOWN_MS);
        return;
      }
      const byId = new Map(batch.map((message) => [message.id, message]));
      for (const share of outcome.shares) {
        const message = byId.get(share.messageId);
        if (message !== undefined && share.conversationId === conversationId) await consume(share, message, languages);
      }
    }
  };

  const receive = async (payload: unknown): Promise<void> => {
    if (!isSharedTranslation(payload)) return;
    const snapshot = snapshots.get(payload.conversationId);
    const message = snapshot?.messages.get(payload.messageId);
    if (snapshot === undefined || message === undefined) return;
    await consume(payload, message, snapshot.languages);
  };

  return {
    offer,
    receive,
    /** Le fil est quitté : plus personne n'écoute ses partages en direct. */
    forget: (conversationId: string): void => void snapshots.delete(conversationId),
  };
}

export type SharedTranslationReceiver = ReturnType<typeof createSharedTranslationReceiver>;
