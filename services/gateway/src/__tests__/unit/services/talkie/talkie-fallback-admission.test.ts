/**
 * **LE REPLI DU TALKIE APPLIQUE LA RÈGLE D'ADMISSION QU'IL DÉCLARE** (#19910).
 *
 * Deux défauts se livrent ici ensemble, et l'ordre compte.
 *
 * 1. `deletedAt: null` était une ÉGALITÉ sur une colonne qu'aucun des onze
 *    `conversation.create` n'écrit (#19803, #19905) : le repli ne rendait JAMAIS
 *    rien, pour aucune paire.
 * 2. Tant qu'il ne rendait rien, `withFallbackConversation` ne posait aucun
 *    `conversationId` sur l'accusé et **le client choisissait seul**, en
 *    appliquant `mayCarryTheCopy`. Réparer le filtre ne « rallume » donc pas un
 *    chemin : il **TRANSFÈRE la décision du client au serveur** — et les trois
 *    clients font confiance à l'id servi (iOS et Android le prennent tel quel,
 *    le web ne revérifie que le registre E2EE).
 *
 * Ce `where` est donc le SEUL endroit où la règle s'applique encore, et son
 * doc-comment en déclarait une partie qu'il n'appliquait pas : « une copie
 * n'atterrit ni dans une communauté ». C'est la leçon 124 du dépôt — *un champ
 * de service qui DÉCLARE une restriction ne la fait pas respecter* — restée
 * inoffensive uniquement parce que le filtre était mort.
 *
 * ─── CE QUE CHAQUE TÉMOIN GARDE ─────────────────────────────────────────────
 *
 * Un par prédicat, et tous de COMPORTEMENT : ils appellent la fonction et
 * lisent l'id rendu. Le double ÉVALUE le `where` (`findConversationsIn`,
 * `matchesMongoWhere`) ; il n'en recopie jamais la clause — une assertion de
 * forme survivrait à une clause qui n'apparie rien, ce qui est précisément le
 * défaut qu'on répare.
 */

import { describe, it, expect } from '@jest/globals';
import { findManyIn, type MongoDocument } from '../../../helpers/mongo-where';
import { findConversationsIn, type DirectDoc } from '../../../helpers/direct-pair-world';
import { mostRecentSharedConversation } from '../../../../services/talkie/talkieFallback';

const MOI = 'u-emetteur';
const LUI = 'u-destinataire';
const at = (iso: string) => new Date(iso);

/**
 * La forme NOMINALE d'une conversation partagée : `deletedAt`, `communityId` et
 * `encryptionMode` ABSENTS — ce que produisent les chemins de création — et les
 * deux colonnes REQUISES portant leur défaut.
 */
const partagee = (id: string, columns: MongoDocument = {}): DirectDoc => ({
  id,
  participants: [],
  type: 'direct',
  isActive: true,
  isAnnouncementChannel: false,
  defaultWriteRole: 'everyone',
  slowModeSeconds: 0,
  lastMessageAt: at('2026-11-10T10:00:00Z'),
  ...columns,
});

/**
 * Les deux participations ACTIVES de la paire, à la forme nominale
 * (`deletedForMe` absent) et aux droits d'un membre ordinaire — `permissions`
 * est un composite REQUIS, donc toute ligne de production le porte
 * (`NEW_MEMBER_PERMISSIONS` ouvre les deux droits que ce chemin exige).
 */
const DROITS_OUVERTS = { canSendMessages: true, canSendAudios: true };

const paireSur = (ids: readonly string[], extra: MongoDocument = {}): MongoDocument[] =>
  ids.flatMap((conversationId) => [
    { conversationId, userId: MOI, isActive: true, permissions: DROITS_OUVERTS, ...extra },
    { conversationId, userId: LUI, isActive: true, permissions: DROITS_OUVERTS },
  ]);

const monde = (conversations: readonly DirectDoc[], participants: readonly MongoDocument[]) =>
  ({
    participant: findManyIn(participants),
    conversation: findConversationsIn(conversations),
  }) as never;

const destination = (conversations: readonly DirectDoc[], participants: readonly MongoDocument[]) =>
  mostRecentSharedConversation(monde(conversations, participants), MOI, LUI);

describe('le repli du talkie n’est plus mort, et il applique sa règle (#19910)', () => {
  it('rend la conversation partagée à la forme NOMINALE — le filtre n’est plus inerte', async () => {
    const vivante = partagee('c-vivante');

    expect(await destination([vivante], paireSur(['c-vivante']))).toBe('c-vivante');
  });

  it('écarte une conversation réellement supprimée', async () => {
    const supprimee = partagee('c-supprimee', { deletedAt: at('2026-11-11T10:00:00Z'), lastMessageAt: at('2026-11-20T10:00:00Z') });
    const vivante = partagee('c-vivante');

    expect(await destination([supprimee, vivante], paireSur(['c-supprimee', 'c-vivante']))).toBe('c-vivante');
  });

  /**
   * CE QUE LE DOC-COMMENT DÉCLARAIT ET QUE LE `where` N'APPLIQUAIT PAS.
   * `type: 'group'` ne suffit pas : `communities/core.ts` rattache une
   * conversation EXISTANTE à une communauté sans toucher son `type`.
   */
  it('ne nomme JAMAIS un salon de communauté, même de type `group`', async () => {
    const salon = partagee('c-salon', { type: 'group', communityId: '507f1f77bcf86cd799439011', lastMessageAt: at('2026-11-20T10:00:00Z') });
    const privee = partagee('c-privee');

    expect(await destination([salon, privee], paireSur(['c-salon', 'c-privee']))).toBe('c-privee');
  });

  /**
   * L'ENVOI SERAIT REFUSÉ EN AVAL (`admitConversationWrite` lit exactement ces
   * deux colonnes), et la copie vocale serait PERDUE — avec, sur Android, une
   * bulle optimiste déjà peinte dans le salon.
   */
  it('ne nomme pas un canal d’annonces', async () => {
    const annonces = partagee('c-annonces', { type: 'group', isAnnouncementChannel: true, lastMessageAt: at('2026-11-20T10:00:00Z') });
    const privee = partagee('c-privee');

    expect(await destination([annonces, privee], paireSur(['c-annonces', 'c-privee']))).toBe('c-privee');
  });

  it('ne nomme pas un groupe où seuls les modérateurs écrivent', async () => {
    const reserve = partagee('c-reserve', { type: 'group', defaultWriteRole: 'moderator', lastMessageAt: at('2026-11-20T10:00:00Z') });
    const privee = partagee('c-privee');

    expect(await destination([reserve, privee], paireSur(['c-reserve', 'c-privee']))).toBe('c-privee');
  });

  /**
   * L'ASYMÉTRIE, et elle est délibérée : une conversation que l'ÉMETTEUR a
   * masquée ne figure pas dans la liste où son client puiserait, donc la nommer
   * enverrait la copie là où il ne la cherchera pas.
   */
  it('ne nomme pas une conversation que l’ÉMETTEUR a masquée chez lui', async () => {
    const masquee = partagee('c-masquee', { lastMessageAt: at('2026-11-20T10:00:00Z') });
    const visible = partagee('c-visible');
    const participants = [
      ...paireSur(['c-visible']),
      { conversationId: 'c-masquee', userId: MOI, isActive: true, permissions: DROITS_OUVERTS, deletedForMe: at('2026-11-12T10:00:00Z') },
      { conversationId: 'c-masquee', userId: LUI, isActive: true, permissions: DROITS_OUVERTS },
    ];

    expect(await destination([masquee, visible], participants)).toBe('c-visible');
  });

  /** Mais le masquage du DESTINATAIRE ne retire rien : la conversation lui réapparaît à l'arrivée. */
  it('nomme une conversation que seul le DESTINATAIRE a masquée', async () => {
    const masqueeChezLui = partagee('c-chez-lui');
    const participants = [
      { conversationId: 'c-chez-lui', userId: MOI, isActive: true, permissions: DROITS_OUVERTS },
      { conversationId: 'c-chez-lui', userId: LUI, isActive: true, permissions: DROITS_OUVERTS, deletedForMe: at('2026-11-12T10:00:00Z') },
    ];

    expect(await destination([masqueeChezLui], participants)).toBe('c-chez-lui');
  });

  /**
   * LE RÉGIME SE DIT EN POSITIF (#12966, #19907). La population qui compte est
   * celle dont `encryptionMode` est ABSENTE — toute conversation créée avant la
   * directive « régime à la création » — et c'est elle que la négation d'une
   * condition COMPOSÉE laissait en suspens.
   */
  it('nomme une conversation dont le régime n’est pas écrit, et écarte une `e2ee` plus récente', async () => {
    const sansRegime = partagee('c-sans-regime');
    const chiffree = partagee('c-chiffree', { encryptionMode: 'e2ee', lastMessageAt: at('2026-11-20T10:00:00Z') });

    expect(await destination([chiffree, sansRegime], paireSur(['c-chiffree', 'c-sans-regime']))).toBe('c-sans-regime');
  });

  /**
   * ET LE RANG RESTE CELUI DE #19834 SOUS CE `where` : une conversation REMONTÉE
   * par une réaction, un appel ou une épingle passe devant celle qui porte le
   * dernier message — ce que les clients élisent sur `listRankAt`.
   */
  it('élit la conversation REMONTÉE par son activité, pas celle du dernier message', async () => {
    const remontee = partagee('c-remontee', {
      lastMessageAt: at('2026-11-01T10:00:00Z'),
      lastActivityAt: at('2026-11-25T10:00:00Z'),
    });
    const bavarde = partagee('c-bavarde', { lastMessageAt: at('2026-11-10T10:00:00Z') });

    expect(await destination([remontee, bavarde], paireSur(['c-remontee', 'c-bavarde']))).toBe('c-remontee');
  });

  /**
   * L'ÉTAT TERMINAL NE SE LIT PAS DANS `isActive` SEUL (constat d'audit).
   * `admin/conversation-settings-sovereign.ts` pose `closedAt` quand `closed:
   * true` arrive SANS `isActive` : le fil reste ACTIF et fermé. Nommer cette
   * conversation ferait répondre `410 conversation-closed` au POST, et la copie
   * serait perdue sans repli — `isConversationClosed` tranche sur
   * `isActive === false` **ou** `closedAt != null`.
   */
  it('ne nomme pas une conversation FERMÉE qui est restée active', async () => {
    const fermee = partagee('c-fermee', { closedAt: at('2026-11-12T10:00:00Z'), lastMessageAt: at('2026-11-20T10:00:00Z') });
    const vivante = partagee('c-vivante');

    expect(await destination([fermee, vivante], paireSur(['c-fermee', 'c-vivante']))).toBe('c-vivante');
  });

  it('ne nomme pas un GROUPE en mode lent — l’envoi y serait refusé en 429', async () => {
    const lente = partagee('c-lente', { type: 'group', slowModeSeconds: 300, lastMessageAt: at('2026-11-20T10:00:00Z') });
    const vivante = partagee('c-vivante');

    expect(await destination([lente, vivante], paireSur(['c-lente', 'c-vivante']))).toBe('c-vivante');
  });

  /**
   * ET LA DISPENSE DU TÊTE-À-TÊTE, qui est la moitié la moins intuitive.
   *
   * `WRITE_HIERARCHY_FREE_TYPES` exempte `direct` du rang ET du débit, et sa
   * raison écrite est que la dispense **GUÉRIT** les tête-à-tête qu'un
   * initiateur a empoisonnés en y posant `isAnnouncementChannel` ou un plancher
   * `defaultWriteRole`. Filtrer ces colonnes sur un `direct` écarterait donc une
   * conversation où l'envoi RÉUSSIT — et quand c'est la seule que la paire
   * partage, le repli du client ne produit rien non plus : la copie serait
   * perdue. C'est le contre-exemple à « l'erreur penche du côté sûr ».
   */
  it('nomme un tête-à-tête EMPOISONNÉ : la hiérarchie d’écriture ne s’y applique pas', async () => {
    const empoisonne = partagee('c-direct-empoisonne', {
      type: 'direct',
      isAnnouncementChannel: true,
      defaultWriteRole: 'admin',
      slowModeSeconds: 300,
    });

    expect(await destination([empoisonne], paireSur(['c-direct-empoisonne']))).toBe('c-direct-empoisonne');
  });

  /**
   * LES DROITS PERSONNELS DE L'ÉMETTEUR (#19930). La copie vocale est un
   * message AVEC une pièce jointe audio : `MessagingService` la refuse si
   * `canSendMessages` est explicitement fermé (`WRITE_NOT_PERMITTED`), et un
   * droit de média fermé fait passer la pièce par l'admission qui lit
   * `canSendAudios`. Nommer une telle conversation perdait la copie.
   */
  it('ne nomme pas une conversation où l’hôte a retiré à l’émetteur le droit d’ÉCRIRE', async () => {
    const interdite = partagee('c-interdite', { lastMessageAt: at('2026-11-20T10:00:00Z') });
    const vivante = partagee('c-vivante');
    const participants = [
      ...paireSur(['c-vivante']),
      { conversationId: 'c-interdite', userId: MOI, isActive: true, permissions: { canSendMessages: false, canSendAudios: true } },
      { conversationId: 'c-interdite', userId: LUI, isActive: true, permissions: DROITS_OUVERTS },
    ];

    expect(await destination([interdite, vivante], participants)).toBe('c-vivante');
  });

  it('ne nomme pas une conversation où l’émetteur ne peut pas joindre d’AUDIO', async () => {
    const muette = partagee('c-muette', { lastMessageAt: at('2026-11-20T10:00:00Z') });
    const vivante = partagee('c-vivante');
    const participants = [
      ...paireSur(['c-vivante']),
      { conversationId: 'c-muette', userId: MOI, isActive: true, permissions: { canSendMessages: true, canSendAudios: false } },
      { conversationId: 'c-muette', userId: LUI, isActive: true, permissions: DROITS_OUVERTS },
    ];

    expect(await destination([muette, vivante], participants)).toBe('c-vivante');
  });

  /**
   * ET LE DROIT DU DESTINATAIRE NE DÉCIDE RIEN : c'est l'ÉMETTEUR qui poste la
   * copie. Filtrer le destinataire écarterait une conversation où l'envoi
   * réussit — l'erreur symétrique de celle que ce lot répare.
   */
  it('nomme une conversation où seul le DESTINATAIRE n’a pas le droit d’écrire', async () => {
    const vivante = partagee('c-vivante');
    const participants = [
      { conversationId: 'c-vivante', userId: MOI, isActive: true, permissions: DROITS_OUVERTS },
      { conversationId: 'c-vivante', userId: LUI, isActive: true, permissions: { canSendMessages: false, canSendAudios: false } },
    ];

    expect(await destination([vivante], participants)).toBe('c-vivante');
  });

  it('rend `null` quand la paire ne partage aucune conversation admissible', async () => {
    const salon = partagee('c-salon', { type: 'group', communityId: '507f1f77bcf86cd799439011' });

    expect(await destination([salon], paireSur(['c-salon']))).toBeNull();
  });
});
