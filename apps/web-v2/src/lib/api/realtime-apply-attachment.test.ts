import { createElement } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

import { Attachments } from '@/components/attachment-blocks';
import { countingQueryFn, localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { messagesQueryKey } from './messages';
import { applyMessageAttachmentUpdated, isAttachmentUpdated } from './realtime-apply';
import type { Attachment, Message } from './types';

/**
 * `message:attachment-updated` (#7017) — L'ALIMENTATION, pas le rendu.
 *
 * La transcription Whisper, puis les traductions NLLB et les pistes TTS,
 * arrivent APRÈS le message (`emitAttachmentUpdated.ts`, une émission par
 * enrichissement). Le rendu de la transcription était déjà juste ; web-v2
 * n'écoutait simplement pas l'évènement, si bien qu'un vocal reçu restait muet
 * jusqu'à ce qu'on quitte et rouvre le fil.
 */

/**
 * LA PIÈCE JOINTE TELLE QUE LE SOCKET LA SERT — la forme de
 * `serializeAttachmentForSocket` (`services/gateway/src/socketio/`).
 *
 * Elle part SANS drapeau de protection, et c'est DÉLIBÉRÉ : c'est la charge la
 * plus PAUVRE que ce puits puisse recevoir, donc le pire cas de sa garde de
 * masquage. Les témoins qui ajoutent `isViewOnce` / `isBlurred` / `effectFlags`
 * le font explicitement, un par un. Ne pas les poser ici par défaut : une
 * fabrique qui déclarerait toujours la protection rendrait indémontrable le
 * cas — celui de la passerelle d'avant #7014 comme celui de tout relais futur
 * dont le `select` oublierait ces colonnes — où le cache est le SEUL à savoir
 * que la pièce est masquée.
 */
const socketAttachment = (partial: Record<string, unknown>): Record<string, unknown> => ({
  id: 'a-1',
  messageId: 'm-audio',
  mimeType: 'audio/wav',
  fileSize: 16_044,
  fileUrl: 'https://cdn.example/voice.wav',
  capturedInApp: false,
  transcription: null,
  translations: null,
  ...partial,
});

const cachedAudioMessage = (attachment: Record<string, unknown>): Message =>
  localMessage({
    id: 'm-audio',
    conversationId: 'c-a',
    content: '',
    messageType: 'audio',
    attachments: [attachment],
  } as unknown as Partial<Message>);

const attachmentOf = (client: QueryClient, conversationId: string, messageId: string): Record<string, unknown> => {
  const message = threadOf(client, conversationId)?.messages.find((m) => m.id === messageId);
  return (message?.attachments?.[0] ?? {}) as unknown as Record<string, unknown>;
};

describe('isAttachmentUpdated (#7017) — décodage FAIL-CLOSED', () => {
  test('accepte la charge de la passerelle', () => {
    expect(isAttachmentUpdated({ conversationId: 'c-a', messageId: 'm-audio', attachment: { id: 'a-1' } })).toBe(true);
  });

  test('rejette ce qui ne nomme ni la conversation, ni le message, ni la pièce', () => {
    expect(isAttachmentUpdated(null)).toBe(false);
    expect(isAttachmentUpdated('a-1')).toBe(false);
    expect(isAttachmentUpdated({ messageId: 'm-audio', attachment: { id: 'a-1' } })).toBe(false);
    expect(isAttachmentUpdated({ conversationId: 'c-a', attachment: { id: 'a-1' } })).toBe(false);
    expect(isAttachmentUpdated({ conversationId: 'c-a', messageId: 'm-audio' })).toBe(false);
    expect(isAttachmentUpdated({ conversationId: 'c-a', messageId: 'm-audio', attachment: null })).toBe(false);
    /* Sans `id`, la pièce n'est PAS adressable : la remplacer au rang 0
       écraserait une AUTRE pièce du même message (un message peut en porter
       plusieurs, chacune transcrite par son propre passage Whisper — c'est la
       raison pour laquelle l'éventail serveur déduplique sa file sur
       `attachmentId`, `emitAttachmentUpdated.ts:104`). */
    expect(isAttachmentUpdated({ conversationId: 'c-a', messageId: 'm-audio', attachment: { mimeType: 'audio/wav' } })).toBe(false);
  });
});

describe('applyMessageAttachmentUpdated (#7017) — la transcription arrive SANS rechargement', () => {
  test('la transcription Whisper atterrit sur la pièce du fil OUVERT, sans requête réseau', () => {
    const client = new QueryClient();
    const calls = { count: 0 };
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));
    void client.getQueryCache().build(client, { queryKey: messagesQueryKey('c-a'), queryFn: countingQueryFn(calls) });

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({
        transcription: { type: 'audio', text: 'Hola, ¿seguimos el jueves?', language: 'es' },
      }),
    });

    expect(attachmentOf(client, 'c-a', 'm-audio').transcription).toEqual({
      type: 'audio',
      text: 'Hola, ¿seguimos el jueves?',
      language: 'es',
    });
    expect(calls.count).toBe(0);
  });

  test('un SECOND évènement greffe les traductions NLLB sans perdre la transcription', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));

    const transcription = { type: 'audio', text: 'Hola', language: 'es' };
    applyMessageAttachmentUpdated(client, { conversationId: 'c-a', messageId: 'm-audio', attachment: socketAttachment({ transcription }) });
    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({ transcription, translations: { fr: { type: 'audio', transcription: 'Bonjour' } } }),
    });

    const attachment = attachmentOf(client, 'c-a', 'm-audio');
    expect(attachment.transcription).toEqual(transcription);
    expect(attachment.translations).toEqual({ fr: { type: 'audio', transcription: 'Bonjour' } });
  });

  /**
   * LA CHARGE SOCKET EST UN SUR-ENSEMBLE INCERTAIN — ce que la passerelle
   * n'énumère PAS ne doit pas être EFFACÉ. `currentUserConsumption` est servi
   * par le REST et absent de `SocketAttachment` : un REMPLACEMENT sec ferait
   * disparaître la barre de consommation d'un vocal déjà écouté au moment
   * exact où sa transcription arrive.
   */
  test('les clés que la charge socket ne porte pas SURVIVENT (fusion, jamais remplacement sec)', () => {
    const client = new QueryClient();
    client.setQueryData(
      messagesQueryKey('c-a'),
      threadPages([cachedAudioMessage(socketAttachment({ duration: 12_000, currentUserConsumption: { playPositionMs: 4000 } }))]),
    );

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: { id: 'a-1', messageId: 'm-audio', transcription: { type: 'audio', text: 'Hola', language: 'es' } },
    });

    const attachment = attachmentOf(client, 'c-a', 'm-audio');
    expect(attachment.duration).toBe(12_000);
    expect(attachment.currentUserConsumption).toEqual({ playPositionMs: 4000 });
  });

  /**
   * UNE CHARGE QUI NE DÉCLARE RIEN NE DÉMASQUE RIEN. `maskedAttachment` rend
   * `false` sur une charge muette (« une pièce sans déclaration est une pièce
   * ordinaire » — son fail-closed vit chez l'appelant), et le sérialiseur
   * socket ne servait AUCUN des trois drapeaux avant #7014. Une pièce à VUE
   * UNIQUE connue du cache par le REST doit rester masquée quand son
   * enrichissement arrive : sinon le voile tombe au moment précis où le
   * pipeline finit son travail — la fuite du cycle 125, rouverte par un chemin
   * neuf et sans qu'aucun gate ne rougisse.
   *
   * CE TÉMOIN EST GARDÉ EN PROFONDEUR, et il faut le dire : DEUX mécanismes le
   * tiennent indépendamment — la FUSION (les clés absentes de la charge
   * survivent) et la GARDE (une pièce masquée ne se démasque pas). Mesuré :
   * il ne TOMBE que si les deux partent ensemble. C'est pourquoi les deux
   * témoins qui l'encadrent existent — « fusion, jamais remplacement sec »
   * fait tomber le premier mécanisme SEUL, « la charge DÉMENT la protection »
   * fait tomber le second SEUL. Aucun des trois ne subsume les autres.
   */
  test('une pièce DÉJÀ masquée le reste quand la charge socket ne déclare aucun drapeau', () => {
    const client = new QueryClient();
    client.setQueryData(
      messagesQueryKey('c-a'),
      threadPages([cachedAudioMessage(socketAttachment({ isViewOnce: true, isBlurred: false }))]),
    );

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({ transcription: { type: 'audio', text: 'Hola', language: 'es' } }),
    });

    expect(maskedAttachment(attachmentOf(client, 'c-a', 'm-audio') as never)).toBe(true);
  });

  test('une pièce DÉJÀ masquée le reste même si la charge socket DÉMENT la protection', () => {
    const client = new QueryClient();
    client.setQueryData(
      messagesQueryKey('c-a'),
      threadPages([cachedAudioMessage(socketAttachment({ isBlurred: true }))]),
    );

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({ isViewOnce: false, isBlurred: false, effectFlags: 0 }),
    });

    expect(maskedAttachment(attachmentOf(client, 'c-a', 'm-audio') as never)).toBe(true);
  });

  /** LA PROTECTION PEUT MONTER — la charge en sait alors plus que le cache.
   * C'est le sens que #7014 donne au fil : une fois les trois drapeaux servis,
   * ce témoin est le chemin nominal, et non plus le cas de bord. */
  test('une protection ANNONCÉE par la charge socket masque une pièce que le cache croyait ordinaire', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({ isViewOnce: true }),
    });

    expect(maskedAttachment(attachmentOf(client, 'c-a', 'm-audio') as never)).toBe(true);
  });

  /**
   * JAMAIS UN AJOUT — l'évènement dit « cette pièce a été ENRICHIE », jamais
   * « voici une pièce de plus ». Ajouter une pièce inconnue ferait entrer dans
   * le fil un média dont le cache n'a rien pour juger la protection : c'est la
   * fenêtre du cycle 125, ouverte par un chemin neuf.
   */
  test('une pièce INCONNUE du message n’est jamais ajoutée', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({ id: 'a-inconnue' }),
    });

    const message = threadOf(client, 'c-a')?.messages[0];
    expect(message?.attachments).toHaveLength(1);
    expect((message?.attachments?.[0] as unknown as Record<string, unknown>).id).toBe('a-1');
  });

  /**
   * ET QUI AFFICHE CE QUE LA FUSION GARDE ? (revue-correction #7017, la
   * question du cycle 122 posée à une garde de confidentialité.)
   *
   * Les cinq témoins ci-dessus mesurent le CACHE : ils prouvent que
   * `maskedAttachment` rend encore `true` après l'évènement. Aucun ne prouve
   * que le DOM s'en sert — or c'est là que le secret partirait. Un puits qui
   * garde parfaitement ses drapeaux au-dessus d'un rendu qui ne les lit pas
   * n'a protégé personne.
   *
   * Le rendu est le MÊME site pour les deux chemins — `Attachments`
   * (`components/attachment-blocks.tsx`), monté par `bubble.tsx` et
   * `focal-row.tsx` — donc « la même garde que le chemin REST » n'est pas une
   * intention, c'est une identité de code. Ce témoin la MESURE plutôt que de
   * la déduire : il prend la pièce TELLE QUE LE CACHE LA REND après
   * l'évènement socket, la rend, et cherche dans le balisage le texte
   * transcrit, l'URL du fichier et le nom du fichier — les trois choses que le
   * cycle 125 nomme comme parties de la CHARGE, pas de la seule chaîne.
   *
   * LA CHARGE DÉMENT LA PROTECTION, délibérément : c'est le pire cas, et #7014
   * est ce qui le rend ATTEIGNABLE. Tant que `serializeAttachmentForSocket` ne
   * servait aucun des trois drapeaux, la seule FUSION (les clés absentes de la
   * charge survivent) suffisait à tenir ce témoin — mesuré : retirer le
   * cliquet de `mergedAttachment` ne le faisait pas tomber. Une fois les
   * drapeaux sur le fil, une ligne périmée ou un `select` incomplet les sert à
   * `false`, et alors seul le cliquet retient le voile. Écrit ainsi, ce témoin
   * tombe si l'un OU l'autre des deux mécanismes part.
   */
  test('une pièce à VUE UNIQUE enrichie PAR SOCKET n’atteint pas le DOM en clair', () => {
    const client = new QueryClient();
    client.setQueryData(
      messagesQueryKey('c-a'),
      threadPages([cachedAudioMessage(socketAttachment({ isViewOnce: true }))]),
    );

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
        transcription: { type: 'audio', text: 'le code du coffre est 4712', language: 'fr' },
      }),
    });

    const servie = attachmentOf(client, 'c-a', 'm-audio') as unknown as Attachment;
    const html = renderToStaticMarkup(
      createElement(Attachments, { attachments: [servie], languages: ['fr'], fallbackLanguage: 'fr', mediaFrame: 'box' }),
    );

    expect(html).toContain('data-protected-attachment="hidden"');
    expect(html).not.toContain('le code du coffre est 4712');
    expect(html).not.toContain('https://cdn.example/voice.wav');
    expect(html).not.toContain('<audio');
  });

  /**
   * LA CONTRE-ÉPREUVE (leçon 261) — la MÊME pièce, MÊME évènement, sans la
   * déclaration de vue unique : le texte transcrit atteint bien le DOM. Sans
   * elle, un `Attachments` qui cesserait de rendre TOUTE transcription ferait
   * passer le témoin ci-dessus.
   */
  test('CONTRÔLE : sans déclaration, la MÊME transcription arrivée par socket est RENDUE', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));

    applyMessageAttachmentUpdated(client, {
      conversationId: 'c-a',
      messageId: 'm-audio',
      attachment: socketAttachment({
        transcription: { type: 'audio', text: 'le code du coffre est 4712', language: 'fr' },
      }),
    });

    const servie = attachmentOf(client, 'c-a', 'm-audio') as unknown as Attachment;
    const html = renderToStaticMarkup(
      createElement(Attachments, { attachments: [servie], languages: ['fr'], fallbackLanguage: 'fr', mediaFrame: 'box' }),
    );

    expect(html).toContain('le code du coffre est 4712');
    expect(html).not.toContain('data-protected-attachment');
  });

  test('un fil NON ouvert, ou un message inconnu, ne lève pas et ne peint rien', () => {
    const client = new QueryClient();
    client.setQueryData(messagesQueryKey('c-a'), threadPages([cachedAudioMessage(socketAttachment({}))]));

    applyMessageAttachmentUpdated(client, { conversationId: 'c-jamais-ouverte', messageId: 'm-audio', attachment: socketAttachment({ transcription: { text: 'x' } }) });
    applyMessageAttachmentUpdated(client, { conversationId: 'c-a', messageId: 'm-inconnu', attachment: socketAttachment({ transcription: { text: 'x' } }) });

    expect(attachmentOf(client, 'c-a', 'm-audio').transcription).toBeNull();
  });
});
