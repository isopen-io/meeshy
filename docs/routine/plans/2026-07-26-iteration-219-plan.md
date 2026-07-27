# Plan d'implémentation — Iteration 219

## Objectifs
Rendre `Message.originalLanguage` **canonique par construction** sur les 2 chemins d'envoi share-link
(`routes/links/messages.ts:196` anonyme, `:445` enregistré), en fermant le dernier write boundary de
langue hors funnel `MessagingService` (legs explicite de l'itération 218).

## Modules affectés
- `services/gateway/src/routes/links/types.ts` — schéma Zod `sendMessageSchema` (write boundary partagé).
- `services/gateway/src/__tests__/unit/routes/links/types.test.ts` — tests RED→GREEN.

## Phases
1. **RED** — Ajouter 2 tests à `types.test.ts` :
   - canonicalisation des locales région-taggés (`fr-FR`/`fr_FR`/`FR`/`en-US`/`zh-Hant-HK`).
   - préservation verbatim des codes irréductibles (`bas`, `xx`).
2. **GREEN** — `types.ts` : importer `normalizeLanguageCode`, ajouter `.transform((v) => normalizeLanguageCode(v) ?? v)`
   sur `originalLanguage` (après `.default('fr')`).
3. **Validation** — `types.test.ts` 32/32 ; `routes/links/**` 229/229 ; RED prouvé par stash du fix.

## Dépendances
Aucune. `normalizeLanguageCode` déjà exporté sur `main` et consommé par 6 fichiers gateway.

## Risques estimés
Très faible (cf. analyse §Risk assessment). Placement schéma = SSOT partagé, repli verbatim, idempotent.

## Stratégie de rollback
Revert du commit unique — changement isolé à 2 fichiers, aucune migration, aucun impact sur les
lignes existantes (idempotent sur `'fr'`).

## Critères de validation
- RED : `'fr-FR'` conserve `'fr-FR'` sans fix (1 failed / 31 passed). ✅
- GREEN : suite `types.test.ts` 32/32. ✅
- Non-régression : `routes/links/**` 229/229. ✅

## Statut de complétion
**Terminé** — RED prouvé, GREEN vert, non-régression verte, docs écrites.

## Suivi de progression
- [x] Audit anti-doublon PRs ouvertes
- [x] Audit legs 218 (édition écartée, share-link confirmés)
- [x] RED (2 tests)
- [x] GREEN (transform schéma)
- [x] Validation (32/32 + 229/229)
- [x] Analyse + plan
- [ ] Commit + push + PR

## Améliorations futures
Voir analyse §Future Considerations (migration historique, prefs in-app, attachements share-link).
# Plan d'implémentation — Itération 219

## Objectifs
Étendre la canonicalisation de `Message.originalLanguage` (218i) aux **3 write boundaries restants**
hors funnel `MessagingService.handleMessage` : l'édition REST et les 2 chemins d'envoi via lien
partagé. Rendre la base auto-cohérente quel que soit le point d'entrée.

## Modules affectés
- `services/gateway/src/routes/conversations/messages-advanced.ts` — import + édition REST (`message.update`).
- `services/gateway/src/routes/links/messages.ts` — import + 2 `message.create` (anon + auth).
- `services/gateway/src/__tests__/unit/routes/conversation-messages-advanced.test.ts` — 2 tests.
- `services/gateway/src/__tests__/unit/routes/links-messages.test.ts` — 3 tests.

## Phases
1. **RED** — 3 tests « canonicalize a region-tagged claim » : édition `'fr-FR'` → `'fr'`, lien anon
   `'en-US'` → `'en'`, lien auth `'pt-BR'` → `'pt'` (échouent tant que la valeur est persistée verbatim).
2. **GREEN** — `normalizeLanguageCode(x) ?? x` sur les 3 sites d'écriture.
3. **Non-régression** — 2 tests « keep an irreducible claim verbatim » (`'bas'` → `'bas'`) édition + lien anon.
4. **Validation** — jest suites ciblées + smoke messaging/links/conversations, tsc gateway `--noEmit`.

## Dépendances
Aucune. `normalizeLanguageCode` est **déjà exporté sur `main`** (`@meeshy/shared/utils/language-normalize`)
et déjà consommé par `MessagingService` (218i) et `MessageTranslationService`. Jest gateway mappe
`@meeshy/shared/*` → source → pas de rebuild `dist`.

## Risques estimés
Faible — repli verbatim pour les codes irréductibles (zéro perte, zéro round-trip ajouté) ; idempotent
sur les codes canoniques (tests existants intacts) ; le chemin socket d'édition n'écrit pas
`originalLanguage` (hors périmètre, inchangé).

## Stratégie de rollback
Revert du commit unique. Aucune migration de données, aucune écriture de schéma. Les lignes historiques
restent couvertes par la défense au read (216i).

## Critères de validation
- édition `'fr-FR'` → `update` `originalLanguage: 'fr'` ; lien anon `'en-US'` → `create` `'en'` ;
  lien auth `'pt-BR'` → `create` `'pt'`.
- `'bas'` → `'bas'` (édition + lien anon) ; `'fr'` inchangé.
- suites `conversation-messages-advanced` + `links-messages` vertes (132 tests) ; smoke 34 suites /
  554 tests vert ; tsc gateway sans nouvelle erreur.

## Statut de complétion
✅ **Complété** — RED prouvé (revert temporaire des 2 sources → 3 tests de canonicalisation rouges,
2 irréductibles verts), GREEN vert, non-régression validée sur la surface gateway testable.

## Suivi de progression
- [x] Import `normalizeLanguageCode` (messages-advanced + links/messages)
- [x] Canonicalisation édition REST (`message.update`)
- [x] Canonicalisation lien anonyme (`message.create`)
- [x] Canonicalisation lien authentifié (`message.create`)
- [x] 3 tests RED de canonicalisation prouvés rouges (revert temporaire)
- [x] 2 tests non-régression irréductible (`'bas'` → `'bas'`)
- [x] Suites ciblées 132/132 vertes + smoke 554/554 verts
- [x] tsc gateway : 0 nouvelle erreur (seule `sanitize.ts` pré-existante subsiste)
- [x] Commit + push

## Améliorations futures
- Migration idempotente des `Message.originalLanguage` historiques région-taggés (batch).
- Convergence write-boundary des préférences in-app (`systemLanguage` & co).
- Audit d'un éventuel write de `participant.language` verbatim au join anonyme via lien.
