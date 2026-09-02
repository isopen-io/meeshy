/**
 * Le SOCLE de tout document composé à la main par la v3.
 *
 * Il vivait dans `app/(public)/l/[token]/feuille.ts`, où il n'avait qu'un
 * consommateur. La vitrine publique en est le second, et elle n'est pas dans ce
 * dossier : le laisser là aurait obligé la RACINE à importer depuis l'écran des
 * liens, ou — pire — à recopier ces quatre déclarations. Le § 3.2 corollaire 2
 * interdit la seconde table ; il interdit aussi le second socle.
 *
 * Il ne porte que ce qui est vrai de TOUT écran : la marge du document, les
 * couleurs de fond et de texte prises aux jetons, et l'anneau de focus. Tout ce
 * qui appartient à un écran reste dans sa feuille.
 */
const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const SOCLE_DU_DOCUMENT = compacte(`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-body);font-size:var(--text-base);line-height:var(--leading-normal);-webkit-font-smoothing:antialiased}
:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
`);

/**
 * L'ÉCHAPPEMENT — un seul, pour tous les documents composés à la main.
 *
 * Chaque surface qui écrit du HTML en chaînes en a besoin, et chacune qui en
 * porterait sa copie serait la jumelle qui dérive le jour où l'on ajoute une
 * entité. Le contenu ne décide jamais du balisage.
 */
const ENTITES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const echappe = (valeur: string): string =>
  valeur.replace(/[&<>"']/g, (caractere) => ENTITES[caractere] ?? caractere);
