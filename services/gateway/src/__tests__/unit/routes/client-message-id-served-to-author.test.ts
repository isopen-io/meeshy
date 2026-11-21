/**
 * @jest-environment node
 *
 * **LA CLÉ D'IDEMPOTENCE EST SERVIE À SON AUTEUR, ET À PERSONNE D'AUTRE** (#19960).
 *
 * Le chemin socket l'avait tranché dès #16689 — `stripClientMessageId` retire
 * `clientMessageId` de la charge des PAIRS, « so a non-sender participant
 * never learns the sender's optimistic-id space ». Les DEUX surfaces qui
 * servent une ligne au repos, la liste REST et le delta `/sync`, la servaient
 * à tout participant, chacune sous un commentaire qui justifie la
 * réconciliation optimiste — vraie de SES propres bulles, et d'aucune autre.
 *
 * Les deux témoins traversent la couche de sérialisation RÉELLE
 * (`fast-json-stringify` sur `messageSchema` pour la liste), parce qu'une
 * assertion posée sur l'objet du mapper n'atteste pas ce qui part sur le fil.
 */
import { describe, expect, it } from '@jest/globals';
import fastJsonStringify from 'fast-json-stringify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

import { mapMessageRowForList } from '../../../routes/conversations/messages-list-query';
import { servedClientMessageId } from '../../../services/messaging/clientMessageIdOwnership';

const CONV_ID = '507f1f77bcf86cd799439011';
const AUTHOR = '507f1f77bcf86cd7994390a0';
const PEER = '507f1f77bcf86cd7994390b9';
const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

const row = {
  id: '507f1f77bcf86cd799439033',
  conversationId: CONV_ID,
  senderId: AUTHOR,
  clientMessageId: CID,
  content: 'a tout de suite',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
  attachments: [],
  sender: null,
};

const ctxFor = (reader: string | undefined) => ({
  includeTranslations: false,
  includeReplies: false,
  hasLanguageFilter: false,
  languageFilter: undefined,
  currentParticipantId: reader,
  readStatusMap: new Map(),
  senderPresenceVis: new Map(),
  listMissingEntry: 'hide',
  consumptionMap: new Map(),
  ephemeralDeadlines: new Map(),
}) as never;

const listWire = (reader: string | undefined) =>
  JSON.parse(fastJsonStringify(messageSchema as never)(mapMessageRowForList(row as never, ctxFor(reader))));

describe('la liste REST ne sert le clientMessageId qu’à son auteur (#19960)', () => {
  it('l’AUTEUR le reçoit — la réconciliation optimiste au chargement à froid reste possible', () => {
    expect(listWire(AUTHOR).clientMessageId).toBe(CID);
  });

  it('un PAIR ne le reçoit pas, et la clé n’apparaît nulle part dans ce qui part', () => {
    const wire = listWire(PEER);

    expect(wire.clientMessageId).toBeNull();
    expect(JSON.stringify(wire)).not.toContain(CID);
  });

  it('un lecteur NON RÉSOLU ne reçoit rien non plus : la porte ferme par défaut', () => {
    expect(listWire(undefined).clientMessageId).toBeNull();
  });
});

describe('la loi de service ferme par défaut', () => {
  it('rend la clé à son auteur', () => {
    expect(servedClientMessageId({ clientMessageId: CID, senderParticipantId: AUTHOR, readerParticipantId: AUTHOR })).toBe(CID);
  });

  it.each([
    ['un pair', PEER],
    ['un lecteur inconnu', undefined],
    ['un lecteur vide', ''],
  ])('ne rend rien à %s', (_label, reader) => {
    expect(servedClientMessageId({
      clientMessageId: CID, senderParticipantId: AUTHOR, readerParticipantId: reader as string | undefined,
    })).toBeNull();
  });

  it('ne fabrique rien quand la ligne n’a pas de clé', () => {
    expect(servedClientMessageId({ clientMessageId: null, senderParticipantId: AUTHOR, readerParticipantId: AUTHOR })).toBeNull();
  });
});
