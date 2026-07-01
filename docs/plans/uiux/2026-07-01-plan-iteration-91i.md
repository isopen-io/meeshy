# Plan itération 91i — Dynamic Type + VoiceOver `NewConversationView`

**Base de départ** : `main` HEAD `3c073b5d` (post-90i mergé : DataExportView + MagicLinkView).
**Branche** : `claude/upbeat-euler-158u7c` (branche désignée harness ; resync sur `main`).
**Portée** : 1 vue iOS + 1 clé i18n a11y neuve, sweep présentation.

## Objectif
Rendre l'écran de création de conversation (`NewConversationView`) conforme Dynamic Type +
VoiceOver, cohérent avec la doctrine 84i/86i/87i/88i/90i, sans toucher à la logique, au layout
par défaut ni à la palette.

## Étapes
1. [x] Resync branche sur `main` HEAD (`3c073b5d`).
2. [x] Vérifier absence de collision (90i = DataExportView+MagicLinkView mergés ; 89i = EffectsPicker). 91i = numéro libre.
3. [x] Migrer 16/17 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight préservé).
4. [x] Garder 1 site FIXE + commenté : `chevron.left` 16pt du header (chrome nav glyph, doctrine 82i/87i/90i).
5. [x] VoiceOver :
       - masquer 4 glyphes décoratifs (`person.3.fill`, `magnifyingglass`, `person.slash` empty-state, `hand.raised.fill` bloqué, `checkmark.circle`/`circle` sélection) ;
       - labels sur les 2 boutons `xmark.circle.fill` non-labellisés : retrait de chip (`accessibility.remove_selected_user`, clé neuve) + clear recherche (`accessibility.clear_search`, clé existante) ;
       - `.accessibilityElement(children: .combine)` sur l'empty-state ;
       - `.accessibilityAddTraits(.isSelected)` sur la row utilisateur sélectionnée.
6. [x] Ajouter 1 clé i18n `accessibility.remove_selected_user` (5 langues : de/en/es/fr/pt-BR).
7. [x] Vérifier `grep` : 1 `.system(size:)` résiduel (le chevron figé), 16 `relative`.
8. [x] Docs analyse + plan + tracking.
9. [ ] Commit + push branche.
10. [ ] Ouvrir PR ; attendre CI `iOS Tests` verte.
11. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Décisions
- **`person.slash` 36pt empty-state → migré** (`relative(36)`, pas figé) : < seuil héros 40pt,
  et `.accessibilityHidden` neutralise l'impact VoiceOver du scaling. Illustration qui grandit
  gentiment reste souhaitable en Dynamic Type.
- **1 clé i18n neuve assumée** (dérogation à l'invariant « 0 clé » du sweep pur) : le bouton de
  retrait de chip était un contrôle interactif **sans label** → VoiceOver lisait « xmark.circle.fill ».
  C'est un vrai gain a11y, pas cosmétique. Le bouton clear-search réutilise une clé existante.

## Risques
- **Compile** : `MeeshyFont.relative` renvoie `Font`, drop-in de `.system(size:weight:)`. OK.
- **Visuel** : au réglage Dynamic Type standard, tailles identiques → pas de régression.
- **Build local** : impossible (env Linux) → CI `ios-tests.yml` seule autorité.
- **xcstrings** : entrée JSON insérée manuellement, validée `json.load` OK, ordre alphabétique respecté.

## Prochaines cibles différées (92i+)
`AffiliateView` (17), `LocationPickerView` (17), `MemberManagementSection` (17) ; puis
`StoryViewerView+Content` (31, ⚠️ collision i18n historique #1174) et `ConversationView+Composer`
(22, lot critique prudent) en dernier ; Glass adoption `MessageOverlayMenu` (21, via `AdaptiveGlassContainer`).
