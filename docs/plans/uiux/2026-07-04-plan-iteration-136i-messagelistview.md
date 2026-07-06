# Plan — Itération 136i (iOS) : `MessageListView` (swipeIndicator)

**Base** : `main` HEAD (`6b2a335f`, 1 PR ouverte #1440 calls/`WebRTCVideoView`/`CallsTab` — pas `MessageListView` → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (indicateur de swipe répondre/transférer) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

135i mergé (#1439, `SyncPill`) → **136i**. Ranking des surfaces fraîches → `MessageListView`
(3 `.system(size:)`, 0 doctrine, 0 `relative`). 3 éléments du `swipeIndicator`, ZStack `.frame(width: 64)`.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| flèche répondre/transférer (22 semibold) | `relative` |
| tampon jour `swipeStampDay` (11 medium) | `relative` |
| tampon heure `swipeStampTime` (12 semibold) | `relative` |

## Règles respectées

1. `ZStack` contraint en **largeur seulement** (`.frame(width: 64)`, hauteur libre) → **pas** un cadre de
   dimension fixe → **scale** (`relative`), pas de gel. Flèche + tampons s'échangent dans le même
   emplacement → migrer ensemble pour un swap cohérent.
2. Retour visuel transitoire de geste (drag actif) non exposé au rotor → pas de `.accessibilityLabel/Hidden`.
3. Palette (brandPrimary, secondary) conforme → non touchée.
4. 1 fichier, 0 logique, 0 touche à la logique de geste, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (136i car 135i mergé) ; contention vérifiée (#1440 calls — ne touche pas `MessageListView`).
2. [x] 3 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 3 `relative` ; tests conv-vm/perf inchangés (pas de scan police).
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 137i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `ConversationLockSheet` (3), `KeypadTab` (3), la traîne de fichiers à 2/1 `.system` (⚠️ éviter
`WebRTCVideoView` tant que #1440 est ouverte), ou **passe state-of-the-art** au tarissement.
