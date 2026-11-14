# K13 — MeeshySplitActionButton (l'action principale et son choix)

Relevé sur `origin/dev` `19c98a6e30d` le 2026-11-12. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`, entrée K13 (chantier #17312, milestone 258 ; issue du lot #17758). Dépend de K00 et K09 ; vit dans l'emplacement `primary` de K10 ; lit le ton et la matière de K01. Lois 1, 13 et 16 de `docs/product/composer-vue-finale.md`. Planche : `.pub` (lignes 42 à 45), `pub(label, chev, o)` (209), `pillItems` (210), `ring(62,44)` dans P1 (352), « Au retour en ligne » dans P2 (353), `pub(…,{w})` dans `ipadL` (279) et I4 (363).

## 1. Rôle
Un bouton plein à la couleur de marque porte l'action principale par son libellé et, séparé par un filet, un chevron qui ouvre le choix de ce qui part ; pendant l'envoi il devient un anneau et un mot, et hors ligne il dit que l'envoi attend.

Il ne fait pas :
- le contenu du choix (formats, cases, disposition, raisons de refus) : menu de l'app aujourd'hui, K11 à l'intégration (R7, R8) ;
- la décision d'exister, d'être retenu ou de partir : gates de l'app (`ComposerDocumentPublishGate`, `canPublish`, `studioPublishRefusal`) ;
- le libellé (« Publier la story », « Enregistrer », « Publication… ») : l'hôte le passe déjà traduit ;
- la progression et ses phases (hôte), le dessin de l'anneau (K09), la capsule de refus, d'échec ou de hors-ligne (K14), l'annonce de début et de fin ;
- le verre : K13 est un fond plein, jamais un verre posé sur la pilule (loi 1) ;
- les boutons pleins à un seul segment (Valider, Terminé, Ajouter 4) : K16.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshySplitActionButton.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-split-action-button.tsx` |
|---|---|---|---|
| Bouton | `MeeshySplitActionButton(_ title:…choose:action:)` | `MeeshySplitActionButton(title, onClick, modifier, …, choose)` | `<MeeshySplitActionButton title onPress … choose />` |
| Choix | `MeeshySplitActionChoose(label:hint:isExpanded:isEnabled:action:)` | même classe | `{ label, hint, expanded, disabled, popup, controls, onPress, ref }` |
| Phase | `MeeshySplitActionPhase { ready, busy(progress: Double?, title: String), deferred(title: String) }` | `sealed interface` identique | union étiquetée identique |
| Recette en valeurs | `MeeshySplitActionButtonRecipe.resolve(phase:size:width:isEnabled:hasChevron:material:tone:increasedContrast:reduceMotion:)` | idem | `meeshySplitActionButtonRecipe(...)` : classes, attributs, propriétés `--kit-split-*` (`styles/kit-split-action-button.css`) |
| Loi du libellé | `MeeshySplitActionLabelFit.resolve(widths:room:maxLines:)` | idem | `meeshySplitActionLabelFit(...)` |

Paramètres opaques, mêmes défauts :
- `title: String` (visible, obligatoire, non vide) ; `shortTitle: String? = nil` (repli court, « Publier ») ; `label: String? = nil` (nom dit, défaut `title`) ; `hint: String? = nil` ;
- `phase = ready` ; `size = regular` (48) ou `compact` (44) ; `width = hug` ou `fill` (prend la largeur offerte, libellé centré, chevron à la fin) ; `maxLines = 1` ;
- `isEnabled = true` ; `onDisabledPress: (() -> Void)? = nil` (le toucher d'un bouton retenu, pour que l'hôte dise la raison) ;
- `haptic: MeeshyGlassButtonHaptic = light` (type et déclencheur de K02 réutilisés) ;
- `choose: MeeshySplitActionChoose? = nil` : absent ⇒ ni filet ni chevron. `label` y est obligatoire et non vide.

Emplacements : `statusGlyph` (devant le libellé en `deferred`, vide par défaut) ; `fallbackGlyph` (seul quand aucun libellé ne tient ; flèche vers le haut par défaut).

Ancrage du choix, par plateforme : iOS expose `MeeshySplitActionChevronFace` (filet, glyphe, cible) et une variante `chevron:` pour qu'un `Menu` du système l'habille ; Android offre `chevronAnchor: @Composable () -> Unit` composé dans la boîte du chevron ; web transmet `choose.ref` au bouton du chevron.

## 3. États
- Absent (l'hôte ne le monte pas) : R1 (scène vide), C1 et C2 (retouche, loi 17).
- Prêt avec chevron, dans la pilule : R2, R3, R5, R6, R10, A7, P3 ; sur scène claire : R13.
- Prêt, choix déplié : R7, R8 (aucun changement de dessin, l'état est dit).
- Prêt sans chevron : P6 (« Enregistrer »).
- Prêt, largeur imposée : I1, I4 (sous la scène, à sa largeur).
- En cours : P1 (anneau K09 de 40 à 62 %, « Publication… », sans chevron) ; `progress` absent ⇒ anneau indéterminé.
- Différé hors ligne : P2 (voile doux, sans ombre, glyphe et « Au retour en ligne », sans chevron).
- Retenu (`isEnabled` faux), pressé, survolé, focus clavier, compact, libellé replié : aucune vue, conservés du code.

Loi 13 : pas de bouton sans matière à publier (l'hôte) ; pas de chevron sans `choose` ; ni chevron ni filet en `busy` et en `deferred` ; pas d'anneau hors `busy` ; pas de chiffre en indéterminé (K09) ; pas de glyphe devant le libellé au repos ; pas de voile d'appui sur un segment retenu ; pas d'anneau de focus au doigt.

## 4. Gestes et retours
- Toucher le libellé : `action` part une fois, au relâcher dans le segment. Toucher le chevron : `choose.action` seulement ; il n'appelle jamais `action`.
- Retenu : ni `action`, ni haptique ; `onDisabledPress` part s'il existe. Le chevron garde son propre `isEnabled`.
- `busy` et `deferred` : aucun geste ; un toucher ne fait rien.
- Haptique : un `light` par activation d'un segment, par le site unique (`HapticFeedback.light()`, `MeeshyHaptics.light()`, `impact('light')` de `lib/view/haptics.ts`) ; `none` laisse l'hôte jouer le sien. Succès, échec et refus restent à l'hôte (K14).
- Réponse au toucher : voile d'appui sur le SEGMENT touché (valeurs de K02) et échelle de K01 sur la capsule entière ; sous Liquid Glass, la réponse interactive du système. Survol au pointeur : demi-voile, sans échelle.
- Changement de phase : fondu enchaîné du contenu en 200 ms ; la largeur suit le morphisme de K10.
- « Réduire les animations » : ni échelle ni fondu, le contenu change d'un coup, le voile d'appui reste ; l'anneau suit K09.

## 5. Accessibilité
- Prêt : deux éléments, dans l'ordre libellé puis chevron. Libellé : rôle bouton, nom `label ?? title`, indice `hint`, état désactivé quand retenu. Chevron : rôle bouton, nom `choose.label`, indice `choose.hint`, état déplié ou replié (web : `aria-expanded`, `aria-haspopup`, `aria-controls`). Sans chevron : un seul élément.
- En cours : un seul élément, nom inchangé (`label ?? title`), valeur « Publication…, 62 % » (`MeeshyProgressRingWords.spokenValue`), trait de mise à jour fréquente ; web : `role="progressbar"`, `aria-valuenow`, `aria-busy`. L'anneau y est décoratif (`label: nil`). Jamais une région vivante.
- Différé : un texte d'état, nom = son titre ; l'annonce vient de la capsule K14 de l'hôte.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : le libellé grandit, la hauteur passe à `max(48, texte + 2 × 8)`, les glyphes et l'anneau restent figés ; la loi du libellé replie ; glyphe seul ⇒ nom entier conservé, grande loupe de contenu sur iOS, `title` sur le web. Mesures web en `rem`.
- Web, clavier : deux `<button type="button">` dans l'ordre de tabulation, Entrée et Espace, anneau `:focus-visible` intérieur à l'encre `on-brand` ; en passant à `busy`, le focus reste sur la capsule (`tabindex="-1"`), il ne tombe pas sur `body`. Android et iPad au clavier : même anneau.
- RTL : l'ordre se retourne (chevron au début visuel), le filet reste entre les deux ; chevron, flèche et anneau ne se reflètent pas.
- Contraste : encre `onBrand` sur `brandPrimary` = 4,47:1 (sous 4,5:1 de 0,03 ; écart du jeton de marque suivi par #8933, non tranché ici). « Augmenter le contraste » : fond `brandDeep` (7,9:1), filet à 60 %. Le fond est opaque : même contraste sur verre clair, sombre et scène blanche (R13). Différé : encre du ton sur le voile doux, garantie par K01 ; ton `theme` ⇒ encre du thème.
- « Réduire la transparence » : rien ne change hors Liquid Glass, que le système givre.

## 5 bis. Performance
- Ne se re-rend jamais : les voisins de la pilule et l'hôte à l'appui ; le libellé quand la progression avance ; le chevron quand le libellé change.
- iOS : trois feuilles `Equatable` (libellé, chevron, en cours), fermetures hors égalité, appui dans le style du bouton. Android : paramètres stables, appui lu en phase de dessin, la progression ne recompose que l'anneau. Web : `:active`, `:hover`, `:focus-visible` en CSS, aucun état ni écouteur au repos.
- Loi du libellé : mesurée une fois par (libellés, place, taille de police), jamais pendant un geste ; iOS `ViewThatFits`, Android mesure mémorisée, web un `ResizeObserver` sur la capsule, déconnecté au démontage.
- S'anime : l'opacité (voile, fondu du contenu), la transformation (échelle de K01), la longueur du tracé de l'anneau (K09). Jamais le flou, l'ombre ni la mise en page par K13.
- Budget : aucune image perdue à l'appui, au passage prêt → en cours pendant le morphisme de K10, ni à 60 mises à jour de progression par seconde ; rien de retenu une fois l'écran quitté.

## 6. Jetons et mesures
Mesures de la planche, toutes dans `MeeshySplitActionButtonRecipe` :
- capsule : hauteur 48 (`MeeshyGlassButtonSize.s48.diameter`), 44 en `compact` (`MeeshyControlSize.tapTarget`), rayon = demi-hauteur ;
- libellé : gras, `MeeshyFont.bodySize` (15) relatif, marge horizontale `MeeshySpacing.mdPlus` (14), une ligne ;
- chevron : glyphe `MeeshyIconSize.lg` (18), marges `smPlus` (10) et `md` (12), soit 40 dessinés ; cible 44 pt, 48 dp, 44 px par débord vers la fin, jamais vers le libellé ;
- filet : `MeeshyBorder.regular` (1), pleine hauteur, encre à 35 % ;
- ombre : `0 6 18` à la couleur de marque, 45 % (rayon SwiftUI 9) ; aucune en `deferred` et retenu ;
- en cours : anneau de 40 (`MeeshyControlSize.large`, choix 1 de K09), marge de début `xs` (4), écart `sm` (8), marge de fin `lg` (16) ;
- différé : marge `mdPlus` (14), écart `xsPlus` (6), glyphe `MeeshyIconSize.md` (16), libellé `MeeshyFont.labelSize` (14) gras, fond = voile doux de K02 (12 %) ;
- retenu : capsule à 40 % (`MeeshyGlassButtonRecipe.disabledOpacity`) ; voile d'appui 22 %, survol 11 % (K02) ; fondu 200 ms.

Jetons : fond `MeeshyColors.brandPrimary`, `MeeshyPalette.Indigo500`, `--color-ios-brand` ; contraste accru `brandDeep`, `Indigo700`, `--color-ios-brand-deep` ; encre `MeeshyColors.onBrand`, `MeeshyPaletteGenerated.OnBrand`, `--color-ios-on-brand` ; rayon `MeeshyRadius.pill`, `--radius-pill`. Aucun code de couleur, aucun `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K13.

Loi du libellé, dans l'ordre : `title` sur une ligne ; `title` à `subheadSize` (13) ; `title` à 13 sur `maxLines` lignes si `maxLines` > 1 ; `shortTitle` ; `shortTitle` à 13 ; `fallbackGlyph` seul. Jamais un mot coupé.

Matière : sous Liquid Glass (iOS 26+), K13 demande à K01 un verre teinté de marque et interactif (`.meeshyGlass(in:tint:isInteractive:)`) ; ailleurs (iOS 16 à 25, Android, web), fond plein et voile d'appui. La recette décide (`glass: none | brand`), comme le destructif de K02.

Parité : `docs/product/kit/K13-MeeshySplitActionButton.vectors.json` (mesures, loi du libellé, opacités, valeurs dites en fr, en et ar), lu par les trois suites.

## 7. Jumeaux
Le lot K13 ne rebranche aucun écran ; les lots d'intégration suppriment.
- iOS. DEVIENT : `publishCapsule`, `publishCapsuleLabel` et `publishButton` (`MeeshyComposerHost+Socle.swift`) avec le filet et la face de `ComposerPublishChevron` (`ComposerPublishMenu.swift`) : le plus complet (deux segments, chevron hors du gate, éléments séparés pour VoiceOver, libellé compact).
- iOS, supprimés par I2 : ces quatre, `moodHeaderPublishButton`, `ComposerPublishRefusalTapZone` (remplacée par `onDisabledPress`), `publishBlockedNotice` (K14). Par I7 : `ComposerExportProgressVeil` (la progression passe à `busy`). Restent à l'app : `ComposerPublishMenu`, `ComposerPublishMenuRule`, `ComposerPublishMenuCopy`, `ComposerPublishChoice`, `ComposerSeveralFormats`, `ComposerSocleDensity`.
- Android. DEVIENT : la capsule de `ScenePublishSocle` et `PublishOneLineLabel` (`feature/stories/ComposerSceneOverlays.kt`), dont la loi du libellé est promue. Supprimés par I2 : ces deux, le disque de 30 dp de `ComposerFormatChevron` (`app/composer/host/ComposerFormatMenu.kt`), `AudiencePastille` du socle (K24). Restent : `FormatMenuItems`, `ComposerSceneTools.showsFormatChevron`.
- Web (relevé). DEVIENT : la capsule de `PublishSplitButton` (`components/publish-split-button.tsx`, un emploi : `routes/story-compose.tsx:1097`). Supprimé par I2 : le fichier ; son menu (parcours au clavier, agencements dépliés) reste à l'app jusqu'à K11. Aucun autre bouton scindé dans `call-*`, `composer-*`, `scene-*`, `story-*`, `sheet`, `glass-surface`.
- I7 branche `busy`, `deferred`, « Enregistrer » et l'humeur ; I8 la largeur imposée.

## 8. Témoins exigés
Comportements (`MeeshySplitActionButtonTests`, `MeeshySplitActionButtonTest`, `meeshy-split-action-button.test.tsx`) :
- le chevron n'appelle jamais `action` ; le libellé n'appelle jamais `choose.action` ;
- retenu : ni action ni haptique, `onDisabledPress` appelé, chevron encore actif ;
- `busy` et `deferred` : aucun geste, ni chevron ni filet, anneau présent en `busy` seulement ;
- nom, rôle, valeur et état de chaque phase ; nom inchangé en `busy` ; ordre de lecture, RTL compris ;
- un seul retour haptique par activation, par le site unique, aucun avec `none` ;
- loi du libellé sur chaque vecteur ; nom entier conservé quand le glyphe reste seul ;
- recette : mesures des vecteurs, matière `brand` sous Liquid et `none` ailleurs, contraste calculé (≥ 3:1, ≥ 7:1 en contraste accru) ;
- sous « réduire les animations », aucun fondu ni échelle ;
- web : Tab, Entrée, Espace, focus gardé au passage à `busy`, `aria-expanded` ;
- garde de source : ni verre ni code de couleur.

Instantanés (`MeeshySplitActionButton/<id>.<variante>`) : `repos` (R2), `sans-chevron` (P6), `en-cours` (P1), `indetermine`, `differe` (P2), `retenu`, `largeur-imposee` (I4), `scene-claire` (R13), `compact`, `replie`, en `clair` et `sombre`, `presse` et `presse-chevron` pour ceux qui se touchent, planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` et `-dessine` ; web : 390, 820, 1440. Enregistrés par la CI, jamais à la main.

Catalogue : entrée K13 remplie sur les trois plateformes (`MeeshyKitCatalog+K13.swift`, `KitCatalogK13.kt`, `catalog/k13.tsx`), chaque état avec sa vue.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Planche : fond plein uni, sans glyphe. iOS : verre proéminent teinté, flèche devant le libellé, filet de 20. Android : dégradé de marque, chevron dans un disque blanc à 22 %. Web : filet de 20 à 40 %.
- Libellé long : iOS passe sur deux lignes (#13920), Android reste sur une ligne et replie (#14826), la planche ne coupe pas.
- En cours : aucun anneau nulle part ; iOS garde le libellé et baisse la teinte, le web change le libellé (« 2 / 3 »), Android n'a pas d'état.
- Retenu : la planche ne le dessine pas (A7 montre Publier normal pendant un envoi de scène) ; les trois codes le portent.
- Nom du chevron : « Choisir ce qui part » (planche), « Type de publication » (iOS), « Publier comme » (Android, web).
- P5 dessine un chevron sur l'humeur ; iOS n'en offre pas quand il n'y a qu'un choix.
- K09 n'est livré que sur iOS : les lots Android et web de K13 attendent le leur.

Choix retenus (mode autonome) :
1. Fond plein uni de marque ; verre teinté de K01 sous Liquid Glass seulement. (Dégradé ; verre partout.)
2. Aucun glyphe devant le libellé ; la flèche n'est que le dernier repli. (Flèche permanente d'iOS.)
3. Une ligne par défaut, `maxLines` pour l'hôte qui nomme plusieurs formats. (Deux lignes partout ; une ligne stricte.)
4. Chevron sans disque, filet pleine hauteur à 35 %, 40 dessinés et cible par débord. (Disque Android ; segment de 44.)
5. Le chevron ne change pas de dessin quand le choix est déplié. (Rotation de 180°.)
6. L'état retenu est conservé : capsule à 40 %, `onDisabledPress`, chevron indépendant. (Le retirer comme la planche.)
7. En cours : anneau de 40 et mot de l'hôte, nom accessible inchangé, valeur dite. (Anneau de 44 ; nom remplacé par « Publication 62 % ».)
8. Différé : non touchable, voile doux de K02 à 12 %. (14 % de la planche ; toucher pour annuler.)
9. `busy` et `deferred` retirent le chevron. (Chevron grisé.)
10. Haptique `light` de K02 sur chaque segment. (`medium` sur l'action ; aucun.)
11. Le menu reste à l'app ; K13 expose une face et un ancrage par plateforme. (Menu dans le kit.)
12. Hauteur 48, `compact` à 44 pour un en-tête. (Hauteur libre.)
13. Contraste accru : `brandDeep`. (Ne rien faire ; changer le jeton de marque.)
14. Nom du chevron passé par l'hôte ; recommandé à I2 : « Choisir ce qui part ». (Chaîne dans le kit.)
15. L'humeur et son chevron se tranchent en I7 : K13 ne dessine le chevron que si `choose` existe.

## 10. Relevé iOS (lot K13, 2026-11-12)
- Fichiers : `MeeshySplitActionButtonRecipe.swift` (valeurs, loi du libellé, mots dits, loi d'activation), `MeeshySplitActionButton.swift` (vue, face du chevron, bouton du chevron), `Catalog/MeeshyKitCatalog+K13.swift`.
- L'état déplié du chevron se dit par le trait « sélectionné » du système : iOS n'offre pas de trait « déplié », et le kit ne porte aucune chaîne propre (aucune entrée de plus dans les catalogues de chaînes).
- Les jumeaux de l'app (`publishCapsule`, `ComposerPublishChevron`, …) ne sont pas touchés dans ce lot : la fiche § 7 confie leur suppression à I2 et I7, et aucun écran ne change ici.
- Instantanés : états tactiles `repos` (libellé pressé) et `chevron` (chevron pressé), suffixes `presse`.
