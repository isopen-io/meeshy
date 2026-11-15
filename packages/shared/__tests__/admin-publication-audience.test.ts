import { describe, it, expect } from 'vitest';
import {
  ADMIN_SETTABLE_VISIBILITIES,
  adminAudiencesOffered,
  authorAudienceOf,
  heldAuthorAudience,
  widensAuthorAudience,
} from '../types/admin-publication-states';

/**
 * L'AUDIENCE DE L'AUTEUR, une seule loi pour la passerelle et l'espace web (#10471).
 *
 * La recette de #10435 a resserré une publication publique vers ses amis, puis voulu
 * revenir en arrière : 403 AUDIENCE_WIDENING. Le resserrement avait oublié l'audience de
 * l'auteur, et le retour à SON audience passait pour un élargissement.
 */
const facts = (visibility: string, moderationPriorVisibility: string | null = null) => ({ visibility, moderationPriorVisibility });

describe("authorAudienceOf — l'audience que l'auteur a choisie", () => {
  it("est l'audience retenue par la modération quand il y en a une", () => {
    expect(authorAudienceOf(facts('FRIENDS', 'PUBLIC'))).toBe('PUBLIC');
    expect(authorAudienceOf(facts('PRIVATE', 'EXCEPT'))).toBe('EXCEPT');
  });

  it("est l'audience servie quand la modération n'en a retenu aucune", () => {
    expect(authorAudienceOf(facts('COMMUNITY'))).toBe('COMMUNITY');
  });
});

describe("heldAuthorAudience — ce qu'un geste d'administration retient", () => {
  it("retient l'audience de l'auteur dès que l'audience servie en diffère, vers PRIVATE comme vers une autre", () => {
    expect(heldAuthorAudience(facts('PUBLIC'), 'FRIENDS')).toBe('PUBLIC');
    expect(heldAuthorAudience(facts('PUBLIC'), 'PRIVATE')).toBe('PUBLIC');
    expect(heldAuthorAudience(facts('ONLY'), 'PRIVATE')).toBe('ONLY');
  });

  it("garde l'audience de l'auteur à travers deux resserrements, jamais celle du premier", () => {
    expect(heldAuthorAudience(facts('FRIENDS', 'PUBLIC'), 'PRIVATE')).toBe('PUBLIC');
    expect(heldAuthorAudience(facts('FRIENDS', 'PUBLIC'), 'COMMUNITY')).toBe('PUBLIC');
  });

  it("ne retient rien quand l'audience servie redevient celle de l'auteur", () => {
    expect(heldAuthorAudience(facts('FRIENDS', 'PUBLIC'), 'PUBLIC')).toBeNull();
    expect(heldAuthorAudience(facts('PRIVATE'), 'PRIVATE')).toBeNull();
  });
});

describe("widensAuthorAudience — on n'ouvre jamais au-delà de l'audience de l'auteur", () => {
  it('Publique → Amis → Publique : le retour à l’audience de l’auteur n’élargit pas', () => {
    const narrowed = facts('FRIENDS', heldAuthorAudience(facts('PUBLIC'), 'FRIENDS'));
    expect(widensAuthorAudience(narrowed, 'PUBLIC')).toBe(false);
  });

  it.each([
    ['PRIVATE', null, 'PUBLIC'],
    ['FRIENDS', null, 'PUBLIC'],
    ['FRIENDS', null, 'COMMUNITY'],
    ['ONLY', null, 'FRIENDS'],
    ['PRIVATE', 'FRIENDS', 'PUBLIC'],
  ] as const)('%s (auteur : %s) vers %s : élargit', (visibility, prior, target) => {
    expect(widensAuthorAudience(facts(visibility, prior), target)).toBe(true);
  });

  it.each([
    ['PUBLIC', null, 'FRIENDS'],
    ['PUBLIC', null, 'PRIVATE'],
    ['FRIENDS', null, 'FRIENDS'],
    ['ONLY', null, 'PRIVATE'],
    ['PRIVATE', 'FRIENDS', 'FRIENDS'],
    ['COMMUNITY', 'PUBLIC', 'FRIENDS'],
  ] as const)('%s (auteur : %s) vers %s : n’élargit pas', (visibility, prior, target) => {
    expect(widensAuthorAudience(facts(visibility, prior), target)).toBe(false);
  });
});

describe("adminAudiencesOffered — l'écran ne propose que ce que la passerelle accepte", () => {
  it("une publication de l'auteur en Public : les quatre audiences", () => {
    expect(adminAudiencesOffered(facts('PUBLIC'))).toEqual([...ADMIN_SETTABLE_VISIBILITIES]);
  });

  it('resserrée vers ses amis par la modération : Public reste offert pour revenir en arrière', () => {
    expect(adminAudiencesOffered(facts('FRIENDS', 'PUBLIC'))).toEqual([...ADMIN_SETTABLE_VISIBILITIES]);
  });

  it('réservée par l’auteur à ses amis, mise hors ligne : Amis et Privée seulement', () => {
    expect(adminAudiencesOffered(facts('PRIVATE', 'FRIENDS'))).toEqual(['FRIENDS', 'PRIVATE']);
  });

  it('une liste choisie par l’auteur (ONLY, EXCEPT) ou un brouillon : Privée seulement', () => {
    expect(adminAudiencesOffered(facts('ONLY'))).toEqual(['PRIVATE']);
    expect(adminAudiencesOffered(facts('PRIVATE'))).toEqual(['PRIVATE']);
  });
});
