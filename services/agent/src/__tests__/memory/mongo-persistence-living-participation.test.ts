/**
 * #20111 — UN MEMBRE BANNI N'EST PAS ANIMÉ, et il ne compte pas comme éligible.
 *
 * L'agent sélectionne les membres DORMANTS d'une conversation **pour parler à
 * leur place** (archétype « Impersonator », `CLAUDE.md` du service). Ses trois
 * lectures de `Participant` portaient `isActive: true` NU : un membre
 * actif-et-banni y était éligible, donc l'agent publiait un message signé de
 * quelqu'un d'EXCLU, dans le fil dont il est exclu. Ce n'est pas une fuite de
 * lecture — c'est une INJECTION de contenu attribuée à une personne bannie.
 *
 * La ligne `{ isActive: true, bannedAt ≠ null }` existe en base : bannir
 * pendant qu'une participation est inactive n'écrit que `bannedAt`
 * (`conversationBanState.ts`), et aucune migration n'a repris les lignes
 * existantes. Le producteur est fermé ; la population, non.
 *
 * ── POURQUOI CE DOUBLE, ET PAS UN `toMatchObject` SUR LE `where` ────────────
 *
 * `bannedAt` est ABSENT du document de tout participant jamais banni, et
 * Prisma n'apparie pas une clé absente par une égalité à `null`. Un témoin qui
 * compare la clause reçue à celle qu'il attend passe donc aussi bien avec une
 * clause juste qu'avec une clause qui ferme l'agent à TOUTE la population : il
 * ne vérifie que sa propre copie. `findManyIn` ÉVALUE le `where` contre des
 * documents nus — une clé absente de l'objet est absente du document — et
 * c'est le RÉSULTAT de la lecture qui parle.
 *
 * Le double vient de la passerelle PAR IMPORT, jamais par copie : c'est le
 * seul évaluateur de `where` MongoDB du dépôt, il n'a aucune dépendance, et
 * une seconde transcription de la sémantique « absent ≠ null » serait
 * exactement la jumelle divergente que ce lot ferme.
 */
import { describe, it, expect } from '@jest/globals';
import { PARTICIPATION_VIVANTE } from '@meeshy/shared/utils/participation-vivante';
import { findManyIn, groupByIn } from '../../../../gateway/src/__tests__/helpers/mongo-where';
import { MongoPersistence } from '../../memory/mongo-persistence';

const CONVERSATION = 'conv-1';
const VIEILLE_ACTIVITE = new Date('2020-01-01T00:00:00.000Z');

/** Un dormant que l'agent DOIT pouvoir animer — et sa ligne ne porte AUCUNE clé `bannedAt`. */
const dormantVivant = (id: string) => ({
  id: `p-${id}`,
  conversationId: CONVERSATION,
  userId: id,
  isActive: true,
  lastActiveAt: VIEILLE_ACTIVITE,
  user: {
    id,
    displayName: id,
    username: id,
    bio: '',
    systemLanguage: 'fr',
    agentGlobalProfile: null,
    lastActiveAt: VIEILLE_ACTIVITE,
    role: 'USER',
    isOnline: false,
    sessions: [],
  },
});

/** Le défaut de #20111 : ACTIF et BANNI. C'est la ligne que la loi doit écarter. */
const dormantBanni = (id: string) => ({
  ...dormantVivant(id),
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
});

/** Un dormant DÉBANNI — `bannedAt` remis à `null`, ce qu'écrit `resolveUnbanWrite`. */
const dormantDebanni = (id: string) => ({ ...dormantVivant(id), bannedAt: null });

const persistenceSur = (rows: readonly Record<string, unknown>[]) => {
  const participant = findManyIn(rows);
  const prisma = {
    participant: {
      findMany: participant.findMany,
      groupBy: () => Promise.resolve([]),
    },
    agentUserRole: { findMany: () => Promise.resolve([]) },
  } as never;
  return { persistence: new MongoPersistence(prisma), calls: participant.calls };
};

const identifiants = (users: readonly { id: string }[]) => users.map((user) => user.id).sort();

describe('#20111 — la loi de la participation vivante gouverne les sélecteurs de l’agent', () => {
  it('la loi partagée dit bien « active ET non bannie », sous les DEUX états de « pas encore banni »', () => {
    expect(PARTICIPATION_VIVANTE).toEqual({
      isActive: true,
      OR: [{ bannedAt: null }, { bannedAt: { isSet: false } }],
    });
  });

  it('getPotentialControlledUsers n’élit jamais un dormant BANNI', async () => {
    const { persistence } = persistenceSur([dormantVivant('vivant'), dormantBanni('banni')]);

    const elus = await persistence.getPotentialControlledUsers(CONVERSATION, 10, 24, [], []);

    expect(identifiants(elus)).toEqual(['vivant']);
  });

  it('getLeastActiveParticipants n’élit jamais un dormant BANNI', async () => {
    const { persistence } = persistenceSur([dormantVivant('vivant'), dormantBanni('banni')]);

    const elus = await persistence.getLeastActiveParticipants(CONVERSATION, 10, [], []);

    expect(identifiants(elus)).toEqual(['vivant']);
  });

  /**
   * Le témoin qui tombe si la loi s'écrit `bannedAt: null` au lieu de
   * `unsetOrNull('bannedAt')` : la colonne étant ABSENTE pour l'immense
   * majorité, cette orthographe ferme l'agent à toute la population — un
   * resserrement qui ressemble à un correctif et qui ÉTEINT la feature.
   */
  it.each([
    ['getPotentialControlledUsers', (p: MongoPersistence) => p.getPotentialControlledUsers(CONVERSATION, 10, 24, [], [])],
    ['getLeastActiveParticipants', (p: MongoPersistence) => p.getLeastActiveParticipants(CONVERSATION, 10, [], [])],
  ])('%s garde le dormant jamais banni ET le dormant débanni', async (_nom, appeler) => {
    const { persistence } = persistenceSur([dormantVivant('jamais-banni'), dormantDebanni('debanni'), dormantBanni('banni')]);

    const elus = await appeler(persistence);

    expect(identifiants(elus)).toEqual(['debanni', 'jamais-banni']);
  });
});

/**
 * LA MESURE — `getEligibleConversations` compte les participants « éligibles »
 * pour élire les conversations qui valent un scan.
 *
 * Ici un banni n'est pas une fuite : c'est un nombre FAUX. Le compte doit dire
 * la même chose que les deux sélecteurs qu'il garde, sans quoi il envoie
 * scanner un fil dont aucun d'eux ne retiendra personne. C'est la troisième
 * ligne du tableau de `services/gateway/CLAUDE.md` § audiences — « COMBIEN ils
 * sont (mesure) : dire ce que le nombre alimente ».
 */
describe('#20111 — la MESURE d’éligibilité compte comme ses sélecteurs', () => {
  const conversationEligible = {
    id: CONVERSATION,
    type: 'group',
    isActive: true,
    lastMessageAt: new Date(),
    agentConfig: null,
  };

  const persistenceAvec = (rows: readonly Record<string, unknown>[]) => {
    const participant = groupByIn(rows);
    const prisma = {
      conversation: { findMany: (args: { where?: Record<string, unknown> }) => Promise.resolve(args.where?.agentConfig ? [] : [conversationEligible]) },
      agentUserRole: { groupBy: () => Promise.resolve([]) },
      participant: { groupBy: participant.groupBy },
    } as never;
    return new MongoPersistence(prisma);
  };

  it('ne retient pas une conversation dont le seul dormant est BANNI', async () => {
    const persistence = persistenceAvec([dormantBanni('banni')]);

    await expect(persistence.getEligibleConversations()).resolves.toEqual([]);
  });

  it('retient la conversation dès qu’un dormant est VIVANT', async () => {
    const persistence = persistenceAvec([dormantVivant('vivant'), dormantBanni('banni')]);

    const retenues = await persistence.getEligibleConversations();

    expect(retenues.map((c: { id: string }) => c.id)).toEqual([CONVERSATION]);
  });
});
