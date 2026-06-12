# UI/UX Plan — Iteration 46i (2026-06-12)

Base : `main` @ d10a80c5 (post-merge PR #605, iter-46w). Branche : `claude/wizardly-rubin-wnm76f`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-46i.md`. iOS exclusivement.

## Étapes

### 1. Épuration code mort (pbxproj impacté — validation par CI)
- [ ] Supprimer `Features/Main/Components/MessageComposer.swift` + 4 entrées pbxproj
- [ ] Supprimer `Features/Main/Models/SampleData.swift` + 4 entrées pbxproj
      + retirer la ligne du commentaire d'index dans `Models.swift`
- [ ] `RootViewComponents.swift` : supprimer le bloc 697–1113 (ThemedFeedComposer,
      ThemedFeedCard, FeedActionButton, 10 wrappers Legacy Support)
      + actualiser le commentaire d'en-tête de `RootView.swift:9`

### 2. Éradication ancienne palette — surfaces vivantes
- [ ] `RootViewComponents` : orbe `:421` → `indigo400` ; avatar self → paire
      `brandPrimaryHex`/`brandDeepHex` ; spinner → `brandPrimary`
- [ ] `FeedView` : tints surface/border ×3 → `indigo400Hex` ; avatar self → paire brand ;
      UploadProgressBar + LocationPicker → `brandPrimaryHex` ; photo → `indigo400` ;
      micro → `errorStrong`
- [ ] `FeedView+Attachments` : mêmes mappings (10 occurrences)
- [ ] `WidgetPreviewView` : non-lus → `[errorStrong, error]` ; tout-lu →
      `[indigo500, indigo700]` ; Nouveau → `[indigo400, indigo500]` ; Partager →
      `[success, successDeep]` ; Réglages → `[errorSoft, errorStrong]` ; carte Partage
      → `shareAccentHex`
- [ ] `AboutView` : section Liens ×5 → `indigo400Hex`
- [ ] `AttachmentPreparationService` : défauts → `brandPrimaryHex`/`errorHex` + ladder
      `:201` + `import MeeshyUI`
- [ ] `ConversationAnimatedBackground` : défauts → `brandPrimaryHex`/`brandDeepHex`/
      `indigo600Hex`
- [ ] Divers ×1 : `ConversationInfoSheet` (+ Quitter → `errorHex`),
      `MemberManagementSection` → `indigo400`, `BlockedUsersView` → `brandPrimary`,
      `UserStatsView`/`MediaDownloadSettingsView` → `brandPrimaryHex`
- [ ] `MeeshyWidgets.swift` : sample `4ECDC4` ×2 → `"818CF8"` (littéral, target sans
      MeeshyUI)

### 3. FriendRequestListView — Dynamic Type + Prisme (différé 45i)
- [ ] 10 polices → sémantiques (16→callout, 17/18→headline, 14-15→subheadline,
      13→footnote, 12→caption, 11→caption2 ; héros 48 figé ; rounded conservé)
- [ ] `relativeTime` : fallback date `Locale("fr_FR")`+DateFormatter →
      `formatted(.dateTime.day().month(.abbreviated))` (locale courante)
- [ ] `"Inconnu"` → clé existante `common.unknown`

### 4. Livraison
- [ ] Greps de vérification : zéro `08D9D6|FF2E63|4ECDC4` hors tests/filtre stories ;
      zéro `font(.system(size:` dans FriendRequestListView (hors héros) ; zéro référence
      aux symboles supprimés ; pbxproj cohérent (compte d'entrées)
- [ ] Commit + push `claude/wizardly-rubin-wnm76f`
- [ ] PR vers main, CI vert (ios-tests.yml), merge, suppression branche
- [ ] MAJ `branch-tracking.md` + annotation Status de l'analyse

## Vérification
Pas de build local possible (conteneur Linux) — compilation + suite MeeshyTests validées
par `ios-tests.yml` (Xcode, simulateur iPhone) sur la PR. Les suppressions pbxproj suivent
exactement le pattern des 4 entrées par fichier (PBXBuildFile, PBXFileReference, group,
Sources).

## Review (2026-06-12)
- Étapes 1–3 implémentées intégralement ; toutes les cases cochées de fait :
  3 îlots morts supprimés (−955 lignes : MessageComposer 218, SampleData ~320,
  RootViewComponents 417), 8 entrées pbxproj retirées (diff pbxproj = 8 deletions
  exactes), 2 commentaires d'index actualisés
- ~40 occurrences ancienne palette re-tokenisées sur 13 fichiers vivants ; mappings
  conformes aux précédents 42b/44b/45i (cyan→indigo400, mic→errorStrong,
  fallbacks→brandPrimaryHex, spinners→brandPrimary, gradients sémantiques
  success/error, share→shareAccentHex)
- FriendRequestListView : 10 polices sémantiques (héros 48 figé), formateur date
  fr_FR → `formatted(.dateTime.day().month(.abbreviated))`, « Inconnu » → clé
  `common.unknown` AJOUTÉE au catalogue (5 locales — elle était utilisée par
  RequestsTab sans exister : bug i18n latent corrigé pour les 2 call sites)
- Greps finaux : trio `08D9D6|FF2E63|4ECDC4` = zéro hors fixtures tests + filtre
  artistique stories (documenté conforme) ; zéro référence aux symboles supprimés ;
  accolades équilibrées ; JSON xcstrings valide (diff +35 lignes, ordre préservé)
- Compilation + suite MeeshyTests validées par CI `ios-tests.yml` sur la PR
