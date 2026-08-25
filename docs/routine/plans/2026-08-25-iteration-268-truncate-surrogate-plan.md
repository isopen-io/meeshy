# Itération 268 — Plan : troncature sûre aux points de code

## Objectifs
Empêcher `SecuritySanitizer.truncate` d'émettre un substitut UTF-16 orphelin quand
la coupe tombe au milieu d'une paire (émoji / hors-BMP).

## Modules affectés
- `services/gateway/src/utils/sanitize.ts` — `SecuritySanitizer.truncate`
- `services/gateway/src/__tests__/unit/utils/sanitize.test.ts` — témoins

## Phases
1. **RED** — ajouter 3 témoins (coupe qui splitte un émoji ; contenu mixte ;
   coupe propre sur frontière = non-régression). Prouver le ROUGE. ✅
2. **GREEN** — reculer d'une unité sur substitut haut. ✅
3. **Validation** — suite complète `sanitize.test.ts` + `tsc --noEmit`. ✅

## Dépendances
Aucune.

## Risques estimés
Très faible (voir analyse) — comportement modifié uniquement sur une sortie
aujourd'hui invalide ; toute entrée ASCII/BMP rendue à l'identique.

## Stratégie de rollback
Revert du commit unique — leaf utility sans appelant de production.

## Critères de validation
- Témoin ROUGE prouvé, puis VERT.
- 204/204 `sanitize.test.ts`.
- `tsc --noEmit` gateway = 0.

## État d'achèvement
**Terminé.**

## Suivi / améliorations futures
- Troncature GRAPHÈME-consciente (ZWJ, marques combinantes) via `Intl.Segmenter`
  si un appelant de production a besoin d'un rendu visuel exact. Non requis tant
  que la seule garantie visée est « UTF-16 valide ».
- `compareAppVersions` (`utils/appVersion.ts`) est borné à 3 composantes et coerce
  les segments non numériques via `|| 0` : à revisiter SI l'en-tête `X-App-Version`
  se met à porter une 4e composante ou un tag pré-version (déclencheur non confirmé
  à ce jour — ne pas corriger sans mesure).
