/**
 * **LA PASTILLE DE NON-LUS — UN CHIFFRE, UNE SEULE LOI** (#6080).
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
 * **iOS a DEUX poses ; ce module n'en porte qu'une, et c'est voulu.** Là-bas,
 * `UnreadCountBadge` est un objet de FLUX (posé dans une ligne, plancher 24) et
 * `NotificationBadge` une pastille de COIN (posée SUR un bouton flottant,
 * plancher 18, décalée de `(+16, −16)`) : une pastille de coin empiète sur ce
 * qu'elle annote, elle doit donc être plus petite que celle qui occupe sa
 * propre place.
 *
 * La pose de COIN a été écrite ici, puis RETIRÉE : son seul site candidat — le
 * compte « non lus ailleurs » du bouton retour — s'est révélé être un site de
 * FLUX. Le chevron vit au bord d'une barre dense, pas au milieu de l'air d'un
 * bouton flottant ; empilée à son coin, la pastille montait au ras du bord
 * supérieur de l'en-tête et ne s'alignait avec rien (retour porteur, capture
 * de l'émulateur). Elle est donc redevenue voisine du chevron, sur la même
 * ligne — la convention de la barre de navigation d'iOS, « ‹ 30 ».
 *
 * Un atome sans consommateur ne protège rien et finit par diverger de ce qu'il
 * prétend garder : ce dépôt l'a déjà payé une fois, sur CET atome précisément
 * (« l'atome existait, testé, sans un seul consommateur » —
 * `LentilleConversationRow.swift`). La pose de coin reviendra avec son premier
 * appelant réel, dans le même commit que lui ; ses cotes sont écrites
 * ci-dessus pour qu'il n'ait pas à les rechercher.
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
