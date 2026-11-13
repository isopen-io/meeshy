# K17 — MeeshyKeyboardDock (la barre collée au clavier et le panneau qui le remplace)

Relevé sur `origin/dev` `fa00e224ab` le 2026-11-12. Chantier #17312, milestone 258 ; issue du lot : #17789. Dépend de K00, K01 (verre), K02 (outils) et K16 pour la capsule de validation (choix 5 : sur une plateforme où K16 n'est pas fusionné, K17 l'attend). Loi 10 de `docs/product/composer-vue-finale.md` ; lois 1, 4, 6, 8, 9 et 13 lues. Planche : `kbar(on, o)` (ligne 238), `panel(body)` (ligne 239), `kb()` et `KBTOP` (lignes 236 et 237), `above(top)` (ligne 234), classes `.kbar`, `.panel` (lignes 86 et 87) et `.ctl.white` (ligne 49). Vues qui appellent ces fonctions : A1, A2, A3, A4, A5, O11, S6, S7 — le registre dit vrai. État du kit sur `dev` : iOS K01 à K16 ; Android et web K01 et K02 ; l'entrée K17 des trois catalogues existe, vide.

## 1. Rôle
Pendant qu'on écrit, une capsule de verre porte les outils du champ et « OK », collée au-dessus du clavier ; toucher un outil remplace le clavier par son panneau, à la hauteur exacte du clavier, sans que la barre, le champ ni la scène ne bougent.

Il ne fait pas :
- le champ, son texte, son curseur, sa sélection, ni l'insertion d'une mention ou d'un « # » : l'hôte ;
- le contenu des panneaux (K03, K04, K05, K07, les polices, les fonds), la liste des outils, leurs familles et leurs libellés traduits : l'hôte ;
- la bande des mentions (son contenu), le compteur et le mot de limite : l'hôte, dans l'emplacement `above` ;
- la réduction de la scène au-dessus de lui : l'hôte, qui lit la place publiée ; le retrait de la pilule, des rails et de l'en-tête pendant l'écriture (lois 10 et 13) : l'hôte ;
- ce que « OK » termine, la feuille de S7 (K15), le choix du ton (K01, posé par l'hôte) ;
- le composeur de conversation et son panneau (+) : I10 arbitre.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyKeyboardDock.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-keyboard-dock.tsx` |
|---|---|---|---|
| Dock | `MeeshyKeyboardDock(link:label:items:input:confirm:…above:panel:)` : une vue sans pixel dans l'hôte, qui peint dans les deux vues d'entrée du champ | `MeeshyKeyboardDock(label, items, input, onInputChange, confirm, modifier, state, …, above, panel)` aligné en bas | `<MeeshyKeyboardDock label items input onInputChange confirm fieldRef … above>{panel}</MeeshyKeyboardDock>` |
| Barre seule | `MeeshyKeyboardBar(label:items:openItem:confirm:tone:onItem:glyph:)` | idem | `<MeeshyKeyboardBar>` |
| Panneau seul | `MeeshyKeyboardPanel(label:content:)` | idem | `<MeeshyKeyboardPanel>` |
| Outil | `MeeshyKeyboardDockItem(id:label:systemImage:opensPanel:isEnabled:hint:value:)` | `data class` (`icon`) | objet de même forme (`glyph`) |
| Validation | `MeeshyKeyboardDockConfirm(title:label:hint:isEnabled:action:)` | `data class` | objet de même forme |
| Entrée | `MeeshyKeyboardDockInput { keyboard, panel(String) }` | `sealed interface` | `'keyboard' \| { panel: string }` |
| Place publiée | `MeeshyKeyboardDockPlace { reserve, keyboard, durationMs, isFloating }` | idem, lue par `state.reserve()` | idem + `--kit-keyboard-dock-reserve` |
| Attache | `MeeshyKeyboardDockLink` (référence ; `attach(to:)`, `attachToFirstResponder()`, `detach()`) | `rememberMeeshyKeyboardDockState()`, `MeeshyKeyboardInsets` | `fieldRef` |
| Lois pures | `MeeshyKeyboardDockRule`, `MeeshyKeyboardDockRecipe`, `MeeshyKeyboardBarFit` | `object` identiques | `meeshy-keyboard-dock-recipe.ts` + `styles/kit-keyboard-dock.css` |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) : le nom de la barre (« Barre du texte ») ;
- `items` : zéro à cinq outils, dans l'ordre de l'hôte. `id` opaque, `label` obligatoire, `opensPanel = true` (faux : une action simple, le « @ » et le « # » de S7), `isEnabled = true`, `hint` et `value` remis à K02 ;
- `input = keyboard`, contrôlé par l'hôte ; `onInputChange` rend la valeur que la loi a élue ;
- `confirm` (obligatoire) : `title` (« OK »), `label` dit (« Valider le texte »), `hint`, `isEnabled = true`, `action` ;
- `isActive = true` : faux, rien n'est monté ni accroché au champ ;
- `tone: MeeshyGlassTone = deep`, passé en paramètre : sur iOS la barre vit dans la fenêtre du clavier, l'environnement de l'hôte n'y arrive pas ;
- `maxBarWidth = 480` (grand écran : la barre se centre) ;
- `onItem(id)` : chaque toucher d'un outil actif ; `onKeyboardDismissed` : le système a rangé le clavier alors que `input` vaut `keyboard` ; `onPlaceChange(place)` ;
- iOS : `link` ; Android : `state`, `keyboard: MeeshyKeyboardInsets? = null` (celui de la fenêtre) ; web : `fieldRef` (le champ qui garde le focus), `data` (sondes `data-*`).

Emplacements : `glyph(id)` (à la place de l'image de l'outil, reçoit l'encre : le « Aa », la pastille de couleur), `above` (au-dessus de la barre : la bande des mentions d'A5, un compteur), `panel(id)` (le contenu du panneau de l'outil ouvert, en colonne, qui défile). Aucun emplacement de champ dans la barre (choix 11).

## 3. États
- Clavier levé, quatre outils, aucun ouvert : A1 ; le texte manipulé à deux doigts pendant ce temps : O11 ; la légende de story : S6.
- Un outil ouvert (disque blanc), son panneau à la place du clavier : A2 (Aa), A3 (●), A4 (▣).
- Bande au-dessus de la barre : A5.
- Deux actions sans panneau, la barre posée au bas d'une feuille K15 : S7.
- Sans vue, conservés du code ou imposés par la plateforme : ≡ ouvert ; outil désactivé (40 %, ni action ni haptique) ; « OK » désactivé ; clavier matériel (la barre au bas de l'hôte, panneau à la hauteur de repli) ; clavier flottant ou scindé d'iPad (la barre le suit, la réserve vaut 0) ; grand écran (barre bornée et centrée) ; ton `onLight` sur scène claire (loi 4) ; panneau plus haut que le clavier (il défile) ; aucun outil (la capsule épouse « OK », au bord de fin) ; « OK » en coche quand la rangée ne tient plus ; opaque sous « réduire la transparence » ; pressé, survolé, focus clavier.
- Vide, chargement, erreur, hors ligne : ceux du contenu de `above` et du panneau ; le dock garde sa place.

Loi 13 (`MeeshyKeyboardDockRule.resolve`, fonction pure) :
- `isActive` faux : ni barre, ni bande, ni panneau, aucun toucher reçu, rien d'accroché au champ ;
- jamais le clavier ET un panneau ; pas de panneau si l'identifiant ouvert n'est plus dans `items`, n'ouvre pas de panneau ou est désactivé : l'entrée élue redevient `keyboard` ;
- pas de bande ni de son écart si `above` est vide ; pas de bande de verre vide : sans outil, la capsule épouse « OK » ;
- pas de légende sous un outil, pas de titre peint dans la barre ;
- pendant l'écriture, l'hôte retire pilule, rails et en-tête.

## 4. Gestes et retours
- Toucher un outil à panneau : `tapped` rend `panel(id)`, ou `keyboard` si c'était l'outil ouvert. Le champ reste en saisie, le curseur visible ; la barre ne bouge pas.
- Toucher une action simple : `onItem` seul, l'entrée ne change pas.
- Toucher le champ, ou le clavier qui remonte de lui-même : `keyboard`. iOS : l'hôte appelle `link.fieldTouched()` ; Android : front montant de l'IME ; web : `pointerdown` sur `fieldRef`.
- « OK » : `confirm.action` une fois, au relâcher. K17 ne termine rien lui-même.
- Hors de la capsule, de la bande et du panneau, tout toucher traverse vers l'hôte : glisser, pincer, tourner le texte (O11, loi 9). iOS : les zones transparentes de la vue accessoire rendent un test de toucher nul.
- Échap (clavier d'iPad, web) et retour matériel (Android, coque web par `useBackDismiss`) : panneau ouvert, le clavier revient ; sinon la touche va à l'hôte. Aucun raccourci de validation : ⌘ ou Ctrl + Entrée appartient à l'hôte (publier, sur le web).
- Réponse au toucher : celle de K02 sur les outils, celle de la capsule pleine de K16 sur « OK ».
- Haptique : le `light` de K02 et de la capsule, par le site unique (`HapticFeedback`, `MeeshyHaptics`, `impact('light')` de `lib/view/haptics.ts`) ; K17 n'en ajoute aucune.
- Animation : la barre monte DANS le mouvement du clavier (accessoire du système sur iOS ; encarts lus image par image sur Android ; `translate` de 260 ms sur le web). Clavier ↔ panneau : la barre est immobile, le contenu du panneau se fond en 150 ms. La bande entre par le bas avec fondu, 250 ms, sort en 200 ms.
- « Réduire les animations » : fondus seuls, 150 ms, aucune translation propre ; le mouvement du clavier reste celui du système.

## 5. Accessibilité
- Nom : la barre est une barre d'outils nommée `label` ; chaque outil porte son `label` (K02), jamais de légende ; « OK » dit `confirm.label` et son `hint` ; le panneau est un groupe nommé par le `label` de l'outil ouvert.
- Rôle et valeur : boutons ; un outil à panneau est annoncé développé ou réduit (K02 `expanded`, `aria-expanded` et `aria-controls` sur le web) ; `value` de K02 pour ce que l'outil porte déjà. Désactivé : annoncé.
- Annonce : l'ouverture d'un panneau annonce son nom (changement de disposition sur iOS, `paneTitle` sur Android, région `aria-live` polie sur le web) ; le retour au clavier ne dit rien.
- Ordre de lecture : le champ, la bande, les outils du début à la fin, « OK », puis le panneau de haut en bas.
- Clavier (web, iPad, Android) : depuis le champ, Tab entre dans la barre (un seul arrêt, ← → vont au voisin en boucle, inversés en RTL, Début et Fin), puis « OK », puis le panneau ; Maj + Tab et Échap rendent le champ. Au pointeur et au doigt, la barre ne prend jamais le focus du champ. Anneau `:focus-visible` de K01 et K02.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : la barre garde sa hauteur et ses glyphes (noms dits, grande vue de contenu sur iOS) ; « OK » grandit sur une ligne jusqu'à la borne `xxxLarge`, puis passe en coche si la rangée ne tient plus (`MeeshyKeyboardBarFit`), son nom toujours dit ; le panneau défile. Mesures web en `rem`.
- Cibles : 44 pt, 48 dp (disque visible de 44), 44 px.
- RTL : outils du bord de début vers la fin, « OK » au bord de fin, par propriétés logiques ; aucun glyphe retourné par K17.
- Contraste, calculé par le témoin depuis les recettes : glyphes blancs sur verre `deep` et sur `onLight` au moins 3:1 sur le pire fond (K01) ; encre `indigo950` sur la capsule pleine 15,99:1 ; texte blanc sur le panneau opaque 15,98:1 (surface `dark` de K15), indépendant du fond. « Réduire la transparence » : matière opaque de K01.

## 5 bis. Performance
- Ne se re-rend jamais : la barre pendant la frappe, pendant la montée du clavier et pendant un réglage du panneau (entrées primitives, `Equatable` et `.equatable()`, paramètres stables en Compose, `memo` sur le web) ; le conteneur du panneau quand son contenu change ; l'hôte quand le clavier glisse.
- iOS : la racine d'une vue hébergée n'est réécrite que si ses valeurs changent ; le clavier se mesure une fois par mouvement annoncé, jamais par image. Android : encarts et réserve lus en phase de placement et de dessin (`offset`, `layout`, `graphicsLayer`), aucune recomposition pendant que le clavier glisse. Web : position par CSS (`h-app` et `--keyboard-inset`, mesure unique d'`installKeyboardViewport`), aucun état par image.
- S'anime : translation et opacité. Jamais le flou, jamais la hauteur image par image ; le panneau a sa hauteur d'un coup.
- Un verre pour la barre (K01), les outils sont des K02 emboîtés, aucun verre sur du verre ; le panneau est opaque. Web : un `backdrop-filter`.
- K17 n'échantillonne aucune image : le ton vient de l'hôte.
- Budget : aucune image perdue pendant la montée du clavier, la bascule clavier ↔ panneau, la frappe ni un pincement du texte sous la barre ; barre visible à la première image du clavier. Rien de retenu après la fin : vues d'entrée retirées du champ, observateur du clavier et contrôleurs hébergés libérés (le lien ne tient le champ que faiblement), `inputmode` et écouteurs rendus sur le web. Aucune dépendance ajoutée.

## 6. Jetons et mesures
Mesures de la planche (390 × 844, clavier de 291) :
- barre : bords à 8, hauteur 52, rayon 26, marge intérieure 4, outils de 44 répartis d'un bord à l'autre, « OK » au bord de fin ; bas de la barre à 6 du haut du clavier ;
- « OK » : capsule blanche, encre `#0E1117`, texte 15 gras, hauteur 40 (retenu 44, choix 5) ;
- panneau : toute la largeur, hauteur du clavier, fond `#1C1D23`, marges 14 et 16, écart 13 ;
- bande d'A5 : bords à 8, hauteur 46, à 4 au-dessus de la barre ; la scène finit 14 au-dessus du dock.

Jetons :
- bord `MeeshySpacing.sm` (8) ; marge de barre et écart de bande `.xs` (4) ; écart au clavier `.xsPlus` (6) ; hauteur de barre `MeeshyControlSize.tapTarget + 2 × MeeshySpacing.xs` (52), rayon = demi-hauteur ;
- outils : K02 `s44`, emboîtés, `active` quand ouverts ; validation : `MeeshyModeCapsule(kind: solid)` de K16 ;
- verre : K01 `deep` (ou le ton de l'hôte), densité simple ; encre `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ;
- panneau : surface `dark` de K15 (`MeeshyColors.indigo950`, `MeeshyPalette.Indigo950`, `--ios-indigo-950`), marges `.mdPlus` (14) et `.lg` (16), écart `.md` (12), bas `max(zone sûre, 14)`.

Les valeurs propres (repli 291 borné à 45 % de la fenêtre, seuil de clavier 160, largeur 480, écart de scène 14, bas sans clavier `max(zone sûre + 6, 12)`, durées 260, 250, 200 et 150 ms, cinq outils au plus) vivent dans `MeeshyKeyboardDockRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*` dans les fichiers de K17. Vecteurs communs : `docs/product/kit/K17-MeeshyKeyboardDock.vectors.json` (recette, `tapped`, `fieldTouched`, hauteur retenue, hauteur de panneau, réserve, loi 13, ajustement).

## 7. Jumeaux
K17 ne rebranche ni ne supprime aucun jumeau : il promeut le plus complet, l'écran change aux lots d'intégration.
- iOS. DEVIENT le dock : `ComposerKeyboardDock` (barre en `inputAccessoryView`, panneau en `inputView`, hauteur par cadre et par contrainte, écoute du clavier) et `StoryInlineEditInputLink` du SDK, généralisé en `MeeshyKeyboardDockLink` pour tout `UITextView` ou `UITextField`. DEVIENT la loi : `ComposerKeyboardOrOptions` (`tapped`, `textTouched`, hauteur retenue, seuil 160, repli 291), `StoryKeyboardOverlap.height` (flottant, scindé, Stage Manager, matériel) et la durée de `ComposerKeyboardMotion.timing`. DEVIENT la barre : `ComposerKeyboardStyleBarView`. DEVIENT le panneau : la coque de `ComposerKeyboardStylePanel` (défile, ne renvoie jamais le clavier).
- iOS, restent à l'app : `ComposerKeyboardStyleFamily` et ses sections, `ComposerKeyboardDockMentions`, `ComposerMentionStrip`, `ComposerSceneKeyboard` (la réduction de la scène), `replaceText` du canvas.
- iOS, supprimés : par I3, `ComposerKeyboardDock`, `ComposerKeyboardDockState`, `ComposerKeyboardDockBar`, `ComposerKeyboardDockPanel`, `ComposerKeyboardStyleBarView`, la coque de `ComposerKeyboardStylePanel`, l'énuméré `ComposerKeyboardOrOptions`, `StoryInlineEditInputLink`, `StoryKeyboardOverlap`, et la chaîne ancienne `StoryTextEditToolbar`, `TextEditFloatingBubbles`, `ComposerEditTextLayer` (avec `StoryTextEditTopBar`, déjà promis par K16) ; par I9, son montage en retouche ; par I6, le « OK » de `ComposerDescriptionLayer` (S6, S7).
- iOS, hors K17 : `ComposerPanelHeightLaw`, `KeyboardTransition`, `UniversalComposerBar` (conversation) : I10 arbitre.
- Android. DEVIENT le dock : `TypingDock`, `TypingMeasures`, `TypingKeyboard`, `TypingKeyboardWatcher`, `rememberWindowTypingKeyboard` (`:feature:stories`, `StorySceneTypingDock.kt`). DEVIENT la loi : `iconTapped`, `keyboardRaised`, `rememberedKeyboard`, `reserve`, `optionsHeight` de `ComposerKeyboardOrOptions` (`:core:model`). DEVIENT la barre : `TypingBarFrame` et `BarIcon`.
- Android, restent : `ComposerKeyboardOrOptions.tools` et `.scene`, `Modifier.typingScene` (réduction de la scène, qui lira `state.reserve()`), `HostedTextField` (état de champ, `:sdk-ui`).
- Android, supprimés : par I3, `ComposerKeyboardStyleBar`, `TypingBarFrame`, `BarIcon`, `TypingDock`, `TypingMeasures`, `TypingKeyboardWatcher`, `StoryTypingSlot` et les cinq lois ci-dessus ; par I6, `CaptionTypingBar`, `PostTextTypingBar`, `HostedTypingBar` (la légende va sur la scène, le texte du post en feuille K15, leur compteur et leur mot de limite sont gardés). Hors K17 : `ComposerKeyboardTracker` du fil (`:feature:chat`), I10.
- Web (relevé). Aucune barre collée au clavier n'existe pour la scène : les sous-outils du texte vivent au rail droit (`lib/stories/studio-inline-edit.ts`) et leurs options dans `StudioInlinePanel`. Réutilisés sans les déplacer : `virtualKeyboardOf` et `nextKeyboardBaseline` (`lib/view/comments-zone.ts`), `useVirtualKeyboard`, `installKeyboardViewport` et `h-app`, le `pointerdown` qui ne vole pas le focus de `ComposerFormatBar`. Contenu de `above` : `MentionFieldPanel`.
- Web, supprimés : par I3, les sections `style`, `effect`, `color`, `align`, `background`, `language` du rail droit et leur montage dans `story-compose-editor.tsx` (I3 construit A1 à A5 et garde la section `pose`, atteignable au clavier, dans le (…) de l'objet). Hors K17 : `ComposerFormatBar` (emphases du fil, apparaît à la sélection) et `ThreadComposerChrome` (dock de verre du fil), cités au registre : I10.

## 8. Témoins exigés
Comportements (`MeeshyKeyboardDockTests`, `MeeshyKeyboardDockTest`, `meeshy-keyboard-dock.test.tsx`) :
- loi 13 : rien si inactif ; jamais clavier et panneau ; l'entrée redevient `keyboard` quand l'outil ouvert disparaît, se désactive ou n'ouvre rien ; ni bande ni écart sans `above` ;
- `tapped` : ouvre, bascule d'un outil à l'autre, referme sur l'outil ouvert ; une action simple ne change pas l'entrée ; `fieldTouched` rend le clavier ;
- hauteur retenue : seul un clavier d'au moins 160 se retient, jamais le panneau lui-même ni une barre seule (clavier matériel) ; trame dégénérée ignorée ; flottant : réserve 0 ; repli borné ;
- le panneau a la hauteur du clavier retenu et la barre garde sa position à la bascule (au pixel) ; le champ garde le focus pendant toute la bascule ;
- iOS : le lien pose et retire les deux vues d'entrée sur un champ factice, recharge seulement si elles changent, ne laisse rien après `detach` ; web : `inputmode="none"` posé puis rendu, focus conservé ;
- « OK » et chaque outil partent une fois ; rien si désactivé ; un toucher hors capsule atteint l'hôte ; Échap et retour rendent le clavier, puis vont à l'hôte ;
- place publiée : une valeur par mouvement, avec sa durée ; `onKeyboardDismissed` au rangement par le système, pas à l'ouverture d'un panneau ;
- ajustement : « OK » passe en coche au vecteur de largeur attendu ; cinq outils tiennent sur 320 ;
- accessibilité : noms, rôle, état développé, ordre de lecture, annonce du panneau ; web : arrêt unique, flèches inversées en RTL prouvées sur un index autre que le premier ;
- « réduire les animations » : aucune translation propre ; contraste calculé depuis les recettes de K01, K02, K15 et K16 ;
- non-re-rendu : la barre n'est pas réévaluée quand le contenu du panneau ou le texte du champ change ;
- garde de source : aucun verre direct, aucune couleur en dur, aucun type du composer ni des appels, aucun singleton ; web : `check-kit.mjs` vert ;
- parité : les vecteurs lus par les trois suites ; non-régression : le lot ne touche aucun jumeau ni aucun écran ; les cas de `ComposerKeyboardOrOptionsTests`, `StoryKeyboardOverlapTests` et `ComposerKeyboardOrOptionsTest` sont repris.

Instantanés (`MeeshyKeyboardDock/<id>.<variante>`) : `barre`, `outil-ouvert`, `panneau`, `bande`, `deux-actions`, `sans-outil`, `coche`, `desactive`, `clair`, `sans-clavier`, `large`, en `clair` et `sombre`, `presse` pour un outil et pour « OK », planches `grande-police` et `rtl` ; iOS : suffixe `-iOS26` et `<id>-dessine`. Web : 390, 820 et 1440 px. Le clavier des instantanés est un bloc neutre de la hauteur retenue. Images enregistrées sur la branche du lot (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `CAPTURE_DIR=docs/product/kit/captures node scripts/check-kit.mjs`) : K02 a été retiré de `dev` une fois faute d'images.

Catalogue : entrée K17 (`MeeshyKitCatalog+K17.swift`, `KitCatalogK17.kt`, `components/kit/catalog/k17.tsx`). Vues : `barre` A1, `panneau` A2, `bande` A5, `deux-actions` S7, sur fond `media`, avec un vrai champ : la barre s'y colle au clavier réel et les outils basculent.

Preuve : iOS `sdk-tests.yml` ; Android `assembleDebug` + `testDebugUnitTest` par `android.yml` ; web `bun test` et `bun run gate`. Consigne du porteur : gardes locales vertes et runs de branche annulés, le lot se fusionne dans `dev` et s'y prouve ; rouge sur `dev`, il est corrigé ou retiré aussitôt.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Barre : capsule de verre flottante (planche) ; bande opaque pleine largeur, noir 88 % dans un `UIInputView` (iOS), `Indigo950` (Android) ; absente (web).
- Hauteur : 52 (planche), 44 (iOS), 48 (Android). Répartition : d'un bord à l'autre (planche), serrée au début (iOS), `SpaceAround` (Android).
- Outil ouvert : disque blanc (planche) ; disque à la couleur de marque (iOS), accent à 55 % (Android). « OK » : capsule blanche de 40 (planche) ; capsule indigo de 32 (iOS), pastille `Indigo500` (Android), contraire à la loi 1.
- Panneau : `#1C1D23` opaque (planche) ; noir 92 % (iOS), surface du thème (Android), verre latéral (web). Repli : 291 (planche, iOS), 280 borné à 45 % (Android). Écart 13 sans jeton.
- Android écrit la légende et le texte du post DANS la barre ; la planche les pose sur la scène (S6) et en feuille (S7).
- iOS garde deux chaînes : le dock de la scène et l'ancienne `StoryTextEditToolbar` (bulles flottantes, encore montée par `ComposerEditTextLayer`).
- Le clavier se mesure en quatre endroits sur iOS, deux sur Android ; le web n'a qu'une loi.
- La planche ne montre ni le panneau de ≡, ni le clavier matériel ou flottant, ni le grand écran, ni la scène claire.
- Le registre cite `ComposerFormatBar` et `ThreadComposerChrome` comme existant web : ce sont des pièces du fil, pas des jumeaux.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. iOS : la barre et le panneau restent des vues d'entrée du champ, comme le jumeau ; c'est ce qui garde le champ en saisie et suit seul les claviers flottant et matériel. (Calque SwiftUI décalé par la hauteur mesurée ; barre de clavier du système.)
2. `input` est contrôlé par l'hôte, la loi « clavier OU panneau » devient une fonction pure de K17. (État interne au dock ; loi laissée à chaque app.)
3. Capsule de verre flottante de la planche, verre K01 `deep`, ton en paramètre. (Bande opaque du code.)
4. Outil ouvert : K02 `active` en `expanded`. (Couleur de marque du code ; `selected`.)
5. « OK » est la capsule pleine de K16, à 44, concentrique dans la barre de 52 ; K17 dépend donc de K16. (Capsule de 40 dessinée dans K17 ; indigo du code.)
6. Barre de 52, outils de 44 répartis d'un bord à l'autre, cinq au plus, « OK » en coche si la rangée ne tient plus. (44 ou 48 du code ; rangée qui défile.)
7. Panneau à la hauteur du dernier clavier d'au moins 160 ; repli 291 borné à 45 % de la fenêtre. (280 d'Android ; 291 sans borne d'iOS ; plafond de 55 % du fil.)
8. Panneau opaque, surface `dark` de K15, écart 12. (Noir 92 % ; surface du thème ; verre ; 13 en constante.)
9. `above` est un emplacement libre, à 4 de la barre ; les mentions, le compteur et le mot de limite y vivent. (Bande de mentions intégrée au kit.)
10. Outils opaques à deux natures, panneau ou action simple ; ≡ reste un outil à panneau de l'hôte. (≡ qui alterne sans panneau ; deux composants.)
11. Pas d'emplacement de champ dans la barre : la planche rend déjà la légende et le texte du post autrement, I6 les y porte sur Android sans rien retirer. (Emplacement `field` pour garder la disposition d'Android.)
12. Web : le champ garde le focus, le clavier se range par `inputmode="none"` posé et refocalisé dans le geste ; la barre se pose dans le cadre `h-app`, sans mesure propre. (Perdre le focus ; feuille par-dessus ; seconde mesure du `visualViewport`.)
13. Clavier flottant, scindé ou matériel : la barre suit ou reste au bas de l'hôte, la réserve vaut 0, le panneau prend le repli. (Masquer la barre ; forcer un clavier ancré.)
14. Échap et retour rendent le clavier quand un panneau est ouvert, puis vont à l'hôte ; aucun raccourci de validation. (Échap valide ; ⌘ + Entrée valide.)
15. Haptique : celle de K02 et de la capsule seulement. (Le `light` en plus du jumeau iOS, qui doublerait.)
16. K17 publie sa place et la durée du mouvement ; l'hôte réduit sa scène. (Réduire la scène dans le kit.)
17. Barre bornée à 480 et centrée sur grand écran. (Toute la largeur du clavier.)
18. Les pièces du fil de conversation ne sont pas absorbées ; I10 arbitre. (Tout fondre dans K17.)
19. Le lot ne rebranche aucun jumeau. (Rebrancher la scène iOS dans le lot.)

## 10. Précisions de l'implémentation iOS (lot du 2026-11-12)
- La **réserve** publiée vaut le recouvrement du clavier (accessoire compris, mesuré par la loi de `StoryKeyboardOverlap`) plus l'écart de scène (14) ; elle vaut 0 quand le clavier flotte, est scindé ou est rangé. La **hauteur retenue** est le recouvrement moins la hauteur de l'accessoire, seulement s'il vaut au moins 160 et que l'entrée est `keyboard`.
- Les lois sont reprises des jumeaux (`ComposerKeyboardOrOptions`, `StoryKeyboardOverlap`, `ComposerKeyboardMotion.timing`) sans les modifier : I3 les supprime et ne garde que la copie du kit.
- « OK » passe en coche quand `requiredWidth = 2 × marge + n × 44 + max(44, largeur du titre + 2 × 16)` dépasse la largeur de la barre ; le rendu laisse `ViewThatFits` en décider avec la même arithmétique.
