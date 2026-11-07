/**
 * #16557 — le texte que le traducteur lit d'un message rappelé : rien.
 *
 * Les transports de suppression gardent `content` (ils n'effacent que
 * `translations`). `translatableTextOf` est le passage obligé de toute
 * retraduction (édition, file post-envoi, retraduction demandée) : c'est là
 * qu'un rappel les arrête toutes.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { translatableTextOf } from '../../../../services/messaging/atRestTranslationSource';
import type { AtRestKeyring } from '../../../../services/messaging/serverAtRest';

const unusedKeyring = {} as AtRestKeyring;

describe('translatableTextOf — un message rappelé ne repart pas au traducteur (#16557)', () => {
  it('ne rend aucun texte d’un message rappelé, alors que sa ligne garde `content`', async () => {
    const text = await translatableTextOf(
      { id: 'm-1', content: 'mon code d’accès est 1234', encryptionMode: null, deletedAt: new Date('2026-11-07T10:00:00Z') },
      unusedKeyring,
    );

    expect(text).toBeNull();
  });

  it('rend le texte d’un message vivant', async () => {
    const text = await translatableTextOf({ id: 'm-1', content: 'bonjour', encryptionMode: null, deletedAt: null }, unusedKeyring);

    expect(text).toBe('bonjour');
  });
});
