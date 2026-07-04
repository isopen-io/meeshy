# Itération 131i — Analyse UI/UX iOS : `MessageDetailSheet`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetailSheet.swift`
**Base** : `main` HEAD (`eb74172e`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`MessageDetailSheet` est la sheet de détail d'un message (grille d'onglets Language/Views/Reactions/
React/Report/Delete/Forward/Sentiment/Transcription/History). Surface **fraîche** :
4 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **0 PR iOS ouverte** au démarrage →
**0 contention**. Numéro **131i** (130i = `ReelFeedCard` mergé #1406). Fichier volumineux (~2502 lignes)
mais les 4 sites sont tous des **glyphes hero d'états vides/erreur/confirmation** — bien identifiés.

## Constat (avant 131i)

**4 `.font(.system(size:))`** — tous des **glyphes hero décoratifs** dont le sens est porté par le texte
adjacent :
- `emptyStateView` : icône générique d'état vide (28 light, `.opacity(0.4)`) au-dessus d'un `footnote` ;
- `retryableErrorView` : `wifi.slash` (28 light) au-dessus d'un texte d'erreur + bouton Réessayer ;
- `deleteTabContent` : `trash.fill` (48, animé `deleteIconScale`) au-dessus du titre « Supprimer ce
  message ? » ;
- transcription empty-state : `text.word.spacing` (28 light) au-dessus d'un texte + bouton Transcrire.

## Corrections appliquées (1 fichier, 0 logique)

- **3/4 glyphes hero < 40pt → `MeeshyFont.relative(28, weight: .light)`** (empty-state générique,
  `wifi.slash`, `text.word.spacing`) : ils **scalent désormais avec le texte** de l'état vide/erreur sous
  Dynamic Type (seuil de gel hero = ≥40pt ; à 28pt on migre).
- **1/4 glyphe hero ≥40pt FIGÉ** + commentaire doctrine **84i** : `trash.fill` (48, animé) — un glyphe
  hero décoratif ≥40pt garde `.font(.system(size:))`.
- **`.accessibilityHidden(true)` sur les 4** glyphes hero décoratifs : le texte adjacent (état vide,
  message d'erreur, titre de confirmation de suppression) **porte déjà le sens** → on évite que VoiceOver
  lise le nom brut du symbole SF. **Amélioration a11y nette.**

Palette (`MeeshyColors.error`, `theme.textMuted`, accent) déjà conforme → non touchée. Les nombreux
autres glyphes/textes de la sheet utilisent déjà des styles sémantiques (`.caption`, `.footnote`,
`.callout`, `.title3`, `.system(.caption2, design: .monospaced)`) → hors périmètre, non touchés.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent.
- Le seul test référençant le fichier (`AudioTranslationMergeTests`) exerce le **helper pur statique**
  `mergeAudioTranslations`, **pas** les polices → aucune régression.

## Statut

**TERMINÉE** — `MessageDetailSheet` glyphes hero Dynamic Type + a11y soldé (3 migrés < 40pt, 1 figé ≥40pt
commenté 84i, 4 masqués décoratifs). Ne plus re-flagger le `trash.fill` figé.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageDetailSheet` — 3 glyphes hero < 40pt (empty-state, `wifi.slash`, `text.word.spacing`) →
  `MeeshyFont.relative` ; 1 glyphe hero ≥40pt figé (`trash.fill` 48) commenté « doctrine 84i » ;
  4 `.accessibilityHidden(true)` sur les hero décoratifs. **SOLDÉ 131i.**
