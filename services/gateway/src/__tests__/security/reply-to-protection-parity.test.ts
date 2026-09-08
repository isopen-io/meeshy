/**
 * #4952 — la passerelle sert UNE forme de citation : le message CITÉ passe
 * par le même masquage de protection quel que soit le TRANSPORT qui le sert.
 *
 * Quatre sites construisent un `replyTo` avec un CORPS (texte + auteur), et
 * seulement deux d'entre eux appelaient `servedQuotedMessage` — le site
 * UNIQUE qui sait qu'un message à vue unique / flouté / chiffré ne doit
 * jamais republier son texte, ses traductions ou ses pièces jointes dans une
 * citation :
 *
 *   a) REST — `GET /conversations/:id/messages` (`messages-list-query.ts`)
 *   b) Socket.IO — `message:new` (`socketio/messageNewPayload.ts`)
 *   c) REST — `GET /links/:identifier/messages` (`links/utils/message-formatters.ts`)
 *   d) REST — `GET /conversations/:id/threads/:messageId` (`conversations/threads.ts`)
 *
 * (c) et (d) répandaient la ligne CITÉE brute (`include`, pas `select`) :
 * répondre à — ou citer dans un fil de discussion — un message protégé
 * republiait son texte en clair via un lien de partage (population la plus
 * exposée : visiteurs sans compte) ou via un fil de réponses.
 *
 * Ce témoin garde les deux moitiés de la parité :
 *   1. comportementale — chacun des quatre sites masque le MÊME secret
 *      (déjà couvert, par site, dans `reply-message-protection-contract.test.ts`
 *      (a/b), `message-new-producer-parity.test.ts` (b, gelé), et les
 *      nouveaux témoins de `messages-retrieval-serialization.test.ts` (c) et
 *      `threads.test.ts` (d)) ;
 *   2. structurelle — les quatre sites appellent bien le site UNIQUE, jamais
 *      une réimplémentation locale du masquage. Un cinquième site qui
 *      construirait un `replyTo` sans passer par `servedQuotedMessage` ne
 *      ferait tomber AUCUN des témoins comportementaux existants (chacun ne
 *      regarde que SON site) — c'est cette garde-ci qui le verrait.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');

const REPLY_TO_BODY_SITES = [
  {
    name: 'REST — GET /conversations/:id/messages',
    file: join(GATEWAY_SRC, 'routes/conversations/messages-list-query.ts'),
  },
  {
    name: 'Socket.IO — message:new',
    file: join(GATEWAY_SRC, 'socketio/messageNewPayload.ts'),
  },
  {
    name: 'REST — GET /links/:identifier/messages',
    file: join(GATEWAY_SRC, 'routes/links/utils/message-formatters.ts'),
  },
  {
    name: 'REST — GET /conversations/:id/threads/:messageId',
    file: join(GATEWAY_SRC, 'routes/conversations/threads.ts'),
  },
] as const;

describe('#4952 — les quatre sites qui construisent un replyTo avec un corps appellent le masquage UNIQUE', () => {
  it.each(REPLY_TO_BODY_SITES)('$name appelle servedQuotedMessage', ({ file }) => {
    const source = readFileSync(file, 'utf-8');
    expect(source).toMatch(/\bimport\s*\{[^}]*\bservedQuotedMessage\b[^}]*\}\s*from\s*['"][^'"]*servedQuotedMessage['"]/);
    expect(source).toMatch(/\bservedQuotedMessage\(/);
  });

  it("n'existe qu'un seul module qui décide si une citation est protégée", () => {
    // `quotedMessageIsProtected` — le prédicat que `servedQuotedMessage`
    // encapsule — ne doit pas être réimplémenté site par site : un second
    // prédicat divergerait silencieusement de la loi partagée (leçon 261).
    for (const { file } of REPLY_TO_BODY_SITES) {
      const source = readFileSync(file, 'utf-8');
      expect(source).not.toMatch(/function\s+\w*[Qq]uoted\w*[Pp]rotected/);
    }
  });
});
