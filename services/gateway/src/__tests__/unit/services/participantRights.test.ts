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

import { disclosableEntryRights, resolveParticipantRights } from '../../../services/participantRights';

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

/**
 * **#4056 — la loi de divulgation, éprouvée sur ce qu'elle CACHE.**
 *
 * Elle vaut pour les deux chemins : la fiche REST et l'événement diffusé à la
 * room. Deux omissions écrites à la main auraient divergé au premier droit
 * ajouté — et la divergence se serait faite du côté BAVARD, celui qui ne rougit
 * jamais. C'est pourquoi la règle est ici, et non dupliquée aux deux sites.
 */
describe('disclosableEntryRights — ce qu\'une fiche a le droit de dire', () => {
  const complet = {
    canSendMessages: true,
    canSendFiles: false,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: false,
    canSendLinks: true,
    canViewHistory: true,
  };

  it('retire canViewHistory à qui n\'héberge pas la conversation', () => {
    const servi = disclosableEntryRights(complet, false);

    expect(servi).not.toHaveProperty('canViewHistory');
  });

  /**
   * La clé ABSENTE, jamais `false`. Un `false` affirmerait « ce visiteur ne voit
   * pas l'historique » — une affirmation SUR la modération, donc exactement le
   * fait qu'on refuse de divulguer. C'est la différence entre « je ne te le dis
   * pas » et « la réponse est non », et seule la première protège.
   */
  it('ne le remplace pas par false — l\'absence est le point', () => {
    const servi = disclosableEntryRights(complet, false) as Record<string, unknown>;

    expect(servi.canViewHistory).toBeUndefined();
    expect(Object.keys(servi)).not.toContain('canViewHistory');
  });

  it('sert les SEPT autres droits intacts — c\'est UN droit qui sort, pas l\'objet', () => {
    const servi = disclosableEntryRights(complet, false);

    expect(servi).toEqual({
      canSendMessages: true,
      canSendFiles: false,
      canSendImages: true,
      canSendVideos: true,
      canSendAudios: true,
      canSendLocations: false,
      canSendLinks: true,
    });
  });

  it('le sert à un hôte, qui est le seul à pouvoir le poser', () => {
    expect(disclosableEntryRights(complet, true).canViewHistory).toBe(true);
  });

  /**
   * Le repli SÛR se lit dans la SIGNATURE : le second paramètre n'a pas de
   * défaut. Un appelant qui oublierait de dire qui regarde ne compile pas —
   * plutôt que de servir silencieusement le fait, ce qui est le sens de panne
   * qu'une garde de confidentialité ne peut pas se permettre.
   */
  it('ne rend pas l\'objet d\'origine — le patcher ne doit pas patcher la source', () => {
    const servi = disclosableEntryRights(complet, true);

    expect(servi).not.toBe(complet);
    expect(complet.canViewHistory).toBe(true);
  });
});
