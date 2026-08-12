# Iteration-208i — ReelRepostEmbedCell VoiceOver: caption + likes restored

**Date**: 2026-07-21
**Scope**: iOS only — `apps/ios/Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift`
**Type**: Accessibility (VoiceOver) — 0 logic / 0 visual / 0 network change
**Base**: `main` HEAD `22465a5`
**Branch**: `claude/laughing-thompson-ku262q`

## Contexte

`ReelRepostEmbedCell` rend un post du feed qui **repartage un réel** sous forme
de carte « post cité » compacte (bande média + auteur original + légende +
compteur de j'aime). Utilisé par `FeedPostCard` quand `post.type == "POST"` ET
`post.repost?.type == "REEL"`. Tap → page détail du réel.

`list_pull_requests` GitHub MCP **indisponible** (run headless/cron) → choix
guidé par le pointeur 207i (« autres rangées où un `.accessibilityLabel`
explicite écrase/ignore le contenu visible »). `ReelRepostEmbedCell` absent de
toute liste de PR ouverte du tracking doc.

## Défaut identifié (réel — WCAG 1.3.1)

La carte réel est un **bouton unique** (bon choix UX : une seule cible de tap qui
ouvre le réel) via `.accessibilityElement(children: .ignore)` (l.90). Mais son
`.accessibilityLabel` ne contenait que **« Réel de {auteur} »** — `children:
.ignore` **jette** tout le reste que l'utilisateur voyant lit :

1. **La légende du réel** (`repost.content`, l.121-128) — le **contenu primaire**
   de la carte, celui qui pilote sa hauteur (`lineLimit(4)`). Absente pour
   VoiceOver → un utilisateur non-voyant entend « Réel de Marie, bouton » sans
   jamais savoir de quoi parle le réel.
2. **Le compteur de j'aime** (`statsRow`, l.240) — visible mais également ignoré
   (le `.accessibilityElement(children: .combine)` interne du `statsRow` est mort
   sous le `children: .ignore` parent).

C'est exactement la classe de bug soldée en 207i (`CallJournalRow` : label
explicite écrasant l'info visible).

## Correctif appliqué

Helper pur `static func reelCardAccessibilityLabel(for:)` recomposant le label :

```
[ "Réel de {auteur}",  (légende si non vide),  "{n} j'aime" ].joined(". ")
```

- `.accessibilityLabel(String(localized: "feed.reel.repost.by", …))` →
  `.accessibilityLabel(Self.reelCardAccessibilityLabel(for: repost))`.
- **Réutilise les 2 clés i18n déjà présentes** dans le fichier (`feed.reel.repost.by`
  l.91-origine, `feed.reel.repost.likes` l.245) → **0 clé neuve / 0 `.xcstrings`**.
- Légende **conditionnelle** (`guard !content.isEmpty`) → pas de séparateur `. .`
  dangling pour un réel sans légende.
- `children: .ignore` + `.isButton` + hint **conservés** (design bouton unique
  correct, une seule action « ouvrir le réel »).

## Choix délibérés

- **Helper `static`** (miroir de `reelVideoMedia(for:)` du même fichier) → pur,
  testable sans host SwiftUI, parité doctrine 207i (`rowAccessibilityLabel`).
- **Likes inclus** en dernier (info la moins prioritaire) : parité 207i « inclure
  tout ce que le voyant voit ».
- **`statsRow` interne non touché** : son `.combine`/label reste correct en
  isolation conceptuelle ; le retirer serait du bruit hors périmètre.

## Tests

2 tests unitaires ajoutés à `ReelRepostEmbedCellTests` (assertions `contains`
locale-robustes — l'auteur/la légende/les likes sont interpolés donc présents
quelle que soit la langue du host) :
- `withCaption_includesAuthorCaptionAndLikes`
- `emptyCaption_omitsCaptionSegmentWithoutEmptyPunctuation`

## Vérification

- Build local Swift impossible (hôte Linux, pas de toolchain) → **gate = CI
  `iOS Tests`** (xcodegen auto-inclut, compile Xcode 26.1.1 / run simu 18.2).
- 2 fichiers (1 prod +14 l, 1 test +20 l), 0 logique / 0 visuel / 0 réseau /
  0 clé i18n neuve.

## Statut

✅ Résolu — légende + likes du réel reposté désormais annoncés par VoiceOver, le
design bouton-unique préservé.

## Restant (différé 209i+)

- Autres cartes « repost/cité » à auditer pour le même `children: .ignore` +
  label partiel (`StoryRepostEmbedCell`, `repostView` générique de `FeedPostCard`)
  — vérifier collision essaim via `list_pull_requests`.
