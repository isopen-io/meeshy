# Presence — palette verte + source de vérité centralisée (2026-07-08)

Branche : `claude/presence-color-inconsistency-eb6b8g`

Règle produit validée par JC :
- **online** (backend `isOnline=true` OU activité ≤ 60s) → **vert** `#34D399` (+pulse)
- **recent** (activité ≤ 5 min) → **vert** `#34D399`
- **away** (5–30 min) → **orange** `#FBBF24`
- **offline** (> 30 min, ou aucune donnée + déconnecté) → **gris** `#9CA3AF` là où la présence est affichée délibérément ; `nil`/absent = aucun dot
- `isOnline` backend est **autoritatif** pour l'état online (garde anti-stale : ignoré si `lastActiveAt` > 30 min)
- **typing = signal de présence** : un `typing:start` reçu force l'état online localement

## Plan
- [x] Analyse + inventaire (web / iOS / Android / gateway)
- [x] `packages/shared/utils/user-presence.ts` — source de vérité TS (états + tone) + tests vitest (17/17)
- [x] Web : `lib/user-status.ts` délègue au shared + mapping couleur central (`PRESENCE_DOT_CLASS`…)
- [x] Web : OnlineIndicator, UserPresenceBadge, UserPresenceLabel, StreamSidebar, v2 Avatar/ContactCard/ConversationItem, presence-format, SearchPageContent → consomment le mapping central
- [x] Web : TypingService bump présence (user-store) sur typing:start
- [x] Web : tests mis à jour + suite complète verte (448 suites / 11075 tests, bun)
- [x] iOS SDK : `PresenceModels.state` (isOnline autoritatif + garde) + `PresenceStyle.swift` (mapping couleur central) + `PresenceStyleTests`
- [x] iOS SDK : MeeshyAvatar / UserIdentityBar / UserProfileSheet+Header → `PresenceState?` (nil = pas de dot, .offline = gris) + couleurs centrales
- [x] iOS app : PresenceManager.noteActivity + subscription typingStarted ; StoryViewerView → mapping central ; call sites `.offline`-comme-caché → `nil`
- [x] iOS : tests SDK + app mis à jour (runner Linux — compile/tests à vérifier par la CI iOS)
- [x] Android : Presence.kt (isOnline autoritatif + garde), meeshyPresenceDotColor public (Success/Warning/Neutral400), ContactsListTab/ProfileScreen/NewConversationScreen dédupliqués + tests (gradle non exécutable ici — CI)
- [x] Docs : CLAUDE.md racine (§ User Presence) + addendum presence-fix-todo.md
- [x] Commit + push branche

## Review (2026-07-08)
- **Web** : 448/448 suites vertes (11075 tests). `getUserStatus` délègue à `@meeshy/shared/utils/user-presence` ;
  toutes les couleurs passent par `PRESENCE_DOT_CLASS` / `PRESENCE_BADGE_CLASS` / `PRESENCE_TEXT_CLASS`
  (emerald-400 = #34D399, amber-400 = #FBBF24, gray-400 = #9CA3AF — hex identiques aux tokens iOS/Android).
  v2 garde son propre `presenceDotClassV2` (tokens --gp-success/--gp-warning) exporté depuis Avatar.tsx.
  `isPresenceVisible` supprimé (les dots offline se rendent désormais en gris).
- **Typing → présence** : web `TypingService.handleTypingStart` force `{isOnline:true, lastActiveAt:now}`
  dans le user-store ; iOS `PresenceManager` s'abonne à `typingStarted` → `noteActivity`. C'était le bug
  du screenshot (« is typing » + pastille décolorée). Android : pas de store de présence live — non câblé
  (follow-up possible si un PresenceStore Android apparaît).
- **isOnline autoritatif** : garde anti-stale (ignoré si lastActiveAt > 30 min) pour ne pas réintroduire
  le bug « online fantôme » ; les snapshots/refresh REST corrigent le flag.
- **nil vs offline** : MeeshyAvatar/UserIdentityBar/v2 Avatar prennent une présence OPTIONNELLE —
  les surfaces sans donnée (commentaires, groupes, story tray) ne montrent aucun dot ; blocked-by-target
  passe nil (ne pas révéler « hors ligne »).
- **Non vérifié sur ce runner (Linux)** : compile Swift + suites XCTest (UserPresenceStateTests,
  PresenceStyleTests, PresenceManagerTests, UserProfileSheetPresenceTests, IdentityBarElementTests)
  et gradle testDebugUnitTest — à valider par la CI iOS/Android.
