import { memo, useState } from 'react';


import type { Attachment } from '@/lib/api/types';
import { attachmentSrc, attachmentSrcSet, sizesFor } from '@/lib/api/media-url';
import { thumbHashPlaceholder } from '@/lib/media/thumbhash';
import { electDescription } from '@/lib/view/media';
import { kindOf } from '@/lib/view/message';
import {
  MEDIA_GRID_SPACING,
  MEDIA_GRID_VISIBLE_MAX,
  OVERFLOW_LABEL_SIZE,
  OVERFLOW_VEIL_OPACITY,
  mediaGridCellSizes,
  mediaGridSlots,
  type MediaGridFrame,
} from '@/lib/view/media-grid-layout';
import { MEDIA_GRID_MAX_WIDTH } from '@/lib/reading-mode/metrics';
import { READER_LOCALE } from '@/lib/reader';

import { Glyph } from './glyph';
import { MaskedAttachment } from './masked-attachment';
import { VideoTile } from './video-tile';
import { useAttachmentMasked } from './view-once-opened';

/**
 * `ImageTile` — DÉMÉNAGÉ d'`attachment-blocks.tsx:43-121` (#6221, § 5 étape
 * 3 de la spécification « grille de médias ») : la RANGÉE SOLO d'une pièce
 * visuelle, quel que soit son porteur (`bubble.tsx`, `focal-row.tsx`). Le
 * SITE UNIQUE — c'est `Attachments`/`MediaGrid` (ci-dessous) qui décident
 * quand une SEULE pièce visuelle passe par lui plutôt que par `MediaGrid`
 * (`items.length === 1` ⇒ pas de boîte de grille, cette rangée garde son
 * ratio INTRINSÈQUE, exactement le comportement d'avant ce lot — aucune des
 * captures ni des témoins `attachment-blocks.test.tsx:49-97` n'a changé).
 *
 * NOUVEAU dans ce lot : `srcset`/`sizes` (D4 §1.4.4, `attachmentSrcSet`) et
 * un `<button data-media-tile>` qui enveloppe l'`<img>` — la `<figure
 * data-attachment>` reste l'ENVELOPPE EXTÉRIEURE, un `<button>` n'acceptant
 * que du contenu de phrasé (`<img>` oui, `<figure>` non), d'où l'ordre
 * `figure > button > img`. Sans URL exploitable (`fileUrl === ''` ou
 * `onError`), AUCUN bouton n'est monté : il n'y a rien à ouvrir (loi 4).
 */
export function ImageTile({
  attachment,
  languages,
  displayLanguage,
  fallbackLanguage,
  onOpen,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly onOpen?: () => void;
}) {
  const described = electDescription({ attachment, readerLanguages: languages, displayLanguage, fallbackLanguage });
  const hasDimensions = attachment.width !== undefined && attachment.height !== undefined;
  const aspectRatio = hasDimensions ? `${attachment.width} / ${attachment.height}` : `${MEDIA_GRID_MAX_WIDTH} / 240`;
  const lang = described.language !== READER_LOCALE ? described.language : undefined;
  const [failed, setFailed] = useState(false);
  const showsFallbackLabel = attachment.fileUrl === '' || failed;
  const srcSet = attachmentSrcSet(attachment.imageVariants);
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);

  const img = attachment.fileUrl === '' ? null : (
    <img
      data-attachment-image={attachment.id}
      src={attachmentSrc(attachment.fileUrl)}
      {...(srcSet !== undefined ? { srcSet: srcSet, sizes: sizesFor(MEDIA_GRID_MAX_WIDTH) } : {})}
      alt={described.text}
      hidden={failed}
      {...(lang !== undefined ? { lang } : {})}
      {...(attachment.width !== undefined ? { width: attachment.width } : {})}
      {...(attachment.height !== undefined ? { height: attachment.height } : {})}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 size-full object-cover"
      onError={() => setFailed(true)}
    />
  );

  return (
    <figure
      data-attachment={attachment.id}
      /* `relative` + enfants `absolute inset-0` (revue #5805) — voir le
         doc-comment historique (le motif de la pile d'empilement) : NE PAS
         revenir à `grid` avec deux enfants au même `col-start-1 row-start-1`. */
      className="relative max-w-full overflow-hidden rounded-media"
      style={{
        width: MEDIA_GRID_MAX_WIDTH,
        aspectRatio,
        backgroundColor:
          placeholder !== undefined ? undefined : 'color-mix(in srgb, var(--accent) 12%, transparent)',
        ...(placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : {}),
      }}
      {...(showsFallbackLabel ? { role: 'img', 'aria-label': described.text } : {})}
    >
      <Glyph name="image" size={40} className="absolute inset-0 m-auto opacity-40" />
      {img === null ? null : onOpen !== undefined ? (
        <button
          type="button"
          data-media-tile
          onClick={onOpen}
          aria-label={`Ouvrir ${described.text}`}
          className="absolute inset-0 block size-full cursor-pointer appearance-none border-0 bg-transparent p-0"
        >
          {img}
        </button>
      ) : (
        img
      )}
    </figure>
  );
}

/**
 * `MediaGrid` (#6221) — la grille 2/3/4+ d'un MESSAGE, miroir arithmétique de
 * `FocalMediaGridLayout.slots(for:)` / `BubbleStandardLayout+Media.swift`.
 *
 * `items.length === 1` : AUCUNE boîte de grille — délègue directement à
 * `ImageTile`/`VideoTile` en mode SOLO, exactement le rendu d'avant ce lot.
 * `items.length >= 2` : la boîte `[data-media-grid]`, cotes DÉRIVÉES
 * (`mediaGridSlots`), FORME déclarée par l'hôte (`frame`, `MediaGridFrame`) :
 * boîte noire unique en bulle, cases arrondies séparées en rangée plate.
 *
 * `memo` sur des PRIMITIVES (`languages`, jamais l'objet — leçon cycle 123) :
 * l'identité de `items` (les pièces) et des trois chaînes suffit à décider
 * un re-rendu, l'état « visionneuse ouverte » restant chez `Attachments`.
 */
const FRAME_CLASS: Readonly<Record<MediaGridFrame, string>> = {
  box: 'relative overflow-hidden rounded-media bg-black',
  tiles: 'relative',
};

const CELL_CLASS: Readonly<Record<MediaGridFrame, string>> = {
  box: 'relative size-full overflow-hidden',
  tiles: 'relative size-full overflow-hidden rounded-media bg-black',
};

export const MediaGrid = memo(function MediaGrid({
  items,
  frame,
  languages,
  displayLanguage,
  fallbackLanguage,
  onOpen,
}: {
  readonly items: readonly Attachment[];
  readonly frame: MediaGridFrame;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly onOpen: (index: number) => void;
}) {
  const maskedAttachment = useAttachmentMasked();
  if (items.length === 0) return null;

  if (items.length === 1) {
    const only = items[0]!;
    if (maskedAttachment(only)) return <MaskedAttachment attachment={only} />;
    if (kindOf(only) === 'video') {
      return <VideoTile attachment={only} solo onExpand={() => onOpen(0)} />;
    }
    return (
      <ImageTile
        attachment={only}
        languages={languages}
        fallbackLanguage={fallbackLanguage}
        onOpen={() => onOpen(0)}
        {...(displayLanguage !== undefined ? { displayLanguage } : {})}
      />
    );
  }

  const slots = mediaGridSlots(items.length);
  const cellSizes = mediaGridCellSizes(items.length);
  const boxHeight = slots[0]!.height;
  const visible = items.slice(0, MEDIA_GRID_VISIBLE_MAX);

  /* LA FORME QUE CETTE CASE DOIT GARDER, posée sur la case ELLE-MÊME (#7030,
     seconde relecture). Les cotes restent en px et la boîte rétrécit avec son
     porteur : c'est le RATIO qui est l'invariant, et le gate navigateur le
     compare à ces deux nombres — la sortie RÉELLE de `mediaGridCellSizes` à
     ce montage, jamais un littéral recopié dans le gate. Posée par `cell()`,
     donc sur les TROIS agencements : la première écriture n'instrumentait que
     la paire et la case gauche du triplet, et laissait le quadruple — deux
     rangées `1fr 1fr`, le seul mécanisme dont la hauteur de rangée dépend
     désormais de la largeur servie — sans aucun témoin de forme. */
  const cellShape = (index: number) => ({
    'data-slot-width': cellSizes[index]!.width,
    'data-slot-height': cellSizes[index]!.height,
  });

  const cell = (attachment: Attachment, index: number, widthPx: number) => {
    const overflowCount = slots[index]!.overflowCount;
    if (maskedAttachment(attachment)) return <MaskedAttachment key={attachment.id} attachment={attachment} fill />;
    if (kindOf(attachment) === 'video') {
      return (
        <div key={attachment.id} className={CELL_CLASS[frame]} {...cellShape(index)}>
          <VideoTile attachment={attachment} solo={false} onExpand={() => onOpen(index)} />
          {overflowCount > 0 ? <OverflowVeil count={overflowCount} total={items.length} index={index} onOpen={onOpen} /> : null}
        </div>
      );
    }
    return (
      <div key={attachment.id} className={CELL_CLASS[frame]} {...cellShape(index)}>
        <GridCellImage
          attachment={attachment}
          languages={languages}
          fallbackLanguage={fallbackLanguage}
          widthPx={widthPx}
          onOpen={() => onOpen(index)}
          {...(displayLanguage !== undefined ? { displayLanguage } : {})}
        />
        {overflowCount > 0 ? <OverflowVeil count={overflowCount} total={items.length} index={index} onOpen={onOpen} /> : null}
      </div>
    );
  };

  return (
    <div
      data-media-grid
      data-media-frame={frame}
      className={FRAME_CLASS[frame]}
      /* `maxWidth: '100%'` (#7018) — PARITÉ avec `ImageTile`, qui porte
         `max-w-full` depuis toujours. Une largeur FIXE de 300 px dans une
         bulle dont la largeur utile est 253,4 px (390 px de viewport,
         `max-w-[70%]` + la gouttière de 50 px) débordait de 46,6 px : vers la
         GOUTTIÈRE sur un message reçu — invisible —, HORS DE L'ÉCRAN sur un
         message DE MOI (`justify-end`), rendant tout le fil défilable
         horizontalement (`scrollWidth` 437 pour `clientWidth` 390, mesuré).

         `aspectRatio`, JAMAIS `height` (#7030, relecture adversariale — la
         régression que #7018 a introduite en se corrigeant à moitié) : le
         plafond `100 %` fait RÉTRÉCIR la largeur RENDUE dès que le porteur
         est plus étroit que 300 px (223,4 px en Bulles, mesuré), et une
         `height` littérale ne suit pas — chaque case, shrinkée par
         `flex-shrink` par défaut, se retrouvait sous une hauteur inchangée
         (paire : 110,7 × 180 au lieu de 110,7 × 134,0). Même motif que la
         vidéo SEULE (#7016, `soloVideoSlot`, ci-dessus dans ce fichier) :
         `width` + `aspectRatio` fait DESCENDRE la hauteur avec la largeur
         plafonnée, dans les trois agencements (paire, triplet, quadruple —
         `1fr 1fr` y est déjà proportionnel en largeur, il ne l'était pas en
         hauteur) sans toucher aux cotes des CASES, qui restent en px : le
         partage `flex-shrink` par défaut (poids égaux à valeurs de départ
         égales) les rétrécit déjà PROPORTIONNELLEMENT à la largeur de la
         boîte — mesuré après correctif : écart ≤ 0,3 % avec le ratio de
         `mediaGridSlots`, bien sous la tolérance de 2 % du gate. */
      style={{ width: MEDIA_GRID_MAX_WIDTH, maxWidth: '100%', aspectRatio: `${MEDIA_GRID_MAX_WIDTH} / ${boxHeight}` }}
    >
      {items.length === 2 ? (
        <div className="flex size-full" style={{ gap: MEDIA_GRID_SPACING }}>
          {visible.map((a, i) => (
            <div key={a.id} style={{ width: slots[i]!.width }}>
              {cell(a, i, slots[i]!.width)}
            </div>
          ))}
        </div>
      ) : items.length === 3 ? (
        <div className="flex size-full" style={{ gap: MEDIA_GRID_SPACING }}>
          <div style={{ width: slots[0]!.width }}>{cell(visible[0]!, 0, slots[0]!.width)}</div>
          <div className="flex flex-col" style={{ width: slots[1]!.width, gap: MEDIA_GRID_SPACING }}>
            <div style={{ flex: 1 }}>{cell(visible[1]!, 1, slots[1]!.width)}</div>
            <div style={{ flex: 1 }}>{cell(visible[2]!, 2, slots[2]!.width)}</div>
          </div>
        </div>
      ) : (
        <div
          className="grid size-full"
          style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: MEDIA_GRID_SPACING }}
        >
          {visible.map((a, i) => cell(a, i, slots[i]!.width))}
        </div>
      )}
    </div>
  );
});

/** `+Media.swift:530-538` — voile 0,5 + libellé `+N` 24 px bold blanc, SUR la 4ᵉ tuile (elle reste ouvrable en dessous). */
function OverflowVeil({
  count,
  total,
  index,
  onOpen,
}: {
  readonly count: number;
  readonly total: number;
  readonly index: number;
  readonly onOpen: (index: number) => void;
}) {
  return (
    <button
      type="button"
      data-overflow={count}
      onClick={() => onOpen(index)}
      aria-label={`Ouvrir le média ${index + 1} sur ${total}, ${count} de plus`}
      className="absolute inset-0 grid cursor-pointer appearance-none place-items-center border-0 font-bold text-white"
      style={{ backgroundColor: `rgba(0,0,0,${OVERFLOW_VEIL_OPACITY})`, fontSize: OVERFLOW_LABEL_SIZE }}
    >
      +{count}
    </button>
  );
}

/**
 * `GridCellImage` — la case IMAGE d'une grille 2/3/4+ (#6221). Distincte
 * d'`ImageTile` : la cote est celle de la MISE EN PAGE (`widthPx`, hauteur
 * pleine de la case via `size-full`), jamais du ratio intrinsèque de la
 * pièce — `object-cover` la recadre, comme `BubbleGridImageView` (`+Media
 * .swift:629-676`). Fond ThumbHash (moyenne, `thumbHashPlaceholder`) avant
 * décodage, repli teinte d'accent 12 % sans hash.
 *
 * `onError` (#6882) — GAP retrouvé en investiguant « des pièces jointes en
 * base sont absentes du stockage » : `ImageTile` (case SOLO, lignes
 * ci-dessus) masque l'`<img>` en échec et affiche un glyphe de repli depuis
 * #5805 ; cette case, montée pour toute grille 2/3/4+, n'avait AUCUNE prise
 * sur `onError` — un message à plusieurs pièces dont une manque au stockage
 * rendait l'icône « image brisée » native du navigateur, exactement ce que
 * l'enveloppe SOLO existe pour éviter. Même traitement ici : `<img hidden>`
 * à l'échec, `Glyph` de repli DÉCOUVERT (jamais recouvert que par une image
 * qui a réellement décodé) — parité avec `ImageTile`, pas une nouvelle règle.
 */
function GridCellImage({
  attachment,
  languages,
  displayLanguage,
  fallbackLanguage,
  widthPx,
  onOpen,
}: {
  readonly attachment: Attachment;
  readonly languages: readonly string[];
  readonly displayLanguage?: string;
  readonly fallbackLanguage: string;
  readonly widthPx: number;
  readonly onOpen: () => void;
}) {
  const described = electDescription({ attachment, readerLanguages: languages, displayLanguage, fallbackLanguage });
  const lang = described.language !== READER_LOCALE ? described.language : undefined;
  const [failed, setFailed] = useState(false);
  const srcSet = attachmentSrcSet(attachment.imageVariants);
  const placeholder = thumbHashPlaceholder(attachment.thumbHash);

  return (
    <button
      type="button"
      data-media-tile
      data-attachment={attachment.id}
      onClick={onOpen}
      aria-label={`Ouvrir ${described.text}`}
      className="relative block size-full cursor-pointer appearance-none border-0 bg-transparent p-0"
      style={{
        backgroundColor: placeholder !== undefined ? undefined : 'color-mix(in srgb, var(--accent) 12%, transparent)',
        ...(placeholder !== undefined ? { backgroundImage: `url("${placeholder}")`, backgroundSize: 'cover' } : {}),
      }}
    >
      <Glyph name="image" size={28} className="absolute inset-0 m-auto opacity-40" />
      {attachment.fileUrl === '' ? null : (
        <img
          data-attachment-image={attachment.id}
          src={attachmentSrc(attachment.fileUrl)}
          {...(srcSet !== undefined ? { srcSet: srcSet, sizes: sizesFor(widthPx) } : {})}
          alt={described.text}
          hidden={failed}
          {...(lang !== undefined ? { lang } : {})}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </button>
  );
}
