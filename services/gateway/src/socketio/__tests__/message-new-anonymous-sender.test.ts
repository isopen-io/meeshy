/**
 * L'AUTEUR SANS COMPTE D'UN MESSAGE NEUF PORTE SON NOM DONNÉ (#10120).
 *
 * Recette staging du 2026-10-11 : un invité de World Wide entré sous le nom
 * « Recette QA 063842 » envoie un message ; sa ligne « Vous » montre « AR »,
 * les initiales du pseudo `ano_RecetteQA063842`, quand un compte qui relit la
 * liste voit « RQ ». La liste résout le nom donné (`messages-list-query.ts`) ;
 * `message:new` et la réponse de l'envoi servaient la ligne `Participant`
 * brute, où `displayName` EST le pseudo. Les deux producteurs passent par
 * `buildMessageNewPayload` : il sert la forme de la liste — le nom donné en
 * `displayName`, le pseudo en `username` — et rien du profil de session.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { buildMessageNewPayload } from '../messageNewPayload';
import { makeContractMessage } from './helpers/message-new-parity-fixtures';

const INVITE = {
  id: 'p-invite',
  userId: null,
  displayName: 'ano_RecetteQA063842',
  avatar: null,
  type: 'anonymous',
  nickname: null,
  user: null,
  anonymousSession: { profile: { firstName: 'Recette QA 063842', lastName: '' } },
};

const payloadOf = (sender: unknown) =>
  buildMessageNewPayload(makeContractMessage({ senderId: 'p-invite', sender }), {
    conversationId: 'conv-world',
    translations: [],
    attachments: [],
  });

describe('message:new — un invité y porte le nom qu’il a donné', () => {
  it('le nom donné en displayName, le pseudo ano_ en username', () => {
    const { sender } = payloadOf(INVITE);
    expect(sender?.displayName).toBe('Recette QA 063842');
    expect(sender?.username).toBe('ano_RecetteQA063842');
  });

  it('le profil de session ne part pas sur le fil', () => {
    expect(JSON.stringify(payloadOf(INVITE).sender)).not.toContain('anonymousSession');
  });

  it('un auteur déjà servi (réponse de l’envoi rejouée par le producteur REST) garde son nom et son pseudo', () => {
    const { anonymousSession: _session, ...rest } = INVITE;
    const { sender } = payloadOf({ ...rest, displayName: 'Recette QA 063842', username: 'ano_RecetteQA063842' });
    expect(sender?.displayName).toBe('Recette QA 063842');
    expect(sender?.username).toBe('ano_RecetteQA063842');
  });

  it('un invité d’avant le profil garde son pseudo, en nom comme en handle', () => {
    const { anonymousSession: _session, ...rest } = INVITE;
    const { sender } = payloadOf(rest);
    expect(sender?.displayName).toBe('ano_RecetteQA063842');
    expect(sender?.username).toBe('ano_RecetteQA063842');
  });
});
