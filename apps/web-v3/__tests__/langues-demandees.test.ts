import { langueDemandee, languesDemandees } from '@/lib/a11y/langues-demandees';

/**
 * Le rang 4 du Prisme, lu là où il est écrit : l'en-tête `Accept-Language`.
 *
 * Ce module ne résout AUCUNE préférence applicative — il n'y a pas d'utilisateur
 * ici, seulement un navigateur qui déclare ce qu'il lit. C'est exactement le
 * quatrième rang que `resolveUserLanguage()` consomme, et rien de plus : le jour
 * où la v3 aura un compte, c'est ce module qui alimentera ce rang, jamais lui qui
 * décidera à sa place.
 */
describe('les langues que le navigateur demande', () => {
  it('rend la première langue demandée, sa base et son libellé', () => {
    const [premiere] = languesDemandees('fr-FR,fr;q=0.9,en;q=0.8');

    expect(premiere?.etiquette).toBe('fr-FR');
    expect(premiere?.code).toBe('fr');
    expect(premiere?.libelle).toContain('rançais');
    expect(premiere?.drapeau).toBe('🇫🇷');
  });

  it('ordonne par qualité décroissante, jamais par ordre d’écriture', () => {
    expect(languesDemandees('en;q=0.3,de;q=0.9,fr;q=0.5').map((l) => l.code)).toEqual([
      'de',
      'fr',
      'en',
    ]);
  });

  it('traite une entrée sans q comme q=1', () => {
    expect(languesDemandees('en;q=0.9,de').map((l) => l.code)).toEqual(['de', 'en']);
  });

  it('ne rend qu’une entrée par langue de base — deux régions ne sont pas deux langues', () => {
    expect(languesDemandees('fr-CA,fr-FR;q=0.9,fr;q=0.8').map((l) => l.code)).toEqual(['fr']);
  });

  it('ignore le joker et les étiquettes que la grammaire BCP-47 refuse', () => {
    expect(languesDemandees('*,<script>;q=0.9,en').map((l) => l.code)).toEqual(['en']);
  });

  it('retombe sur la langue du document quand rien n’est demandé', () => {
    expect(languesDemandees(null).map((l) => l.code)).toEqual(['fr']);
    expect(languesDemandees('').map((l) => l.code)).toEqual(['fr']);
    expect(langueDemandee(null).code).toBe('fr');
  });

  it('ne fabrique aucun drapeau à partir d’une LANGUE — seule une région en porte un', () => {
    expect(langueDemandee('es').drapeau).toBeNull();
    expect(langueDemandee('es-MX').drapeau).toBe('🇲🇽');
  });

  it('rend toujours au moins une langue, donc `langueDemandee` ne peut pas manquer', () => {
    expect(langueDemandee('de-AT,de;q=0.9').etiquette).toBe('de-AT');
  });
});
