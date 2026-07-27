# Iteration-223i — BubbleQuotedReply: hide decorative SF Symbols from VoiceOver

**Date:** 2026-07-26 · **Track:** iOS UI/UX (suffix `i`) · **Area:** Accessibility (VoiceOver)
**File:** `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleQuotedReply.swift`

## Contexte

`BubbleQuotedReply` est la sous-vue de bulle qui rend l'aperçu d'un message cité
(reply). Elle portait **0 modificateur d'accessibilité** sur ses SF Symbols.
Deux d'entre eux sont **décoratifs**, accolés à un `Text` porteur du sens :

1. **Aperçu de pièce jointe** (l.125) : `Image(systemName: kind.sfSymbolName)`
   (photo / vidéo / doc…) suivi du **label court localisé** de la pièce jointe
   (« Photo », « Vidéo »…). Le glyphe illustre le label.
2. **Aperçu de reply story** (`BubbleStoryReplyPreview`, l.287) :
   `Image(systemName: "camera.fill")` suivi de `Text("Story")`.

## Problème (a11y — HIG « masquer les éléments décoratifs »)

Sans `.accessibilityHidden(true)` et sans regroupement, VoiceOver lit le **nom
du SF Symbol** avant le libellé utile (« appareil photo, Story » ; « photo,
Photo »). Le nom du glyphe est du bruit — le texte adjacent porte déjà
l'information. Doctrine appliquée en 196i / 213i / 214i.

## Correctif

`.accessibilityHidden(true)` sur les deux symboles décoratifs :

```swift
Image(systemName: kind.sfSymbolName) … .accessibilityHidden(true)  // aperçu pièce jointe
Image(systemName: "camera.fill")     … .accessibilityHidden(true)  // aperçu story
```

VoiceOver annonce désormais le texte utile seul (« Photo », « Story »).

## Hors périmètre (délibéré)

Le 3e symbole — les icônes de `storyMetric(icon:value:)` (l.334 :
`heart.fill` / `bubble.right.fill` / `arrowshape.turn.up.right.fill`) — est
**informatif**, pas décoratif : il distingue réactions / commentaires / partages,
et le nombre seul (« 5 ») serait ambigu sans lui. Le masquer PERDRAIT de
l'information. Le traiter proprement demande un couple libellé+valeur
(« 5 réactions ») — un changement de nature différente (doctrine 206i), nominé
comme piste 224i+ plutôt que bâclé ici.

## Portée & sûreté

- **1 fichier**, +7 lignes (dont 5 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 clé i18n / 0 test neuf.
- Sous-vue de bulle Equatable à entrées primitives — `.accessibilityHidden`
  n'affecte ni l'`Equatable` ni le pattern « Zero Unnecessary Re-render ».
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests` : PR iOS
  en vol = 217i–222i + share-extension ; 0 mention de `BubbleQuotedReply`).
  Défaut re-vérifié présent sur `main` HEAD juste avant commit (leçon 212i).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Aucun toolchain Swift dans l'environnement (Linux) → inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger les 2 glyphes décoratifs de `BubbleQuotedReply`
(aperçu pièce jointe + aperçu story) — soldés 223i.

## Pistes 224i+

- `storyMetric` (`BubbleStoryReplyPreview`) : regrouper icône+nombre en un
  élément VoiceOver labellisé (« 5 réactions », « 3 commentaires », « 2 partages »)
  — doctrine label+value 206i.
- `BubbleMoodReplyPreview` : auditer le même motif glyphe-décoratif/valeur.
