# UI/UX Plan — Iteration 44b (2026-06-12)

Analyse : `docs/analyses/uiux/2026-06-12-iteration-44b.md`
Branche : `claude/keen-dirac-a53ki2` (depuis main post-merge #587/#588)

## Scope : iOS exclusivement

### A. Dynamic Type — vues liens (différé iter-42/43)
- [ ] `ShareLinkDetailView.swift` — 13 polices figées → sémantiques
- [ ] `TrackingLinkDetailView.swift` — 25 polices figées → sémantiques
- [ ] `CreateShareLinkView.swift` — 24 polices figées → sémantiques
- [ ] `CreateTrackingLinkView.swift` — 6 polices figées → sémantiques

### B. Dynamic Type + hex — surface composer
- [ ] `UniversalComposerBar.swift` — 12 polices → sémantiques
- [ ] `UniversalComposerBar+Recording.swift` — 6 polices → sémantiques ;
      hex `08D9D6`/`FF2E63` → tokens charte (`errorStrong` pour record, indigo pour focus)
- [ ] `UniversalComposerBar+Attachments.swift` — 11 polices → sémantiques
- [ ] `AudioPostComposerView.swift` — 27 polices → sémantiques ;
      washes `EEF2FF`/`E0E7FF`/`C7D2FE`/`1E1B4B` → `indigo50/100/200/950` ;
      `13111C`/`0F0D19` → constantes locales nommées (intentionnels)

### C. A11y opportuniste sur les surfaces touchées
- [ ] `.accessibilityLabel` sur boutons icône seule rencontrés pendant la passe

### Garde-fous
- `Color(hex: accentColor)` (accent conversation) : NE PAS toucher — conforme charte
- Héros ≥40pt : restent figés (précédent iter-32)
- Mapping tailles → polices : tableau dans l'analyse
- Pas de changement de layout, uniquement fonts/couleurs/a11y

### Vérification
- [ ] Grep négatif `font(.system(size:` sur les 8 fichiers (hors héros documentés)
- [ ] Grep négatif hex hors charte sur Recording/AudioPost
- [ ] CI verte (ios-tests) puis merge dans main, suppression branche, MAJ branch-tracking
