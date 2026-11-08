/**
 * `pairAccessAmong` — l'orchestrateur lit ce que la LOI exige (#14107) : le
 * niveau au site unique, le blocage, et, quand la feature le demande, l'âge
 * déclaré et la communauté. Un bouclier des mineurs qu'on jugerait sans lire
 * l'âge serait ouvert.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { pairAccess, pairAccessAmong } from '../../../../services/relations/pairAccess';
import { ADULT_BIRTH, MINOR_BIRTH, messagingWorld } from '../../../helpers/messaging-circle-world';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADULTE = '6100000000000000000000a1';
const MINEUR = '6100000000000000000000a2';
const CONNAISSANCE = '6100000000000000000000a3';
const BLOQUEUR = '6100000000000000000000a4';
const CO_MEMBRE = '6100000000000000000000a5';
const COMMUNAUTE = '6100000000000000000000c1';

const monde = () =>
  messagingWorld({
    links: [
      [ADULTE, CONNAISSANCE, 'ACQUAINTANCE'],
      [ADULTE, BLOQUEUR, 'FRIEND'],
    ],
    users: [
      { id: ADULTE, birthDate: ADULT_BIRTH },
      { id: MINEUR, birthDate: MINOR_BIRTH },
      { id: CONNAISSANCE, birthDate: ADULT_BIRTH },
      { id: BLOQUEUR, birthDate: ADULT_BIRTH, blockedUserIds: [ADULTE] },
      { id: CO_MEMBRE, birthDate: MINOR_BIRTH },
    ],
    communityMembers: [
      { userId: ADULTE, communityId: COMMUNAUTE, isActive: true },
      { userId: CO_MEMBRE, communityId: COMMUNAUTE, isActive: true },
    ],
  });

const db = (world: ReturnType<typeof monde>) => world.prisma as unknown as PrismaClient;

const MODERATRICE = '6100000000000000000000b1';
const ADMINISTRATEUR = '6100000000000000000000b2';
const QUIDAM = '6100000000000000000000b3';
const SANS_ROLE = '6100000000000000000000b4';
const ANALYSTE = '6100000000000000000000b5';
const EQUIPE_MINEURE = '6100000000000000000000b6';
const ADMIN_SUPPRIME = '6100000000000000000000b7';
const MODO_INACTIF = '6100000000000000000000b8';
const MODO_DESACTIVE = '6100000000000000000000b9';

const equipe = () =>
  messagingWorld({
    links: [],
    users: [
      { id: MODERATRICE, birthDate: ADULT_BIRTH, role: 'MODERATOR' },
      { id: ADMINISTRATEUR, birthDate: ADULT_BIRTH, role: 'ADMIN' },
      { id: QUIDAM, birthDate: ADULT_BIRTH, role: 'USER' },
      { id: SANS_ROLE, birthDate: ADULT_BIRTH },
      { id: ANALYSTE, birthDate: ADULT_BIRTH, role: 'ANALYST' },
      { id: EQUIPE_MINEURE, birthDate: MINOR_BIRTH, role: 'ADMIN' },
      { id: ADMIN_SUPPRIME, birthDate: ADULT_BIRTH, role: 'ADMIN', deletedAt: new Date('2026-10-01T00:00:00Z') },
      { id: MODO_INACTIF, birthDate: ADULT_BIRTH, role: 'MODERATOR', isActive: false },
      { id: MODO_DESACTIVE, birthDate: ADULT_BIRTH, role: 'MODERATOR', deactivatedAt: new Date('2026-10-01T00:00:00Z') },
    ],
    communityMembers: [],
  });

describe('pairAccessAmong — l\'équipe (#16623)', () => {
  it('lit les DEUX rôles : deux comptes de l\'équipe ont les outils de cercle sans lien, dans les deux sens', async () => {
    const among = (subjectIs: 'viewer' | 'target') =>
      pairAccessAmong(db(equipe()), { feature: 'dm.typing', subjectId: MODERATRICE, otherIds: [ADMINISTRATEUR], subjectIs });
    expect((await among('viewer')).get(ADMINISTRATEUR)).toMatchObject({ allowed: true, effectiveLevel: 'BLOOD' });
    expect((await among('target')).get(ADMINISTRATEUR)).toMatchObject({ allowed: true, effectiveLevel: 'BLOOD' });
  });

  it('face à un utilisateur ordinaire, à un rôle absent ou à un analyste, rien ne s\'ouvre', async () => {
    const verdicts = await pairAccessAmong(db(equipe()), {
      feature: 'presence.dnd',
      subjectId: ADMINISTRATEUR,
      otherIds: [QUIDAM, SANS_ROLE, ANALYSTE],
      subjectIs: 'viewer',
    });
    expect([...verdicts.values()].map((v) => v.allowed)).toEqual([false, false, false]);
  });

  it('une audience de contenu s\'ouvre au niveau Sang sans lien (correction porteur 2026-11-08), la Connaissance automatique reste fermée', async () => {
    const audience = await pairAccessAmong(db(equipe()), {
      feature: 'audience.close',
      subjectId: MODERATRICE,
      otherIds: [ADMINISTRATEUR],
      subjectIs: 'viewer',
    });
    expect(audience.get(ADMINISTRATEUR)).toMatchObject({ allowed: true, effectiveLevel: 'BLOOD' });
    const auto = await pairAccessAmong(db(equipe()), {
      feature: 'acquaintance.auto',
      subjectId: MODERATRICE,
      otherIds: [ADMINISTRATEUR],
      subjectIs: 'viewer',
    });
    expect(auto.get(ADMINISTRATEUR)).toMatchObject({ allowed: true, effectiveLevel: 'PUBLIC' });
  });

  it('un compte de l\'équipe supprimé, inactif ou désactivé n\'a plus le privilège, dans aucun sens', async () => {
    const hors = [ADMIN_SUPPRIME, MODO_INACTIF, MODO_DESACTIVE];
    const vers = await pairAccessAmong(db(equipe()), { feature: 'dm.typing', subjectId: MODERATRICE, otherIds: hors, subjectIs: 'viewer' });
    const depuis = await pairAccessAmong(db(equipe()), { feature: 'dm.typing', subjectId: MODERATRICE, otherIds: hors, subjectIs: 'target' });
    expect([...vers.values(), ...depuis.values()].map((v) => v.allowed)).toEqual([false, false, false, false, false, false]);
  });

  it('le bouclier des mineurs n\'est pas franchi par le rôle', async () => {
    const verdict = await pairAccess(db(equipe()), { feature: 'call.ring', viewerId: ADMINISTRATEUR, targetId: EQUIPE_MINEURE });
    expect(verdict.allowed).toBe(false);
  });

  it('ni sur un outil hors bouclier : un adulte de l\'équipe n\'écrit pas en direct à un collègue mineur déclaré', async () => {
    const outils = ['dm.direct', 'dm.typing', 'presence.dnd', 'views.identity'] as const;
    const verdicts = await Promise.all(
      outils.map((feature) => pairAccess(db(equipe()), { feature, viewerId: ADMINISTRATEUR, targetId: EQUIPE_MINEURE })),
    );
    expect(verdicts.map((v) => v.allowed)).toEqual([false, false, false, false]);
  });
});

describe('pairAccessAmong — la loi jugée sur les lectures vraies', () => {
  it('la frappe d\'un membre n\'atteint que ceux qui sont au moins Connaissance, et jamais un bloqueur', async () => {
    const verdicts = await pairAccessAmong(db(monde()), {
      feature: 'dm.typing',
      subjectId: ADULTE,
      otherIds: [CONNAISSANCE, MINEUR, BLOQUEUR],
      subjectIs: 'target',
    });
    expect(verdicts.get(CONNAISSANCE)?.allowed).toBe(true);
    expect(verdicts.get(MINEUR)?.allowed).toBe(false);
    expect(verdicts.get(BLOQUEUR)).toMatchObject({ allowed: false, reason: 'blocked' });
  });

  it('lit l\'âge déclaré pour le bouclier : le Public ne peut pas adresser de demande à un mineur', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: MINEUR });
    expect(verdict).toMatchObject({ allowed: false, reason: 'level' });
  });

  it('une communauté ne lève pas le bouclier (audit B3) : un co-membre mineur reste contenu', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: CO_MEMBRE });
    expect(verdict).toMatchObject({ allowed: false, effectiveLevel: 'COMMUNITY', reason: 'level' });
  });

  it('écarte soi-même et les doublons de l\'éventail', async () => {
    const verdicts = await pairAccessAmong(db(monde()), {
      feature: 'dm.typing',
      subjectId: ADULTE,
      otherIds: [ADULTE, CONNAISSANCE, CONNAISSANCE],
      subjectIs: 'target',
    });
    expect([...verdicts.keys()]).toEqual([CONNAISSANCE]);
  });

  it('une demande à soi-même est refusée par la loi', async () => {
    const verdict = await pairAccess(db(monde()), { feature: 'dm.request', viewerId: ADULTE, targetId: ADULTE });
    expect(verdict).toMatchObject({ allowed: false, reason: 'self' });
  });
});
