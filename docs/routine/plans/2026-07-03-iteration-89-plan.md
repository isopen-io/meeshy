# Iteration 89 — Plan d'implémentation (2026-07-03)

## Objectives
Propager la locale appareil (`deviceLocale`, 4e priorité du Prisme Linguistique — extension
2026-05-26) aux **deux derniers** call sites de `resolveUserLanguage` côté gateway qui l'ignoraient
encore, afin que la résolution de langue soit **identique sur tous les chemins** (REST, socket,
notifications).

## Affected modules
- `services/gateway/src/routes/conversations/messages.ts` — `select` de `userPrefs` (+`deviceLocale`)
  et appel `resolveUserLanguage` du hot-path `GET /conversations/:id/messages` (`meta.userLanguage`).
- `services/gateway/src/middleware/auth.ts` — appel `resolveUserLanguage` (`UnifiedAuthContext.userLanguage`).
- `services/gateway/src/__tests__/unit/middleware/auth.test.ts` — 3 tests neufs.
- `services/gateway/src/__tests__/unit/routes/messages-list-language.test.ts` — fichier neuf (3 tests).

## Implementation phases
1. **RED** — tests neufs :
   - `auth.test.ts` : user prefs in-app toutes `null` + `deviceLocale: 'en-US'` →
     `ctx.userLanguage === 'en'` (échoue : retourne 'fr').
   - `messages-list-language.test.ts` : inject `GET /conversations/:id/messages`, `userPrefs` prefs
     in-app `null` + `deviceLocale: 'en-US'` → `meta.userLanguage === 'en'` (échoue : 'fr').
   - Gardes (passent avant/après) : `deviceLocale` ne supplante pas `systemLanguage` ; fallback 'fr'.
   Vérifié : les 2 cas `deviceLocale` échouent sans le fix prod (RED prouvé), gardes vertes.
2. **GREEN** — 3 lignes prod :
   - `messages.ts` : `deviceLocale: true` dans le select + `resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })`.
   - `auth.ts` : `resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })`.
3. **REFACTOR** — aucun (change minimal, aligné sur le pattern existant `NotificationService`).

## Dependencies
Aucune. `resolveUserLanguage` accepte déjà `{ deviceLocale }` (shared). `User.deviceLocale` existe au
schema (l.120) et est indexé. `auth.ts` charge déjà `deviceLocale` (select l.249) — zéro requête
nouvelle. `messages.ts` embarque `deviceLocale` dans la requête `user.findFirst` déjà émise.

## Estimated risks
TRÈS FAIBLE. La 4e priorité ne se déclenche que si `systemLanguage`/`regionalLanguage`/
`customDestinationLanguage` sont toutes vides ; comportement inchangé sinon.

## Rollback strategy
Revert du commit (4 fichiers). Aucune migration, aucun état persistant.

## Validation criteria
- [x] `auth.test.ts` + `messages-list-language.test.ts` : verts (6 tests neufs, RED→GREEN prouvé).
- [x] RED prouvé : sans le fix, les 2 tests `deviceLocale` retournent 'fr' au lieu de 'en'.
- [x] `tsc --noEmit` gateway : 0 erreur.
- [x] Suites `auth|messages|deviceLocale|NotificationService.i18n` : 36 suites / 1043 tests verts, 0 régression.

## Completion status
✅ **COMPLÉTÉ** — implémenté, testé (RED→GREEN), tsc propre, prêt à merger.

## Progress tracking
- [x] Analyse rédigée (`…-iteration-89-analyse.md`).
- [x] Plan rédigé (ce fichier).
- [x] RED → GREEN → validation.
- [ ] Commit + push.

## Future improvements
- **F51** : supprimer/fusionner `FirebaseNotificationService` (dead code FCM parallèle).
- **F49/F50** : résidus lost-update in-process sur caches stats (auto-guéris par TTL).
