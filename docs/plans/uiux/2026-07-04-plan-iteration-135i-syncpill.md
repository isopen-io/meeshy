# Plan — Itération 135i (iOS) : `SyncPill`

**Base** : `main` HEAD (`1fbda962`, 7 PR ouvertes gateway/calls — aucune sur `SyncPill` → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (pastille rotative de synchronisation) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

134i mergé (#1430, `AchievementBadgeView`) → **135i**. Ranking des surfaces fraîches → `SyncPill`
(3 `.system(size:)`, 0 doctrine, 0 `relative`). 3 éléments inline sans cadre fixe.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| libellé `label + animatedDots` (11 medium) | `relative` |
| compteur `index/count` (10 regular, monospacedDigit) | `relative` |
| icône de statut `Image(systemName: iconName)` (11 semibold) | `relative` |

## Règles respectées

1. Éléments inline **non bornés** par un cadre fixe (capsule dimensionnée au contenu via `.padding`) →
   **scalent** (`relative`). `monospacedDigit` conservé sur le compteur.
2. A11y déjà en place (`.accessibilityElement(children: .ignore)` + label + hint) → intacte, icône aplatie,
   pas de `.accessibilityHidden` requis.
3. Palette (brandGradient/warning/success/error, capsule tint) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès modèle/rotator, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (135i car 134i mergé) ; contention vérifiée (7 PR ouvertes gateway/calls — aucune sur `SyncPill`).
2. [x] 3 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 3 `relative` ; tests labels/derive/rotator inchangés.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 136i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `MessageListView` (3), `ConversationLockSheet` (3), `KeypadTab` (3), la longue traîne de fichiers à
2 et 1 `.system`, ou **démarrer la passe state-of-the-art** (hexes inline vs tokens) quand le lot migratable
s'épuise.
