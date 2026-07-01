# Iteration 73 — Plan d'implémentation (2026-07-01)

## Objectif
Éliminer la duplication du bucketing « temps écoulé » dans l'UI admin/agent en convergeant vers la source
unique `classifyRelativeTime` (`@meeshy/shared`), via un helper web unique et testé. Zéro régression.

## Modules affectés
- **Nouveau** : `apps/web/utils/agent-time-format.ts` (`formatAgentTimeAgo`, `formatAgentTimeAgoShort`)
- **Nouveau** : `apps/web/utils/__tests__/agent-time-format.test.ts`
- **Modifiés** (suppression fonction locale + délégation) :
  - `apps/web/components/admin/agent/AgentOverviewTab.tsx`
  - `apps/web/components/admin/agent/AgentConversationsTab.tsx`
  - `apps/web/components/admin/agent/AgentMessagesModal.tsx`
  - `apps/web/components/admin/agent/AgentLiveTab.tsx`
  - `apps/web/components/admin/agent/ScanLogTable.tsx`

## Phases
1. **[fait]** Créer le helper pur backé par `classifyRelativeTime` (2 familles de rendu, `nullLabel` paramétrable).
2. **[fait]** Écrire la suite de tests (10 cas, `Date.now` mocké).
3. **[fait]** Câbler les 5 composants en préservant chaque `nullLabel` d'origine.
4. **[fait]** Valider : tsc (0 erreur source), jest ciblé (746 tests admin/agent + 10 helper).
5. **[fait]** Documenter (analyse + plan), commit, push.

## Dépendances
- `@meeshy/shared` build (`dist/utils/relative-time.js`) — présent après `bun run build`.

## Risques & mitigation
- **Divergence de valeurs** au passage manuel → SSOT : neutralisé par l'identité entière
  `floor(floor(diff/60000)/60) === floor(diff/3600000)` + tests de borne d'heure (59 min/60 min).
- **Perte du `nullLabel` spécifique** (`'-'` pour Conversations) : préservé via l'option `nullLabel`.
- **Cas date invalide (NaN)** : ancien rendu « … NaN … » → nouveau `nullLabel` (amélioration, cas hors données réelles).

## Stratégie de rollback
Revert du commit unique (self-contained, 7 fichiers, aucune migration ni changement d'API publique/i18n).

## Critères de validation
- [x] `utils/__tests__/agent-time-format.test.ts` : 10/10.
- [x] 27 suites `__tests__/components/admin/agent/**` : 746/746 verts.
- [x] `tsc --noEmit` : 0 erreur nouvelle dans les fichiers source touchés.
- [x] Aucune clé i18n ajoutée/supprimée (rendu identique).
- [ ] CI verte (gate final — lint + build bun).

## Statut : COMPLET (sous réserve CI verte)

## Améliorations futures (backlog)
- N1 : converger `formatDate`/`Intl.DateTimeFormat` des ranking cards + user-detail admin vers `date-format.ts`.
- F34 : exporter `isValidUrl` depuis `xss-protection.ts` (2-3 sites `try{new URL()}catch`).
- Étendre `agent-time-format` si d'autres vues admin réintroduisent un bucketing manuel.
