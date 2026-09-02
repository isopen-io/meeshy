import { PIED, REPERE_DU_COMPTE, REPERE_DU_PIED } from '@/app/enveloppe/contenu';
import { ATOUTS, HEROS, MISSION } from '@/app/vitrine/contenu';
import { GLYPHE_DE_LA_MARQUE } from '@/app/enveloppe/contenu';
import { GLYPHE_DU_BADGE, glypheDeLAtout } from '@/app/vitrine/glyphes';
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

  // MARK: — la forme de la charte (§ 12.5)

  /**
   * Règle 4 — l'action principale est la CIBLE de 56 px, la secondaire celle de
   * 52 px. Le témoin porte sur la CLASSE parce que c'est elle qui porte la
   * hauteur : la mesure en pixels, elle, se prend au navigateur
   * (`e2e/visual/v3-cibles.spec.ts`).
   */
  it('sert ses appels à l’action dans le vocabulaire de la charte', () => {
    expect(doc).toContain('<a class="action primaire" href="/signup">');
    expect(doc).toContain('<a class="action contour" href="/login">');
    expect(doc).not.toContain('class="cta');
  });

  /**
   * Règle 23 — le glyphe est une PONCTUATION, pris au sprite commité et inliné :
   * la vitrine est gatée à UNE requête avant le premier pixel (§ 12.6), donc
   * elle ne peut pas attendre le sprite externe.
   */
  it('inline ses glyphes depuis le sprite, sans une requête de plus', () => {
    expect(doc).toContain(`<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">`);
    expect(doc).not.toContain('<use ');
    expect(doc).not.toContain('sprite.svg');
    expect(GLYPHE_DE_LA_MARQUE).toBe('ph-chat-circle');
    expect(GLYPHE_DU_BADGE).toBe('ph-translate');
  });

  /**
   * NEUF cartes, NEUF tuiles : une grille qui perdrait une tuile rendrait une
   * carte muette sans qu'aucune assertion de présence ne tombe.
   */
  it('donne sa tuile à chacun des neuf atouts', () => {
    expect(new Set(ATOUTS.map((atout) => glypheDeLAtout(atout.titre))).size).toBe(ATOUTS.length);
    const grille = doc.slice(doc.indexOf('<ul>'), doc.indexOf('</ul>'));

    expect((grille.match(/<span class="tuile" aria-hidden="true">/g) ?? []).length).toBe(
      ATOUTS.length,
    );
  });

  /**
   * Règle 7 — un contrôle existe s'il a un effet. Ni ancre morte, ni bouton sans
   * gestionnaire : cette page ne porte aucun JavaScript qui pourrait en armer un.
   */
  it('ne porte aucun contrôle inerte', () => {
    expect(doc).not.toContain('href="#"');
    expect(doc).not.toContain('onclick');
    expect(doc).not.toContain('type="button"');
  });

  /**
   * Règle 7 — du HTML réel : les deux navigations sont NOMMÉES, sans quoi elles
   * se confondent pour un lecteur d'écran.
   *
   * LE COMPTE NE SUFFIT PAS, ET C'EST LA LEÇON. Ce témoin ne vérifiait que la
   * PRÉSENCE de deux `aria-label` : la navigation du héros portait le texte du
   * BADGE — « navigation, Traduction en temps réel » annoncé pour l'accès au
   * compte — et il restait vert, `axe` avec lui (l'étiquette n'était pas vide,
   * elle était fausse). Un repère se garde sur la VALEUR de son nom.
   */
  it('nomme chacune de ses deux navigations par sa FONCTION', () => {
    expect((doc.match(/<nav /g) ?? []).length).toBe(2);
    expect((doc.match(/<nav [^>]*aria-label="/g) ?? []).length).toBe(2);

    expect(doc).toContain(`<nav class="actions" aria-label="${REPERE_DU_COMPTE}">`);
    expect(doc).toContain(`aria-label="${REPERE_DU_PIED}"`);
    expect(doc).not.toContain(`aria-label="${HEROS.badge}"`);
    expect(doc).not.toContain('aria-label="Meeshy"');
  });
});
