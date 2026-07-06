# Plan — Itération 133i (iOS) : `ReelRepostEmbedCell`

**Base** : `main` HEAD (`b6ba87ee`, 6 PR ouvertes calls/gateway/typing — aucune sur ce fichier → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type — annotation de gel (glyphes décoratifs de bande média fixe) — doctrine 86i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

132i mergé (#1410, `StatusBubbleController`) → **133i**. Ranking des surfaces fraîches →
`ReelRepostEmbedCell` (3 `.system(size:)`, 0 doctrine, 0 `relative`). 3 glyphes décoratifs bornés par la
bande média de hauteur fixe (`stripHeight = 116`).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `music.note` backdrop (30 semibold) | **FIGÉ** + commentaire 86i |
| `play.fill` affordance centrale (18 bold) | **FIGÉ** + commentaire 86i |
| `play.rectangle.on.rectangle.fill` badge Réel (13 bold) | **FIGÉ** + commentaire 86i |

## Règles respectées

1. Glyphe décoratif **borné par une vignette de dimension fixe** (bande média `.frame(height: 116)`),
   **sans texte adjacent** → **figé** (86i). Distinction avec 130i (`ReelFeedCard`, badge `.padding`-driven
   sur média plein-cadre → migré).
2. A11y déjà en place (`reelBadge` masqué ; carte `Button` `children:.ignore` + label) → intacte, pas de
   `.accessibilityHidden` redondant.
3. Palette (hex auteur, blanc, ultraThinMaterial) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. `Equatable` préservé.

## Étapes

1. [x] Resync main (133i car 132i mergé) ; contention vérifiée (6 PR ouvertes calls/gateway — aucune sur ce fichier).
2. [x] 3 gels commentés 86i.
3. [x] Vérifier : 3 `.system` restants (tous figés + commentés) ; tests helpers/coordinateur inchangés.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 134i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `AchievementBadgeView` (3), `SyncPill` (3), les fichiers à 2 `.system`, ou **démarrer la passe
state-of-the-art** (hexes inline vs tokens — `F8B500`/`9B59B6` FeedView, `9933CC`
ConversationAnimatedBackground —, cohérence dark/light, gestes standards) si le lot migratable s'épuise.
