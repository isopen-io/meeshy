import {
  lastMessagePreviewProtection,
  lastMessageTextMayTravel,
} from '../../utils/last-message-protection.js';

const MAINTENANT = new Date('2026-09-11T12:00:00Z');
const PASSE = new Date('2026-09-11T11:00:00Z');
const FUTUR = new Date('2026-09-11T13:00:00Z');

/**
 * LA LOI EST LE MIROIR DE SWIFT — `LastMessageSummaryKind.lastMessageSummaryKind(now:)`.
 * Chaque cas ci-dessous a son jumeau là-bas ; c'est ce qui permet aux trois
 * clients de peindre le MÊME placeholder pour le même message.
 */
describe('lastMessagePreviewProtection — miroir de LastMessageSummaryKind', () => {
  it('un message ordinaire est standard', () => {
    expect(lastMessagePreviewProtection({}, MAINTENANT)).toBe('standard');
    expect(lastMessagePreviewProtection(null, MAINTENANT)).toBe('standard');
    expect(lastMessagePreviewProtection(undefined, MAINTENANT)).toBe('standard');
  });

  it('un message flouté est caché', () => {
    expect(lastMessagePreviewProtection({ isBlurred: true }, MAINTENANT)).toBe('hidden');
  });

  it('un message à vue unique est caché', () => {
    expect(lastMessagePreviewProtection({ isViewOnce: true }, MAINTENANT)).toBe('view-once');
  });

  it('un éphémère PÉRIMÉ est expiré', () => {
    expect(lastMessagePreviewProtection({ expiresAt: PASSE }, MAINTENANT)).toBe('expired');
    expect(lastMessagePreviewProtection({ expiresAt: PASSE.toISOString() }, MAINTENANT)).toBe('expired');
  });

  it('un éphémère ENCORE VALIDE reste lisible — le seul état protégé qui se lit', () => {
    expect(lastMessagePreviewProtection({ expiresAt: FUTUR }, MAINTENANT)).toBe('ephemeral-active');
  });

  /**
   * L'ORDRE DES TESTS EST LA RÈGLE. Les deux cachent le contenu, mais ils ne
   * disent pas la même chose à l'utilisateur — et c'est Swift qui fait foi sur
   * le mot employé : la péremption passe AVANT le flou.
   */
  it('périmé ET flouté se dit « expiré », comme sur iOS', () => {
    expect(lastMessagePreviewProtection({ isBlurred: true, expiresAt: PASSE }, MAINTENANT)).toBe('expired');
  });

  it('une date illisible ne protège rien et ne casse rien', () => {
    expect(lastMessagePreviewProtection({ expiresAt: 'pas une date' }, MAINTENANT)).toBe('standard');
  });
});

/**
 * LE PRÉDICAT QUI GOUVERNE LE TEXTE — c'est lui que la passerelle appelle, et
 * c'est ce qu'un client ne peut PAS contourner. La garde du serveur ne
 * remplace pas celle du client : elle la rend inutile.
 */
describe('lastMessageTextMayTravel — ce que la charge transporte', () => {
  it('le texte d’un message protégé ne voyage pas', () => {
    for (const protege of [{ isBlurred: true }, { isViewOnce: true }, { expiresAt: PASSE }]) {
      expect(lastMessageTextMayTravel(protege, MAINTENANT)).toBe(false);
    }
  });

  it('le texte d’un message ordinaire ou d’un éphémère encore valide voyage', () => {
    expect(lastMessageTextMayTravel({}, MAINTENANT)).toBe(true);
    expect(lastMessageTextMayTravel({ expiresAt: FUTUR }, MAINTENANT)).toBe(true);
  });

  /**
   * LE CAS QUI A PRODUIT LE DÉFAUT : `isViewOnce` arrive en `null` (Prisma
   * `Boolean?`), pas en `false`. Un prédicat écrit `!message.isViewOnce`
   * aurait été juste ; un prédicat écrit `message.isViewOnce === undefined`
   * ne l'aurait pas été.
   */
  it('null n’est pas true — un drapeau absent ne protège pas, et ne casse rien', () => {
    expect(lastMessageTextMayTravel({ isViewOnce: null, isBlurred: null, expiresAt: null }, MAINTENANT)).toBe(true);
  });
});
