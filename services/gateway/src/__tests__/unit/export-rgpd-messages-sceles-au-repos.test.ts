/**
 * **L'EXPORT RGPD SERVAIT UN `content` VIDE POUR TOUT MESSAGE SCELLÉ AU REPOS**
 * (#20163).
 *
 * `routes/me/export.ts` sélectionnait `content` et rien de l'enveloppe au
 * repos — mesuré : ZÉRO occurrence de `encrypt` dans tout le fichier. Or
 * `MessageProcessor` écrit `content: ''` dès qu'un message part dans une
 * conversation `server` ou `hybrid`, le texte vivant dans `encryptedContent`.
 * L'archive servait donc une ligne par message avec un texte VIDE, et un
 * `messagesCount` JUSTE : elle ne se présentait pas comme tronquée mais comme
 * « vous n'avez rien écrit » — « la liste vide est plus dangereuse que la
 * réponse vide » (`services/gateway/CLAUDE.md`) appliqué à une obligation
 * légale (RGPD art. 15(3), 12(1), 5(1)(d)).
 *
 * ─── LE CORRECTIF NE CRÉE AUCUNE LOI ────────────────────────────────────────
 *
 * `AT_REST_MESSAGE_SELECT` + `revealAtRestRowsForWire` (`serverAtRest.ts`) sont
 * la loi que QUATORZE lecteurs de la passerelle appliquent déjà — fil, threads,
 * liste, épinglés, sync, liens, tableau de bord, socket, édition. L'export
 * était le seul à ne pas ouvrir le sceau, et le seul dont la sortie est
 * opposable au titre d'un droit.
 *
 * ─── POURQUOI LA VARIANTE `…ForWire`, ET PAS `revealAtRestRows` ─────────────
 *
 * Le schéma de réponse déclare `messages` en
 * `items: { type: 'object', additionalProperties: true }` — OUVERT. Tout ce que
 * le gestionnaire met dans une ligne SORT. Ajouter les cinq colonnes au `select`
 * sans déporter le chiffré publierait donc `encryptedContent` et
 * `encryptionMetadata` dans l'archive : la question « qu'est-ce qui part À CÔTÉ
 * de ce que je viens de corriger ? » appliquée à son propre correctif. La
 * variante `…ForWire` RETIRE les deux clés ; `isEncrypted` et `encryptionMode`
 * restent, et c'est voulu — ils DISENT le régime.
 *
 * ─── POURQUOI CES TÉMOINS NE PEUVENT PAS SE MENTIR ──────────────────────────
 *
 * Le double `findManyIn` applique le `where` ET **projette par le `select`** :
 * une colonne absente de la requête est absente de la ligne rendue, donc le
 * témoin de VALEUR tombe pour de vrai si le `select` l'oublie. Un double qui
 * rend sa fixture quel que soit le `select` ne verrait rien (c'est le défaut
 * que l'audit de #20113 a mesuré, et ce que fait encore
 * `export-sections.test.ts:376`).
 *
 * ─── LA FORME NOMINALE D'UNE LIGNE `Message` PORTE `deletedAt: null` ────────
 *
 * Contrairement à `Post` et `PostComment` (#19909), le filtre `deletedAt: null`
 * est JUSTE ici : `LIVE_MESSAGE_MARK` (`services/messaging/liveMessage.ts`) est
 * la discipline d'ÉCRITURE que tous les créateurs de `Message` répandent —
 * `MessageProcessor`, `CallService`, `conversationNotice`,
 * `MessageTranslationService` — donc la clé est PRÉSENTE. Les fixtures la
 * portent pour cette raison, pas par commodité.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { findManyIn, type MongoDocument } from '../helpers/mongo-where';
import { exportMessages, MESSAGES_LIMIT } from '../../routes/me/export-sections';
import type { AtRestKeyring } from '../../services/messaging/serverAtRest';

const CLAIR = 'On se voit demain à 14 h';

/** Un trousseau qui ouvre tout, et qui COMPTE ce qu'on lui demande. */
const trousseauOuvrant = () => {
  const demandes: string[] = [];
  const keyring: AtRestKeyring = {
    openAtRest: async (envelope, conversationId) => {
      demandes.push(`${conversationId}:${envelope.keyId}`);
      return CLAIR;
    },
  };
  return { keyring, demandes };
};

/** Un trousseau qui ne peut pas ouvrir : la clé a disparu du coffre. */
const trousseauMuet = (): AtRestKeyring => ({
  openAtRest: async () => {
    throw new Error('clé introuvable');
  },
});

const LIGNE_SCELLEE: MongoDocument = {
  id: 'm-scelle',
  conversationId: '507f1f77bcf86cd799439011',
  senderId: 'u-1',
  content: '',
  isEncrypted: true,
  encryptionMode: 'server',
  encryptedContent: 'Q0hJRkZSRQ==',
  encryptionMetadata: { keyId: 'k-1', iv: 'aXY=', authTag: 'dGFn' },
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  createdAt: new Date('2026-11-01T10:00:00Z'),
  editedAt: null,
  deletedAt: null,
};

const LIGNE_CLAIRE: MongoDocument = {
  id: 'm-clair',
  conversationId: '507f1f77bcf86cd799439012',
  senderId: 'u-1',
  content: 'Bonjour',
  isEncrypted: false,
  encryptionMode: null,
  encryptedContent: null,
  encryptionMetadata: null,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  createdAt: new Date('2026-11-02T10:00:00Z'),
  editedAt: null,
  deletedAt: null,
};

const LIGNE_E2EE: MongoDocument = {
  id: 'm-e2ee',
  conversationId: '507f1f77bcf86cd799439013',
  senderId: 'u-1',
  content: '',
  isEncrypted: false,
  encryptionMode: 'e2ee',
  encryptedContent: null,
  encryptionMetadata: null,
  originalLanguage: 'zxx',
  messageType: 'text',
  messageSource: 'user',
  createdAt: new Date('2026-11-03T10:00:00Z'),
  editedAt: null,
  deletedAt: null,
};

const base = (rows: readonly MongoDocument[]) => {
  const table = findManyIn(rows);
  return { prisma: { message: { findMany: jest.fn(table.findMany) } } as never, calls: table.calls };
};

describe("l'export RGPD ouvre le sceau au repos de ses messages (#20163)", () => {
  it('sert le TEXTE CLAIR d’un message scellé, là où la base porte une chaîne vide', async () => {
    const { keyring, demandes } = trousseauOuvrant();
    const { prisma } = base([LIGNE_SCELLEE]);

    const [servi] = await exportMessages(prisma, ['u-1'], keyring);

    expect(servi?.content).toBe(CLAIR);
    expect(demandes).toEqual(['507f1f77bcf86cd799439011:k-1']);
  });

  it('ne met NI le chiffré NI ses métadonnées dans l’archive — le schéma de la section est ouvert', async () => {
    const { keyring } = trousseauOuvrant();
    const { prisma } = base([LIGNE_SCELLEE]);

    const [servi] = await exportMessages(prisma, ['u-1'], keyring);

    expect(servi).not.toHaveProperty('encryptedContent');
    expect(servi).not.toHaveProperty('encryptionMetadata');
  });

  it('DIT le régime plutôt que de le taire : la ligne servie garde `encryptionMode`', async () => {
    const { keyring } = trousseauOuvrant();
    const { prisma } = base([LIGNE_SCELLEE]);

    const [servi] = await exportMessages(prisma, ['u-1'], keyring);

    expect(servi?.encryptionMode).toBe('server');
    expect(servi?.isEncrypted).toBe(false);
  });

  it('un sceau que le coffre n’ouvre PAS sort étiqueté scellé, jamais en silence', async () => {
    const { prisma } = base([LIGNE_SCELLEE]);

    const [servi] = await exportMessages(prisma, ['u-1'], trousseauMuet());

    expect(servi?.content).toBe('');
    expect(servi?.isEncrypted).toBe(true);
    expect(servi?.encryptionMode).toBe('server');
  });

  it('une conversation chiffrée DE BOUT EN BOUT n’a rien à ouvrir, et le trousseau n’est pas touché', async () => {
    const { keyring, demandes } = trousseauOuvrant();
    const { prisma } = base([LIGNE_E2EE]);

    const [servi] = await exportMessages(prisma, ['u-1'], keyring);

    expect(servi?.encryptionMode).toBe('e2ee');
    expect(demandes).toEqual([]);
  });

  it('un message en clair traverse inchangé', async () => {
    const { keyring, demandes } = trousseauOuvrant();
    const { prisma } = base([LIGNE_CLAIRE]);

    const [servi] = await exportMessages(prisma, ['u-1'], keyring);

    expect(servi?.content).toBe('Bonjour');
    expect(demandes).toEqual([]);
  });

  it('la REQUÊTE demande les cinq colonnes de l’enveloppe — un témoin de valeur ne peut pas voir un `select` qui les oublie', async () => {
    const { keyring } = trousseauOuvrant();
    const { prisma, calls } = base([LIGNE_SCELLEE]);

    await exportMessages(prisma, ['u-1'], keyring);

    expect(calls[0]?.select).toMatchObject({
      conversationId: true,
      isEncrypted: true,
      encryptionMode: true,
      encryptedContent: true,
      encryptionMetadata: true,
    });
  });

  it('garde ses bornes : l’expéditeur, les messages non supprimés, et le plafond', async () => {
    const { keyring } = trousseauOuvrant();
    const supprime = { ...LIGNE_CLAIRE, id: 'm-supprime', deletedAt: new Date('2026-11-04T10:00:00Z') };
    const autrui = { ...LIGNE_CLAIRE, id: 'm-autrui', senderId: 'u-2' };
    const { prisma, calls } = base([LIGNE_CLAIRE, supprime, autrui]);

    const servis = await exportMessages(prisma, ['u-1'], keyring);

    expect(servis.map((row) => row.id)).toEqual(['m-clair']);
    expect(calls[0]?.take).toBe(MESSAGES_LIMIT);
  });
});
