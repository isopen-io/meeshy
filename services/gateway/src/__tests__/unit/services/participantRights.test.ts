/**
 * La résolution des droits d'un participant, énoncée une seule fois.
 *
 * `anonymousSession.rights` est un DELTA, pas une copie : un droit qu'il ne
 * nomme pas suit la valeur figée au join. Ces témoins tiennent la distinction —
 * c'est elle qui permet à un hôte d'ouvrir un seul droit sans geler les six
 * autres à leur valeur du moment.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';

import { resolveParticipantRights } from '../../../services/participantRights';

const permissions = {
  canSendMessages: true,
  canSendFiles: false,
  canSendImages: true,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
};

describe('resolveParticipantRights', () => {
  it('rend les permissions du join quand aucune surcharge n existe', () => {
    expect(resolveParticipantRights({ permissions })).toEqual(permissions);
  });

  it('rend les permissions du join quand la surcharge est nulle', () => {
    expect(resolveParticipantRights({ permissions, anonymousSession: { rights: null } }))
      .toEqual(permissions);
  });

  it('laisse la surcharge OUVRIR un droit fermé au join', () => {
    const resolved = resolveParticipantRights({
      permissions,
      anonymousSession: { rights: { canSendFiles: true } },
    });

    expect(resolved.canSendFiles).toBe(true);
  });

  it('laisse la surcharge FERMER un droit ouvert au join', () => {
    const resolved = resolveParticipantRights({
      permissions,
      anonymousSession: { rights: { canSendMessages: false } },
    });

    expect(resolved.canSendMessages).toBe(false);
  });

  it('ne touche pas aux droits que la surcharge ne nomme pas', () => {
    const resolved = resolveParticipantRights({
      permissions,
      anonymousSession: { rights: { canSendFiles: true } },
    });

    expect(resolved).toEqual({ ...permissions, canSendFiles: true });
  });

  it('traite un droit relu à null comme non nommé (forme rendue par Mongo)', () => {
    const resolved = resolveParticipantRights({
      permissions,
      anonymousSession: { rights: { canSendMessages: null, canSendFiles: true } },
    });

    expect(resolved).toEqual({ ...permissions, canSendFiles: true });
  });

  it('traite un droit explicitement undefined comme non nommé', () => {
    const resolved = resolveParticipantRights({
      permissions,
      anonymousSession: { rights: { canSendImages: undefined } },
    });

    expect(resolved.canSendImages).toBe(true);
  });
});
