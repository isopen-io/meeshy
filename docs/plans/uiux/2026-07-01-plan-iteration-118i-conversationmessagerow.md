# Plan — Itération 118i (iOS) : `ConversationView+MessageRow`

**Base** : `main` HEAD (`f07928f1`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (affordances de conversation) — doctrine 82i
**Gate** : CI `iOS Tests`

## Constat

117i mergé (#1337, `StoryViewerView+Canvas`) → **118i**. Restaient **16 `.font(.system(size:))`**
dans les affordances de conversation (recherche, bannières, pilules, barre d'échec, actions).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Glyphe + champ de recherche (14/15) | `relative` |
| Croix d'effacement (16) | `relative(16)` |
| Bouton « Fermer » (14 medium) | `relative(14, .medium)` |
| Bannière de résultats : glyphe + label (12/12) | `relative` |
| Pilule « Messages récents » : glyphe + label (12/12) | `relative` |
| Barre d'échec : glyphe + `Échec` / `Réessayer` / `Supprimer` (11) | `relative` |
| Pilule de réponses : glyphe + label (10/11) | `relative` |
| `messageActionButton` : icône (16) + micro-label (9), cadre fixe 60×44 | **FIGÉS** + commentaire 82i |

## Règles respectées

1. Icône + micro-label dans un cadre tap fixe (60×44) en rangée → figés (doctrine 82i) ; le bouton
   porte déjà `.accessibilityLabel`, VoiceOver reste complet.
2. Palette + `.adaptiveGlass` + labels VoiceOver existants déjà conformes → non touchés.
3. 1 fichier, 0 logique, 0 test neuf, 0 clé i18n neuve.

## Étapes

1. [x] Resync main (118i car 117i mergé) ; surface `ConversationView+MessageRow` non réclamée.
2. [x] 14 migrations `relative` ; 2 gels commentés (bouton d'action fixe).
3. [x] Vérifier : 2 `.system` figés (commentés) + 14 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 119i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `BubbleStandardLayout+Media`,
`ConversationAnimatedBackground`. `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
