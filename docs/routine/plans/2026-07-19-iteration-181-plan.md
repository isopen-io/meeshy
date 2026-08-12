# Plan d'implémentation — Itération 181

## Objectifs
Aligner `generateDefaultConversationTitle` (`packages/shared/utils/conversation-helpers.ts`)
sur l'ordre de priorité CANONIQUE du nom d'affichage
(`displayName → firstName+lastName → username`), identique à `getUserDisplayName`
(web) et au snapshot gateway `MessagingService`. Supprimer la duplication de la
résolution de nom.

## Modules affectés
- `packages/shared/utils/conversation-helpers.ts` (impl)
- `packages/shared/__tests__/conversation-helpers.test.ts` (tests)

## Phases
1. **RED** — +5 tests sur le cas conflictuel (`username` + `firstName/lastName`
   présents) : nom complet prioritaire sur username (1 & multi membres),
   `displayName` reste au sommet, repli username quand nom complet blanc.
2. **GREEN** — extraire `resolveMemberName` (ordre canonique, blank-aware) ;
   déléguer les 3 branches (1 / 2 / 3+ membres) à ce helper.
3. **REFACTOR** — comment JSDoc du helper + repositionnement du JSDoc de la fonction.

## Dépendances
Aucune (fonction pure, sans dépendance externe modifiée).

## Risques estimés
Très faible. Callers gateway (`core.ts`, `search.ts`) fournissent déjà
`firstName`/`lastName`. Tests de routes gateway mockent la fonction → non impactés.

## Stratégie de rollback
`git revert` du commit — changement isolé à un fichier d'impl + son test.

## Critères de validation
- `conversation-helpers.test.ts` 84/84 ; suite shared 46/1368 ; `bun run build` OK.

## Statut de complétion
✅ Complété. RED→GREEN vérifié (l'ancien ordre renvoyait `jdoe123`, le nouveau
`John Doe`). Suite complète verte, build tsc OK.

## Suivi / Améliorations futures
Voir section Backlog de l'analyse 181 (random suffix 6-char, date-format futur,
avatar user-first dans CallEventsHandler).
# Plan — Iteration 181 : borner le cache de debounce du middleware `deviceLocale`

## Objectifs
Supprimer la fuite mémoire non bornée du cache de debounce
(`lastUpdateByUserId`) en garantissant par construction une empreinte ≤
`MAX_TRACKED_USERS`, sans changer le comportement de debounce sous charge
nominale.

## Modules affectés
- `services/gateway/src/middleware/deviceLocale.ts` (production)
- `services/gateway/src/__tests__/unit/middleware/deviceLocale.test.ts` (tests)

## Phases d'implémentation
1. **RED** — 3 tests d'éviction (cap franchi → purge des expirées ; toutes
   fraîches → borne dure ; sous plafond → pas de purge). Seams de test
   `_deviceLocaleCacheSize` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
2. **GREEN** — `MAX_TRACKED_USERS` + `pruneStaleDebounceEntries(now)` (sweep
   expirées puis borne dure FIFO) ; garde amortie sur le chemin d'écriture.
3. **REFACTOR** — docstrings ; aucune duplication introduite.

## Dépendances
Aucune (constantes locales, `Map` native).

## Risques estimés
Très faible : purge limitée aux entrées expirées (préservation stricte) ;
plafond dur uniquement en cas pathologique (>10k users/5 min → 1 update
idempotente en trop). Coût O(n) amorti, hors hot path nominal.

## Stratégie de rollback
Revert du commit unique — le middleware retrouve son comportement précédent
(fuite lente incluse) sans effet de bord.

## Critères de validation
- `deviceLocale.test.ts` : 17/17 verts.
- `tsc --noEmit` : 0 nouvelle erreur.

## Statut de complétion
- [x] Phase 1 RED
- [x] Phase 2 GREEN
- [x] Validation — `deviceLocale.test.ts` **17/17** verts ; `tsc --noEmit`
      gateway : 0 erreur sur `deviceLocale.ts` (seule erreur résiduelle
      `sanitize.ts`/`@meeshy/shared` = dist shared non buildée, environnementale
      et préexistante, sans lien avec ce changement).
- [x] Commit + push

## Améliorations futures
- Étendre la purge amortie aux autres caches de processus non bornés du
  gateway s'il en existe (audit dédié).
- Backlog inchangé (voir analyse 181).
