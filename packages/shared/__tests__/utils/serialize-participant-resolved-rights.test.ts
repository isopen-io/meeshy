/**
 * #20292 — **la fabrique sert les droits d'émission RÉSOLUS, jamais l'instantané
 * du join.**
 *
 * `serializeConversationParticipant` servait `canSendMessages` / `canSendFiles` /
 * `canSendImages` **aplatis** depuis `Participant.permissions`, l'instantané figé
 * à l'entrée. `anonymousSession.rights` est le DELTA que l'hôte pose, et il passe
 * devant (`resolvedSendRight`). Les deux divergent dès le premier
 * `PATCH …/participants/:id/rights`, par décision écrite : la surcharge retirée
 * fait retomber le droit sur sa valeur d'origine, donc il n'y a aucune écriture à
 * aligner — la seule lecture juste est la lecture résolue.
 *
 * **Cette famille a échappé à cinq énumérations successives** parce que son
 * vocabulaire diffère : trois booléens aplatis, pas un objet `permissions`. Une
 * énumération de lecteurs d'une loi se fait sur ce que la loi DÉCIDE, pas sur le
 * nom du champ qui la porte.
 *
 * Les témoins vont dans les DEUX sens, et le second ne se déduit pas du premier :
 * un droit RETIRÉ laissé à `true` offre une tuile pour un geste refusé en 403 ;
 * un droit ACCORDÉ laissé à `false` cache une tuile pour un geste que le serveur
 * accepte. Tant qu'aucun client ne lisait la valeur résolue, le second cas
 * marchait par accident.
 */
import { describe, it, expect } from 'vitest';
import { serializeConversationParticipant } from '../../utils/participant-helpers.js';

const JOINED = new Date('2026-11-01T10:00:00.000Z');

const guestRow = (
  permissions: Record<string, boolean> | null,
  rights: Record<string, boolean | null> | null,
) => ({
  id: 'part-guest',
  userId: null,
  type: 'anonymous',
  displayName: 'Visiteur',
  avatar: null,
  role: 'member',
  language: 'fr',
  isActive: true,
  isOnline: false,
  lastActiveAt: null,
  joinedAt: JOINED,
  permissions,
  anonymousSession: rights === null ? null : { rights },
  user: null,
});

const sent = (row: Parameters<typeof serializeConversationParticipant>[0]) =>
  serializeConversationParticipant(row) as unknown as {
    canSendMessages: boolean;
    canSendFiles: boolean;
    canSendImages: boolean;
  };

describe('#20292 — les trois droits APLATIS de la ligne servie', () => {
  it('une surcharge qui FERME un droit que l’instantané ouvrait est servie fermée', () => {
    const served = sent(
      guestRow({ canSendMessages: true, canSendFiles: true, canSendImages: true }, { canSendMessages: false }),
    );
    expect(served.canSendMessages).toBe(false);
    // Les droits que la surcharge ne NOMME pas suivent l'instantané : « non dit »
    // n'est pas « faux ». C'est ce qui permet d'en fermer un sans geler les autres.
    expect(served.canSendFiles).toBe(true);
    expect(served.canSendImages).toBe(true);
  });

  it('une surcharge qui OUVRE un droit que l’instantané fermait est servie ouverte', () => {
    const served = sent(
      guestRow({ canSendMessages: false, canSendFiles: false, canSendImages: false }, { canSendFiles: true }),
    );
    expect(served.canSendFiles).toBe(true);
    expect(served.canSendMessages).toBe(false);
  });

  it('`null` dans la surcharge est une ABSTENTION, pas un refus — Mongo relit `null`, jamais `undefined`', () => {
    const served = sent(
      guestRow({ canSendMessages: true, canSendFiles: true, canSendImages: true }, { canSendMessages: null }),
    );
    expect(served.canSendMessages).toBe(true);
  });

  it('sans surcharge, l’instantané est servi tel quel', () => {
    const served = sent(guestRow({ canSendMessages: false, canSendFiles: true, canSendImages: false }, null));
    expect(served).toMatchObject({ canSendMessages: false, canSendFiles: true, canSendImages: false });
  });

  it('sans table de droits du tout, un membre ORDINAIRE garde ses trois droits', () => {
    const served = sent(guestRow(null, null));
    expect(served).toMatchObject({ canSendMessages: true, canSendFiles: true, canSendImages: true });
  });

  it('la source de la surcharge ne VOYAGE pas dans la ligne servie', () => {
    const served = serializeConversationParticipant(
      guestRow({ canSendMessages: true, canSendFiles: true, canSendImages: true }, { canViewHistory: true }),
    );
    // `canViewHistory` est un fait de MODÉRATION (#4056) : il n'a aucune raison
    // d'apparaître parce qu'on a projeté la surcharge pour appliquer la loi.
    expect(JSON.stringify(served)).not.toContain('canViewHistory');
    expect(JSON.stringify(served)).not.toContain('anonymousSession');
  });
});
