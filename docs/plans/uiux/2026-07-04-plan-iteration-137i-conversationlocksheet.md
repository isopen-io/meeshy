# Plan — Itération 137i (iOS) : `ConversationLockSheet`

**Base** : `main` HEAD (`ee185327`, 1 PR ouverte #1440 calls/`WebRTCVideoView`/`CallsTab` — pas `ConversationLockSheet` → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type — annotation de gel (sheet PIN de verrouillage) — doctrine 82i/84i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

136i mergé (#1441, `MessageListView`) → **137i**. Ranking des surfaces fraîches → `ConversationLockSheet`
(3 `.system(size:)`, 0 doctrine, 0 `relative`). 1 hero ≥40pt + 2 glyphes de pavé bornés par touches fixes.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| hero cadenas `Image(systemName: iconName)` (44) | **FIGÉ** 84i + `accessibilityHidden` |
| `delete.left.fill` (22 medium, touche fixe 76×76) | **FIGÉ** 82i (label déjà présent) |
| chiffre `Text("\(digit)")` (26 rounded, touche fixe 76×76) | **FIGÉ** 82i |

## Règles respectées

1. Hero décoratif **≥40pt** → figé (84i) + masqué (titre porte le sens). Glyphe/chiffre **borné par une
   touche de dimension fixe 76×76** → figé (82i).
2. `delete.left.fill` porte déjà son `.accessibilityLabel` ; le `Button` du chiffre lit le chiffre pour
   VoiceOver → pas d'a11y neuve sur les touches.
3. Palette (gradient error/indigo600, textPrimary) conforme → non touchée.
4. 1 fichier, 0 logique, 0 touche à la logique de saisie du PIN, 0 test/clé i18n neuve. Pas d'`import
   MeeshyUI` (aucune migration `relative`).

## Étapes

1. [x] Resync main (137i car 136i mergé) ; contention vérifiée (#1440 calls — pas `ConversationLockSheet`).
2. [x] 3 gels commentés (1×84i masqué + 2×82i).
3. [x] Vérifier : 3 `.system` restants (tous figés + commentés) ; aucun test ne référence le fichier.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 138i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `KeypadTab` (3), la traîne de fichiers à 2/1 `.system` (⚠️ éviter `WebRTCVideoView` tant que #1440
ouverte), ou **passe state-of-the-art** au tarissement.
