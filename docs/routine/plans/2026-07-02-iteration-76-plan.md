# Iteration 76 — Plan d'implémentation (2026-07-02)

## Objectifs
Borner le `identityCache` de `StatusHandler` (gateway) pour éliminer une croissance mémoire non
bornée sur le hot path `typing:*`, en réutilisant les 2 idiomes de cache borné déjà établis dans
le codebase (balayage périodique du `typingThrottleMap`, borne FIFO du `conversationIdCache`).

## Modules affectés
- `services/gateway/src/socketio/handlers/StatusHandler.ts` (prod)
- `services/gateway/src/__tests__/unit/handlers/StatusHandler.test.ts` (tests)

## Phases d'implémentation
1. **Constante** — `IDENTITY_CACHE_MAX_SIZE = 5000`. ✅
2. **Balayage périodique** — timer 30 s existant → `_evictStale()` = throttle + identités expirées ;
   `_evictExpiredIdentities()` supprime `expiresAt <= now`. ✅
3. **Borne FIFO à l'écriture** — `_cacheIdentity()` (balaie expirées, sinon évince la plus ancienne,
   puis `set` avec TTL) ; les 2 sites `.set` inline délèguent. ✅
4. **Tests** — balayage périodique vide la Map après TTL+tick ; borne FIFO tient à 5000 et évince
   la plus ancienne. ✅

## Dépendances
Aucune. Fix isolé, 0 nouvelle dépendance, 0 API publique modifiée.

## Risques estimés
Faible. Comportement fonctionnel inchangé (TTL fraîcheur + `invalidateIdentityCache` préservés).
Balayage n'évince que des entrées déjà expirées ; borne FIFO n'agit qu'au-delà de 5000 identités
fraîches simultanées.

## Stratégie de rollback
`git revert` du commit — 1 fichier prod + 1 fichier test, sans migration ni changement de contrat.

## Critères de validation
- [x] `StatusHandler.test.ts` : 23/23.
- [x] `src/__tests__/unit/handlers/` : 234/234, 0 régression.
- [x] ts-jest compile sans erreur.

## Statut d'achèvement
**COMPLET.** Implémenté + validé. Prêt à merger (attendre que `main` repasse vert via PR #1336).

## Suivi / améliorations futures
- Le `typingThrottleMap` a une garde de taille (`TYPING_THROTTLE_CLEANUP_SIZE`) déclenchée à
  l'écriture ; `identityCache` s'appuie sur balayage périodique + borne FIFO à l'écriture — pattern
  équivalent, pas de garde de taille redondante nécessaire.
- Follow-ups realtime consignés (F41, F43) et F2/F31 — voir l'analyse iter 76.
</content>
