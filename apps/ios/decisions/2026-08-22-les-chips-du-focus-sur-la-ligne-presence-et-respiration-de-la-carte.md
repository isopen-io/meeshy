## 2026-08-22 : les chips du focus SUR la ligne, présence et respiration de la carte, affiliations en état vide

**Statut**: Accepté (directives utilisateur, 3ᵉ lot de la nuit)

**Décision**:
1. **Chips du message en focus SUR la ligne de la carte** — « comme CATÉGORIE dans la liste » : la bande (drapeaux, icône de traduction, (+), réactions) déborde sous le contenu de `FocalMetrics.FocusStrip.overhang` (= demi-chip 16 + 4 pt, la carte s'arrêtant à `Row.paddingVertical − focusCardInnerMargin` du bas de la cellule) par un rembourrage bas NÉGATIF — la hauteur réservée ne change pas (zéro relayout) ; chips OPAQUES (fond secondaire + teinte accent) posées sur le trait ; la cellule en focus ne rogne plus (`clipsToBounds = false` cellule + contentView) et passe au-dessus de ses voisines (`layer.zPosition = 1` le temps du focus).
2. **Pastille de présence sur la carte de focus** : `LentilleFocusCard.presenceState` → `MeeshyAvatar(presenceState:)`, relue par l'hôte à chaque tick via `presenceFor` — MÊME source que la rangée plate (`PresenceManager.presenceState(for: participantUserId)`), `.offline`/`nil` = aucun point.
3. **Respiration autour de la rangée magnifiée** (« le triple de l'espace actuel ») : `LentilleFocusBreathing` (`Lentille/Mode/`, hors du dossier gelé Perspective) — translation de compositor `visualEffect` : les voisines s'écartent de la ligne de focus de `FocusCard.breathing` (12 pt) × niveau de scène, rampe nulle sous une demi-rangée (l'élue ne bouge pas, la carte non plus) et pleine une rangée plus loin (jamais de saut au passage). Même repère et même `distance` que `LentillePerspective`.
4. **Libellé** : « Conversations avec ce tag » (7 langues). **État vide** : troisième héros « Voir mes affiliations » (`router.push(.affiliate)` — les personnes invitées qui sont venues), dégradé partage→violet.
5. Badge non-lus de la carte `fixedSize` + priorité 3 : c'est le NOM qui tronque, jamais le badge (il se comprimait en « ⋮ »).

**Alternatives rejetées**: pousser les voisines par une hauteur de rangée variable (relayout à chaque tick) ; un `.offset` dans `LentillePerspective` (dossier gelé « opacité et échelle seules », garde de source) ; rendre la bande en overlay hors cellule (elle doit défiler avec le message).
