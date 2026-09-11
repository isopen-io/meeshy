/**
 * **LA PASTILLE DE NON-LUS — UN CHIFFRE, DEUX POSES, UNE SEULE LOI** (#6080).
 *
 * Trois pastilles de non-lus vivaient dans cette application, écrites à trois
 * endroits, et elles avaient déjà divergé sur les trois axes qui comptent :
 *
 * | site | couleur | plancher | au-delà de 99 |
 * |---|---|---|---|
 * | `lens-row.tsx` | `var(--accent)` — l'accent de la CONVERSATION | 20 × 20 | `4312` en toutes lettres |
 * | `thread-header.tsx` | `var(--color-error)` | 16 × 16 | idem |
 * | iOS, la référence | l'ERREUR, toujours | 24 (flux) / 18 (coin) | `99+` |
 *
 * **Le rouge n'est pas une décoration, c'est le SENS.** iOS le dit en toutes
 * lettres dans la garde de son atome (`UnreadCountBadgeTests
 * .test_theBadgeIsSemanticRed_neverTheConversationAccent`) : « un compte à
 * rattraper se peint en ROUGE sémantique, jamais avec l'accent de la
 * conversation — l'accent est une décoration, il ne dit pas *il te reste ceci
 * à lire* ». Une rangée à l'accent turquoise peignait donc sa dette en
 * turquoise, c'est-à-dire dans la couleur qu'elle emploie déjà pour dire
 * « moi », et la seule information d'urgence de l'écran devenait invisible.
 *
 * **Le portillon vit DANS l'atome.** Aucun appelant n'écrit `count > 0` :
 * à zéro — ou en négatif, ce qu'un remplacement optimiste peut produire — la
 * pastille ne rend RIEN et n'occupe aucune place. C'est ce qui garantit
 * qu'aucune peau ne pourra jamais peindre un disque rouge vide.
 *
 * **Deux poses, et elles sont DIFFÉRENTES pour une raison.** iOS sépare
 * `UnreadCountBadge` (objet de FLUX, posé dans une ligne, plancher 24) de
 * `NotificationBadge` (pastille de COIN, posée sur un bouton, plancher 18) :
 * une pastille de coin empiète sur ce qu'elle annote, elle doit donc être plus
 * petite que celle qui occupe sa propre place. Ce qui reste COMMUN — le rouge,
 * le blanc, la capsule, le « 99+ » — vit ici une seule fois.
 */

/** Cotes de la pose de FLUX — `UnreadCountBadge.swift`, trait pour trait. */
export const UNREAD_BADGE_FLOW = {
  /** Plancher CARRÉ : à un chiffre la pastille reste un disque. */
  minimumSize: 24,
  horizontalPadding: 7,
  verticalPadding: 4,
  shadowRadius: 3,
  shadowOpacity: 0.25,
} as const;

/** Cotes de la pose de COIN — `NotificationBadge` (`FloatingButtons.swift`). */
export const UNREAD_BADGE_CORNER = {
  minimumSize: 18,
  horizontalPadding: 6,
  verticalPadding: 0,
  shadowRadius: 3,
  shadowOpacity: 0.5,
} as const;

/**
 * **Au-delà de 99 on annonce « 99+ », jamais `min(count, 99)`** — miroir de
 * `NotificationBadge.displayed`, dont le doc-comment nomme le défaut évité :
 * « 99 » serait un nombre FAUX présenté comme exact.
 *
 * Et la borne haute n'est pas cosmétique : sans elle, une conversation à 4 312
 * messages en retard peignait une capsule de la largeur d'un tiers de rangée,
 * qui repoussait le nom et le tronquait.
 */
export function unreadBadgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count >= 100 ? '99+' : String(Math.trunc(count));
}

/**
 * La pastille de FLUX — en fin de ligne de nom, dans une rangée de liste.
 *
 * `data-unread` porte le compte RÉEL (jamais le texte affiché) : c'est le
 * crochet stable que `check-list-actions.mjs` interroge pour prouver que
 * « Lu »/« Non lu » a un effet, et il doit continuer de dire 4 312 quand
 * l'œil lit « 99+ ».
 */
export function UnreadBadge({
  count,
  opacity,
}: {
  readonly count: number;
  readonly opacity?: number;
}) {
  const text = unreadBadgeText(count);
  if (text === '') return null;

  return (
    <span
      data-unread={count}
      className="grid shrink-0 place-items-center rounded-chip text-check font-bold text-white tabular-nums"
      style={{
        minWidth: UNREAD_BADGE_FLOW.minimumSize,
        minHeight: UNREAD_BADGE_FLOW.minimumSize,
        paddingInline: UNREAD_BADGE_FLOW.horizontalPadding,
        paddingBlock: UNREAD_BADGE_FLOW.verticalPadding,
        backgroundColor: 'var(--color-error)',
        boxShadow: `0 0 ${UNREAD_BADGE_FLOW.shadowRadius}px color-mix(in srgb, var(--color-error) ${UNREAD_BADGE_FLOW.shadowOpacity * 100}%, transparent)`,
        ...(opacity === undefined ? {} : { opacity }),
      }}
    >
      {text}
    </span>
  );
}

/**
 * La pastille de COIN — posée sur un bouton qu'elle annote (le retour du fil,
 * qui dit « il reste du non-lu AILLEURS »).
 *
 * **Elle ne déborde plus du chrome.** Posée `top-0 right-0` sur une cible de
 * 44, elle sortait par le haut de l'en-tête et la marge de sécurité la
 * TRONQUAIT — mesuré à la capture, 390 × 844 : la moitié haute du disque était
 * coupée par le bord de l'écran. iOS décale la sienne de `(+16, −16)` depuis
 * le CENTRE d'un bouton flottant qui, lui, a de l'air autour. Dans une barre
 * dense, la pose juste est l'inverse : la pastille rentre, ancrée au coin
 * intérieur de la cible.
 */
export function UnreadCornerBadge({ count, label }: { readonly count: number; readonly label?: string }) {
  const text = unreadBadgeText(count);
  if (text === '') return null;

  return (
    <span
      data-unread-corner={count}
      aria-hidden={label === undefined ? true : undefined}
      {...(label === undefined ? {} : { 'aria-label': label })}
      className="absolute grid place-items-center rounded-chip text-check font-semibold text-white tabular-nums"
      style={{
        top: 2,
        insetInlineEnd: 0,
        minWidth: UNREAD_BADGE_CORNER.minimumSize,
        minHeight: UNREAD_BADGE_CORNER.minimumSize,
        paddingInline: UNREAD_BADGE_CORNER.horizontalPadding,
        backgroundColor: 'var(--color-error)',
        boxShadow: `0 0 ${UNREAD_BADGE_CORNER.shadowRadius}px color-mix(in srgb, var(--color-error) ${UNREAD_BADGE_CORNER.shadowOpacity * 100}%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}
