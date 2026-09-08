import type { ReactNode } from 'react';

import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import type { LensSectionId } from '@/lib/lens/sections';
import { sectionLabelOf } from '@/lib/lens/sections';

/**
 * LE STICKER DE SECTION (#5694, écart 6) — miroir
 * `Lentille/Chrome/LentilleSticker.swift:20-99` : `10.5` pt poids `.heavy`
 * (800), letter-spacing `0,1 em`, padding `4/13`, MAJUSCULES, fond
 * secondaire, encre secondaire, COLLANT plein largeur.
 *
 * AUCUNE cote n'est écrite ici en littéral (D-4) — elles viennent TOUTES de
 * `packages/shared/design/lentille-tokens.json` (`list.sticker`), exposé au
 * web-v3 par l'export `./design/*` de `@meeshy/shared` (JSON brut, pas
 * `dist` — même mécanique que `packages/design-tokens/ios.css`, une SEULE
 * table dont ce fichier lit les valeurs plutôt que les recopier). Muter une
 * cote du JSON fait dériver ce composant SANS qu'aucune ligne d'ici ne
 * bouge — c'est la garantie qu'un littéral recopié ne peut jamais offrir.
 *
 * UN EN-TÊTE, PAS UN BOUTON (§1.1 de la spécification) : iOS rend `pinned`
 * repliable (le pliage PERSISTE côté serveur, `PATCH …/categories/:id`) ;
 * aucun port web-v3 ne l'écrit encore — un bouton sans effet observable est
 * inerte (charte, § contrôle = effet), un `<h2>` dit exactement ce qu'il
 * fait. Il est monté PLEINE LARGEUR (`-mx-2`), sans la marge horizontale des
 * rangées — même géométrie que `LazyVStack(spacing: 8, pinnedViews:
 * [.sectionHeaders])` côté iOS.
 *
 * UN SEUL STICKER COLLE À LA FOIS (revue #5694). Ce nœud est le PREMIER
 * ENFANT de la SECTION (`LensSection`, ci-dessous), jamais un frère direct de
 * toutes les rangées de la liste : `position: sticky` est borné par le bloc
 * CONTENEUR, donc chaque en-tête est chassé par le haut quand SA section
 * quitte l'écran, et le suivant prend sa place. Posés à plat dans le même
 * conteneur, les en-têtes s'EMPILENT au contraire tous en haut — mesuré sur
 * `render/list-scrolled.dark.png` avant correction : « HIER » et « CETTE
 * SEMAINE » collés l'un sous l'autre, deux bandes mangées à la liste, six
 * avec toutes les sections. La cible iOS n'en montre jamais qu'un
 * (`targets/lentille.scrolled.{light,dark}.png`).
 */
export function LensSticker({ id }: { readonly id: LensSectionId }) {
  const sticker = lentilleTokens.list.sticker;

  return (
    <h2
      data-sticker={id}
      className="sticky top-0 z-10 -mx-2 px-4 uppercase"
      style={{
        backgroundColor: 'var(--color-ios-card)',
        fontSize: sticker.size,
        fontWeight: sticker.weight,
        letterSpacing: `${sticker.letterSpacingEm}em`,
        padding: `${sticker.padding.vertical}px ${sticker.padding.horizontal}px`,
        color: 'var(--color-ios-ink-2)',
      }}
    >
      {sectionLabelOf(id)}
    </h2>
  );
}

/**
 * LA SECTION — le BLOC qui borne son en-tête collant. Il n'est PAS positionné :
 * `check-lens.mjs` mesure `offsetTop` des rangées contre leur `offsetParent`,
 * et un bloc positionné le déplacerait sous les pieds du témoin d'invariance.
 *
 * LA JONCTION VAUT 8 (revue #5694) — `list.row.marginVertical`, la cote que
 * `lentille-tokens.json` déclare et que son propre `$noteRail` rappelle :
 * « toutes les autres jonctions de la liste valent 8 ». Sans elle, l'en-tête
 * OPAQUE d'une section (`z-10`, il DOIT passer devant pour coller) venait se
 * poser sur les 8 px dont le VISUEL d'une rangée déborde sa case : mesuré au
 * rendu, la dernière ligne d'une rangée magnifiée — « 2026-09-06 · 128
 * membres » — coupée en deux dans la hauteur par la bande « CETTE SEMAINE »
 * (`render/list-scrolled.light.png` avant correction).
 *
 * TOUTE section porte désormais cette marge, la PREMIÈRE comprise (#5694,
 * correction défaut 3). Avant : le scrollport (`<ul id="contenu">`) portait
 * lui-même un `pt-2` pour ouvrir cet espace au-dessus de la première section,
 * et la PREMIÈRE section en était dispensée. Mais `position: sticky` colle
 * un élément au bord de la boîte de PADDING de son ascendant défilant — pas
 * à son bord de clip — donc `top-0` s'immobilisait à `y = 8` (la hauteur du
 * `pt-2`), jamais à `y = 0` : 8 px de scrollport restaient hors de portée de
 * l'en-tête collant, et la rangée qui y défilait s'y peignait TRANCHÉE
 * au-dessus de la bande opaque (mesuré : `getComputedStyle(ul).paddingTop
 * === "8px"`, en-tête à `top: 8`, capture `sliver262.*.png`). Une MARGE (sur
 * le premier enfant d'un conteneur qui établit son propre contexte de mise
 * en page — `overflow-y-auto` en fait un — ne collapse pas dans son parent
 * ET n'entre pas dans le repère de `position: sticky`, qui ne connaît QUE la
 * boîte de padding) ouvre le même espace SANS déplacer ce repère : `top-0`
 * s'immobilise enfin à `y = 0`, pile au bord de clip du scrollport.
 */
export function LensSection({
  id,
  children,
}: {
  readonly id: LensSectionId;
  readonly children: ReactNode;
}) {
  return (
    <li data-section={id} className="shrink-0" style={{ marginTop: lentilleTokens.list.row.marginVertical }}>
      <LensSticker id={id} />
      <ul>{children}</ul>
    </li>
  );
}
