# Itération 270 — Plan : porter la FRONTIÈRE DE JOUR dans le miroir web du regroupement de bulles

## Objectifs

Aligner `apps/web/utils/message-grouping.ts` sur la règle canonique de tête de
groupe (iOS `MessageDayGrouping.continues`, Rivière partagée `river-lanes.continues`)
en y ajoutant la troisième condition manquante : **même jour calendaire local**.
Corriger le symptôme (identité masquée sur la première bulle sous une capsule de
date) sur les DEUX vues web consommatrices (Focal et Bulles).

## Modules affectés

- `apps/web/utils/message-grouping.ts` — la règle (`GroupableMessage`, `continuent`).
- `apps/web/components/conversations/focal/focal-row-utils.ts` — l'adaptateur
  `isFirstInFocalGroup` descend `createdAt`.
- Consommateurs bénéficiant sans changement (passent déjà un `Message` complet) :
  `FocalRow.tsx` (Focal), `messages-display.tsx` (Bulles).
- Tests : `__tests__/utils/message-grouping.test.ts`,
  `components/conversations/focal/__tests__/focal-row-utils.test.ts`.

## Phases

1. **Règle** — `GroupableMessage` porte `createdAt` (requis) ; `continuent` ajoute
   `memeJour` via `startOfLocalDayMs` (`@meeshy/shared/utils/calendar-date`). ✅
2. **Adaptateur** — `isFirstInFocalGroup` descend `createdAt` (Pick étendu). ✅
3. **Tests** — cas « même auteur, jour différent → ouvre un groupe » ajoutés aux
   deux suites ; factories mises à jour avec `createdAt` (Date pour la vue Focal,
   chaîne locale pour le miroir). ✅
4. **Validation** — tsc propre sur les fichiers modifiés, jest vert. ✅

## Dépendances

`startOfLocalDayMs` (déjà exporté, déjà consommé par la capsule de date et
`date-format.ts`). Aucune nouvelle dépendance.

## Risques estimés

Faible. Le correctif ne peut que RESTREINDRE la continuité — il révèle des
en-têtes d'identité là où la règle canonique l'exige, jamais n'en masque.
`createdAt` requis force chaque appelant à fournir l'horodatage (verrou
anti-régression), et les deux appelants réels passent déjà un `Message` complet.

## Stratégie de rollback

Revert du commit unique. Aucun changement de schéma, de contrat réseau ou de
persistance ; changement purement client, pur, testé.

## Critères de validation

- `npx jest components/common/__tests__/messages-display.test.tsx components/conversations/focal`
  → 14 suites / 142 tests verts ; `__tests__/utils/message-grouping.test.ts` +
  `focal-row-utils.test.ts` → 2 suites / 41 tests verts. ✅
- `npx tsc --noEmit` → zéro NOUVELLE erreur sur les fichiers touchés (les 17
  erreurs pré-existantes de `messages-display.tsx` sont hors périmètre). ✅

## Statut

**Terminé.** Prêt au merge.

## Améliorations futures

- Le miroir Android `MessageGrouping.kt` (nommé par le doc-comment iOS) reste à
  vérifier séparément — hors périmètre de cette itération web-only.
- Les 17 erreurs tsc pré-existantes de `messages-display.tsx` (casts
  `as unknown` massifs) méritent une passe de typage dédiée.
