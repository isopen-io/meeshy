# K07 — MeeshyColorDots (les pastilles de couleur)

Fiche de contrat du composant. Lot K07 du chantier « kit de la planche » (#17312), issue #17616.
Source de dessin : `docs/product/composer-vue-finale/planche.html` (`dots()`, A3, A13, S1). Lois 7, 9, 10, 13.

## Rôle
Un groupe de choix unique : des disques de couleur, un seul courant et cerclé ; toucher un disque le choisit.
Ne fait pas : la palette ni son ordre (l'hôte), l'application de la couleur, le titre, le panneau, le verre, la couleur libre, le fond du texte ▣ (A4), la pastille d'un trait (K02), les vignettes de look (K19).

## API iOS (`MeeshyUI/Kit/MeeshyColorDots.swift`)
- `MeeshyColorDots(_ dots:selection:label:size:layout:tone:haptic:onSelect:trailing:)`, défauts : `selection = nil`, `size = .s28`, `layout = .wrap`, `tone = nil`, `haptic = .light`.
- `MeeshyColorDot(id:fill:name:systemImage:)`, `MeeshyColorDotFill { solid, gradient, hollow }`.
- `MeeshyColorDotSize { s28, s32 }`, `MeeshyColorDotsLayout { wrap, row }`, `MeeshyColorDotHaptic { light, none }`.
- `MeeshyColorDotsRecipe.resolve(count:available:size:layout:)` : seule source de la géométrie (par ligne, défilement).

## États
Courante cerclée ; sans courante (aucun cercle) ; `row` qui défile ; pressé (pré-cercle 50 %) ; désactivé (contenu 40 %, ni action ni haptique) ; dégradé, disque creux, glyphe.

## Accessibilité
Groupe nommé `label` ; chaque pastille nommée par `name`, sinon par sa position (« Couleur n sur m »). Trait `.isSelected` sur la courante. Cible 44 pt, cellules jointives.

## Choix retenus (mode autonome)
1. `wrap` par défaut ; `row` pour la plaque du dessin.
2. Cellule 44 pt tenue : l'écart visible passe de 9 à 12, pas de cible de 37 à 39.
3. Deux tailles : 28 et 32.
4. Courante : cercle blanc (encre du ton) hors du disque, sans échelle ni coche.
5. Nom fourni par l'hôte, sinon position ; jamais le code.
6. Valeur et rappel, identifiants opaques ; retoucher la courante rappelle `onSelect`.
7. Remplissage uni, dégradé ou creux, glyphe optionnel.
8. Un emplacement `trailing` hors du groupe de choix.
9. Aucun verre dans K07 ; l'encre suit le ton.
10. Un `light` par le site unique ; `none` possible.
11. Aucun jumeau rebranché dans ce lot (lots d'intégration I3, I4, I6, I10).

## Écarts connus, non résolus dans ce lot
- Position « Couleur n sur m » en anglais dans le code : la chaîne localisée (catalogue `.xcstrings`, miroir Android) reste à ouvrir.
- Pas de défilement automatique vers la courante en `row`.
- Contraste du glyphe non calculé (glyphe blanc fixe).
- Instantanés non enregistrés : ils se produisent sur la CI (`sdk-tests.yml`) avec `record_snapshots`.
