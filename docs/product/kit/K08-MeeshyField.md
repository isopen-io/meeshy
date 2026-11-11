# K08 — MeeshyField (le champ de saisie de feuille)

Relevé sur `origin/dev` `f4f2b928ac` le 2026-11-11. Chantier #17312, milestone 258 ; issue du lot #17625, PR iOS #17628. Dépend de K00 ; lit le ton de K01 (`\.meeshyGlassTone`, `LocalMeeshyGlassTone`, `data-glass-tone`). Loi 8, et lois 6, 7, 12 et 13 par ses vues. Planche : `.field` (ligne 95), `.caret` (96), `.sub` (61), employés par A16 (318), A17 (319), A18 (320), O9 (335), O10 (336) et P5 (356). C4 (369) pose aussi `.field` sur « Message » : c'est le composeur de conversation, hors K08.

## 1. Rôle
Une boîte arrondie où l'on tape une ligne, un paragraphe ou un nombre dans une feuille ou une pilule ouverte, avec une tête optionnelle, une invite, un compteur et l'effacement.

Il ne fait pas :
- la recherche, son délai, ses résultats, les suggestions, les puces choisies (K04), les lignes de liste (K06), le titre ni la feuille (K15), la pilule (K11) ;
- la valeur des plafonds, l'analyse d'un hashtag ou d'une durée, la détection de `@`, l'annulation : l'hôte reçoit du texte et décide ;
- la capsule de refus (K14, loi 12), le verre (aucun dans K08) ;
- les champs de formulaire (connexion, inscription, mot de passe, code), le champ Message, le texte écrit sur la scène (A1, S6), la surface d'écriture du texte du post (S7 : seul son compteur vient de K08), la barre de recherche de verre de la liste.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyField.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-field.tsx` |
|---|---|---|---|
| Champ | `MeeshyField(_ label:text:input:prompt:caption:leading:limit:counter:isBusy:autoFocus:tone:haptic:focus:onChange:onSubmit:onCommit:onFocusChange:onLimitReached:onStep:trailing:)` | `MeeshyField(label, text, onChange, modifier, …, trailing)` | `<MeeshyField label text onChange … />` |
| Saisie | `MeeshyFieldInput { search, token, sentence, paragraph, numeric }` | idem | `'search' \| 'token' \| 'sentence' \| 'paragraph' \| 'numeric'` |
| Tête | `MeeshyFieldLeading { icon(systemImage:), glyph(String) }` | `Icon(ImageVector)`, `Glyph(String)` | `{ icon: GlyphName } \| { glyph: string }` |
| Compteur | `MeeshyFieldCounter(count:limit:tone:)`, placement `MeeshyFieldCounterPlacement { inline, hosted }` | idem | `<MeeshyFieldCounter count limit />`, `'inline' \| 'hosted'` |
| Loi du plafond | `MeeshyFieldLimit.count(_:)`, `.truncate(_:to:)`, `.isNear(count:limit:)`, `.crossing(from:to:limit:)` | idem | `meeshyFieldLimit.*` |
| État du brouillon | `MeeshyFieldLedger` (`receive`, `resync`, `commit`) | idem | idem |
| Haptique | `MeeshyFieldHaptic { standard, none }` | idem | `'standard' \| 'none'` |
| Recette en valeurs | `MeeshyFieldRecipe.resolve(input:hasCaption:tone:isEnabled:increasedContrast:)` | idem | `meeshyFieldRecipe(...)` |
| Mots | `MeeshyFieldWords` : `kit.field.clear`, `kit.field.count`, `kit.field.limit_reached`, `kit.field.busy` | idem | idem |

Paramètres, tous opaques, mêmes défauts partout :
- `label` (obligatoire, non vide) : le nom accessible ; `text` + `onChange(String)` : valeur et rappel, pas de liaison ;
- `input = sentence` : voir le tableau ; `prompt: String? = nil` : l'invite déjà traduite, visible champ vide ; `caption: String? = nil` : une ligne fine au-dessus de la saisie, dans la boîte, toujours visible, qui empile le champ et remplace l'invite ;
- `leading = nil` ; `limit: Int? = nil` ; `counter = inline` ; `isBusy = false` ; `autoFocus = false` ; `tone: MeeshyGlassTone? = nil` (celui de l'hôte) ; `haptic = standard` ;
- `onSubmit(String)` (Retour, sauf `paragraph`), `onCommit(String)` (Retour, perte de focus, démontage, si la valeur a changé depuis le dernier commit : un pas d'annulation), `onFocusChange(Bool)`, `onLimitReached()`, `onStep(Int)` (`numeric` seulement), tous optionnels ;
- désactivé : `.disabled(_:)`, `enabled = true`, `disabled` ; poignée de focus idiomatique : `focus: FocusState<Bool>.Binding?`, `focusRequester`, `inputRef` ; le web ajoute `data` (sondes `data-*`).

| `input` | lignes | clavier, Retour | correction, majuscule | croix | vue |
|---|---|---|---|---|---|
| `search` | 1 | recherche, « Rechercher » | non, aucune | oui, s'il y a du texte | A16, A18 |
| `token` | 1 | défaut, « OK » | non, aucune | non | A17 |
| `sentence` | 1 | défaut, « OK » | oui, phrase | non | P5 |
| `paragraph` | 3 à 6, puis défile | Retour = ligne | oui, phrase | non | O9 |
| `numeric` | 1 | chiffres et ponctuation, « OK » | non | non | O10 |

Un emplacement : `trailing`, un accessoire qui n'est pas la saisie (puce de langue, action courte), dans une cellule de 44 pt au bord de fin, après le compteur et la croix.

État interne, le même partout : un brouillon local garde le curseur et la composition du clavier ; `onChange` part à chaque frappe, après troncature ; le brouillon ne se réaligne sur `text` que si `text` change pour une raison extérieure (annulation, normalisation de l'hôte) ou après un commit, jamais pendant une composition.

## 3. États
- Vide, invite et loupe : A16, A18.
- En saisie, tête « # », curseur : A17.
- En saisie, compteur en ligne au bord de fin : P5 (« 17 / 60 »).
- Paragraphe à légende, compteur chez l'hôte (en-tête de la pilule) : O9 (« 86 / 1000 »).
- Numérique à légende, deux champs côte à côte : O10 (« Début 0:02 », « Fin 0:08 »).
- Recherche avec texte : croix. Occupé : roue à la place de la croix. Aucune vue ; conservés du code (`ContactsSearchField`, `AudienceUserPickerView`, `StoryAudiencePickerPage`).
- Proche du plafond (80 %) : compteur en couleur d'alerte ET en gras. Au plafond : troncature, annonce, `onLimitReached` (la capsule R10 reste à l'hôte). Aucune vue ; conservé (`CharacterCountLabel`).
- Désactivé : contenu à 40 %, ni saisie ni croix. Focus au clavier (web) : anneau de K01 sur la boîte. Ton `theme` : fond et encre du thème, hors média. Aucune vue.

Loi 13 :
- pas d'invite dès qu'il y a du texte ou une légende ; pas de croix sur un champ vide ni hors `search` ; pas de roue sans `isBusy` ;
- pas de compteur sans `limit`, ni tant que le champ est vide ; en `hosted`, le champ n'en dessine aucun ;
- pas de bord, d'ombre ni de verre ; pas de titre ni de message d'erreur autour du champ ; pas de « Annuler » à côté ;
- pas de cellule pour une tête ou un `trailing` absents ; pas de boutons − et + visibles en `numeric`.

## 4. Gestes et retours
- Toucher la boîte, où que ce soit (tête, marge, légende), donne le focus à la saisie. `autoFocus` le prend une fois, au tour de boucle qui suit le montage.
- Croix : vide le texte, rappelle `onChange("")`, garde le focus et le clavier. Le champ ne ferme jamais le clavier ni la feuille de lui-même.
- Retour : `onSubmit` puis `onCommit` ; en `paragraph`, une ligne de plus.
- Coller ou taper au-delà du plafond : le texte est coupé au plafond, sur une frontière de graphème ; jamais de frappe refusée en deçà.
- `numeric` : `onStep(±1)` par les actions d'accessibilité et, sur le web, par ↑ et ↓ ; l'hôte analyse le texte au commit et rend la valeur normalisée.
- Animations : fondu de la croix, de la roue et du compteur (opacité, 150 ms) ; immédiat sous « réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`). La hauteur d'un paragraphe change sans animation.
- Haptique, par le site unique (`HapticFeedback`, `rememberMeeshyHaptics()`, `lib/view/haptics.ts`) : un `light` à la croix (sur iOS par `MeeshyGlassButtonTrigger`), un `warning` à chaque franchissement du plafond, jamais à la frappe ; `none` laisse l'hôte jouer le sien ; rien si désactivé.

## 5. Accessibilité
- Nom : `label`, jamais l'invite seule. La légende est lue comme indication (`accessibilityHint`, description d'état, `aria-describedby`). Tête masquée.
- Rôle : champ de texte natif ; `search` porte le trait de recherche (`.isSearchField`, `role="searchbox"` sur un `type="text"`) ; `paragraph` est un `<textarea>` ; `numeric` avec `onStep` est réglable (`accessibilityAdjustableAction`, actions personnalisées, `role="spinbutton"`).
- Valeur : le texte. Le compteur se lit « 17 caractères sur 60 », nombres dans les chiffres du lecteur, rattaché au champ ; passage à 80 % et plafond annoncés une fois, poliment (`UIAccessibility.post`, `liveRegion`, `aria-live="polite"`).
- Ordre de lecture : champ (nom, valeur, indication), compteur, croix (« Effacer », `kit.field.clear`), `trailing`.
- Cible : la boîte fait au moins 44 pt, 48 dp, 44 px de haut ; croix et `trailing` dans une cellule de même taille.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : texte en taille relative, la boîte grandit en hauteur ; aux très grandes tailles, le compteur en ligne passe sous la saisie ; web en `rem`, sans défilement horizontal de la page.
- Web, clavier : un arrêt de tabulation pour la saisie, puis la croix, puis `trailing` ; Échap dans `search` efface s'il y a du texte, sinon laisse la feuille le traiter ; anneau de K01 sur la boîte (`:focus-within`), contour propre de la saisie retiré ; `enterKeyHint`, `inputMode`, `autoCapitalize`, `spellCheck` selon `input` ; `dir="auto"`.
- RTL : tête au bord de début, compteur, croix et `trailing` au bord de fin ; la saisie suit la direction du texte tapé ; les nombres de `numeric` restent de gauche à droite.
- Contraste, calculé sur la feuille de la planche : texte 13,3:1, invite et tête à 70 % 7,4:1, alerte 4,8:1, curseur 4,5:1. Le fond du champ ne fait que 1,26:1 contre la feuille : sous « augmenter le contraste », un filet à 60 % de l'encre l'entoure. Ton `onLight` : encre sombre, mêmes seuils.

## 5 bis. Performance
- Ne se re-rend jamais à la frappe : l'hôte (hors de son propre `onChange`), la tête, la légende, le `trailing`. iOS : sous-vues `Equatable`, aucun `@ObservedObject` ni singleton de thème (`colorScheme` et le ton d'environnement suffisent). Android : paramètres stables, lambdas mémorisées, compteur lu dans son propre périmètre de recomposition. Web : saisie non contrôlée à chaque touche (`onInput`, valeur poussée seulement sur changement extérieur), compteur et croix en composants mémoïsés, `:focus-within` en CSS.
- S'anime : l'opacité de la croix, de la roue et du compteur. Jamais la mise en page, une ombre ni un flou.
- Budget : frappe continue et collage de 1000 caractères sans image perdue, la scène restant vivante derrière (O9, P5) ; le compte est linéaire et ne se refait qu'au changement de texte ; rien de retenu une fois la feuille fermée (aucun minuteur, aucun écouteur global). Web : poids mesuré par `measure-weight.mjs`.

## 6. Jetons et mesures
Mesures de la planche : rayon 14 ; fond blanc à 8 % ; marges 12 × 14 ; texte 15/21 ; écart 8 ; hauteur d'une ligne 45 ; loupe 18 à 70 % ; invite à 70 % ; curseur 2 px `#8B8DFF` ; compteur 12 px, graisse 500, à 70 % ; O9 : 110 de haut au moins, légende 12 px puis 6 px ; O10 : deux champs à 10 d'écart, marges 10 × 14, légende 12 px, valeur 20 px grasse à chiffres tabulaires.

Jetons :
- rayon `MeeshyRadius.md`, `--radius-field` ; marges `MeeshySpacing.md` et `.mdPlus` (`.smPlus` en `numeric`) ; écarts `.sm`, `.xsPlus`, `.xxs` ;
- tête `MeeshyIconSize.lg` ; texte `MeeshyFont.bodySize` relatif, légende et compteur `smallSize` en `medium`, valeur numérique `title3Size` grasse, chiffres à chasse fixe ; web `text-body`, `text-caption`, `tabular-nums` ;
- fond : l'encre à `MeeshyOpacity.subtle` ; invite, tête et compteur : `MeeshyColors.onMediaMuted`, `MeeshyMediaChromeColors.OnMediaMuted`, `--color-on-media-3` ; texte `onMedia` ; ton `theme` : encre et fond de saisie du thème (`tokens.inputBackground`, `--color-ios-card`) ;
- curseur `MeeshyColors.indigo400` ; alerte `MeeshyColors.error` ; filet `MeeshyBorder.regular` ; désactivé 40 % ;
- cible `MeeshyControlSize.tapTarget`, `.minTouchTarget`, `--target-min`.

Géométrie, opacités et table des `input` vivent dans `MeeshyFieldRecipe`, nulle part ailleurs. Aucun appel à `glassEffect`, `adaptiveGlass`, `backdrop-filter` ni classe `.glass*`, aucun code de couleur, aucune chaîne en dur dans les fichiers de K08.

Parité : `docs/product/kit/K08-MeeshyField.vectors.json` (recette par `input` et par ton, visibilité de l'invite, de la croix et du compteur, compte et troncature dont émojis composés, seuil de 80 %, franchissements, textes du compteur et noms dits en fr, en, ar), lu par les trois suites.

## 7. Jumeaux
K08 ne rebranche et ne supprime aucun jumeau. Il promeut l'état, la forme et les témoins des plus complets ; les lots d'intégration suppriment.
- iOS. DEVIENT : `MediaAltTextField` (`MeeshyUI/Story/Controls`) pour l'état (brouillon, réalignement, commit à la perte de focus et au démontage), avec la forme de `ContactsSearchField` (loupe, croix conditionnelle) et le compteur de `CharacterCountLabel` (app), dont les lois pures et `CharacterCountLabelTests` montent dans le kit.
- iOS, supprimés : par I3, `ComposerHashtagSheet.champ`, `StoryMentionPickerSheet.searchField`, `LocationPickerView.searchBar` (« Autour de moi » devient la ligne de liste de A18), le champ de `StickerPickerView+Vertical`, `SoundLibraryPicker.searchField` ; par I2, `AudienceUserPickerView.searchField` ; par I5, `MediaAltTextField`, ses appels du composer et `MediaAccessibilityPanel`, les deux curseurs Début et Fin de `ComposerObjectTimingControls` ; par I6, le compteur de `ComposerPostTextCap` et `ClipInspectorNumericField` ; par I7, `ComposerMoodSurface.textInput` et `characterCount` ; par I10, `ContactsSearchField` (5 appels), `CharacterCountLabel`, `LanguagePickerSheet.searchBar`, `CommunityListScreen.searchBar`, `TagInputField.inputField`, et les recherches de `AddParticipantSheet`, `ConversationInfoSheet`, `MemberManagementSection`, `ConversationMediaHubView`, `EmojiPickerSheet`, `NewConversationView`, `CallDeclineSheet`.
- iOS, restent hors K08 : `AuthTextField`, `MeeshyPasswordField`, `UniversalComposerBar`, `ComposerDescriptionLayer`, `ConversationSearchFieldHost`.
- Android. DEVIENT : `PeopleSearchField` (`component/people`) pour la forme, avec l'état de `rememberHostedTextField` (`component/composer/HostedTextField.kt`) et le compteur de `CharacterCountLabel` et `CharacterCountPolicy`.
- Android, supprimés : par I3, les champs de `StoryReferenceSheets.kt` (mention, hashtag, lieu), `StickerSearchField`, `ShelfSearch` ; par I2, celui de `StoryAudiencePickerPage.kt` ; par I5, `MediaAltField` et les deux champs de `ComposerMediaDescription.kt` ; par I7, celui de `StatusComposerSheet.kt` ; par I10, `PeopleSearchField`, `EmojiPickerSearchField`, `ChipInputBox`, `ReportDetailsField`, `CharacterCountLabel`, et les `SearchField` privés (contacts, communautés, nouvelle conversation, médiathèque, lieu, appels).
- Android, restent hors K08 : `ComposerInlineTextField` (le texte édité sur la scène, compté à tort par le registre), `AuthTextField`, `MeeshyPasswordField`, `MessageComposerCapsule`, `ConversationSearchBar`.
- Web. DEVIENT : la rangée de recherche de `Sheet` (`components/sheet.tsx`, `onSearchChange`, six feuilles), avec la croix et le `role="searchbox"` de `DiscoverSearchField` et la loi de `characterCounterOf` (`lib/send/compose-protection`).
- Web, supprimés : par I5, `StudioAltField` et les saisies de légende de `story-compose-editor.tsx` et `story-compose-parts.tsx` ; par I7, la note de `routes/status-compose.tsx` ; par I10, la rangée de `Sheet`, `DiscoverSearchField`, et les recherches de `thread-search-panel.tsx`, `send-sheet-zones.tsx`, `call-people-sheet.tsx`, `call-decline-sheet.tsx`. Le web n'a ni feuille Mention, ni Hashtags, ni Lieu, ni Temps de l'objet : I3 et I5 les construisent avec K08.
- Web, restent hors K08 : `Field` (`components/field.tsx`), `password-input.tsx`, `composer.tsx`, la zone de texte de `story-compose-overlays.tsx`. `glass-surface`, `call-glass-button`, `call-control-pill`, `scene-*` et `story-*` ne portent aucun champ de texte ; `composer-audio-trim` ne porte que des curseurs.

## 8. Témoins exigés
Comportements (`MeeshyFieldTests`, `MeeshyFieldTest`, `meeshy-field.test.tsx`) :
- recette : chaque `input` × ton rend les valeurs des vecteurs ; clavier, Retour, correction et majuscule du tableau ;
- l'invite n'existe que champ vide et sans légende ; la croix que dans `search` avec du texte ; la roue remplace la croix ; le compteur en ligne que si `limit` et du texte, aucun en `hosted` ;
- `onChange` à chaque frappe ; `onCommit` une seule fois par valeur changée, à Retour, à la perte de focus et au démontage, jamais sans changement ; un `text` venu de l'hôte remplace le brouillon, une composition en cours n'est pas cassée ;
- plafond : compte et troncature des vecteurs, alerte à 80 %, `onLimitReached` et annonce une fois par franchissement ;
- croix : texte vide, focus gardé, un `light` ; `warning` au plafond ; aucun avec `none` ni désactivé, jamais à la frappe ;
- nom, rôle, indication, compteur dit en phrase et en chiffres localisés ; `onStep` exposé en action ; web : ordre de tabulation, Échap, ↑ et ↓, `role="searchbox"` sans croix native ;
- boîte et cellules d'au moins 44 pt, 48 dp, 44 px ; contraste calculé depuis la recette ; filet sous « augmenter le contraste » ; aucun fondu sous « réduire les animations » ;
- garde de source : ni verre, ni couleur, ni chaîne en dur, ni `ThemeManager.shared` ; web : `glass-site` et `check-kit.mjs` verts ;
- parité par les vecteurs ; non-régression : le lot ne touche aucun jumeau ni aucun écran.

Instantanés (`MeeshyField/<id>.<variante>`) : `recherche-vide`, `recherche-texte`, `occupe`, `hashtag`, `phrase-compteur`, `plafond`, `paragraphe`, `temps`, `theme`, `desactive` en `clair` et `sombre`, planches `grande-police` et `rtl` ; web : 390, 820 et 1440 px, plus `focus`. Images enregistrées sur la branche du lot puis comparées au vert (`sdk-tests.yml` et `android.yml` avec `record_snapshots`, `check-kit.mjs` avec `CAPTURE_DIR`) ; Android : aucun nom de test avec « ; » ni « . ».

Catalogue : entrée K08 (`MeeshyKitCatalog+K08.swift`, `KitCatalogK08.kt`, `components/kit/catalog/k08.tsx`, vides sur `dev`). Vues : `recherche-vide` A16, `recherche-texte` A18 et `hashtag` A17 sur `dark`, `paragraphe` O9, `temps` O10 et `phrase-compteur` P5 sur `media`, `theme` sur `light`.

## 9. Écarts connus et choix retenus
Écarts relevés :
- Forme : aucun jumeau n'a celle de la planche. Rayons de 10, 12 et 14, capsule (stickers iOS, appels web), fonds à 4, 6, 7 et 8 %, bord Material (`OutlinedTextField`, 9 sites Android), `.roundedBorder` (`MediaAltTextField`), bord indigo (mood iOS).
- Focus : la planche ne montre que le curseur ; `AuthTextField`, `ChipInputBox` et `Field` web teintent et épaississent le bord.
- Croix : absente de la planche, présente sur toutes les recherches du code ; absente de la feuille Mention iOS et de la rangée de `Sheet` web.
- Compteur : « 17 / 60 » avec espaces sur la planche, « 17/60 » dans le code ; dans le champ (P5) ou dans l'en-tête (O9, S7) ; alerte par la seule couleur dans le code.
- Unité du plafond : graphèmes (mood iOS), UTF-16 (texte du post iOS, Android, `maxLength` web).
- Valeurs : mood 60 sur la planche, 122 sur iOS, 80 sur le web ; texte du post 1000 sur la planche, 5000 sur iOS.
- O9 : la légende est dans le champ sur la planche, au-dessus et hors du champ dans le code ; O10 : deux tuiles sur la planche, deux curseurs sur iOS, des boutons cycliques sur Android.
- A18 : « Autour de moi » est une ligne de liste sur la planche, une capsule dans le champ sur iOS.
- A17 : « # » à 70 % sur la planche, à la couleur de hashtag sur iOS.
- Texte : 15 px sur la planche ; `text-body` vaut 17 px sur le web.
- Registre : `ComposerInlineTextField` n'est pas un champ de feuille ; les jumeaux les plus proches (`ContactsSearchField`, `PeopleSearchField`, `CharacterCountLabel`, la rangée de `Sheet`) n'y figurent pas ; les trois modèles y sont `haiku`.

Choix retenus (mode autonome ; alternatives entre parenthèses) :
1. K08 est le champ de feuille et de pilule ; les champs de formulaire (`AuthTextField`, `MeeshyPasswordField`, `Field` web) restent hors kit, et le lot ouvre une issue pour leur convergence. (Les absorber avec refus, validité et saisie secrète ; un second composant de kit.)
2. Brouillon local, `onChange` à la frappe, `onCommit` au Retour, à la perte de focus et au démontage. (Liaison simple ; commit seul.)
3. Cinq `input` fermés qui fixent clavier, Retour, correction et lignes. (Paramètres de clavier libres.)
4. Croix dans `search` seulement, dès qu'il y a du texte. (Partout ; nulle part, comme la planche.)
5. Fond à 8 % de l'encre, sans bord ; focus dit par le curseur, anneau de K01 au clavier sur le web ; filet sous « augmenter le contraste ». (Bord teinté au focus ; bord permanent.)
6. Compteur : un atome, en ligne (P5) ou remis à l'hôte (O9, S7), écrit « 17 / 60 », visible dès qu'il y a du texte, en alerte grasse à 80 %. (Toujours visible ; toujours sous le champ ; couleur seule.)
7. Plafond : troncature, compte en unités UTF-16 coupé sur une frontière de graphème, la loi de `ComposerPostTextPolicy` et celle du serveur. (Graphèmes ; unité choisie par l'hôte ; refus de frappe.)
8. K08 ne fixe aucun plafond : 60 ou 122, 1000 ou 5000 se tranchent à I7 et I6, par une issue chacun. (Prendre les valeurs de la planche dès K08.)
9. O10 : deux champs `numeric` éditables, commit au Retour, pas par l'accessibilité et les flèches (`onStep`) ; la barre à poignées reste le geste principal. (Tuiles en lecture seule ; garder les curseurs.)
10. O9 : `paragraph` de 3 à 6 lignes, légende dans le champ, lue comme indication. (Libellé au-dessus, hors du champ ; 1 à 3 lignes.)
11. Tête : icône ou glyphe de texte, à l'encre atténuée. (Couleur de hashtag ; loupe implicite en `search`.)
12. « Autour de moi » sort du champ à I3 ; `trailing` et `isBusy` gardent la roue et la puce de langue. (Le laisser dans le champ.)
13. Haptique : `light` à la croix, `warning` au plafond, `none` possible. (Aucun ; laissé à l'hôte.)
14. Web : `type="text"` avec `role="searchbox"` et `onInput` ; `text-body` (17 px), ce qui évite le zoom de Safari au focus. (`type="search"` natif ; 15 px.)
15. Deviennent le composant : `MediaAltTextField` (iOS), `PeopleSearchField` avec `rememberHostedTextField` (Android), la rangée de `Sheet` (web). (`ContactsSearchField` ; `ChipInputBox` ; `Field`.)
16. Aucun jumeau rebranché dans K08 ; `ComposerInlineTextField` sort de la liste. (Faire de `ContactsSearchField` un appelant mince dès K08.)
17. Modèle d'exécution : `sonnet` sur les trois plateformes. (`haiku`, comme le registre.)

## 10. Livraison iOS (lot K08, branche `claude/kit-k08-ios`)
- Fichiers : `MeeshyUI/Kit/MeeshyField.swift` (compteur, champ, feuilles `Equatable` de la légende et de la tête, rôle d'accessibilité), `MeeshyUI/Kit/MeeshyFieldRecipe.swift` (recette, encre par ton, loi du plafond et de ses franchissements, registre du brouillon `MeeshyFieldLedger`, mots), `Kit/Catalog/MeeshyKitCatalog+K08.swift` (dix états), clés `kit.field.clear`, `kit.field.count`, `kit.field.limit_reached`, `kit.field.busy` du catalogue de chaînes de MeeshyUI (sept langues).
- Témoins : `MeeshyFieldTests` (vecteurs : recette par `input` et par ton, visibilité, compte, troncature, seuil, franchissements, textes et noms dits en fr/en/ar ; registre du brouillon : frappe, écho, coupe au plafond, commit unique, réalignement ; croix par `MeeshyGlassButtonTrigger` ; gardes de source) et `MeeshyFieldSnapshotTests` (dix états en clair et sombre, `grande-police`, `rtl`).
- Ajouts à l'API de la fiche : `focus: FocusState<Bool>.Binding?` se place entre `haptic` et `onChange` ; `MeeshyFieldLimit.crossing(from:to:limit:)` et `MeeshyFieldLedger` portent en valeurs ce que la vue fait au clavier, pour que les trois suites le testent sans écran.
- Le ton `onLight` fonce l'encre (`textPrimary` clair) et passe l'alerte en `errorStrong`, `error` tombant sous 4,5:1 sur un fond clair ; le ton `theme` garde le fond « encre à 8 % » plutôt que `inputBackground`, que seul `ThemeManager` expose (singleton interdit au kit).
- La croix et la roue vivent dans une cellule de 44 pt réservée dès que le champ est `search` ou occupé : leur fondu ne change jamais la mise en page. Le compteur en ligne est posé dès qu'il y a un plafond, à opacité nulle tant que le champ est vide, pour la même raison.
