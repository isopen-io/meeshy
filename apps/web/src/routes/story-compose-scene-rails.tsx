import type { ReactNode } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { chromeFade, ROUND_GLASS, StudioTile } from '@/routes/story-compose-chrome';
import { PageMark } from '@/routes/story-compose-parts';

/**
 * **LA COLONNE DROITE DE LA SCÈNE** (#8715, jumelle de `ComposerTrailingRail`
 * posé en colonne, #8713 / #8714) — de HAUT en bas : les options du moment
 * (les effets d'une scène à fond média, ou les actions de l'objet touché),
 * défilantes quand elles sont trop nombreuses ; le `(x)` qui quitte la
 * sélection, hors du défilement ; puis, TOUJOURS en bas, sous le pouce,
 * « Temps » d'une scène animée, annuler et rétablir.
 *
 * Loi 4 : une tuile sans effet n'est pas montée (annuler sans rien à défaire,
 * « Temps » sur une scène statique) ; sans aucune tuile, la colonne n'existe pas.
 */
export type StudioColumnTile = {
  readonly key: string;
  readonly label: string;
  readonly probe: string;
  readonly glyph: ReactNode;
  readonly onPress: () => void;
  readonly pressed?: boolean;
  readonly destructive?: boolean;
};

export function StudioTrailingColumn({
  lang,
  locked,
  label,
  options,
  exit,
  foot,
  hidden = false,
}: {
  readonly lang: InterfaceLanguage;
  readonly locked: boolean;
  /** Le nom du groupe d'options — « Effets de la scène », « Options de Texte 1 ». */
  readonly label: string;
  readonly options: readonly StudioColumnTile[];
  /** Le `(x)` d'une sélection — `null` sans objet touché. */
  readonly exit: StudioColumnTile | null;
  readonly foot: readonly StudioColumnTile[];
  /** UN OUTIL OUVERT (#8654) — ses options cèdent en fondu ; le PIED reste :
   * annuler et rétablir sont là « même pour les outils » (#8713). */
  readonly hidden?: boolean;
}) {
  if (options.length === 0 && exit === null && foot.length === 0) return null;
  const tile = (entry: StudioColumnTile) => (
    <StudioTile
      key={entry.key}
      label={entry.label}
      probe={entry.probe}
      onPress={entry.onPress}
      disabled={locked}
      {...(entry.pressed !== undefined ? { pressed: entry.pressed } : {})}
    >
      <span className="grid place-items-center" style={entry.destructive === true ? { color: 'var(--color-error)' } : undefined}>
        {entry.glyph}
      </span>
    </StudioTile>
  );
  return (
    <div data-story-studio-rail="trailing" className="pointer-events-none absolute end-2.5 top-2 bottom-2 z-10 flex flex-col items-center gap-2">
      {options.length > 0 || exit !== null ? (
        <div role="group" aria-label={label} data-story-trailing-options {...chromeFade(!hidden)} className="pointer-events-auto flex min-h-0 flex-col items-center gap-2">
          <div className="flex min-h-0 flex-col items-center gap-2 overflow-y-auto p-0.5">{options.map(tile)}</div>
          {exit !== null ? <div className="p-0.5">{tile(exit)}</div> : null}
        </div>
      ) : null}
      <span aria-hidden="true" className="min-h-0 flex-1" />
      {foot.length > 0 ? (
        <div role="group" aria-label={translate(lang, 'story.studio.rail.scene')} data-story-trailing-foot className="pointer-events-auto flex shrink-0 flex-col items-center gap-2 p-0.5">
          {foot.map(tile)}
        </div>
      ) : null}
    </div>
  );
}

/**
 * **LE (+) NOUVELLE SCÈNE, dans la barre haute** (#8713 — « mets à sa place
 * [celle de l'éclair] le bouton (+) pour créer une nouvelle scène »). Absent
 * au plafond de scènes (`STUDIO_PAGE_MAX`).
 */
export function StudioAddSceneButton({ lang, onAdd, disabled = false }: { readonly lang: InterfaceLanguage; readonly onAdd: () => void; readonly disabled?: boolean }) {
  const label = translate(lang, 'story.studio.page.add');
  return (
    <button
      type="button"
      data-story-option="add-page"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onAdd}
      className={ROUND_GLASS}
      style={{ outlineColor: 'var(--color-ios-brand)', color: 'var(--color-ios-ink)', opacity: disabled ? 0.4 : 1 }}
    >
      <PageMark size={20} />
    </button>
  );
}
