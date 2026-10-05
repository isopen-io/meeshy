import type { ReactNode } from 'react';

import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import { lensSectionAccessibleName } from '@/lib/lens/folded-unread';
import type { LensSectionId } from '@/lib/lens/sections';
import { sectionLabelOf } from '@/lib/lens/sections';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Glyph } from './glyph';
import { UnreadBadge } from './unread-badge';

/**
 * LE PLIAGE D'UNE SECTION (#8694) — fourni par la liste pour les seules
 * sections repliables (`isLensSectionFoldable`). `unread` est déjà passé par
 * `foldedSectionUnread` : il vaut zéro dépliée, donc la pastille — dont le
 * portillon `count > 0` vit dans l'atome — ne peut pas y apparaître.
 */
export type LensSectionFold = {
  readonly folded: boolean;
  readonly unread: number;
  readonly onToggle: () => void;
};

/**
 * LE STICKER DE SECTION (#5694, écart 6) — miroir
 * `Lentille/Chrome/LentilleSticker.swift:20-99` : `10.5` pt poids `.heavy`
 * (800), letter-spacing `0,1 em`, padding `4/13`, MAJUSCULES, fond
 * secondaire, encre secondaire, COLLANT plein largeur.
 *
 * AUCUNE cote n'est écrite ici en littéral (D-4) — elles viennent TOUTES de
 * `packages/shared/design/lentille-tokens.json` (`list.sticker`), exposé au
 * web-v2 par l'export `./design/*` de `@meeshy/shared` (JSON brut, pas
 * `dist` — même mécanique que `packages/design-tokens/ios.css`, une SEULE
 * table dont ce fichier lit les valeurs plutôt que les recopier). Muter une
 * cote du JSON fait dériver ce composant SANS qu'aucune ligne d'ici ne
 * bouge — c'est la garantie qu'un littéral recopié ne peut jamais offrir.
 *
 * UN EN-TÊTE, ET UN BOUTON SEULEMENT S'IL REPLIE (#8694). Sans `fold`, c'est
 * un `<h2>` nu — une section calculée ne se replie pas, un bouton y serait
 * inerte (charte, § contrôle = effet). Avec `fold` (`pinned`, repliable comme
 * sur iOS où son pliage vit dans l'état de l'écran), le `<h2>` porte un
 * `<button aria-expanded>` — le motif accordéon — dont l'effet est observable :
 * les rangées disparaissent et, repliée, la pastille de non-lus qu'elles
 * portaient monte à côté du chevron. Il est monté PLEINE LARGEUR (`-mx-2`),
 * sans la marge horizontale des rangées — même géométrie que
 * `LazyVStack(spacing: 8, pinnedViews: [.sectionHeaders])` côté iOS.
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
export function LensSticker({ id, fold }: { readonly id: LensSectionId; readonly fold?: LensSectionFold }) {
  const sticker = lentilleTokens.list.sticker;
  const label = sectionLabelOf(id);

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
      {fold === undefined ? label : <FoldToggle id={id} label={label} fold={fold} />}
    </h2>
  );
}

/**
 * Le bouton du pliage, miroir de `LentilleSticker` iOS : le titre, puis, au
 * bout de la ligne, la pastille de non-lus À CÔTÉ du chevron — `›` repliée
 * (retourné en arabe), `⌄` dépliée. Le chevron est décoratif : le NOM du
 * bouton dit l'état et le compte, une seule fois.
 */
function FoldToggle({ id, label, fold }: { readonly id: LensSectionId; readonly label: string; readonly fold: LensSectionFold }) {
  return (
    <button
      type="button"
      data-section-toggle={id}
      aria-expanded={!fold.folded}
      aria-label={lensSectionAccessibleName({ language: currentInterfaceLanguage(), label, folded: fold.folded, unread: fold.unread })}
      onClick={fold.onToggle}
      className="flex w-full items-center gap-2 text-start uppercase"
      style={{ font: 'inherit', letterSpacing: 'inherit', color: 'inherit' }}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="normal-case" style={{ letterSpacing: 'normal' }}>
        <UnreadBadge count={fold.unread} />
      </span>
      <Glyph name="caretDown" size={10} {...(fold.folded ? { className: '-rotate-90 rtl:rotate-90' } : {})} />
    </button>
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
  fold,
  children,
}: {
  readonly id: LensSectionId;
  readonly fold?: LensSectionFold;
  readonly children: ReactNode;
}) {
  return (
    <li data-section={id} className="shrink-0" style={{ marginTop: lentilleTokens.list.row.marginVertical }}>
      <LensSticker id={id} {...(fold === undefined ? {} : { fold })} />
      {fold?.folded === true ? null : <ul>{children}</ul>}
    </li>
  );
}
