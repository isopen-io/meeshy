/**
 * L'indice de route que les QUATRE notifications de réengagement transportent
 * (`metadata.route`, projeté en `data.route` sur le fil push) : l'écran
 * « Progression », qui RESTITUE le palier annoncé. Un client qui sait naviguer
 * par nom de route (iOS `pushNavigateToRoute`, la v3.1 web) le suit tel quel ;
 * un client qui route par TYPE de notification n'a rien à lire ici.
 *
 * Module à part pour que les séries (`EngagementStreaks`) et le service le
 * partagent sans s'importer l'un l'autre.
 */
export const ENGAGEMENT_ROUTE = 'progression';
