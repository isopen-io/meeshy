# Iteration 133 — Plan d'implémentation (2026-07-08)

## Objectif
Fermer **F99** : agréger la perte de paquets sur tous les flux `inbound-rtp` dans `useCallQuality` au lieu
d'écraser la valeur au dernier flux itéré.

## Modules affectés
- `apps/web/hooks/use-call-quality.ts` (production, 1 fonction : `updateStats`)
- `apps/web/__tests__/hooks/use-call-quality.test.ts` (1 test de régression)

## Phases
1. **RED** — ajouter un test à deux rapports `inbound-rtp` (audio 20/80 lossy + vidéo 0/100 saine) et
   asserter `packetLoss === 10` + `level === 'poor'`. Échoue sur l'ancien code (renvoie 0 → `excellent`).
2. **GREEN** — remplacer `let packetLoss = 0` + réassignation par accumulateurs `totalPacketsLost` /
   `totalPacketsReceived` (comme `bytesReceived`), calcul du ratio global après la boucle.
3. **REFACTOR** — commentaire alignant explicitement la perte de paquets sur le pattern d'accumulation
   des octets.

## Dépendances
Aucune. Fix confiné, sans changement d'API ni de type.

## Risques estimés
Très faibles. Comportement mono-flux inchangé (Σ = unique rapport). Aucun autre appelant de
`calculateQualityLevel` que `updateStats`.

## Stratégie de rollback
Revert du commit unique (git). Aucune migration, aucun état persistant modifié.

## Critères de validation
- Suite `use-call-quality.test.ts` verte (nouveaux + existants).
- `type-check` / lint web OK sur le fichier modifié.
- Forme de `ConnectionQualityStats` inchangée.

## Statut de complétion
- [x] Analyse écrite (`docs/routine/analyses/2026-07-08-iteration-133-analyse.md`)
- [x] Plan écrit
- [x] RED test ajouté
- [x] GREEN implémenté
- [ ] Suite verte (validation locale)
- [ ] Commit + push + PR

## Suivi de progression
Zone "mentions" strictement évitée (PR humaine #1644 en vol, F95/iter 132).

## Améliorations futures
- **F97** : alias `t.model`/`t.fromCache` dans le dedup de `use-message-translations.ts` (dès qu'un
  consommateur de production existe).
- **F98** : sémantique jour d'une fenêtre DND nocturne dans `NotificationService.isDNDActive`.
- Envisager d'agréger aussi le `jitter` (actuellement écrasé au dernier flux) via un `max` — moins
  critique car le jitter n'alimente pas le niveau de qualité, seulement l'affichage.
