/**
 * UN GLYPHE — et le seul fichier d'icône qu'un composant CLIENT puisse importer.
 *
 * La séparation n'est pas un rangement : `SpriteDeLEcran` (`icones.tsx`) LIT
 * l'actif commité `packages/icons/sprite.svg` par `node:fs`, ce qui en fait un
 * module strictement SERVEUR. Tant que les deux vivaient dans le même fichier,
 * un îlot `'use client'` qui voulait rendre un glyphe tirait `node:fs` dans le
 * graphe du navigateur — et le build échouait sur `UnhandledSchemeError`.
 * Mesuré, pas supposé : c'est l'erreur qu'a rendue le premier build de l'écran
 * `thread`.
 *
 * Ce composant-ci ne lit rien. Il rend un `<use href="#ph-…">`, qui résout dans
 * le DOCUMENT courant — où la coquille racine a inliné les huit glyphes
 * critiques et où `SpriteDeLEcran`, rendu par le SERVEUR au-dessus de l'îlot, a
 * inliné les autres. Le partage est donc : le serveur fournit les symboles, le
 * client les référence.
 *
 * Un glyphe est DÉCORATIF par défaut, et c'est le bon défaut : il redit
 * toujours ce qu'un texte adjacent dit déjà. `role="img"` sans nom accessible
 * ferait annoncer « image » — pire que le silence (§ 9.5). Quand un glyphe
 * porte l'information à lui seul, l'appelant lui donne un `titre` : il devient
 * alors une image NOMMÉE, jamais un dessin muet.
 */
export function Icone({
  nom,
  titre,
  className,
}: {
  readonly nom: string;
  readonly titre?: string;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 256 256"
      fill="currentColor"
      {...(titre === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': titre })}
    >
      <use href={`#${nom}`} />
    </svg>
  );
}
