/**
 * Une permission ne garde pas une ROUTE, elle garde un CHAMP (#4154).
 *
 * Ces témoins sont écrits PAR CHAMP, et c'est la seule forme qui rougit quand
 * un champ change de famille. Un témoin par route ne peut pas le voir : il
 * exerce la loi de l'adresse, qui ne bouge pas quand le champ, lui, déménage.
 *
 * Ce qu'ils tiennent :
 *   1. la loi DÉCLARÉE de chacun des vingt-cinq champs administrables ;
 *   2. le fail-closed sur l'inconnu — un champ sans loi est refusé, jamais
 *      écrit sous une loi par défaut ;
 *   3. la COMPLÉTUDE : tout champ que le schéma de profil partagé accepte
 *      porte une loi. C'est ce témoin-là qui attrape le champ ajouté demain.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { UserRoleEnum } from '@meeshy/shared/types';
import { updateUserProfileValidationSchema } from '@meeshy/shared/types/validation/admin-user';
import {
  LOI_PAR_CHAMP,
  loiDuChamp,
  champsDeLaFamille,
  evaluerLoiDesChamps,
} from '../../../../routes/admin/user-field-law';

const MOTIF = 'demande RGPD ecrite du 2026-08-29';

/**
 * La table est écrite À LA MAIN, jamais dérivée de `LOI_PAR_CHAMP` : une
 * attente calculée depuis ce qu'elle vérifie ne vérifie rien. Un champ qui
 * déménage fait tomber SA ligne, et elle seule.
 */
const TABLE: ReadonlyArray<[string, string, string, boolean, boolean]> = [
  // champ, famille, permission, souverain, motif obligatoire
  ['username', 'profil', 'canUpdateUsers', false, false],
  ['firstName', 'profil', 'canUpdateUsers', false, false],
  ['lastName', 'profil', 'canUpdateUsers', false, false],
  ['displayName', 'profil', 'canUpdateUsers', false, false],
  ['bio', 'profil', 'canUpdateUsers', false, false],
  ['avatar', 'profil', 'canUpdateUsers', false, false],
  ['banner', 'profil', 'canUpdateUsers', false, false],
  ['email', 'profil', 'canUpdateUsers', false, false],
  ['phoneNumber', 'profil', 'canUpdateUsers', false, false],
  ['phoneCountryCode', 'profil', 'canUpdateUsers', false, false],
  ['timezone', 'profil', 'canUpdateUsers', false, false],
  ['systemLanguage', 'profil', 'canUpdateUsers', false, false],
  ['regionalLanguage', 'profil', 'canUpdateUsers', false, false],
  ['customDestinationLanguage', 'profil', 'canUpdateUsers', false, false],
  ['birthDate', 'profil', 'canUpdateUsers', false, false],
  ['role', 'role', 'canUpdateUserRoles', false, false],
  ['isActive', 'statut', 'canUpdateUsers', false, false],
  ['unlock', 'securite', 'canUpdateUsers', false, false],
  ['twoFactorEnabled', 'securite', 'canUpdateUsers', false, false],
  ['emailVerified', 'verification', 'canUpdateUsers', false, false],
  ['phoneVerified', 'verification', 'canUpdateUsers', false, false],
  ['ageVerified', 'verification', 'canUpdateUsers', false, false],
  ['voiceProfile', 'consentement', 'canUpdateUsers', true, true],
  ['voiceData', 'consentement', 'canUpdateUsers', true, true],
  ['dataProcessing', 'consentement', 'canUpdateUsers', true, true],
  ['voiceCloning', 'consentement', 'canUpdateUsers', true, true],
];

describe('LOI_PAR_CHAMP — la loi de chaque champ, champ par champ', () => {
  it.each(TABLE)(
    '%s appartient à %s et se garde sur %s',
    (champ, famille, permission, souverain, motifObligatoire) => {
      const loi = loiDuChamp(champ);
      expect(loi).not.toBeNull();
      expect(loi!.famille).toBe(famille);
      expect(loi!.permission).toBe(permission);
      expect(loi!.souverain).toBe(souverain);
      expect(loi!.motifObligatoire).toBe(motifObligatoire);
    }
  );

  it('n’en déclare pas d’autres — la table dit TOUT ce qui est administrable', () => {
    expect(Object.keys(LOI_PAR_CHAMP).sort()).toEqual(TABLE.map(([c]) => c).sort());
  });

  it('le rôle ne se garde pas sur la permission du profil', () => {
    // `canUpdateUserRoles` était DÉCLARÉE dans la matrice et lue par aucune
    // route : la finesse annoncée n'existait pas. Les deux valent `true` pour
    // ADMIN aujourd'hui — ce témoin ne prouve donc pas un refus, il prouve
    // QUELLE permission le champ nomme.
    expect(loiDuChamp('role')!.permission).toBe('canUpdateUserRoles');
    expect(loiDuChamp('displayName')!.permission).toBe('canUpdateUsers');
  });
});

describe('evaluerLoiDesChamps — fail-closed sur ce qu’aucune loi ne nomme', () => {
  it('refuse un champ inconnu, même à un souverain', () => {
    const refus = evaluerLoiDesChamps({
      role: UserRoleEnum.BIGBOSS,
      champs: ['password'],
      motif: MOTIF,
    });
    expect(refus).not.toBeNull();
    expect(refus!.cause).toBe('inconnu');
    expect(refus!.champ).toBe('password');
  });

  it('refuse le lot ENTIER dès qu’un seul champ n’a pas de loi', () => {
    // Un lot à moitié appliqué est plus difficile à défaire qu'un lot refusé.
    const refus = evaluerLoiDesChamps({
      role: UserRoleEnum.BIGBOSS,
      champs: ['displayName', 'password'],
      motif: MOTIF,
    });
    expect(refus?.champ).toBe('password');
  });

  it('admet un champ de profil pour un ADMIN', () => {
    expect(
      evaluerLoiDesChamps({ role: UserRoleEnum.ADMIN, champs: ['displayName'] })
    ).toBeNull();
  });

  it('refuse à un USER — la permission est lue dans la matrice, pas supposée', () => {
    const refus = evaluerLoiDesChamps({ role: UserRoleEnum.USER, champs: ['displayName'] });
    expect(refus?.cause).toBe('permission');
  });
});

describe('les consentements — rang souverain ET motif écrit', () => {
  it.each(champsDeLaFamille('consentement'))('refuse %s à un ADMIN', (champ) => {
    // ADMIN porte `canUpdateUsers` : si la garde passait par la matrice, elle
    // l'admettrait. C'est le RANG qui la retient, et rien ne le délègue.
    const refus = evaluerLoiDesChamps({ role: UserRoleEnum.ADMIN, champs: [champ], motif: MOTIF });
    expect(refus?.cause).toBe('souverain');
  });

  it.each(champsDeLaFamille('consentement'))('refuse %s à un souverain SANS motif', (champ) => {
    const refus = evaluerLoiDesChamps({ role: UserRoleEnum.BIGBOSS, champs: [champ] });
    expect(refus?.cause).toBe('motif');
  });

  it.each(champsDeLaFamille('consentement'))('refuse %s pour un motif VIDE', (champ) => {
    // Un motif fait d'espaces n'est pas un motif écrit : sans ce témoin, le
    // client contourne l'exigence sans jamais rien écrire.
    const refus = evaluerLoiDesChamps({ role: UserRoleEnum.BIGBOSS, champs: [champ], motif: '   ' });
    expect(refus?.cause).toBe('motif');
  });

  it.each(champsDeLaFamille('consentement'))('admet %s à un souverain motivé', (champ) => {
    expect(
      evaluerLoiDesChamps({ role: UserRoleEnum.BIGBOSS, champs: [champ], motif: MOTIF })
    ).toBeNull();
  });
});

describe('complétude — aucun champ écrivable ne voyage sans loi', () => {
  it('tout champ du schéma de profil partagé porte une loi de famille « profil »', () => {
    // C'est CE témoin qui attrape le champ ajouté demain : le schéma partagé
    // est le seul endroit où l'on déclare ce qu'un administrateur peut écrire
    // sur un profil, et `UserManagementService.updateUser` en fait un ÉPANDAGE
    // (`data: { ...body }`). Un champ qui entre là sans entrer ici partirait en
    // base sous une loi que personne n'a pensée pour lui.
    const sansLoi = Object.keys(updateUserProfileValidationSchema.shape)
      .filter((champ) => loiDuChamp(champ)?.famille !== 'profil');
    expect(sansLoi).toEqual([]);
  });

  it('la famille « profil » ne déclare rien que le schéma n’accepte', () => {
    const duSchema = new Set(Object.keys(updateUserProfileValidationSchema.shape));
    expect(champsDeLaFamille('profil').filter((champ) => !duSchema.has(champ))).toEqual([]);
  });
});
