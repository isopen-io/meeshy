# Iteration-213i — StatusComposerView: hide decorative SF Symbols from VoiceOver

**Date:** 2026-07-22 · **Track:** iOS UI/UX (suffix `i`) · **Area:** Accessibility (VoiceOver)
**File:** `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`

## Contexte

`StatusComposerView` est le composeur de « status » (mood emoji + texte court +
audience). Il portait **0 modificateur d'accessibilité** sur ses deux SF Symbols,
tous deux **décoratifs** et accolés à un `Text` qui porte déjà le sens :

1. **En-tête de republication** (l. 45) : `Image(systemName: "arrow.2.squarepath")`
   + `Text("Status de @\(via)")`. Le glyphe « repost » est redondant avec le texte.
2. **Pilule de visibilité** (l. 256, dans le `visibilityPicker`) :
   `Image(systemName: vis.icon)` + `Text(vis.label)` (« Public », « Privé », …).
   Le glyphe illustre le label mais n'ajoute pas d'information.

## Problème (a11y — HIG « masquer les éléments décoratifs »)

Ni l'un ni l'autre n'était `.accessibilityHidden(true)`. Comme chaque symbole est
un enfant a11y indépendant (en-tête) ou fusionné dans le `Button` (pilule),
VoiceOver **lit le nom du SF Symbol** avant le libellé utile :
- en-tête → « flèches en cercle, Status de @alice »
- pilule → « globe, Public, sélectionné »

Le nom du glyphe est du bruit : il n'apporte rien au-delà du texte adjacent.
Doctrine déjà appliquée par le swarm (196i « hide decorative glyphs »).

## Correctif

`.accessibilityHidden(true)` sur les deux symboles décoratifs :

```swift
Image(systemName: "arrow.2.squarepath") … .accessibilityHidden(true)   // en-tête repost
Image(systemName: vis.icon)             … .accessibilityHidden(true)   // pilule visibilité
```

VoiceOver annonce désormais **« Status de @alice »** et **« Public, sélectionné »**
— le texte utile seul. Le trait `.isSelected` déjà présent sur la pilule
(l. 271) est conservé ; le libellé lu devient le `Text` de la pilule.

## Portée & sûreté

- **1 fichier**, +8 lignes (dont 6 de commentaire), 0 logique / 0 réseau /
  0 layout / 0 changement visuel / 0 clé i18n / 0 test neuf.
- `.accessibilityHidden(true)` est purement additif ; le rendu visuel des
  glyphes est inchangé (ils restent affichés).
- La grille d'emojis (`emojiButton`, le glyphe EST le contenu, déjà `.isSelected`)
  et le bouton Publier (libellé texte « Publier ») **inchangés** — non décoratifs.
- Fichier **absent de toute PR ouverte** (vérifié `list_pull_requests` : seule
  #2269 CI/release en vol, aucun recouvrement iOS UI) → 0 collision.
- Défaut re-vérifié présent sur `main` HEAD juste avant commit (leçon 212i :
  éviter une collision d'essaim par supersession).

## Vérification

- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / Swift 6.2, run simu iOS 18.2).
- Aucun toolchain Swift dans l'environnement (Linux) → inspection + gate CI.

## Statut

✅ Résolu. Ne plus re-flagger les deux glyphes décoratifs de `StatusComposerView`
(en-tête repost + pilule visibilité) — soldés 213i.

## Pistes 214i+

- `StatusComposerView` utilise encore `NavigationView` (déprécié) → migration
  `NavigationStack` (changement plus large, itération dédiée).
- Autres glyphes décoratifs accolés à un libellé lisibles redondamment
  (`ConversationEncryptionDetailSheet` bouton « Enable encryption » `lock.fill`,
  etc.) — auditer + vérifier collision essaim.
