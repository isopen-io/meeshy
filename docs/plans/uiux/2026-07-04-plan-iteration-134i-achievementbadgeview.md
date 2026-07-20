# Plan — Itération 134i (iOS) : `AchievementBadgeView`

**Base** : `main` HEAD (`60fb2238`, 8 PR ouvertes gateway/web/affiliate — aucune iOS → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (tuile de badge d'accomplissement) — doctrine 86i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

133i mergé (#1422, `ReelRepostEmbedCell`) → **134i**. Ranking des surfaces fraîches → `AchievementBadgeView`
(3 `.system(size:)`, 0 doctrine, 0 `relative`). Icône dans anneau fixe 56×56 + 2 libellés texte.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `import MeeshyUI` (absent) | **ajouté** |
| icône `achievement.icon` (22 semibold, anneau fixe 56×56) | **FIGÉE** + commentaire 86i |
| nom `achievement.name` (11 bold) | `relative` |
| compteur `current/threshold` (9 medium rounded) | `relative` |

## Règles respectées

1. Glyphe borné par une vignette circulaire de dimension fixe (anneau 56×56) → **figé** (86i).
2. Vrais libellés texte non bornés → **scalent** (`relative`), avec conservation du weight et du
   `design: .rounded`.
3. A11y déjà en place (`.accessibilityElement(children: .combine)` + label complet) → intacte, icône déjà
   aplatie, pas de `.accessibilityHidden` requis.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. Palette conforme → non touchée.

## Étapes

1. [x] Resync main (134i car 133i mergé) ; contention vérifiée (8 PR ouvertes gateway/web — aucune iOS).
2. [x] `import MeeshyUI` + 1 gel commenté 86i + 2 migrations `relative`.
3. [x] Vérifier : 1 `.system` restant (figé + commenté) + 2 `relative` + import présent.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 135i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `SyncPill` (3), les fichiers à 2 `.system`, ou **démarrer la passe state-of-the-art** (hexes inline
vs tokens — `F8B500`/`9B59B6` FeedView, `9933CC` ConversationAnimatedBackground —, dark/light, gestes) si
le lot migratable s'épuise.
