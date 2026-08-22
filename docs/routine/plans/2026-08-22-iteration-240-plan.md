# Plan Iteration 240 — Collapse de l'espace orphelin d'un token vide dans `interpolate`

## Objectifs
Fermer, à la source unique et pour les 8 langues, le double espace produit par une
réaction sans emoji dans les titres de notification (persistés + expédiés REST /
Socket.IO / push).

## Modules affectés
- `packages/shared/utils/notification-strings.ts` — `interpolate` (pure).
- `packages/shared/__tests__/utils/notification-strings.test.ts` — témoins.
- `CHANGELOG.md`.

## Phases d'implémentation
1. **RED** — ajouter les témoins du chemin sans emoji (8 langues + consommateur
   `buildNotificationDisplay` + non-régression emoji présent + préservation du
   contenu utilisateur à double espace). ✅ 4 tombent sur le code d'avant.
2. **GREEN** — regex `( ?)\{(\w+)\}( ?)` capturant l'espace flanquant ; collapse
   uniquement si valeur vide ; `lead + value + tail` sinon. ✅
3. **REFACTOR** — commentaire d'intention (voisinage / contexte imbriqué). ✅
4. **VALIDATION** — vitest shared complet, jest gateway consommateurs, tsc, grep
   anti-pin, probe empirique du dist. ✅

## Dépendances
Aucune. Fonction pure sans I/O.

## Risques estimés
- **Régression du `{context}` imbriqué** (valeurs `COMMENT_CONTEXT` à espace-en-tête).
  Mitigé : pas de `.trim()`, collapse limité au token vide. Couvert par témoin
  `reaction.commentVerbose ... sur le post de Bob`.
- **Mutation du contenu utilisateur.** Mitigé : valeur non vide inchangée. Couvert
  par témoin `Jean  Dupont`.

## Stratégie de rollback
`git revert` du commit — fonction pure isolée, aucune migration, aucun changement
de contrat client (formes de chaînes uniquement, strictement mieux formées).

## Critères de validation
Voir analyse § « Validation criteria ». Tous verts.

## Statut de complétion
**COMPLET.** RED→GREEN prouvé, full shared vert (98/2370), consommateurs gateway
verts (63 suites / 1461 tests), tsc vert.

## Suivi de progression
- [x] Analyse rédigée
- [x] RED
- [x] GREEN
- [x] Validation complète
- [x] CHANGELOG
- [ ] Commit + push + merge main

## Améliorations futures
- zh sans emoji : espace unique résiduel (refonte templates par-langue — décision produit).
- Gateway `PostCommentService.likeComment` purge multi-réactions (test-pinné — décision produit).
- Runner-ups agent : `MentionService` self-mention en groupe, `buildCursorPaginationMeta`
  `hasMore === limit` (faible impact, documentés).
</content>
