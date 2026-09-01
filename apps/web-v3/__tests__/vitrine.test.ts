import { documentDeLaVitrine } from '@/app/vitrine/vue';

/**
 * **La vitrine ANNONCE le Prisme, et ne paie rien pour le dire.**
 *
 * Décision du porteur (#4476) : annoncer, pas démontrer. Démontrer supposerait
 * un contenu réel, donc un appel réseau — et une page publique qui attend le
 * réseau pour peindre contredirait ce qu'elle vante. Ces témoins gardent les
 * deux moitiés : ce qu'elle DIT, et ce qu'elle ne fait PAS payer.
 */
describe('la vitrine', () => {
  const doc = documentDeLaVitrine();

  it('n’embarque QUE le script de thème — aucun JavaScript applicatif', () => {
    expect(doc.split('<script').length - 1).toBe(1);
    expect(doc).toContain('meeshy-theme');
  });

  it('déclare la langue du document sur <html>', () => {
    expect(doc).toMatch(/<html lang="[a-z]{2}"/);
  });

  /**
   * L'inverse exact de l'écran d'un lien mort, qui porte `noindex` : celui-ci
   * est la page qu'on VEUT voir indexée. Le témoin existe parce que les deux
   * documents se composent dans le même style et qu'un copier-coller de
   * l'autre aurait emporté son `noindex` sans que rien ne rougisse.
   */
  it('est indexable, contrairement à l’écran d’un lien clos', () => {
    expect(doc).toContain('content="index, follow"');
    expect(doc).not.toContain('noindex');
  });

  it('porte les quatre principes du Prisme, dans leur ordre de lecture', () => {
    const rangs = ['Transparence', 'Discrétion', 'Exploration', 'Automatisme'].map((mot) =>
      doc.indexOf(mot),
    );
    expect(rangs.every((rang) => rang > -1)).toBe(true);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
  });

  /**
   * L'illustration DIT la phrase entière du Prisme : un message écrit une fois,
   * lu dans trois langues. Sans les trois, elle ne montre qu'une traduction.
   */
  it('montre le même message servi dans trois langues', () => {
    expect(doc).toContain('On se cale à 15 h pour la revue ?');
    expect(doc).toContain('Shall we meet at 3 p.m. for the review?');
    expect(doc).toContain('¿Nos vemos a las 15 h para la revisión?');
  });

  /**
   * Entre les étapes 2 et 6 du § 4.9, `/login` et `/signup` sont encore au
   * legacy : franchir la frontière de zone exige un `<a>` RÉEL. Un lien de
   * routeur y ferait une navigation client qui ne traverse pas la zone.
   */
  it('sort de la zone par des ancres réelles, jamais par un routeur', () => {
    expect(doc).toContain('<a class="cta principal" href="/signup">');
    expect(doc).toContain('<a class="cta secondaire" href="/login">');
  });

  it('inline la table de jetons plutôt qu’une feuille distante', () => {
    expect(doc).toContain('--color-primary');
    expect(doc).not.toContain('<link rel="stylesheet"');
  });
});
