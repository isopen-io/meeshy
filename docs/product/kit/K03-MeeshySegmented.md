# K03 — MeeshySegmented (un choix entre deux à quatre options)

Relevé sur `origin/dev` `95067b7c6a5` le 2026-11-11. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Lois 7, 10 et 13 de `docs/product/composer-vue-finale.md`. Planche : `seg(items, on)` et la classe `.seg`, employées par A2, A3, A10, A13, A14, S2, S3. Dépend de K00 seul.

Issue du lot : #17583. Décision liée : #17586.

## 1. Rôle
Un choix exclusif entre deux à quatre options courtes, toutes visibles dans une même piste, la courante en pastille pleine.

Il ne fait pas :
- le libellé visible du groupe (« Lissage » en A13, « PLACE DU SON » en A14) ni ce que le choix révèle (les bandes de S2, la grille de S3) : c'est l'hôte ;
- la valeur, sa persistance, l'annulation : il reçoit une sélection et rend un changement ;
- le verre : il se pose DANS un hôte opaque ou de verre dense (panneau, feuille, plaque, pilule agrandie) et ne porte ni matière, ni ombre, ni filet ;
- plus de quatre options, le choix multiple, le défilement : c'est K04.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshySegmented.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-segmented.tsx` |
|---|---|---|---|
| Option | `MeeshySegmentedOption<ID: Hashable & Sendable>(id:, title: String, accessibilityLabel: String? = nil)` | `MeeshySegmentedOption<T>(id, title, contentDescription: String? = null)`, `@Immutable` | `{ id: T; title: string; label?: string; controls?: string }` |
| Rôle | `MeeshySegmentedRole { choice, tabs }` | `enum class MeeshySegmentedRole` | `'choice' \| 'tabs'` |
| Ton | `MeeshySegmentedTone { media, theme }` | `enum class MeeshySegmentedTone` | `'media' \| 'theme'` |
| Contrôle | `MeeshySegmented(_ label: String, selection: Binding<ID>, options:, role: = .choice, tone: = .media, pressed: ID? = nil)` ; désactivé par `.disabled()` | `MeeshySegmented(label, selected: T, onSelect: (T) -> Unit, options: List<…>, modifier, role = Choice, tone = Media, enabled = true, pressed: T? = null, haptics = rememberMeeshyHaptics())` | `<MeeshySegmented label \| labelledBy value onChange options role tone disabled pressed className>` |
| Loi pure | `MeeshySegmentedLaw` (`Kit/MeeshySegmentedLaw.swift`) | `MeeshySegmentedLaw` | `meeshy-segmented-law.ts` |

- Aucun emplacement : un segment est un texte, sur une ligne. `label` nomme le groupe pour l'accessibilité et ne s'affiche jamais. `pressed` fige l'appui pour le catalogue.
- `MeeshySegmentedLaw` rend en valeurs : les options rendues, l'index courant (ou aucun), le voisin au clavier (sens, RTL, bouclage), « ce toucher change-t-il quelque chose ? », et la répartition (ci-dessous). Les trois suites lisent `docs/product/kit/K03-MeeshySegmented.vectors.json`.
- Répartition, celle du `flex:1` de la planche : parts égales ; un segment ne descend jamais sous la largeur de son texte (A10, A14 : largeurs inégales) ; si la somme des largeurs minimales dépasse la piste, repli sur plusieurs rangées, dans l'ordre. iOS et Android l'appliquent dans un `Layout` ; le web l'obtient par `flex: 1 1 0; min-width: min-content; flex-wrap: wrap`.

## 3. États
- Deux segments, premier courant : S2 (Ajuster), S3 (Ouverture), dans la pilule agrandie.
- Deux segments, second courant : A3 (Contour), dans le panneau du clavier.
- Trois segments, un libellé plus long que sa part : A10 (Effets de visage), dans la plaque ; A14 (Fond de la scène), dans la feuille.
- Trois segments à côté d'un libellé d'hôte, le contrôle prenant la place restante : A13 (Courbe).
- Quatre segments, dernier courant : A2 (Gras).
- Pressé (segment non courant, le temps de l'appui), survol au pointeur, focus clavier, désactivé, ton `theme`, repli en rangées, RTL : aucune vue (planche figée).

Loi 13 :
- moins de deux options : rien n'est rendu, pas même la piste ;
- une option indisponible n'est pas passée : pas de segment grisé ; un réglage sans objet (Transitions sans fond média) n'est pas monté par l'hôte ;
- sélection absente des options : aucun segment courant, aucune pastille ;
- ni icône, ni légende, ni compteur, ni estompe de bord, ni libellé tronqué.

## 4. Gestes et retours
- Toucher un segment non courant : la sélection change dans la même image, puis le rappel. Toucher le courant : rien, ni rappel ni retour haptique. Pas de glisser de la pastille.
- Haptique : un `light` par changement effectif, joué par le composant au site unique (`HapticFeedback.light()`, `MeeshyHaptics.light()`, `impact('light')` de `lib/view/haptics.ts`). Rien si désactivé.
- La pastille glisse vers le nouveau segment (`MeeshyAnimation.springFast` et son pendant `MotionSpecs`, 250 ms sur le web) ; l'encre des deux segments concernés bascule en même temps.
- « Réduire les animations » (`meeshyAnimation`, `LocalReduceMotion`, `prefers-reduced-motion`) : la pastille est posée, sans glissement.
- Appui : le segment touché porte `mediaFill` (ou `controlFill` en ton `theme`) jusqu'au relâcher ; sans échelle. Survol : même fond, à `(hover: hover)` seulement.

## 5. Accessibilité
- Nom : le groupe porte `label` ; chaque segment porte son titre, ou `accessibilityLabel` quand le titre est une abréviation.
- Rôle et valeur. iOS : le contrôle se lit comme le contrôle segmenté du système (`accessibilityRepresentation` par un `Picker` segmenté : « Normal, bouton, 2 sur 4, sélectionné »), pour les deux rôles. Android : `selectableGroup`, chaque segment `selectable` en `Role.RadioButton` (`choice`) ou `Role.Tab` (`tabs`), position par `collectionInfo`. Web : `radiogroup` / `radio` / `aria-checked` (`choice`), `tablist` / `tab` / `aria-selected` et `aria-controls` (`tabs`).
- Ordre de lecture : celui des options, y compris replié en rangées.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le texte et la hauteur minimale suivent ; jamais de troncature ni de défilement, le repli en rangées prend le relais (pas de défilement horizontal à 320 px).
- Clavier (web, clavier d'iPad et d'Android) : un seul arrêt de tabulation, sur le segment courant ; flèches vers le voisin, qui le sélectionne, en boucle ; Début et Fin ; Espace et Entrée. `:focus-visible` : contour 2 px décalé de 2 px, à l'encre du ton.
- RTL : la première option est à droite, les flèches horizontales s'inversent, le glissement suit ; marges logiques.
- Contraste, calculé sur les jetons. Encre sur pastille : 15,99:1. Encre blanche sur piste : 12,48:1 dans un panneau opaque, 4,84:1 dans un verre dense sur blanc pur (le pire hôte admis). Pastille contre piste : au moins 4,84:1. Ton `theme` clair : 13,12:1 et 15,99:1. Un verre non dense sur contenu clair donnerait 2,73:1 : l'hôte est opaque ou dense, jamais la scène nue.
- Cible : piste de 44 pt / px ; 48 dp sur Android par `minTouchTarget`, sans changer le dessin.

## 5 bis. Performance
- Ne se re-rend jamais : l'hôte, la piste et les segments non concernés quand la sélection change (options `Equatable` / `@Immutable` / `memo`, liste stable).
- La taille du contrôle ne dépend pas de la sélection : même graisse pour le courant et les autres, donc aucune mise en page de l'hôte au changement.
- Ce qui s'anime : la position de la pastille seule. iOS : `matchedGeometryEffect` d'une capsule. Android : bornes animées lues en phase de dessin (`drawBehind`), sans recomposition. Web : `transform` d'une pastille unique, dont la géométrie est écrite en variables CSS par référence (ni état ni rendu Preact), la largeur étant posée d'un coup ; avant la première mesure, le segment courant porte lui-même son fond.
- Web : un `ResizeObserver` par contrôle, retiré au démontage ; aucun écouteur pour l'appui ; rien d'ajouté à la première peinture.
- Budget : aucune image perdue pendant le toucher ni pendant le glissement ; rien de retenu une fois l'écran quitté.

## 6. Jetons et mesures
Mesures de la planche : piste `padding` 3, rayon 20, fond blanc 10 % ; segment hauteur 34, rayon 17, marge horizontale 10, texte 12,5 px / 700, une ligne ; courant : fond `#fff`, encre `#0E1117`.

Jetons :
- segment `MeeshyControlSize.regular` (36), marge de piste `MeeshySpacing.xs` (4), soit une piste de 44 ; marge horizontale `MeeshySpacing.smPlus` (10) ; piste `MeeshyRadius.xl` (20), pastille en capsule ;
- texte : `MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold)`, `labelMedium` en gras, `--ios-font-subhead` à 700 ;
- ton `media` : piste `MeeshyColors.controlFill(isDark: true)` (blanc 10 %, la valeur de la planche), pastille et encre au repos `onMedia`, encre du courant `indigo950` (`MeeshyPalette.Indigo950`, `--ios-indigo-950`) ;
- ton `theme` : piste `controlFill(isDark:)`, pastille `textPrimary(isDark:)`, encre du courant `backgroundPrimary(isDark:)` (`--color-ios-ink`, `--color-ios-surface`) : une pastille inverse, lisible en clair comme en sombre.

## 7. Jumeaux
- iOS. Aucun type n'existe (registre confirmé) : le composant est créé, sur la forme de la rangée `smoothingChip`. Absorbés à l'intégration : `weightSegments` (`TextEditToolOptions`, A2) et le `Picker` de `SoundLibraryPicker` par I3 ; `smoothingChip` (`DrawingEditToolOptions`, A13) par I4 ; `fitChoice` (`ComposerFrameBand`, S2), les deux rangées de `ComposerSceneTransitionRows` (S3) et le `Picker` de `KeyframeInspector` par I6 ; le `Picker` du journal (`CallCaptionsViews`) par I1 ; les 15 autres `.pickerStyle(.segmented)` par I10. Hors K03 : `ComposerLookFilterChips`, `StickerSheetTabBar`, `PackShopTabBar`, `MediaHubSegmentChip` (plus de quatre positions ou défilantes : K04).
- Android. Aucun type Meeshy : créé d'après la fiche et le composant iOS. Absorbés : `SingleChoiceSegmentedButtonRow` de `CallJournalPanel` (I1), de `SoundShelfSheet` (I3), de `MyStoriesChrome`, `ShareSendBar`, `CommunityDetailScreen`, `LegalDocumentScreen`, `SettingsAppearanceSection` (I10) ; `SmoothingOptions` (`ComposerDrawingOptionPanel`, I4) ; `FitChoice` (`ComposerSceneFrameUi`, I6).
- Web. DEVIENT le composant : `CallJournalViewSwitch` (`components/call-journal-view-switch.tsx`), supprimé par I1. Absorbés : les `Token` de cadrage de `routes/story-compose-frame.tsx` (I6) ; le groupe des périodes de `conversation-stats-section.tsx` et `OutputPicker` de `routes/thread-export-output.tsx` (I10). Hors K03 : `SpeedPanel` (six vitesses), les barres d'onglets de page (`profile-tabs`, `community-tabs`, `discover-parts`, `admin/tabs`). Réutilisé : la loi de `nextRadioIndex` (`lib/profile-decor/radio-keys.ts`).
- K03 ne supprime rien et ne change aucun écran.

## 8. Témoins exigés
Comportements (`MeeshySegmentedTests`, `MeeshySegmentedTest`, `meeshy-segmented.test.tsx`) :
- toucher un segment non courant : un changement, un rappel, un haptique ; toucher le courant : aucun des trois ;
- 2, 3, 4 options rendues dans l'ordre ; moins de deux : rien ; sélection hors options : aucun courant ;
- nom du groupe, nom de chaque segment (`accessibilityLabel` prioritaire), un seul sélectionné, rôle selon `role` ;
- clavier : un seul arrêt de tabulation, flèches, Début, Fin, bouclage, et l'inversion RTL prouvée sur un index autre que le premier ;
- désactivé : ni rappel ni haptique ; « réduire les animations » : pas de glissement ;
- répartition : parts égales, plancher au texte, repli en rangées (vecteurs partagés) ;
- la largeur du contrôle est la même avant et après un changement de sélection ;
- changer la sélection ne re-rend pas les segments non concernés (web : compteur de rendus) ;
- contrastes du § 5 recalculés depuis les jetons.

Instantanés (`MeeshySegmented/<id>.<variante>`) : `deux`, `deux-second`, `trois-long`, `trois-milieu`, `quatre`, `theme`, `desactive` en `clair` et `sombre` ; `presse` pour ceux qui se touchent ; planches `grande-police` (repli visible) et `rtl` ; web à 390, 820 et 1440 px.

Catalogue : entrée K03 (`MeeshyKitCatalog+K03.swift`, `KitCatalogK03.kt`, `catalog/k03.tsx`, vides sur `dev`). États et vues : `deux` S2, `deux-second` A3, `trois-long` A10 sur `media`, `trois-milieu` A14, `quatre` A2 sur `dark` ; `theme` sur `light` ; `desactive`. L'échantillon se pose sur un panneau opaque : il ne dépend pas de K01.

## 9. Écarts connus et choix retenus
- Registre, Android : « aucun contrôle segmenté » est faux, sept sites Material. Registre, iOS : aucun type, mais 19 `Picker` segmentés et deux rangées dessinées à la main.
- Rôle : le registre dit « onglet », la planche `role="group"`. Retenu : `role`, `choice` par défaut (A2, A13, A14, S2), `tabs` pour ce qui change le contenu voisin (A3, A10, S3).
- Hauteur : 34 + 3 sur la planche, 36 + 4 retenus, pour une piste de 44 sans zone invisible.
- Encre du courant : `#0E1117` sur la planche, `indigo950` retenu (jeton déjà employé par les pastilles de l'appel).
- Ton `theme` : absent de la planche, ajouté pour que les sites hors média puissent adopter le composant.
- Web : pas de jeton `controlFill` ; le 10 % vit une seule fois dans les styles du composant.
- A10 : la planche montre trois segments, iOS porte cinq types et des ambiances en puces (#17267). K03 ne les absorbe pas ; I4 tranche, lecture proposée : quatre segments de type, « Tout » et les ambiances restant en puces.
- S2 : iOS et Android montrent deux disques à icône (directive du 2026-09-27), la planche deux segments libellés : la planche, plus récente, l'emporte à I6.
- S3 : iOS empile deux rangées (#8792), la planche un segment Ouverture / Fermeture et une grille : I6, rien n'est perdu.
- A13 : le code dit « Droite », la planche « Ligne » : le vocabulaire revient à `meeshy-composer-modele.md` (I4).
- A2, A3, A14 : ni graisse sur Android et le web, ni bascule Texte / Contour, ni « Place du son » nulle part : I3 les construit.
- I1 : `CallJournalViewSwitch` porte un filet et `aria-pressed` ; le remplacer change d'un rien l'aspect et l'annonce, à montrer dans les captures.

## 10. Lecture iOS (lot K03-ios)
- Fichiers : `MeeshyUI/Kit/MeeshySegmented.swift` (`MeeshySegmentedOption`, `MeeshySegmentedRole`, `MeeshySegmentedTone`, `MeeshySegmentedPalette`, `MeeshySegmented`), `MeeshyUI/Kit/MeeshySegmentedLaw.swift` (loi pure, `nonisolated`), `Kit/Catalog/MeeshyKitCatalog+K03.swift`. Témoins : `MeeshySegmentedTests` (loi sur les vecteurs, `tapResult`, `rendered`, `spokenName`), `MeeshySegmentedRenderTests` (rien sous deux options, taille indépendante de la sélection, piste de 44, repli sans débord, contrastes), `MeeshySegmentedSnapshotTests` (images enregistrées par la CI macOS).
- La loi rend aussi `rendered(_:)` (les options rendues, ou aucune) et `tapResult(current:target:isEnabled:)` (l'index sélectionné, `nil` ⇒ ni rappel ni haptique) ; les touches sont `MeeshySegmentedLaw.Key` (`left`, `right`, `home`, `end`, `space`, valeurs brutes des vecteurs).
- `MeeshySegmentedPalette(tone:isDark:)` porte les cinq teintes d'un ton (piste, pastille, encre au repos, encre du courant, fond d'appui) : la vue et le témoin de contraste lisent la même. Le témoin vérifie 15,99:1 encre sur pastille et AA (4,5:1) partout ailleurs sur les panneaux opaques déclarés (`backgroundPrimary`, `backgroundSecondary`) ; les ratios du § 5 dans un verre dense dépendent de la recette de K01 et se mesurent à l'intégration.
- `Layout` : largeurs idéales mesurées en cache (une fois par changement de segments), rangées et parts par la loi, une option seule plus large que la piste y est bornée et son texte passe à la ligne plutôt que de déborder ou de se tronquer. Le placement s'écrit de gauche à droite : SwiftUI le retourne en RTL.
- Clavier matériel : `focusable` + `onKeyPress` (flèches, Début, Fin) à partir d'iOS 17 ; un seul arrêt de focus pour la piste. Sous iOS 16, pas de pilotage au clavier matériel (#17586) ; VoiceOver et le contrôle d'accès complet passent par la représentation `Picker`.
- Survol au pointeur (iPad) : `onHover`, même fond que l'appui. Désactivé : l'opacité désactivée du kit (`MeeshyGlassButtonRecipe.disabledOpacity`, celle de K02) sur toute la piste, aucun segment grisé seul ; ni rappel ni haptique.
- Le catalogue reprend les libellés et la sélection des vues (S2, A3, A10, A14, A2) dans une piste de 320 pt, `tabs` pour A3 et A10.
