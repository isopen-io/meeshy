import type { ReactNode } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import { STUDIO_INLINE_PANEL } from '@/lib/stories/studio-inline-edit';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { StudioToolClose } from '@/routes/story-compose-chrome';

/**
 * **LES OPTIONS D'UN SOUS-OUTIL, À DROITE, DEPUIS LE HAUT** (#9140, jumelle de
 * `ComposerInlineToolPanel` iOS, #9138) — un panneau de verre posé dans le
 * plateau, aligné sur le haut de la colonne droite, qui prend la largeur que
 * les portes du couloir gauche, cédées pendant l'édition, rendent
 * (`STUDIO_INLINE_PANEL`). Sa hauteur épouse son contenu jusqu'à toute la
 * hauteur libre, puis il défile : la part de scène qu'il ne demande pas reste
 * visible et touchable. Le même panneau sert le texte, le calque et le fond.
 *
 * Une COUCHE (#8517) : le retour matériel et Échap le rangent, lui seul — les
 * sous-outils restent au rail jusqu'au `(x)`.
 */
export function StudioInlinePanel({
  lang,
  section,
  title,
  probe,
  onClose,
  focusOnOpen = false,
  marks = {},
  children,
}: {
  readonly lang: InterfaceLanguage;
  readonly section: string;
  readonly title: string;
  readonly probe: 'section' | 'frame';
  readonly onClose: () => void;
  /** Le focus entre dans le panneau par son (X) — jamais pendant la saisie
   * d'un texte, qui garde le clavier. */
  readonly focusOnOpen?: boolean;
  /** Les attributs que les témoins et les gates lisent sur le panneau. */
  readonly marks?: Readonly<Record<`data-${string}`, string>>;
  readonly children: ReactNode;
}) {
  useBackDismiss(onClose, { escape: true });
  return (
    <section
      {...marks}
      data-story-inline-panel={section}
      aria-label={title}
      className="glass studio-plaque-rise absolute z-20 flex flex-col gap-2 rounded-[22px] p-3 md:ms-auto md:max-w-80"
      style={{
        top: STUDIO_INLINE_PANEL.top,
        insetInlineStart: STUDIO_INLINE_PANEL.start,
        insetInlineEnd: STUDIO_INLINE_PANEL.end,
        maxHeight: `calc(100% - ${2 * STUDIO_INLINE_PANEL.top}px)`,
        color: 'var(--color-ios-ink)',
      }}
    >
      <div className="flex shrink-0 items-center gap-2">
        <h2 className="flex-1 truncate text-body font-bold">{title}</h2>
        <StudioToolClose lang={lang} probe={probe} onClose={onClose} focusOnOpen={focusOnOpen} />
      </div>
      <div data-story-inline-panel-body className="flex min-h-0 flex-col gap-2 overflow-y-auto [&>*]:shrink-0">
        {children}
      </div>
    </section>
  );
}
