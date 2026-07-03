# Iteration 89 — Analyse d'optimisation (2026-07-03)

## Protocole (démarrage)
`main` @ `cfd152ab` (« android/calls auto-dismiss call-waiting banner » — HEAD au démarrage).
Branche de travail `claude/brave-archimedes-yc8t7h` alignée sur `origin/main` (working tree
propre, aucun commit non-mergé à préserver).

PR ouverte au démarrage : #1410 (iOS Dynamic Type `MoodReplyConfirmationOverlay`, fichier
`StatusBubbleController.swift`). Cible retenue **hors de ce fichier** (aucun conflit de merge
attendu) et **côté gateway TypeScript** — validable en local (RED→GREEN), contrairement aux
changements iOS qui nécessitent un toolchain macOS absent de cet environnement.

## Cible : propager `deviceLocale` (Prisme 4e priorité) aux 2 derniers points de résolution de langue côté gateway

### Current state
L'extension du Prisme Linguistique du **2026-05-26** (`docs/superpowers/plans/2026-05-26-device-locale-fourth-priority-plan.md`)
a ajouté la **locale appareil en 4e priorité** de la résolution de langue :
`systemLanguage → regionalLanguage → customDestinationLanguage → deviceLocale → 'fr'`.
La source de vérité `resolveUserLanguage()` (`packages/shared/utils/conversation-helpers.ts`)
accepte désormais `{ deviceLocale }` en 2e argument, et la locale est persistée
opportunément dans `User.deviceLocale` (header `X-Device-Locale`).

Le plan a câblé `deviceLocale` sur plusieurs chemins :
- `NotificationService.resolveRecipientLang` / `resolveRecipientLangs` → `resolveUserLanguage(user, { deviceLocale })` ✓
- chemin socket (connexion) → `resolveUserLanguagesOrdered(prefs, { deviceLocale })` (AuthHandler, `resolved-languages-refresh`) ✓
- destinations translator → `getRequiredLanguages` / `resolveUserLanguagesOrdered` ✓

### Problems identified
**Deux points de résolution `resolveUserLanguage` côté gateway n'ont jamais reçu le `deviceLocale`** —
ils sont restés sur la signature legacy à un seul argument :

1. **`routes/conversations/messages.ts:900`** (hot-path `GET /conversations/:id/messages`) :
   `resolveUserLanguage(userPrefs)`. Pire, le `select` de `userPrefs` (l.828-832) **ne charge même
   pas** `deviceLocale`. Cette route renvoie `meta.userLanguage` **au client** (iOS SDK + web le
   parsent au niveau racine, cf. commentaire l.1282). La valeur renvoyée ignore donc la 4e priorité.
2. **`middleware/auth.ts:305`** : `resolveUserLanguage(user)`, alors que `user.deviceLocale` est
   **déjà chargé** (select l.249, mis en cache l.274). Le `UnifiedAuthContext.userLanguage` ignore
   la 4e priorité.

### Root cause
La 4e priorité a été câblée là où le plan 2026-05-26 la nommait explicitement (notifications, socket,
destinations translator), mais ces **deux call sites de lecture** — antérieurs au plan — n'y
figuraient pas et n'ont jamais été rétro-portés. Résultat : incohérence du Prisme entre chemins
(`meta.userLanguage` de la REST diverge de la langue résolue à la connexion socket et par
NotificationService, pour un même utilisateur).

### Business impact
Pour un utilisateur **sans préférence in-app** (`systemLanguage`/`regionalLanguage`/
`customDestinationLanguage` tous vides — profils legacy, comptes incomplets) mais dont l'appareil a
envoyé une locale, la REST `GET messages` renvoyait `meta.userLanguage: 'fr'` (fallback) au lieu de
la locale appareil réelle. Divergence directe avec la connexion socket, qui elle applique la locale.
C'est exactement le cas que l'extension 2026-05-26 visait à couvrir. Impact réel borné à cet edge
case (utilisateur enregistré sans prefs in-app), mais c'est une **violation du Prisme** et une dette
de cohérence : le Prisme doit s'appliquer **identiquement partout** (règle « Coherence » du Prisme).

### Technical impact
- `messages.ts` : +1 champ au `select` (`deviceLocale: true`) + passage de l'opt — zéro requête
  supplémentaire (`deviceLocale` embarqué dans la requête `user.findFirst` déjà émise).
- `auth.ts` : passage de l'opt uniquement — `user.deviceLocale` déjà chargé, **zéro coût**.
Aucune nouvelle dépendance, aucun changement de signature publique, aucun changement pour les
utilisateurs ayant une préférence in-app (la 4e priorité ne se déclenche que si les 3 premières sont
vides).

### Risk assessment
TRÈS FAIBLE. `resolveUserLanguage` retourne la 1re préférence non-vide ; `deviceLocale` n'intervient
qu'en dernier recours avant `'fr'`. Comportement strictement inchangé pour tout utilisateur avec au
moins une préférence in-app. Aligne les 2 call sites sur le pattern déjà éprouvé et testé de
`NotificationService`/socket.

### Proposed improvements
1. `messages.ts` : ajouter `deviceLocale: true` au `select` de `userPrefs` ; appeler
   `resolveUserLanguage(userPrefs, { deviceLocale: userPrefs.deviceLocale ?? undefined })`.
2. `auth.ts` : appeler `resolveUserLanguage(user, { deviceLocale: user.deviceLocale ?? undefined })`.

### Expected benefits
- `meta.userLanguage` (REST) cohérent avec la connexion socket et NotificationService pour un même
  utilisateur — le Prisme s'applique uniformément sur **tous** les chemins de résolution gateway.
- Clôt le résidu du plan 2026-05-26 : plus aucun `resolveUserLanguage` sans `deviceLocale` en prod.

### Implementation complexity
TRÈS FAIBLE — 3 lignes prod (1 champ select + 2 passages d'opt) + 6 tests neufs (RED→GREEN + gardes).

### Validation criteria
- `auth.test.ts` : test « deviceLocale utilisé quand prefs in-app vides » RED sans fix (retourne
  'fr'), GREEN après. + gardes (ne supplante pas systemLanguage, fallback 'fr').
- `messages-list-language.test.ts` (neuf) : inject `GET /conversations/:id/messages` →
  `meta.userLanguage` honore `deviceLocale` (RED prouvé), gardes vertes.
- `tsc --noEmit` gateway : 0 erreur.
- Suites `auth|messages|deviceLocale|NotificationService.i18n` : 0 régression.

## Résultat
✅ RED prouvé (2 tests échouent : 'fr' au lieu de 'en'), GREEN après fix. `tsc` propre. 36 suites /
1043 tests verts (auth + messages + deviceLocale + notifications), 0 régression.

## Améliorations futures (report)
- **F51** : `FirebaseNotificationService` = implémentation FCM parallèle inutilisée (badge hardcodé
  `1`, pas de circuit breaker/retry) vs `PushNotificationService.sendViaFCM` (live). Seul export
  `index.ts` + son propre test — jamais instancié en prod. Candidat suppression/consolidation.
- **F49/F50** : résidus lost-update in-process sur caches stats (auto-guéris par TTL / `recompute()`).
