# Plan itération 99i — Dynamic Type `MessageOverlayMenu`

**Base de départ** : `main` HEAD `8ecbeb5f` (post-merge #1237/91i `NewConversationView`).
**Branche** : `claude/upbeat-euler-158u7c` (branche désignée harness ; resync sur `main`).
**Portée** : 1 composant iOS, sweep présentation pur.

## Contexte contention (run 2026-07-01)
Nombreux agents parallèles en vol (PR #1238→#1269, iters 92i→98i) couvrant `AffiliateView`,
`LocationPickerView`, `MemberManagementSection`, `ConversationPreferencesTab`, `SharePickerView`,
`AddParticipantSheet`, `SupportView`, `NotificationSettingsView`, `TwoFactorSetupView`,
`UserStatsView`, `AboutView`. **`MessageOverlayMenu` = libre** (aucune PR ouverte), et
explicitement listé comme priorité différée (Glass à part). Numéro **99i** choisi > tout le
peloton pour éviter la collision de nom de doc (leçon du « 91i » concaténé multi-agents).

## Objectif
Rendre le menu contextuel de message (long-press : preview de bulle, quick actions, players
audio/vidéo, panneau détail) conforme Dynamic Type, sans toucher aux maths de layout, à la
logique ni à la palette.

## Étapes
1. [x] Resync `main` HEAD ; vérifier collision (`list_pull_requests` → MessageOverlayMenu libre).
2. [x] Migrer 18/21 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight/design `.monospaced` préservés).
3. [x] Garder 3 glyphes FIXES & commentés (dans cercles/badges de taille fixe) :
       `doc.fill` (badge 36×36, + `.accessibilityHidden`), play/pause audio (cercle 40×40),
       play vidéo (cercle 52×52). Boutons play/pause conservent leur `.accessibilityLabel`.
4. [x] Vérifier `grep` : 3 `.system(size:)` résiduels (glyphes figés), 18 `relative`.
5. [x] Docs analyse + plan + tracking.
6. [ ] Commit + push branche.
7. [ ] Ouvrir PR ; attendre CI `iOS Tests` verte.
8. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Décisions
- **Glyphes dans conteneurs de taille fixe → figés** (doctrine 90i/DataExportView) : un glyphe
  scalable déborderait de son cercle/badge. Les 3 concernés sont soit décoratifs (`doc.fill`,
  masqué VoiceOver) soit portés par un `Button` déjà labellisé (play/pause).
- **Contrôles de transport hors cercle fixe** (`gobackward.5`/`goforward.5`) → migrés : ils
  scalent avec les libellés voisins, restent proportionnés, labels VoiceOver déjà présents.
- **Glass adoption laissée à un lot dédié** (doctrine) — hors scope de ce sweep Dynamic Type.
- **0 clé i18n neuve, 0 logique, 0 test neuf** : le fichier a déjà de bons labels a11y.

## Risques
- **Compile** : `MeeshyFont.relative(N, weight:, design:)` = drop-in de `.system(size:weight:design:)` ;
  `.monospacedDigit()`/`.monospaced` design préservés. `import MeeshyUI` présent (ligne 5).
- **Visuel** : au réglage Dynamic Type standard, tailles identiques → pas de régression ; les maths
  de positionnement du cluster (bulle/emoji/action bar) sont inchangées.
- **Build local** : impossible (env Linux) → CI `ios-tests.yml` seule autorité.

## Prochaines cibles différées (100i+)
`StoryViewerView+Content` (31, ⚠️ collision i18n historique #1174) et `ConversationView+Composer`
(22, lot critique prudent) en dernier ; `OnboardingAnimations` (17), `ConversationListView+Overlays`
(15), `ConversationMediaGalleryView` (13) ; Glass adoption `MessageOverlayMenu` (lot dédié
`AdaptiveGlassContainer`).
