# K03 — MeeshySegmented (un choix entre deux à quatre options)

Relevé sur `origin/dev` `95067b7c6a5`. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Lois 7, 10 et 13 de `docs/product/composer-vue-finale.md`. Planche : `seg(items, on)` et la classe `.seg`, employées par A2, A3, A10, A13, A14, S2, S3. Dépend de K00 seul. Issue : #17583.

## 1. Rôle

Un choix exclusif entre deux à quatre options courtes, toutes visibles dans une même piste, la courante en pastille blanche à texte sombre.

Il ne fait pas :
- le libellé visible du groupe (« Lissage » en A13, « PLACE DU SON » en A14) ni ce que le choix révèle (bandes de S2, grille de S3) : c'est l'hôte ;
- la valeur, sa persistance, l'annulation : il reçoit une sélection et rend un changement ;
- le verre : il se pose DANS un hôte opaque ou de verre dense et ne porte ni matière, ni ombre, ni filet ;
- plus de quatre options, le choix multiple, le défilement : c'est K04.

## 2. API iOS (`MeeshyUI/Kit/MeeshySegmented.swift`)

- `MeeshySegmentedOption<ID: Hashable & Sendable>(id:, title: String, accessibilityLabel: String? = nil)`
- `MeeshySegmentedRole { choice, tabs }`, `MeeshySegmentedTone { media, theme }`
- `MeeshySegmented(_ label: String, selection: Binding<ID>, options:, role: = .choice, tone: = .media, pressed: ID? = nil)` ; désactivé par `.disabled()`.
- `MeeshySegmentedLaw` (`Kit/MeeshySegmentedLaw.swift`) : loi pure, valeurs seulement. Les suites lisent `docs/product/kit/K03-MeeshySegmented.vectors.json`.

Aucun emplacement : un segment est un texte sur une ligne. `label` nomme le groupe pour l'accessibilité et ne s'affiche jamais. `pressed` fige l'appui pour le catalogue.

Répartition : parts égales ; un segment ne descend jamais sous la largeur de son texte ; si la somme des largeurs minimales dépasse la piste, repli sur plusieurs rangées, dans l'ordre (remplissage glouton, puis parts égales avec plancher dans chaque rangée).

## 3. États

- Deux segments, premier courant : S2, S3. Deux segments, second courant : A3.
- Trois segments, libellé plus long que sa part : A10, A14. Trois segments à côté d'un libellé d'hôte : A13.
- Quatre segments, dernier courant : A2.
- Pressé, survol, focus, désactivé, ton `theme`, repli en rangées, RTL : pas de vue (planche figée).

Loi 13 : moins de deux options ⇒ rien n'est rendu ; une option indisponible n'est pas passée ; sélection absente des options ⇒ aucun segment courant ; ni icône, ni légende, ni compteur, ni libellé tronqué.

## 4. Gestes et retours

- Toucher un segment non courant : la sélection change, puis le rappel, puis un `light`. Toucher le courant : rien. Pas de glisser.
- La pastille glisse vers le nouveau segment (`MeeshyAnimation.springFast`) ; « Réduire les animations » : pose sans glissement (`meeshyAnimation`).
- Appui : le segment touché porte `mediaFill` (ou `controlFill` en ton `theme`) jusqu'au relâcher ; sans échelle.

## 5. Accessibilité

- Groupe : `label`. Segment : son titre, ou `accessibilityLabel` quand le titre est une abréviation.
- Rôle : iOS présente le contrôle comme un `Picker` segmenté système (`accessibilityRepresentation`), pour les deux rôles.
- Dynamic Type et `fontScale` 2,0 : la hauteur suit le texte ; repli en rangées plutôt que troncature.
- RTL : la première option est à droite ; le sens « suivant » suit la direction de lecture.
- Contraste : encre `indigo950` sur pastille blanche ; pastille contre piste au moins 4,84:1.
- Cible : piste de 44 pt (`regular` 36 + 2 × `xs` 4).

Limite iOS 16 : le pilotage au clavier matériel (`onKeyPress`) exige iOS 17 ; la loi clavier est livrée et testée (`MeeshySegmentedLaw.keyboardTarget`), son branchement au clavier d'iPad est une issue à part (décision consignée).

## 5 bis. Performance

- Seule la position de la pastille s'anime ; la taille du contrôle ne dépend pas de la sélection (même graisse pour tous les segments).
- Vue feuille `Equatable` pour les segments ; `matchedGeometryEffect` pour la pastille.

## 6. Jetons

- Segment : `MeeshyControlSize.regular` (36), marge de piste `MeeshySpacing.xs` (4) ; marge horizontale `MeeshySpacing.smPlus` (10) ; piste `MeeshyRadius.xl` (20), pastille en capsule.
- Texte : `MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold)`.
- Ton `media` : piste `MeeshyColors.controlFill(isDark: true)`, encre au repos `onMedia`, encre du courant `indigo950`.
- Ton `theme` : piste `controlFill(isDark:)`, pastille `textPrimary(isDark:)`, encre du courant `backgroundPrimary(isDark:)`.

## 7. Jumeaux

Aucun type segmenté n'existe sur `origin/dev`. K03 ne supprime rien et ne change aucun écran : les jumeaux (`TextEditToolOptions.weightSegments`, `SoundLibraryPicker`, `DrawingEditToolOptions.smoothingChip`, `ComposerFrameBand.fitChoice`, `ComposerSceneTransitionRows`, `KeyframeInspector`, `CallCaptionsViews`, les 15 autres `.pickerStyle(.segmented)`) sont absorbés par les lots d'intégration I1, I3, I4, I6 et I10.

## 8. Témoins

- Comportements : `MeeshySegmentedLawTests` (loi, vecteurs partagés) — Swift Testing, sur `docs/product/kit/K03-MeeshySegmented.vectors.json`.
- Instantanés : `MeeshySegmentedSnapshotTests` — `deux`, `deux-second`, `trois-long`, `trois-milieu`, `quatre`, `theme`, `desactive` en clair et sombre ; `presse` ; planches `grande-police` et `rtl`. Enregistrés par SnapshotTesting sur la CI macOS (aucune capture produite dans le conteneur).

## 9. Catalogue

Entrée K03 (`MeeshyKitCatalog+K03.swift`) : `deux` S2, `deux-second` A3, `trois-long` A10 sur `media`, `trois-milieu` A14, `quatre` A2 sur `dark` ; `theme` sur `light` ; `desactive`.

## 10. Choix retenus

- Rôle : `choice` par défaut (A2, A13, A14, S2) ; `tabs` pour ce qui change le contenu voisin (A3, A10, S3).
- Hauteur : 36 + 4 de marge pour une piste de 44 (la planche montre 34 + 3).
- Encre du courant : `indigo950` (jeton déjà employé par les pastilles de l'appel) plutôt que `#0E1117`.
- Ton `theme` : ajouté pour que les sites hors média puissent adopter le composant.
- A10 : la planche montre trois segments ; iOS porte cinq types. K03 ne les absorbe pas (I4).
