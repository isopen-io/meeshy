/**
 * **LA BANDE SOUS L'EN-TÊTE, ET CE QU'ELLE COÛTE À LA PASTILLE** (#6401, #6387).
 *
 * `.sync-pill` (`styles/app.css`) posait la pastille à 72 px du haut — le bas
 * mesuré de l'en-tête de LISTE (64 px) plus les 8 px d'air d'iOS
 * (doc-comment de `components/sync-pill.tsx`). C'est juste pour tout écran
 * qui ne porte QUE cet en-tête.
 *
 * Quatre écrans en portent un SECOND, sous le premier — mesurés dans leurs
 * propres modules : les onglets de `/discover` (`DISCOVER_TABS_HEIGHT`, 52),
 * le rail de `/calls` (`CALLS_RAIL_HEIGHT`, 52) et de `/notifications`
 * (`NOTIFICATIONS_RAIL_HEIGHT`, 52), la recherche de `/communities`
 * (`COMMUNITIES_SEARCH_HEIGHT`, 56) — chacun fermant sa bande entre 116 et
 * 120 px. La pastille, posée à 72 (hauteur ≈ 27), tombe en PLEIN milieu de
 * cette bande sur les quatre : hors ligne, elle en recouvre le centre — un
 * onglet, un filtre ou le champ de recherche — tant que la coupure dure.
 *
 * `72` reste juste pour ces quatre écrans une fois qu'on descend sous la
 * bande la plus basse (120, `/communities`) : `128` (120 + 8 d'air) les
 * dégage toutes les quatre à la fois, sans recalculer une cote par écran —
 * même choix que `floating-corridor.ts`, qui partage `126` entre des bandes
 * de hauteurs voisines plutôt qu'une valeur par route. Sur-dégager de 4 px
 * trois des quatre écrans est le sens SÛR de l'erreur (« le chrome gagne — un
 * contrôle recouvert est un contrôle qu'on ne peut plus lire, alors qu'une
 * annonce posée 8 pt plus bas reste parfaitement visible », déjà la doctrine
 * de la pose de cette pastille) ; sous-dégager en recouvre le centre.
 *
 * La liste est FERMÉE, comme celle de `floating-gate.ts` : un écran ajouté
 * demain qui porterait une bande sous son en-tête ne dégagerait pas la
 * pastille sans qu'on l'ait décidé — l'inverse d'une liste d'exclusions, qui
 * masquerait un recouvrement neuf en silence.
 */
const ROUTES_WITH_SECOND_BAND: ReadonlySet<string> = new Set(['discover', 'calls', 'communities', 'notifications']);

/** Le défaut — le bas de l'en-tête de liste (64) plus les 8 px d'air d'iOS. */
export const SYNC_PILL_TOP_DEFAULT = 72;

/** Le bas de la bande la plus basse mesurée (`/communities`, 120) plus les 8 px d'air. */
export const SYNC_PILL_TOP_BAND = 128;

export function syncPillTop(routeKey: string): number {
  return ROUTES_WITH_SECOND_BAND.has(routeKey) ? SYNC_PILL_TOP_BAND : SYNC_PILL_TOP_DEFAULT;
}
