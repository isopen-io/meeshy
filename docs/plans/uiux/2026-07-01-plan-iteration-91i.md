# Plan itération 91i — Dynamic Type + VoiceOver `DataExportView`

**Base de départ** : `main` HEAD `af1fe619` (post-90i mergé #1221).
**Branche** : `claude/upbeat-euler-pt8xxj` (resync sur `main`).
**Portée** : 1 fichier iOS, sweep pur.

## Objectif
Rendre l'écran RGPD `DataExportView` conforme Dynamic Type + VoiceOver (parité doctrine 86i/88i/90i), sans toucher à la logique ni au rendu par défaut.

## Étapes
1. [x] Resync branche sur `main` HEAD (post-90i).
2. [x] Vérifier absence de collision (90i mergé, 89i EffectsPicker session parallèle).
3. [x] Migrer 16 sites `.font(.system(size:))` → `MeeshyFont.relative(...)`, weight/`.rounded` préservés.
4. [x] Garder figé le glyphe de badge 28×28 (toggleRow), commenter l'exception.
5. [x] VoiceOver : combine carte info + bandeau erreur ; `.isHeader` sur sectionHeader ; hidden sur glyphes décoratifs.
6. [x] Vérifier : 1 `.system(size:)` résiduel attendu, 16 `relative`, 4 traits a11y.
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit + push ; PR ; CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Risques
- **Compile** : `MeeshyFont.relative(N, weight:, design:)` supporte `design:` → sectionHeader `.rounded` OK.
- **Visuel** : cadence par défaut = tailles identiques → pas de régression.
- **Build local** : impossible (env Linux) → CI seule autorité.

## Prochaines cibles différées (92i+)
`NewConversationView` (17), `AffiliateView` (17), `LocationPickerView` (17), `MemberManagementSection` (17) ; puis `StoryViewerView+Content` (31, ⚠️ collision i18n) et `ConversationView+Composer` (22, prudent) ; Glass `MessageOverlayMenu` (21).
