import { PIED } from '@/app/enveloppe/contenu';
import { ATOUTS, HEROS, MISSION } from '@/app/vitrine/contenu';
import { documentDeLaVitrine } from '@/app/vitrine/vue';

/**
 * **La vitrine sert la landing du LEGACY, redessinée — pas une page inventée.**
 *
 * Directive du porteur (2026-09-01) : réutiliser la page d'accueil existante et
 * n'en changer que le dessin. Ces témoins gardent les deux moitiés — le CONTENU
 * vient bien du legacy, et la FORME ne fait rien payer.
 */
describe('la vitrine', () => {
  const doc = documentDeLaVitrine();

  // MARK: — le contenu est celui du legacy

  it('sert l’accroche et le titre du legacy, mot pour mot', () => {
    expect(doc).toContain(HEROS.titreAccentue);
    expect(doc).toContain('Meeshy traduit vos conversations en temps r');
    expect(doc).toContain(MISSION.devise);
    expect(doc).toContain(PIED.devise);
  });

  /**
   * NEUF, et le compte est le témoin : une grille qui en perdrait un
   * n'échouerait sur aucune assertion de présence, et le legacy en annonce neuf.
   */
  it('porte les NEUF atouts du legacy, aucun perdu en chemin', () => {
    expect(ATOUTS).toHaveLength(9);
    for (const { titre, corps } of ATOUTS) {
      expect(doc).toContain(titre);
      expect(doc).toContain(corps.slice(0, 30));
    }
  });

  // MARK: — la forme ne fait rien payer

  it('n’embarque QUE le script de thème — aucun JavaScript applicatif', () => {
    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc).toContain('meeshy-theme');
  });

  it('inline la table de jetons plutôt qu’une feuille distante', () => {
    expect(doc).toContain('--color-primary');
    expect(doc).not.toContain('<link rel="stylesheet"');
  });

  it('déclare la langue du document sur <html>', () => {
    expect(doc).toMatch(/<html lang="[a-z]{2}"/);
  });

  /**
   * L'inverse exact de l'écran d'un lien mort, qui porte `noindex`. Le témoin
   * existe parce que les deux documents se composent dans le même style : un
   * copier-coller aurait emporté ce `noindex` sans que rien ne rougisse.
   */
  it('est indexable, contrairement à l’écran d’un lien clos', () => {
    expect(doc).toContain('content="index, follow"');
    expect(doc).not.toContain('noindex');
  });

  /**
   * Entre les étapes 2 et 6 du § 4.9, `/login` et `/signup` sont encore au
   * legacy : franchir la frontière de zone exige une ancre RÉELLE.
   */
  it('sort de la zone par des ancres réelles, jamais par un routeur', () => {
    expect(doc).toContain('href="/signup"');
    expect(doc).toContain('href="/login"');
  });

  /**
   * Le § 3.2 corollaire 2 interdit la seconde table de jetons. Une couleur
   * ÉCRITE dans la feuille en serait une — et elle serait fausse dans l'un des
   * deux schémas, sans qu'aucun gate de thème ne puisse l'attraper.
   */
  it('n’écrit aucune couleur : tout vient des jetons', () => {
    const feuille = doc.slice(doc.indexOf('.enveloppe'), doc.indexOf('</style>'));
    expect(feuille).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(feuille).not.toMatch(/\b(rgb|hsl)a?\(/);
  });

  /** La navigation du legacy est délibérément absente : trois de ses quatre
   *  liens franchiraient la zone vers des pages que la v3 ne sert pas. */
  it('n’annonce pas une navigation que la v3 ne sert pas', () => {
    expect(doc).not.toContain('href="/features"');
    expect(doc).not.toContain('>Accueil<');
  });
});
