# Plan — Iteration 49i (2026-06-14)

## Objectif
iOS exclusivement. Solder le différé 48i « SDK MeeshyUI — ancienne palette » : migrer le
**chrome UI** du SDK vers les tokens `MeeshyColors` (échelle Indigo + sémantiques), en
documentant les **palettes de contenu / affordances reconnues** comme intentionnelles.

## Périmètre
`packages/MeeshySDK/Sources/MeeshyUI/` uniquement. Aucun fichier `apps/ios` ni couche données
`MeeshySDK` core (modèles testés).

## Étapes
1. [x] Inventaire grep du trio `08D9D6`/`FF2E63`/`4ECDC4` + `A855F7` sur `MeeshyUI`
2. [x] Classification chrome (migrer) vs contenu/affordance/preview/data (documenter)
3. [x] Auth : AuthTextField, LanguageSelector, MeeshyForgotPasswordView → `brandPrimary`
4. [x] Community : unification complète → indigo de marque ; quitter/requis → `error` ;
       public toggle → `success` ; `presetColors` documenté ; défaut sauvegardé → `brandPrimaryHex`
5. [x] Primitives : EmojiReactionPicker, LanguagePickerSheet → `brandPrimary` ; NotificationBadge
       → `error` ; EmptyStateView/ChatBubble défauts → `brandPrimaryHex` ; UserIdentityBar →
       `brandPrimary` ; ConversationSettingsView Modérateur → `success`
6. [x] UserProfileSheet débloquer → `[success, successDeep]`
7. [x] Media/Location défauts `accentColor` (×19) → `brandPrimaryHex`
8. [x] VoiceProfile défauts `accentColor` (×4) → `brandPrimaryHex`
9. [x] Commentaires d'intention : MeeshyAvatar story ring, NotificationListView ladder,
       CommunitySettings presetColors
10. [x] Analyse + plan rédigés
11. [ ] Commit + push sur la branche assignée
12. [ ] PR vers main, attendre CI verte (`ios-tests.yml`)
13. [ ] Merge dans main, mettre à jour branch-tracking, supprimer la branche

## Vérification
- Type-safety : `MeeshyColors.brand*`/`error`/`success`/`indigo*` (Color) en contextes Color ;
  `*Hex` (String) en défauts `accentColor: String` / `??` / `contactColor`. Tous validés.
- `MeeshyColors` + `Color(hex:)` dans le même module `MeeshyUI` → pas d'import requis.
- Pas de build local (UIKit non linkable sur Linux) → CI `ios-tests.yml` = porte de build.

## Résultat
29 fichiers, +77/-68. Éradication du chrome ancienne palette du SDK MeeshyUI. Reste
volontairement : palettes catégorielles/contenu, affordances reconnues, previews, data SDK core
(toutes documentées). Le **ladder catégoriel arc-en-ciel** reste le prochain grand arbitrage
(décision charte unique, app + SDK).
