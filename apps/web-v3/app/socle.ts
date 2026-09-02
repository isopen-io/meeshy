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
 * couleurs de fond et de texte prises aux jetons, l'anneau de focus et la
 * coupure du mouvement. Tout ce qui appartient à un écran reste dans sa
 * feuille.
 *
 * CE QUE LA CHARTE Y A CHANGÉ (conception § 12.5, directive du 2026-09-01)
 *
 * 1. **Le corps se lit à 17 px, interligne 1,6, sur la pile SYSTÈME**
 *    (règle 2). `--text-base` (15 px) et `--leading-normal` étaient un corps de
 *    tableau de bord servi à un lecteur qui tient son téléphone à bout de bras
 *    au soleil ; `--font-body` nommait Inter, une police que personne ne sert et
 *    qu'un jour quelqu'un aurait fini par charger.
 * 2. **L'anneau de focus est DOUBLE** (règle 15) : un anneau d'une seule
 *    couleur disparaît dès qu'il touche une surface de sa luminance — et il en
 *    touchait une, puisqu'il était peint à l'accent, comme l'action primaire
 *    qu'il entoure le plus souvent. Le contre-anneau le détoure ; les deux
 *    jetons sont mesurés l'un contre l'autre par `check-jetons.mjs`.
 * 3. **Le mouvement se coupe pour qui le demande** (règle 24). La coupure vit
 *    ici et non dans une feuille d'écran : une préférence d'accessibilité qui
 *    dépendrait de l'écran servi n'en est pas une.
 *
 * `[hidden]` l'emporte sur TOUTE règle de display — et c'est le seul
 * `!important` du socle. L'attribut `hidden` ne vaut, dans la feuille de
 * l'agent, qu'un `display:none` de spécificité nulle : la première règle de
 * classe qui pose `display:inline-flex` le rend inerte, et c'est exactement ce
 * qui est arrivé — mesuré sur le fil : la pastille « N nouveaux messages »,
 * le composeur fermé et la pastille de langue d'une ligne clonée restaient
 * VISIBLES sous leur attribut `hidden`. Les gabarits que le module de
 * participation remplit (§ 12.4) montrent et cachent par cet attribut ; ils
 * doivent pouvoir le faire sans connaître la feuille.
 */
const compacte = (feuille: string): string => feuille.replace(/\s*\n\s*/g, '').trim();

export const SOCLE_DU_DOCUMENT = compacte(`
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--color-bg);color:var(--color-text);font-family:var(--font-native);font-size:var(--text-md);line-height:var(--leading-relaxed);-webkit-font-smoothing:antialiased}
:focus-visible{outline:var(--stroke-focus) solid var(--color-focus);outline-offset:var(--stroke-strong);box-shadow:0 0 0 var(--stroke-strong) var(--color-focus-contra)}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:0s;animation-duration:0s}}
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
