# Plan d'implémentation — Itération 219

## Objectifs
Canonicaliser `Message.originalLanguage` sur les **trois chemins d'écriture qui contournent le funnel**
`MessagingService.handleMessage` (déjà canonique depuis 218) : envoi share-link anonyme, envoi share-link
authentifié, et édition REST. Rendre la base homogène sur 100 % des surfaces d'envoi/édition.

## Modules affectés
- `services/gateway/src/routes/links/messages.ts` (2 handlers, 2 `message.create`)
- `services/gateway/src/routes/conversations/messages-advanced.ts` (édition REST, 1 `message.update` + source retraduction)
- Tests : `links-messages.test.ts`, `conversation-messages-advanced.test.ts`

## Phases
1. **RED** — Ajouter 4 tests :
   - links anon : `'fr-FR'` → `create` avec `originalLanguage: 'fr'`.
   - links anon : `'bas'` → `create` avec `'bas'` (non-régression irréductible).
   - links auth : `'en_US'` → `create` avec `'en'`.
   - édition REST : `'fr-FR'` → `update` avec `'fr'`.
2. **GREEN** — Importer `normalizeLanguageCode` ; normaliser au write dans les 3 sites via
   `normalizeLanguageCode(claim) ?? claim` (repli identique au funnel 218).
3. **REFACTOR** — Aucun (changement minimal, aligné sur le pattern 218).

## Dépendances
- `@meeshy/shared/utils/language-normalize` (`normalizeLanguageCode`) — déjà exporté sur `main`, déjà
  consommé par `MessagingService` (218) et `MessageTranslationService`. Aucune nouvelle dépendance.

## Risques estimés
Faible. Repli verbatim pour les codes irréductibles ; idempotent sur les codes déjà canoniques ; aucun
chemin de lecture modifié ; aucun round-trip réseau ajouté.

## Stratégie de rollback
Revert du commit unique (2 fichiers source + 2 fichiers de test). Aucune migration de données, aucun
changement de schema Prisma, aucun changement d'API contractuel.

## Critères de validation
- 131/131 sur les 2 suites ciblées (GREEN).
- RED prouvé par `git stash` de la source (3 tests échouent, `'bas'` reste vert).
- Suite gateway complète sans régression.

## Completion status
- [x] Analyse rédigée
- [x] Tests RED ajoutés + RED prouvé
- [x] Implémentation GREEN (3 sites)
- [x] Schema Prisma vérifié inchangé au commit
- [ ] Suite gateway complète verte
- [ ] Commit + push + merge

## Progress tracking
Itération 219 = extension directe de 218. 218 a couvert le funnel ; 219 couvre les 3 chemins hors funnel.
Le triptyque write-boundary (funnel + share-links + édition REST) est désormais complet côté messages.

## Future improvements
Voir « Future Considerations » de l'analyse : migration historique batch, convergence
`CommonSchemas.language` via `.transform`, audit posts/commentaires, préférences in-app.
