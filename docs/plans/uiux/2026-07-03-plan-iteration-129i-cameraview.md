# Plan — Itération 129i (iOS) : `CameraView`

**Base** : `main` HEAD (`806fc972`, 0 PR iOS ouverte → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (écran de capture caméra) — doctrine 82i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

128i mergé (#1397, `FeedPostCard`) → **129i**. Ranking des surfaces fraîches → `CameraView`
(5 `.system(size:)`, 0 doctrine, 0 `relative`). 3 glyphes de chrome dans cadres tap fixes + 2 textes.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `xmark` fermer (18 bold, cercle tap 44×44) | **FIGÉ** + commentaire 82i |
| `flashIcon` (16 semibold, cercle tap 44×44) | **FIGÉ** + commentaire 82i |
| `camera.rotate.fill` switch (22, cercle tap 50×50) | **FIGÉ** + commentaire 82i |
| Libellé onglet de mode « Photo »/« Vidéo » (14 bold/medium) | `relative` |
| Chrono d'enregistrement (16 semibold monospaced) | `relative` |

## Règles respectées

1. Glyphe borné par un cadre tap de dimension fixe (44×44 / 50×50) → **figé** (82i) : le scaler
   déborderait/désalignerait le glyphe hors de son cercle.
2. Vrais libellés texte non bornés → **scalent** (`relative`), avec conservation du weight conditionnel et
   du `design: .monospaced`.
3. Les 3 boutons icône-seul portent déjà leur `.accessibilityLabel` (dont flash à état dynamique) → intacts,
   pas de `.accessibilityHidden` (contrôles porteurs de sens).
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. Palette conforme → non touchée.

## Étapes

1. [x] Resync main (129i car 128i mergé) ; contention vérifiée (0 PR iOS ouverte).
2. [x] 3 gels commentés 82i + 2 migrations `relative`.
3. [x] Vérifier : 3 `.system` restants (tous figés + commentés) + 2 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 130i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `ReelFeedCard` (4), `MessageDetailSheet` (4), `StatusBubbleController` (4),
`ReelRepostEmbedCell`/`AchievementBadgeView`/`SyncPill` (3), ou passe state-of-the-art (hexes vs tokens).
Note : gap i18n pré-existant sur « Photo »/« Vidéo » de `CameraView` à traiter dans une passe i18n dédiée.
