/**
 * **UN OUTIL OUVERT PREND TOUTE LA PLACE** (#8654, jumelle web de
 * `ComposerToolFocus` iOS, #8652 — directive porteur 2026-09-29) :
 *
 * > « les tools de la scène principale laissent place aux tools de l'outil
 * > sélectionné avec (X), et le rail du bas audience, publication ; les (+)
 * > n'ont pas besoin d'être là quand un outil est ouvert ! »
 *
 * Un outil ouvert (l'édition d'un objet — texte ou calque —, le Cadre) ne
 * s'AJOUTE plus à un écran déjà complet : l'en-tête (✕, scènes, Animé, ⋯),
 * le couloir des portes et ses (+), le rail droit et son (+) de scène, le
 * socle (audience, Publier) cèdent en fondu. Restent la scène, les réglages
 * de l'outil et le (X) qui le referme. Refermer rend exactement le chrome
 * d'avant : la loi ne lit que l'état, jamais un historique.
 *
 * La FRISE n'est pas un outil au sens de cette loi : c'est un MODE de la
 * scène, dont la bascule vit au rail droit — elle garde sa géographie (#8415).
 */
export type StudioOpenTool = 'object' | 'frame' | null;

export function studioOpenTool({
  editing,
  frameOpen,
  hasBackground,
  timelineOpen,
}: {
  readonly editing: string | null;
  readonly frameOpen: boolean;
  readonly hasBackground: boolean;
  readonly timelineOpen: boolean;
}): StudioOpenTool {
  if (editing !== null) return 'object';
  if (frameOpen && hasBackground && !timelineOpen) return 'frame';
  return null;
}

export type StudioChrome = {
  /** ✕ · rail des scènes · Animé · ⋯ */
  readonly header: boolean;
  /** Les portes — ce qu'on POSE, et le (+) du texte. */
  readonly leadingRail: boolean;
  /** Annuler, rétablir, Temps, Cadre, (+) de scène. */
  readonly trailingRail: boolean;
  /** Audience, texte du post, Publier. */
  readonly socleRow: boolean;
  /** Les médias en montée et le message du pied. */
  readonly socleCard: boolean;
};

const EVERYTHING: StudioChrome = { header: true, leadingRail: true, trailingRail: true, socleRow: true, socleCard: true };
const FOCUSED: StudioChrome = { header: false, leadingRail: false, trailingRail: false, socleRow: false, socleCard: false };

export function studioChrome({ tool, timelineOpen }: { readonly tool: StudioOpenTool; readonly timelineOpen: boolean }): StudioChrome {
  if (tool !== null) return FOCUSED;
  if (timelineOpen) return { ...EVERYTHING, leadingRail: false, socleCard: false };
  return EVERYTHING;
}
