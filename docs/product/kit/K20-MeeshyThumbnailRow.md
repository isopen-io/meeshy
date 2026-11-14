# K20 — MeeshyThumbnailRow (la rangée de vignettes)

Relevé sur `origin/dev` `0af2664ebf4` le 2026-11-13. Chantier #17312, milestone 258 ; issue du lot : #18084. Dépend de K00 et de K09 (l'anneau des fantômes) ; lit le ton de K01 sans poser de verre. Lois 2, 11 et 13 de `docs/product/composer-vue-finale.md`. Planche : `thumb()` (ligne 204), `srow()` (205), `.th` et `.th.cur` (98-100). Vues du registre : R5, R6, A7, I1, I4. Deux autres emploient la rangée sans être citées : R10 (dix vignettes de 17 × 30, sans « + ») et I2 (par `ipadL()`).

## 1. Rôle
Une rangée de vignettes ordonnées, posée en surimpression sans cadre ni verre : elle cercle la courante, finit par « + », montre ce qui s'envoie ou attend, et se réordonne au doigt.

Elle ne fait pas :
- le contenu d'une vignette : l'hôte le peint (composite de scène, photo, image d'une vidéo), le met en cache et le décode. K20 ne connaît ni scène, ni diapo, ni média ;
- l'état : l'ordre, la courante et la progression appartiennent à l'hôte, appliqués tout de suite (optimiste) ;
- le seuil « à partir de deux scènes », le plafond de dix et son refus (K14), la confirmation de suppression, l'annulation (↶) ;
- les chaînes : noms, valeurs dites et noms d'actions viennent de l'hôte ;
- le fantôme posé SUR la scène (aperçu, annuler, Réessayer) ni le calcul de la progression ;
- sa place dans l'en-tête ni la largeur qu'on lui laisse ;
- les voisins : bande de choix (K19), piste de coupe (K21), pellicule de la visionneuse, plateau des stories.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyThumbnailRow.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-thumbnail-row.tsx` |
|---|---|---|---|
| Rangée | `MeeshyThumbnailRow(_:current:label:words:…content:)` | `MeeshyThumbnailRow(items, current, label, words, modifier, …, content)` | `<MeeshyThumbnailRow items current label words … renderContent />` |
| Vignette (valeur) | `MeeshyThumbnail<ID: Hashable & Sendable>`, `Equatable` | `MeeshyThumbnail<T>`, `@Immutable` | `MeeshyThumbnail`, `id: string` |
| Statut | `MeeshyThumbnailStatus { ready, preparing, sending(Double), waiting, failed }` | idem (scellé) | union équivalente |
| État remis au contenu | `MeeshyThumbnailState { isCurrent, isLifted, status, size }`, `Equatable` | idem, stable | idem |
| Mots | `MeeshyThumbnailRowWords { add, duplicate, moveEarlier, moveLater }` | idem | idem |
| Lois pures | `MeeshyThumbnailRowRule` (`items`, `tap`, `effect`, `targetIndex`, `shift`), `MeeshyThumbnailRowFit.resolve(…)`, `MeeshyThumbnailRowRecipe.resolve(…)` | idem | `meeshyThumbnailRowRule`, `meeshyThumbnailRowFit`, `meeshyThumbnailRowRecipe` (`meeshy-thumbnail-row-rule.ts`) |

Paramètres, opaques, mêmes défauts partout :
- `items` (ordonnées) ; `current: ID?` (la cerclée, `nil` = aucune) ; `label` (nom du groupe, obligatoire) ; `words` (obligatoire) ;
- rappels, tous absents par défaut, et un rappel absent retire son geste ET son affordance : `onSelect(id)`, `onAdd()`, `onDuplicate(id)`, `onMove(id, toIndex)` (rang FINAL, base 0), `onRemove(id)` ;
- `tileHeight = 48`, `minTileHeight = 32`, `aspectRatio = 9/16`, `alignment = center`, `haptic = standard` (`none`), `tone` (celui de l'hôte) ;
- `actions: ((ID) -> [MeeshyThumbnailAction])? = nil` : actions d'accessibilité de l'hôte (nom, effet) ;
- désactivée : `.disabled(_:)` (iOS), `enabled = true` (Android), `disabled` (web).

Une vignette : `id`, `accessibilityLabel` (obligatoire, « Scène 2 sur 4 »), `accessibilityValue = nil` (« Envoi 60 % », « En attente »), `status = ready`, `removeLabel = nil` (non nul = supprimable, « Supprimer la scène 2 »), `contentVersion = 0` (l'hôte l'incrémente quand l'aperçu change : seule cette vignette se redessine).

Un emplacement : `content(item, state)`, obligatoire, rogné à la forme de la vignette. Le « + », la croix, l'anneau, le voile et le pointillé sont dessinés par le kit.

## 3. États
- repos, courante cerclée de blanc, « + » en dernier : R5 (quatre et « + ») ; I1, I2, I4 (trois et « + ») ;
- courante au milieu : R6 ; en fin : R10 ;
- serrée, dix vignettes réduites, sans « + » : R10 ;
- armée après un appui long, croix rouge au coin : R6 ;
- soulevée et glissée (agrandie, inclinée, cerclée), pointillé sur la place visée : R6 ;
- envoi, anneau K09 à 60 % : A7 (troisième) ; attente, voile et minuteur : A7 (quatrième) ;
- préparation (anneau indéterminé) et échec (voile, glyphe d'alerte) : aucune vue, loi 11 ;
- défilante (même réduite, elle ne tient pas), pressée, survol et focus clavier, désactivée, ton `onLight` : aucune vue, conservés du code.

Loi 13 :
- sans vignette ni `onAdd`, rien n'est rendu, ni hauteur ni marge ; le seuil « deux » reste à l'hôte ;
- pas de « + » sans `onAdd` (plafond atteint), jamais grisé ;
- pas de croix au repos ; elle n'existe que sur la vignette armée, et si `removeLabel` existe ;
- pas d'anneau sur une vignette prête, pas de chiffre sous 22 de diamètre, pas de voile pendant l'envoi ;
- pas de pointillé hors d'un glisser ;
- ni cadre, ni verre, ni bande, ni barre de défilement, ni estompe ; ni numéro, ni nom dessiné ; ni bouton « Terminé », ni tremblement.

## 4. Gestes et retours
- Toucher : `onSelect` part tout de suite, sans attendre un éventuel second toucher ; la courante ne répond pas (ni rappel ni haptique).
- Double toucher : un second toucher sur la même vignette en moins de 300 ms appelle `onDuplicate(id)`.
- Appui long (400 ms, annulé au-delà de 10 de déplacement) : la vignette s'ARME sans devenir la courante. Glisser dans le même geste la déplace ; relâcher sans glisser la laisse armée.
- Armée : la croix appelle `onRemove(id)` (l'hôte confirme) ; glisser la vignette la déplace aussitôt ; tout autre toucher désarme sans naviguer ; « + » ajoute et désarme ; un dépôt désarme.
- Glisser : la vignette suit le doigt ; place visée = `round(translation / pas)`, bornée ; les voisines s'écartent d'un pas, le pointillé marque la place visée. Au lâcher, UN `onMove(id, rang final)`, rien si la place n'a pas changé ; geste annulé = retour. Rangée défilante : le défilement est gelé, et elle avance seule près d'un bord.
- « + » : `onAdd` au relâcher ; appui à 85 %, aucune échelle.
- Animations : cercle en fondu (200 ms) ; soulèvement en ressort vers × 1,15 et −6° ; voisines, redimensionnement et arrivée d'une vignette en 200 ms ; la courante vient en vue en 250 ms.
- « Réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`) : ni inclinaison, ni échelle, ni ressort ; soulevée = cercle et ombre ; voisines et pointillé sautent.
- Haptique, par le site unique (`HapticFeedback`, `MeeshyHaptics`, `impact()` de `lib/view/haptics.ts`) : `light` au changement de courante et à la duplication, `medium` à l'armement, un cran par place franchie (`rigid()` iOS, `selection()` Android, `impact('light')` web) ; rien sur un toucher ignoré ; `none` laisse l'hôte jouer le sien.

## 5. Accessibilité
- Groupe nommé `label`. Chaque vignette est un bouton nommé `accessibilityLabel`, valeur `accessibilityValue`, courante ou non (iOS `.isSelected`, Android `selected`, web `aria-current`). Le contenu, l'anneau et le voile sont masqués.
- Actions nommées par vignette, selon les rappels présents : `words.duplicate`, `words.moveEarlier`, `words.moveLater` (absentes en bout de rangée), `removeLabel`, puis celles de l'hôte. Aucun geste n'est la seule voie.
- « + » : bouton nommé `words.add`. Croix : bouton nommé `removeLabel`.
- Ordre : les vignettes dans leur ordre, puis « + ». Le focus d'accessibilité amène la vignette en vue.
- Cible : 44 pt, 48 dp, 44 px en hauteur ; en largeur, le pas (vignette et écart, sans zone morte), 33 au repos et jamais sous 24. Croix : 44.
- Dynamic Type, `fontScale` 2,0 : aucun texte, les vignettes gardent leur taille. Zoom 200 % : mesures en `rem`, la loi d'ajustement se rejoue.
- Web, clavier : un seul arrêt de tabulation (la courante, sinon la première) ; ← → (inversées en arabe), Début, Fin ; Entrée ou Espace = aller ; Alt + ← → = déplacer d'un rang ; Suppr = `onRemove` ; Ctrl ou ⌘ + D = dupliquer ; Échap désarme ou annule le glisser ; « + » en dernier. Anneau `:focus-visible` lisible sur le cercle blanc. À la souris, le glisser part dès 4 px.
- RTL : ordre, sens du glisser et coin de la croix miroités ; contenu et inclinaison non retournés.
- Contraste, calculé depuis la recette (`worstContrast`) : cercle, filet du « + » et croix tiennent 3:1 dans les trois tons. Ton `onLight` (scène claire) : un filet sombre entoure chaque vignette et le voile du « + » passe à 62 %. Aucune matière : rien à faire sous « réduire la transparence ».

## 5 bis. Performance
- Ne se re-rend jamais : l'hôte pendant un appui ou un glisser (un seul `onMove`, au lâcher) ; les vignettes dont l'état n'a pas bougé quand la courante change (deux au plus se redessinent) ; les autres quand une progression avance.
- S'anime : la translation, l'échelle et la rotation de la soulevée, la translation des voisines, l'opacité du cercle. Jamais la mise en page, jamais un flou.
- iOS : cellule `Equatable` sur ses valeurs, glisser dans l'état local de la rangée. Android : `key(id)`, `graphicsLayer` lu en phase de dessin. Web : capture du pointeur, transformations écrites par référence, sans état Preact par image.
- K20 ne décode, ne compose ni ne met en cache aucune image ; l'ajustement se calcule au changement de largeur ou de nombre, pas par image.
- Budget : dix vignettes glissées sans image perdue, à 120 Hz comme sur un appareil d'entrée de gamme ; rien de retenu une fois l'écran quitté (minuteries annulées, écouteurs retirés) ; web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : vignette 28 × 48, rayon 8, écart 6 ; serrée 17 × 30 (R10) ; cercle blanc de 2 collé à la vignette, ombre 0 / 4 / 12 à 45 % ; « + » à la taille d'une vignette, voile noir 35 %, filet blanc 1,5 à 85 %, glyphe 16 ; pointillé 1,5 blanc à 60 % ; soulevée 32 × 56, −6°, ombre 0 / 14 / 30 à 60 % ; croix : disque rouge de 24, filet blanc 1,5, glyphe 12, débord de 8 et 10 ; anneau d'envoi de 22 sur disque d'ombre ; attente : voile 50 %, minuteur de 14.

Loi d'ajustement (`MeeshyThumbnailRowFit`) : largeur = hauteur × 9/16 (27 × 48 au repos, 18 × 32 au plus serré) ; la hauteur descend de 48 à 32 pour tenir dans la largeur, l'écart reste 6 ; en dessous, la rangée défile. Dix vignettes : 324 de large à 48, 234 à 32.

Jetons :
- rayon `MeeshyRadius.xs` (8) ; écart `MeeshySpacing.xsPlus` (6) ; cercle `MeeshyBorder.strong` (2) ; filets `MeeshyBorder.emphasis` (1,5) ;
- encre, cercle et filets `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ; voiles et filet sombre `MeeshyColors.scrim` ; croix `MeeshyColors.error` ;
- voile d'attente `MeeshyOpacity.strong` ; appui `.intense` ; glyphes `MeeshyIconSize.md` (16), `.sm` (14), `.xs` (12) ; cible `MeeshyControlSize.tapTarget`, `--target-min`.

Les valeurs propres (35 %, 62 %, 60 %, × 1,15, −6°, 24, 22, 300 et 400 ms, ombres) vivent dans `MeeshyThumbnailRowRecipe`, nulle part ailleurs. Aucun appel au verre dans les fichiers de K20.

## 7. Jumeaux
K20 promeut par copie et ne rebranche rien : le rebranchement change l'écran et revient aux lots d'intégration.
- iOS. DEVIENT : `ComposerSlideRail` (`Features/Composer`, 520 lignes, un appel), par sa grammaire (`ComposerSlideRowGrammar` : `items`, `effect`, `targetIndex`, `destination`), `ComposerSlideRowDrag` et son geste appui long puis glisser. Restent à l'app : `ComposerSceneThumbnailTile` et `ComposerSceneThumbnailRefresh` (le contenu), `ComposerHeaderTiles.showsRail`, `ComposerSceneAddition`, `ComposerSceneDeletionPrompt`, `ComposerSlideRailCopy`.
- iOS, supprimés par I2 : le corps de `ComposerSlideRail`, `ComposerSlideRowGrammar`, `ComposerSlideRowDrag`, `ComposerSlideRowJiggle`, le bouton « Terminé », la tuile « + » en verre, `ComposerHeaderTiles.showsDelete`. Par I3 : `ComposerSceneIntake` alimente `status`. Hors K20 : `ComposerSceneIntakeGhost` (fantôme de la scène, I3), `SlideMiniPreview` (SDK, sans appelant).
- Android. DEVIENT : `SlideRailTile` et `SlideRailGeometry` (`:sdk-ui`, publics), avec le glisser de `ComposerSlideRail` (`slotShift`, `detectDragGesturesAfterLongPress`), `SlideReorderResolver` et `ComposerSlideDrag`.
- Android, supprimés par I2 : `SlideRailTile`, `SlideRailGeometry`, `SlideReorderResolver`, `ComposerSlideDrag`, le corps de `ComposerSlideRail` (rangée, menu déroulant, bouton « + »), `ComposerHeaderTiles.showsDelete` et `tilesNavigate`. Restent à l'app : `SlideThumbnail` et son magasin, `rememberConfirmedSlideDeletion`, `rememberGuardedAddition`, `showsRail`. Hors K20 : `IncomingMediaPlaceholderLayer` (I3), `MediaFilmstrip`, `ComposerLookStrip` (K19).
- Web. DEVIENT : `StudioPageRail`, `StudioPageTile` et `StudioPageDelete` (`routes/story-compose-pages.tsx`, 196 lignes, un appel).
- Web, supprimés par I2 : ces trois composants et `StudioAddSceneButton` (`story-compose-scene-rails.tsx`), dont le « + » rejoint la rangée ; I2 écrit le déplacement et la duplication d'une page, absents du web. Hors K20 : `story-rail.tsx`, `rail-tile.tsx`, `story-rail-self-tile.tsx` (plateau des stories), `media-filmstrip.tsx`, `feed-scene-carousel.tsx` ; `call-glass-button`, `call-control-pill`, `glass-surface`, `sheet`, `scene-*` ne portent aucune rangée de vignettes.
- À relire sans y toucher ici : `ShareIncomingStrip` (iOS, Android) et les pièces en attente de la conversation (`ConversationView+ComposerAttachments`, `ComposerPendingStrip`, `composer-tray.tsx`), par I10 et I9.

## 8. Témoins exigés
Comportements (`MeeshyThumbnailRowTests`, `MeeshyThumbnailRowTest`, `meeshy-thumbnail-row.test.tsx`) :
- toucher une autre vignette ⇒ un `onSelect` immédiat, un `light` ; la courante, une rangée désactivée ou `none` ⇒ rien ;
- second toucher sous 300 ms ⇒ un `onDuplicate` ; au-delà, sur une autre vignette ou sans rappel ⇒ aucun ;
- appui long ⇒ armée, un `medium`, la courante inchangée ; armée : la croix appelle `onRemove`, un autre toucher désarme sans `onSelect` ;
- glisser : place visée bornée, un cran par place franchie, voisines écartées d'un pas, UN `onMove` au rang final, aucun si la place n'a pas changé ; RTL inversé ;
- ajustement : 48 quand tout tient, réduction jusqu'à 32, puis défilement ; pas jamais sous 24 ;
- « + » en dernier, absent sans `onAdd` ; croix absente sans `removeLabel` ; rangée vide ⇒ rien de rendu ;
- statuts : anneau K09 de 22 en envoi et en préparation, voile et glyphe en attente et en échec, rien sur une prête ; anneau réduit à la largeur de la vignette moins 4 ;
- nom, rôle, valeur, courante ; actions nommées selon les rappels ; cible d'au moins 44 pt, 48 dp, 44 px en hauteur ;
- web : flèches, Début, Fin, Alt + flèches, Suppr, Ctrl + D, Échap, un seul arrêt de tabulation, sens arabe ;
- performance : changer la courante redessine deux vignettes au plus ; une progression n'en redessine qu'une ; un glisser ne rend pas l'hôte ;
- « réduire les animations » ⇒ ni inclinaison ni échelle ; contraste des trois tons depuis la recette ;
- gardes de source : aucun verre, aucun type du composer, aucune chaîne dans les fichiers de K20 ; web : `check-kit.mjs` vert ;
- parité : `docs/product/kit/K20-MeeshyThumbnailRow.vectors.json` (ajustement, place visée, écart des voisines, toucher et double toucher, effets par geste, recette), lu par les trois suites ; le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyThumbnailRow/<id>.<variante>`) : `repos`, `milieu`, `serree`, `defilante`, `armee`, `soulevee`, `envoi`, `attente`, `preparation`, `echec`, `sans-plus`, `desactivee`, `scene-claire`, en `clair` et `sombre`, `presse` pour `repos`, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` ; web : 390, 820 et 1440 px. Images enregistrées par la CI (`sdk-tests.yml`, `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`), jamais posées à la main.

Catalogue : entrée K20, vide sur `dev` sur les trois plateformes (`MeeshyKitCatalog+K20.swift`, `KitCatalogK20.kt`, `components/kit/catalog/k20.tsx`). Vues : `repos` R5, `soulevee` R6, `serree` R10, `envoi` et `attente` A7, sur le fond `media` ; contenus = dégradés du catalogue, aucune image embarquée.

Preuve : iOS `sdk-tests.yml` ; Android `assembleDebug` + `testDebugUnitTest` d'`android.yml` (seul compilateur joignable) ; web `bun run gate`. Consigne porteur : gardes locales vertes et runs de branche annulés ⇒ le lot fusionne dans `dev` et se prouve sur `dev` ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Kit sur `dev` : iOS jusqu'à K19 (sans K18), Android et web jusqu'à K02 ; K09 n'existe que sur iOS.
- Courante : cercle blanc de 2 sur la planche ; trait de marque de 1,5 et filet blanc sur les autres, sur les trois plateformes.
- Taille : 28 × 48 puis 17 × 30 sur la planche ; 24,75 × 44 fixe dans le code (iOS et web défilent, Android non).
- Appui long : la planche arme UNE vignette ; iOS arme un mode (croix partout, tremblement, « Terminé ») ; Android soulève, ou ouvre un menu (Modifier le fond, Dupliquer, Supprimer) ; le web n'a ni déplacement ni duplication.
- Croix : disque rouge sur la planche ; pastille noire sur la courante en permanence (Android, web), ou sur toutes en mode (iOS).
- « + » : sans verre sur la planche ; verre interactif (iOS), bouton d'icône toujours présent (Android), hors de la rangée (web).
- Double toucher : iOS seul, et il retarde le toucher simple.
- Fantômes : sur les vignettes dans A7 ; sur la scène dans le code (iOS, Android) ; le web marque l'échec d'un point rouge.
- Seuil : deux scènes (iOS, web) ; une scène montée suffit sur Android.
- `onMove` : décalage d'`Array.move` sur iOS, rang final sur Android.
- Capture R6 : `.th` (ligne 98) impose `position: relative` après `.abs` ; la vignette soulevée n'est pas à sa place et la croix flotte sur la voisine. Le texte de la loi 2 fait foi.
- Registre : `web_existant` cite le plateau des stories ; `ios_existant` cite `ComposerSceneIntakeGhost` et `SlideMiniPreview` ; R10 et I2 manquent aux vues.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. Le jumeau promu est la rangée des scènes de chaque plateforme : grammaire d'iOS, tuile et glisser d'Android, rail de pages du web. (Réécrire ; partir de `ShareIncomingStrip`.)
2. Cercle blanc de 2, collé, ombre sur toutes, aucun bord sur les autres. (Trait de marque du code ; vide de 2 comme K19.)
3. Hauteur 48 et rapport 9/16 opaques : 27 × 48. (44 du code ; largeur et hauteur libres.)
4. La rangée se réduit jusqu'à 18 × 32 (pas de 24), puis défile. (17 × 30 de la planche, pas de 23 ; taille fixe et défilement ; taille fixe sans défilement.)
5. « + » dessiné sans verre, absent sans `onAdd` ; le refus au plafond reste à l'hôte. (Verre interactif ; bouton toujours présent ; bouton hors rangée.)
6. L'appui long arme UNE vignette : ni mode, ni tremblement, ni « Terminé ». (Mode d'iOS ; corbeille permanente sur la courante.)
7. Pas de menu à l'appui long : Dupliquer = double toucher, Supprimer = croix, Modifier le fond = Fond du rail droit (I2) ; les trois restent des actions d'accessibilité. (Garder le menu d'Android.)
8. Le toucher part tout de suite ; le double toucher se reconnaît après coup. (Attendre l'échec du double toucher.)
9. Les voisines s'écartent et le pointillé marque la place visée. (Seule la vignette bouge ; pointillé fixe à l'origine.)
10. `onMove(id, rang final)` partout ; l'hôte iOS convertit. (Décalage d'`Array.move`.)
11. Croix rouge de 24 au coin de la vignette armée, cible de 44 ; la confirmation reste à l'hôte. (Pastille noire ; confirmation dans le kit.)
12. Cinq statuts opaques ; envoi et préparation par K09, attente et échec par voile et glyphe ; le fantôme de la scène reste à l'app. (Les deux cas de la planche ; point rouge du web ; absorber `ComposerSceneIntakeGhost`.)
13. Cible : 44 en hauteur, le pas en largeur. (44 × 44 et rangée défilante dès quatre scènes.)
14. Scène claire : ton `onLight` de K01, filet sombre et voile à 62 %. (Ne rien faire ; cercle de marque.)
15. Aucune chaîne dans K20. (Clés `kit.thumbnail_row.*`.)
16. Pas d'estompe en défilement : aucune dépendance à K04. (Loi d'estompe de K04.)
17. Le seuil « deux » reste à l'hôte ; Android s'aligne à I2. (Seuil dans le kit.)
18. Désactivée : visible, inerte, sans « + » ni croix. (40 % comme K19.)
19. La fiche fait foi pour les jumeaux ; le registre reçoit `routes/story-compose-pages.tsx`, perd le plateau des stories, et ajoute R10 et I2. (Laisser le registre.)
20. `ShareIncomingStrip` et les pièces en attente de la conversation ne sont pas absorbées ici. (Les absorber dès K20.)
21. La capture R6 se corrige par une issue de la planche ; K20 suit la loi 2. (Suivre la capture.)
22. Aucun jumeau rebranché. (Rebrancher dès K20.)
