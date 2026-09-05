# Plan — Itération 288 : source unique pour le plafond du lot d'impressions

## Objectifs
Éliminer la jumelle divergente du plafond de `POST /posts/impressions/batch`
(schéma `maxItems: 100` vs garde interne `.slice(0, 50)`) qui tronquait
silencieusement tout lot de 51 à 100 ids valides. Une seule constante gouverne
le schéma ET la garde.

## Modules affectés
- `services/gateway/src/routes/posts/impressions.ts` (constante + schéma)
- `services/gateway/src/__tests__/unit/routes/posts/interactions-consumption-audience.test.ts` (témoin neuf)
- `services/gateway/src/__tests__/unit/routes/posts/interactions.test.ts` (témoins alignés)
- `services/gateway/src/__tests__/unit/routes/posts/interactions-extended.test.ts` (témoin aligné)

## Phases
1. RED : témoin « lot de 60 ids admis ⇒ recorded 60 » — échoue contre le cap 50.
2. GREEN : `IMPRESSION_BATCH_CAP = 100`, `maxItems: IMPRESSION_BATCH_CAP`.
3. Aligner les deux témoins existants qui codifiaient la troncature à 50
   (dont un devient « refus 400 au-delà du cap » — le schéma refuse, ne tronque plus).

## Dépendances
Aucune. Fonction de route pure côté serveur ; aucun client ne dépend de la borne
50 (un écran de fil observe quelques dizaines de posts par salve).

## Risques estimés
Très faible. Additif : 1..50 inchangé, 51..100 désormais complet, 101+ refusé
explicitement (400) au lieu d'une troncature muette.

## Stratégie de rollback
Revert du commit unique. Aucune migration, aucun état persistant modifié.

## Critères de validation
- `tsc --noEmit` gateway EXIT=0.
- 739/739 posts routes, 141/141 security + budget.
- `unbounded-findmany-guard` (« plafonne a 100 ») vert.

## Statut de complétude
LIVRÉ. Constante unifiée, schéma dérivé, trois témoins alignés/ajoutés, RED prouvé.

## Suivi / améliorations futures
- Balayage possible : d'autres routes déclarent-elles un `maxItems` de schéma
  qui diverge d'une garde `.slice()` interne ? (même patron jumelle borne
  déclarée ↔ borne appliquée). Candidat d'itération future si mesuré non vide.
