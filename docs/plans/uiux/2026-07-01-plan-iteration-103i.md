# Plan — Itération 103i (iOS) : `AudioFullscreenView`

**Base** : `main` HEAD (`ed04f121`) · **Branche** : `claude/upbeat-euler-s5qysh` (repurposée depuis 95i redondant)
**Thème** : VoiceOver (labels contrôles icône-seule) + Dynamic Type résiduel (doctrine 82i/86i)
**Gate** : CI `iOS Tests`

## Constat

Fichier déjà largement en `MeeshyFont.relative`. Vrai défaut = boutons icône-seule **sans
`.accessibilityLabel`** (VoiceOver lit le nom brut du SF Symbol). Épuration : ajout ciblé de
labels, pas de refonte.

## Actions

| Élément | Avant | Action |
|---|---|---|
| Fermer (`xmark`, cadre 36×36) | pas de label | **FIGÉ** + `.accessibilityLabel(common.close)` + commentaire |
| Download (`arrow.down.to.line`+états, 36×36) | pas de label | **FIGÉ** + `.accessibilityLabel` state-aware (`downloadAccessibilityLabel`) + commentaire |
| −10s (`gobackward.10`) | pas de label | **FIGÉ** (transport) + `.accessibilityLabel(media.skipBack10s)` |
| Play/Pause (`play/pause.fill`, cercle 64×64) | pas de label | **FIGÉ** + `.accessibilityLabel` (play/pause SSOT) |
| +10s (`goforward.10`) | pas de label | **FIGÉ** (transport) + `.accessibilityLabel(media.skipForward10s)` |
| Choisir langue (`translate`, cercle 26×26) | pas de label | **FIGÉ** + `.accessibilityLabel(audio.fullscreen.language.choose)` |
| État vide (`text.word.spacing` 28) | `.system(size:28)` décoratif | `MeeshyFont.relative(28, .light)` + `.accessibilityHidden(true)` |

## Clés i18n (via `defaultValue` inline — pas d'édition catalogue)

- Réutilisées : `common.close`, `media.playAudio`, `media.pauseAudio`, `media.download`.
- Nouvelles : `media.skipBack10s`, `media.skipForward10s`, `audio.fullscreen.language.choose`,
  `audio.fullscreen.save.saving/saved/failed`.

## Règles respectées

1. Glyphes de contrôle/chrome dans cadres fixes + contrôles de transport → figés (doctrine 82i/86i).
2. Labels a11y sur tous les boutons icône-seule (défaut WCAG/HIG corrigé).
3. Palette + Liquid Glass déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf.

## Étapes

1. [x] Repurposer la branche (95i CommunityLinkDetailView déjà mergé par un autre agent → redondant).
2. [x] Éditer `AudioFullscreenView.swift` (6 labels + 1 migration + 6 gels commentés).
3. [x] Vérifier : 6 `.system(size:)` figés commentés, 6 `.accessibilityLabel`, 1 `.accessibilityHidden`.
4. [ ] Commit + push (met à jour la PR #1274 repurposée) ; attendre CI `iOS Tests` verte.
5. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Différé 104i+

- `AudioFullscreenView.seekBar` : rendre le slider custom **VoiceOver-adjustable**
  (`.accessibilityValue` + `.accessibilityAdjustableAction`) — nécessite un adaptateur (risque layout).
- Grandes surfaces Dynamic Type restantes non prises : `StoryViewerView+Content` (38, ⚠️ i18n),
  `ConversationView+Composer` (22, lot prudent), `FeedView+Attachments` (14) ; Glass ciblé.
