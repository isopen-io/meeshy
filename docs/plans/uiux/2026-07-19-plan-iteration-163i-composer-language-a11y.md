# Plan Itération 163i — VoiceOver value des sélecteurs de langue de composition (iOS)

**Base** : `main` HEAD `efedb69e4` · **Branche** : `claude/laughing-thompson-ybp86o` · **Gate** : CI `iOS Tests`

## Objectif
Combler un trou VoiceOver réel : les boutons de sélection de langue de composition n'annonçaient
pas la langue courante comme valeur d'accessibilité (règle CLAUDE.md « `.accessibilityValue()` for
stateful controls »). Pivot après épuisement confirmé du sweep Dynamic Type.

## Étapes
1. [x] Resync `main`, reset branche `claude/laughing-thompson-ybp86o` sur `origin/main`.
2. [x] Audit repo-wide : confirmer que le sweep Dynamic Type est épuisé (tous les `.system(size:)`
       restants sont des glyphes figés commentés).
3. [x] `FeedView.swift` : `+ .accessibilityValue(composerLanguageDisplayName)`.
4. [x] `FeedView+Attachments.swift` (`FeedComposerSheet`) : `+ .accessibilityLabel` (clé existante)
       `+ .accessibilityValue(composerLanguageDisplayName)`.
5. [x] `EditPostSheet.swift` : `+ .accessibilityElement(children:.ignore)` `+ .accessibilityLabel`
       (clé existante) `+ .accessibilityValue(selectedLanguageInfo?.name ?? clé auto existante)`.
6. [x] Vérifier types (`composerLanguageDisplayName: String`, `LanguageInfo.name: String`).
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit + push `-u origin claude/laughing-thompson-ybp86o`.

## Contraintes respectées
- 3 fichiers, +14 lignes, additif pur, 0 logique, **0 clé i18n neuve** (réutilise clés existantes →
  pas de collision `.xcstrings`), 0 test neuf.
- Pas de build iOS local (Linux) → changement prouvé sûr par inspection uniquement.

## Review
Voir section « Statut » de l'analyse `2026-07-19-iteration-163i-composer-language-a11y.md`.
Les 3 sélecteurs annoncent désormais leur langue courante. SOLDÉ 163i.
