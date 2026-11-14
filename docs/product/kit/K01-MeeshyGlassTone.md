# K01 — MeeshyGlassTone (le verre du kit)

Relevé sur `origin/dev` `16d04ad8a1` le 2026-11-10. Registre : `.claude/workflows/meeshy-kit-planche.lots.json`. Loi 4 de `docs/product/composer-vue-finale.md` (loi 3 des appels). Planche : classes `.glass`, `.glass.deep`, `.glass.onlight` et la fonction `G(o)`, employées par `head`, `pill`, `rail`, `caps`, `xpill`, `kbar`, `modeHead`, `plaque`, `objMenu`, `toolPanel`, `retouchHead` et `rl`.

Issue du lot : #17400. Issues liées : #17334 (forçage debug du verre dessiné), #17323 (boutons d'appel en Liquid Glass), #16972 (verre adaptatif des appels iOS).

## 1. Rôle
Toute surface de verre du kit passe par cette entrée : elle choisit la matière selon l'appareil, le ton selon la luminance du contenu dessous, et elle répond au toucher.

Il ne fait pas :
- la forme, la taille ni la place : l'appelant passe une forme opaque (K02, K10, K12, K14, K16, K18, K25) ;
- la mesure : quel média échantillonner, et quand, reste à l'app ; K01 reçoit une luminance ou un ton ;
- l'action, le nom accessible et le retour haptique : ils appartiennent au contrôle (K02) ;
- les fonds pleins : disque blanc actif, rouge, Publier, feuilles et panneaux opaques.

## 2. API (mêmes noms sur les trois plateformes)
| | iOS `MeeshyUI/Kit/MeeshyGlassTone.swift` | Android `me.meeshy.ui.component.kit` | Web `components/kit/meeshy-glass-tone.tsx` |
|---|---|---|---|
| Ton | `enum MeeshyGlassTone { plain, deep, onLight, theme }` | `enum class MeeshyGlassTone` | `type MeeshyGlassTone = 'plain' \| 'deep' \| 'onLight' \| 'theme'` |
| Loi du ton | `MeeshyGlassTone.resolve(luminance: Double?, previous: MeeshyGlassTone? = nil)` | `MeeshyGlassTone.resolve(luminance: Float?, previous = null)` | `resolveMeeshyGlassTone(luminance, previous?)` |
| Densité | `MeeshyGlassDensity { regular, dense }` | idem | `'regular' \| 'dense'` |
| Recette en valeurs | `MeeshyGlassRecipe.resolve(tone:density:isTinted:isInteractive:isPressed:material:reduceMotion:)` | `MeeshyGlassRecipe.resolve(...)` | `meeshyGlassRecipe(...)`, qui rend classes et attributs |
| Surface | `.meeshyGlass(in: S, tone: MeeshyGlassTone? = nil, density: = .regular, tint: Color? = nil, isInteractive: Bool = false, isPressed: Bool? = nil)` | `MeeshyGlass(modifier, shape, tone = LocalMeeshyGlassTone.current, density, tint: Color? = null, interactionSource: InteractionSource? = null, pressed: Boolean? = null, content)` | `<MeeshyGlass as tone density tint interactive pressed className>` |
| Ton posé par l'hôte | `.meeshyGlassTone(_:)`, défaut `.deep` | `LocalMeeshyGlassTone` | `<MeeshyGlassScope tone>` (`data-glass-tone`) |
| Groupe | `MeeshyGlassGroup(spacing:)` | `MeeshyGlassGroup` | `<MeeshyGlassGroup>` |
| Appui en verre dessiné | `MeeshyGlassPressStyle: ButtonStyle` | la source d'interaction du contrôle | `:active` et `[data-pressed]` |

- Un seul emplacement : le contenu. `tone` absent ⇒ celui de l'hôte. `isPressed` / `pressed` fige l'état pour le catalogue.
- La matière `MeeshyGlassMaterial { liquid, drawn, opaque }` se déduit et ne se passe jamais : iOS 26+ ⇒ `liquid` ; iOS 16 à 25, Android et web ⇒ `drawn` ; « réduire la transparence » ⇒ `opaque` là où le verre est dessiné (sur iOS 26+, le système givre lui-même son Liquid Glass, qui l'emporte toujours — la règle d'`adaptiveGlass`). Seule exception, #17334 : `\.meeshyGlassForcesDrawn` sous `#if DEBUG`, posé par le catalogue ou par `-MeeshyForceDrawnGlass`.
- Web : la matière reste dans `styles/glass.css` (classes `.glass-tone-*`, `.glass-dense`, `.glass-touch`) ; le composant ne pose que des classes, jamais un fond. `glass-card` et `glass-accent` deviennent des valeurs de `tint` du ton `theme`.

## 3. États
- `plain` : verre clair sur contenu sombre. R1, I1, I2, I4 (chrome hors scène), I3 (plaque de la frise), C4 (bouton retour).
- `deep` : le défaut, sur une image ou une couleur moyenne. R2 (en-tête, pilule), R3 (rails), A1 (barre du clavier), A8 et A9 (viseur).
- `deep` dense : ce qui porte du texte. R7 à R9, R12, S1 à S5, P4, P5, O5 à O10 (pilule agrandie) ; A10, A13, S8, S9 (plaque) ; O2 (menu) ; R10, P2, P3 (capsule).
- `onLight` : sur contenu clair. R13 (✕, ↶ ↷, audience et pilule ensemble).
- `theme` : hors média, sur le fond de l'app, à l'encre du thème. Aucune vue : c'est le verre actuel des listes et des en-têtes, conservé.
- Teinté (`tint`) : accent de conversation, état enclenché des appels. Aucune vue, conservé.
- Pressé : toute surface `isInteractive`. Aucune vue (planche figée) ; référence : `ConversationListHeaderActions` sous iOS 26.
- Focus clavier (web, clavier d'iPad) : anneau. Aucune vue.
- Opaque : « réduire la transparence ». Aucune vue.
- Changement de ton : de R2 à R13 quand la scène change.

Loi 13 :
- pas de verre pour les feuilles et les panneaux (`.sheet`, `.panel` opaques : R11, A2), ni pour la rangée des scènes (R5), la trace du son et les références (R2) ;
- dans un groupe dessiné, un contrôle ne porte pas de seconde matière : une matière par groupe ;
- pas de réponse au toucher sur une surface qui ne se touche pas (plaque, capsule sans action) ;
- pas de flou ni de reflet en opaque.

## 4. Gestes et retours
- Appui : sous iOS 26+, la réponse du système (`.interactive()`). Ailleurs, dessinée : la surface grandit à `pressScale`, son reflet passe à `pressSheen`, puis retour élastique au relâcher. Valeurs de départ 1,04 et reflet doublé, à caler sur une capture iOS 26, puis identiques partout.
- La réponse part au toucher, en moins d'une image ; elle n'attend pas l'action.
- « Réduire les animations » (`MeeshyMotion.shouldReduce`, `LocalReduceMotion`, `prefers-reduced-motion`) : ni échelle ni ressort.
- Survol au pointeur (web, iPad) : reflet intermédiaire, sans échelle.
- Haptique : aucun dans K01. Le contrôle le joue par `HapticFeedback`, `MeeshyHaptics` ou `lib/view/haptics.ts`.
- Changement de ton : fondu de la teinte seule, 200 ms, immédiat sous « réduire les animations ».

## 5. Accessibilité
- K01 n'ajoute ni élément, ni nom, ni rôle, ni valeur, et ne change pas ceux de son contenu. Reflet et liseré sont masqués aux lecteurs d'écran.
- Ordre de lecture : celui du contenu ; un groupe ne réordonne rien.
- Dynamic Type, `fontScale` 2,0, zoom 200 % : la surface suit son contenu, le liseré reste à 1 px, aucune hauteur fixe.
- Web : `:focus-visible` visible sur les quatre tons (contour 2 px décalé de 2 px, 3:1) ; Espace et Entrée montrent l'état pressé ; la cible de 44 px est portée par le contrôle.
- RTL : rien à refléter (la lumière vient du haut) ; propriétés logiques pour le reste.
- Contraste, flou coupé, pire fond du ton : encre blanche ≥ 4,5:1 sur `dense` et `onLight`, ≥ 3:1 pour un glyphe sur `plain` et `deep`. Calculé sur les valeurs de la planche : `deep` 3,13:1 sur blanc pur, `dense` 6,12:1, `onLight` 5,07:1 ; `plain` tient 4,5:1 jusqu'à une luminance de 0,118.
- « Réduire la transparence » (`MeeshySurface.resolved`, `rememberReduceTransparency`, `prefers-reduced-transparency`) : fond plein du ton, sans flou.

## 5 bis. Performance
- Ne se re-rend jamais : le contenu et les voisins d'une surface pressée ; rien quand la luminance bouge sans changer de ton.
- Ton résolu une fois par contenu, hors du fil principal, mémorisé par clé (motif de `MediaLuminanceSampler`). Flux vivant (caméra, appel) : une mesure par seconde au plus.
- Seuls les lecteurs du ton réagissent : valeur d'environnement `Equatable` (iOS), `compositionLocalOf` et non `static` (Android), attribut et variables CSS héritées, sans rendu Preact (web).
- Ce qui s'anime : `scaleEffect` et opacité du reflet (iOS) ; `graphicsLayer` en phase de dessin (Android) ; `transform` et `opacity` d'un pseudo-élément (web). Jamais le flou, le fond, l'ombre ni la mise en page.
- Un flou par groupe.
- Web : aucun écouteur ni état pour l'appui. `glass.css` est dans la première peinture (96,08 Ko pour un plafond de 97) : le poids ajouté se mesure par `measure-weight.mjs`.
- Budget : aucune image perdue pendant l'appui ni pendant un défilement sous le verre ; rien de retenu une fois l'écran quitté (mémo borné, écouteurs `matchMedia` retirés).

## 6. Jetons et mesures
Mesures de la planche :
- flou 24 px, saturation 180 % ;
- fonds : `plain` blanc 14 %, `deep` sombre 46 %, `dense` 66 %, `onLight` 62 % ;
- liseré 1 px blanc 24 % (`plain`) ou 20 % ; reflet interne haut 1 px blanc 38 % ; ombre y 10, flou 28, noir 28 %.

Seuils du ton, dérivés du calcul de contraste ci-dessus : `plain` sous 0,118, `deep` sous 0,613, `onLight` au-delà ; luminance inconnue ⇒ `deep` ; hystérésis 0,03.

Jetons :
- encre : `MeeshyColors.onMedia`, `MeeshyMediaChromeColors.OnMedia`, `--color-on-media` ;
- sombre du verre : un seul jeton, à désigner (question 4) ;
- ressort : `MeeshyAnimation.springFast` et son pendant `MotionSpecs` ;
- ton `theme` : la recette actuelle, inchangée (`LiquidGlassFallbackRecipe`, remplissage de `MeeshyGlassSurface`, densités 80 et 94 % de `glass.css`).

Toute valeur chiffrée vit dans `MeeshyGlassRecipe` ou dans `glass.css`, nulle part ailleurs.

## 7. Jumeaux
- iOS. DEVIENT le composant : `adaptiveLiquidGlass` et `LiquidGlassFallbackRecipe` (`Compatibility/AdaptiveLiquidGlass.swift`), dont la recette gagne ton, densité et état pressé. Réutilisés tels quels : `makeMeeshyGlass`, `AdaptiveGlassContainer`, `MeeshySurface`, `MeeshyMotion`, la mesure de `CanvasChromeScheme`. `adaptiveLiquidGlass` (31 sites) reste un renvoi au rendu de repos identique.
- iOS, supprimés : les aides de `CallControlGlass` et leurs voiles noirs, `CallBannerContrast.contrastRatio` (I1) ; le voile de `ComposerCaptureChromeLegibility`, `glassControl` de `ComposerSceneCameraBar` (I4) ; la teinte de `MediaChromeScheme`, `ConversationHeaderGlassGlyph`, `glassCard`, les appels directs restants (I10).
- Android. DEVIENT : `MeeshyGlassSurface`, `LiquidGlassRecipe` et `GlassSurfaceValues` (`chrome/`). Réutilisés : `resolveGlassRendering`, `rememberReduceTransparency`, `LocalGlassBackdrop`, `LocalReduceMotion`. `MeeshyGlassSurface` (59 sites) reste un renvoi jusqu'à I10.
- Android, supprimés : les valeurs de `CallGlassTone`, `CallGlassToneUi`, `LocalCallGlassTone` (I1 ; `showsReceivedScreen` reste à l'app) ; `SCENE_VEIL`, `SOCLE_VEIL` (I2).
- Web. DEVIENT : `GlassSurface` (`components/glass-surface.tsx`), la matière restant `styles/glass.css`.
- Web, supprimés : la tenue `glass` et la chaîne `prominent` de `call-glass-button.tsx`, `call-control-pill.tsx`, `call-screen-header.tsx` (I1) ; `ROUND_GLASS` et `PRESSED_TILE` de `routes/story-compose-chrome.tsx` (I2) ; `GlassBack`, `VIEWER_GLASS` et les deux consommateurs de `GlassSurface` (I10).
- K01 ne supprime rien et ne change aucun écran.

## 8. Témoins exigés
Comportements (`MeeshyGlassToneTests`, `MeeshyGlassToneTest`, `meeshy-glass-tone.test.tsx`) :
- loi du ton : un témoin de chaque côté de chaque seuil, inconnue ⇒ `deep`, pas de bascule dans l'hystérésis ;
- matière : `liquid` dès qu'iOS 26 le permet, quel que soit le ton ; aucun paramètre public ne force `drawn` ; le forçage de #17334 est absent du build release ;
- interactif : recette de repos ≠ recette pressée ; égales si la surface ne se touche pas ;
- « réduire les animations » ⇒ échelle 1 ; « réduire la transparence » ⇒ `opaque`, sans flou ;
- contraste de chaque ton et densité contre son pire fond, calculé depuis la recette (web : `scripts/lib/glass-contrast.mjs` étendu) ;
- groupe dessiné : une seule matière, la réponse au toucher gardée ;
- parité : un fichier de vecteurs unique lu par les trois suites ;
- non-régression : le rendu de repos de `adaptiveLiquidGlass`, de `MeeshyGlassSurface` et de `glass` est identique avant et après ;
- web : anneau de focus sur les quatre tons, `glass-site.mjs` vert, première peinture sous le plafond.

Instantanés (`MeeshyGlassTone/<id>.<variante>`) : `plain`, `deep`, `deep-dense`, `onlight`, `theme`, `teinte`, `opaque` en `clair` et `sombre` ; `presse` pour ceux qui se touchent ; planches `grande-police` et `rtl`. iOS : suffixe `-iOS26` pour le Liquid Glass, et le verre dessiné par le forçage debug. Ce que la capture hors écran voit (`layer.render`, hôte sans application) : le Liquid Glass du système, composé par le serveur de rendu, n'y apparaît pas, et un verre teinté (`teinte`, `onlight`) y efface ce qui est peint avant lui ; les images `-iOS26` du chemin système montrent donc le fond et le contenu sans la matière, et la matière se juge sur les images `-dessine`. Les planches portent le verre dessiné sur toute version (`SnapshotHelpers.kitBoardGlass`) : elles jugent la mise en page. Les images se cadrent à la taille naturelle (`kitFramed`, `fixedSize()`), la proposition nulle de `.sizeThatFits` effaçant les libellés.

Catalogue : entrée K01 (`MeeshyKitCatalog+K01.swift`, déjà vide sur `dev`). Vues : `plain` R1 sur fond `dark`, `deep` R2 sur `media`, `deep-dense` R7, `onlight` R13 sur `light`. Bascule « Liquid Glass / verre dessiné » (#17334).

## 9. Écarts connus
- Le socle K00 n'est fusionné que sur iOS : ni `component/kit/`, ni `:feature:kit`, ni `components/kit/`, ni `check-kit.mjs` n'existent sur `dev`.
- Le registre compte 51 appels de verre dont 13 interactifs dans Composer et Call ; mesuré : 56, dont 12 avec `interactive: true`. Toute l'app et le SDK : 166 (cliquet à 163).
- Le registre nomme trois échantillonneurs iOS. `CallBannerContrast` n'en est pas un : il porte des teintes et un calcul de contraste en double. Les appels iOS n'ont aucun ton adaptatif, seulement deux voiles noirs fixes (#16972).
- iOS n'a pas de ton à trois valeurs : le code épingle un `colorScheme` à deux états par `CanvasChromeScheme`, dont les seuils (0,179 et 0,35) répondent à une autre question, l'encre d'un glyphe.
- La recette dessinée d'iOS et d'Android suit le thème de l'app ; la planche ne suit que le contenu, toujours à l'encre blanche. D'où le ton `theme`, que la planche ne dessine pas.
- Android : `CallGlassTone` n'a que deux tons ; `ChromeScheme` est déclaré deux fois dans `:core:model` ; `LocalCallGlassTone` est statique.
- Web : aucun ton lié au contenu hors `sharedScreenShown` ; `glass.css` ignore `prefers-reduced-transparency` ; trois fonctions de luminance (`lib/accent.ts`, `lib/view/author-ink.ts`, `frame-paint-kit.ts`).
- La réponse existante RÉTRÉCIT (`pressable()` à 0,93, 18 `active:scale-95` sur le web) ; le contrat demande un léger agrandissement. Les deux ne s'empilent pas.
- `onLight` vaut 62 % sur la planche du composer et 58 % sur celle des appels, soit 4,43:1 sur blanc pur.
- Le sombre du verre a trois jetons : noir sur iOS, `SurfaceDarkRaised` sur Android, `--ios-indigo-950` sur le web.
- La planche floute à 24 px avec saturation ; iOS emploie `.ultraThinMaterial`, Android 20 dp, le web 24 px sans saturation hors appels.

Les questions au porteur sont listées à part ; aucune n'est tranchée ici. Lectures retenues en attendant, par conservation : une matière par groupe en verre dessiné, ton `theme` gardé, sites existants inchangés par K01.

## 10. Lecture iOS (lot K01-ios)
- Fichiers : `Kit/MeeshyGlassTone.swift` (ton, densité, loi), `Kit/MeeshyGlassRecipe.swift` (matière, recette en valeurs), `Kit/MeeshyGlassSurface.swift` (`.meeshyGlass`, `.meeshyGlassTone`, environnement), `Kit/MeeshyGlassDrawn.swift` (le dessin), `Kit/MeeshyGlassGroup.swift` (groupe et `MeeshyGlassPressStyle`), `Kit/MeeshyGlassDebug.swift` (forçage de #17334, sous `#if DEBUG`).
- `adaptiveLiquidGlass` est un renvoi : `.meeshyGlass(in:, tone: .theme, tint:, isInteractive:)`. Son rendu de repos est celui d'avant ; sur iOS 26+ il reste le `glassEffect` du système même sous « réduire la transparence » (le système le givre) ; dessous, sous « réduire la transparence », il devient plein (fond secondaire du système), ce que le contrat demande.
- Jamais de verre sur du verre : un verre dessiné pose `meeshyGlassIsNested` sur son contenu ; une surface du kit (ton autre que `theme`) posée dedans ne porte alors ni flou, ni fond, ni reflet, ni liseré, ni ombre, et garde sa teinte et sa réponse au toucher. Le contenu reçoit aussi un appui remis à faux : l'appui de l'hôte ne descend pas dans ses voisins.
- Survol au pointeur (iPad) : reflet à 1,5 fois, sans échelle, en verre dessiné interactif seulement. Changement de ton : fondu du fond seul, 200 ms (`toneFadeDuration`), coupé par `meeshyAnimation` sous « réduire les animations ».
- Le sombre du verre iOS est `MeeshyColors.mediaBackdrop` (noir), jeton existant ; la question 4 reste au porteur.
- La recette porte `blurRadius` et `saturation` pour la parité ; iOS rend le flou par le matériau `.ultraThinMaterial`.
- L'appui dessiné se lit dans l'environnement `meeshyGlassIsPressed`, posé par `MeeshyGlassPressStyle` sur le contenu du bouton ; la surface s'applique donc DANS le libellé du bouton, ou reçoit `isPressed`.
- Vecteurs de parité : `docs/product/kit/K01-MeeshyGlassTone.vectors.json`, lus par la suite iOS ; Android et le web les liront tels quels.

## 11. Lecture web (lot K01-web)
- Fichiers, sous `apps/web/src/components/kit/` : `meeshy-glass-recipe.ts` (ton, densité, loi du ton, recette en valeurs : pur, sans DOM), `meeshy-glass-tone.tsx` (`MeeshyGlass`, `MeeshyGlassScope`, `MeeshyGlassGroup`, et les réexports `resolveMeeshyGlassTone`, `meeshyGlassRecipe`), `catalog/k01.tsx` (entrée au catalogue). Matière : `apps/web/src/styles/glass-kit.css`. Témoin : `meeshy-glass-tone.test.tsx` (lit `K01-MeeshyGlassTone.vectors.json`, comme iOS et Android). Captures : `captures/web/MeeshyGlassTone/`.
- La matière est `drawn` ou `opaque` (`MeeshyGlassMaterial`) : le web n'a pas de Liquid Glass. Aucun paramètre public ne la force. `opaque` vient du réglage du système (`prefers-reduced-transparency`) ou de `<MeeshyGlassScope opaque>`, posé par le catalogue seul.
- La matière vit dans `glass-kit.css`, seconde moitié du site unique du verre (`GLASS_KIT_SITE`, `scripts/lib/glass-site.mjs`), et non dans `glass.css` : cette feuille est celle de la première peinture, plafonnée à 97 Ko, et le kit n'est chargé qu'avec ses composants (`import` de `meeshy-glass-tone.tsx`). Écart assumé avec le § 2 (« la matière reste dans `glass.css` ») ; le lot qui fera entrer un composant du kit dans la première peinture tranche le plafond. Mesuré : `dev` à 97,07 Ko avant ce lot, 97,09 avec (le seul ajout est un nom de chunk dans la table de préchargement) ; le dépassement du plafond précède K01.
- Ce qui PLACE la surface (`position: relative`, que le reflet exige) et la disposition du groupe (`display: flex`, écart) vivent dans `@layer components`, sous la couche des utilitaires : un `absolute`, un `grid` ou un `gap-*` passé en `className` l'emporte. Le reste de la feuille reste hors couche, pour l'emporter sur `glass.css` (le ton `theme` plein).
- Le ton se pose en attributs (`data-glass-tone`, `data-glass-density`, `data-glass-tint`, `data-glass-nested`, `data-glass-material`, `data-pressed`) ; la surface ne porte jamais de fond en ligne. `MeeshyGlassScope` (`display: contents`, `data-glass-scope`, `data-glass-tone`) et chaque surface posent un contexte à valeur mémoïsée par (ton, imbrication, matière) : seules les surfaces qui lisent le ton se rendent de nouveau quand il change, jamais leur contenu.
- Jamais de verre sur du verre : un verre pose `nested` sur son contenu ; une surface de ton autre que `theme` posée dedans ne porte ni fond, ni flou, ni liseré, ni ombre, ni reflet, et garde sa teinte et sa réponse au toucher. Le groupe web (`MeeshyGlassGroup`, flex avec un petit écart, sans rôle ni matière) est un simple conteneur : « une matière par groupe » s'obtient par l'imbrication, comme sur iOS et Android.
- Le liseré, le reflet haut et l'ombre sont un seul `box-shadow` (le liseré n'est pas une bordure : aucune différence de dimension d'un ton à l'autre, ni avec `.glass`). Le ton `theme` n'a pas de matière dans `glass-kit.css` : il PORTE les classes `.glass` / `.glass-prominent` (80 et 94 %) de `glass.css`, et `tint` (`card`, `accent`) y ajoute `.glass-card` / `.glass-accent` — K01 enveloppe le verre des listes, il ne le recopie pas ; la matière du kit (`.glass-tone:not([data-glass-tone='theme'])`) ne sert que les trois tons de la planche. Sans liseré ni ombre, sans fondu de teinte (`--glass-tone-fade: 0ms`, comme Android) ; seuls la matière pleine et la réponse au toucher du kit s'y ajoutent. Sur les autres tons, `tint` lave le fond (22 % en sombre, 16 % en clair).
- Réponse au toucher dessinée, sans écouteur ni état : `:active` (aussi `:where(button,[role='button'],a[href],label,summary):active:not(.glass-touch) > .glass-touch`, pour une surface dans le libellé d'un contrôle — l'appui d'un verre hôte ne descend pas dans la surface posée dedans, comme sur iOS ; et, `:active` montant à tous les ancêtres, seul un contrôle transmet son appui : un groupe, un scope ou une pilule pressés par l'un de leurs boutons ne pressent pas ses voisins) et `[data-pressed]` font passer `transform` à `scale(1,04)` par un ressort (`cubic-bezier(.34,1.56,.64,1)`, 280 ms, retour élastique au relâcher) ; le reflet est un pseudo-élément dont seule l'`opacity` bouge (0 au repos, 0,5 au survol à `(hover: hover)`, 1 à l'appui, soit les facteurs 1,5 et 2 des vecteurs moins le reflet du repos). `prefers-reduced-motion` : ni échelle ni transition. Espace montre l'appui sur un `<button>` (`:active` du navigateur) ; Entrée déclenche l'action sans état pressé visible, les navigateurs ne posant pas `:active` à Entrée : le montrer exigerait un écouteur, que le § 5 bis exclut (#17571). Désactivé (`:disabled`, `aria-disabled`) : ni échelle, ni reflet, ni main au survol.
- Focus clavier : `outline: 2px solid var(--glass-focus-ring)`, décalé de 2 px, sur les quatre tons. Décalé, le contour se pose sur le CONTENU et non sur le verre : sa couleur suit donc la bande de luminance qui a élu le ton — encre de la planche (`--ios-on-media`) sur `plain`, sombre du verre (`--ios-media-backdrop`) sur `deep` et `onLight`, `currentColor` sur `theme` (fond de l'app) — et, posée dans un verre, la surface le trace à l'encre de la planche sur le verre de l'hôte. `kitGlassFocusRingContrast()` (`scripts/lib/glass-contrast.mjs`) le mesure aux deux bords de chaque bande : 6,29:1 (`plain`), 3,34:1 (`deep`), 13,21:1 (`onLight`). Le nom accessible, le rôle et la cible de 44 px restent au contrôle.
- Contraste : `kitGlassToneContrast()` (`scripts/lib/glass-contrast.mjs`) calcule, depuis la feuille, l'encre `--ios-on-media` contre le pire fond de chaque ton, flou coupé. Le sombre du verre web est `--ios-media-backdrop` (noir, comme iOS et Android ; la question 4 reste au porteur) : `deep` 3,47:1 (glyphe), `deep` dense 7,26:1, `onLight` 6,20:1, `plain` 4,53:1 à la luminance du seuil. Les 3,13 / 6,12 / 5,07 du § 5 supposaient un sombre moins noir.
- Instantanés : `plain`, `deep`, `deep-dense`, `onlight`, `theme`, `teinte`, `opaque` en clair et sombre, `presse` pour ceux qui se touchent, aux trois largeurs, et les planches `grande-police` et `rtl` (`check-kit.mjs`, jamais à la main).
- Écart de gate relevé hors périmètre : `check-kit.mjs` mesure 141 classes de verre hors du kit (111 sans réponse au toucher) pour un plafond de 140 (110) sur `dev` avant ce lot ; le lot n'y touche pas. Il a seulement fait passer la liste du catalogue à plusieurs entrées : le nom de l'entrée se coupe désormais à 200 % (`routes/kit.tsx`).

## 12. Lecture Android (lot K01-android)
- Fichiers, sous `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/` : `MeeshyGlassTone.kt` (ton, densité, loi), `MeeshyGlassRecipe.kt` (matière, remplissage, recette en valeurs), `MeeshyGlass.kt` (`MeeshyGlass`, `LocalMeeshyGlassTone`, `ProvideMeeshyGlassTone`, dessin), `MeeshyGlassGroup.kt`. Entrée au catalogue : `:feature:kit` `KitCatalogK01.kt`. Témoin : `MeeshyGlassToneTest` (lit `K01-MeeshyGlassTone.vectors.json`, comme iOS).
- Matière : `MeeshyGlassMaterial { Drawn, Opaque }`. Pas de `Liquid` : Android n'a pas de Liquid Glass du système. La matière se déduit (`MeeshyGlassMaterial.resolve`, interne) du rendu de `resolveGlassRendering` et de `rememberReduceTransparency` : « réduire la transparence » ⇒ `Opaque` ; avant l'API 31 un verre de ton reste `Drawn` (seul le flou manque, le remplissage du ton suffit) ; le ton `Theme` garde la règle de `MeeshyGlassSurface` (plein quand le rendu l'est). Aucun paramètre public de `MeeshyGlass` ne force la matière.
- Ton `Theme` : `LiquidGlassRecipe` et `GlassSurfaceValues` redonnés à l'identique (variante `liquid = true` de `MeeshyGlassSurface`, ombre comprise, y compris en opaque). `MeeshyGlassSurface` (59 sites) n'est PAS encore un renvoi : K01 ne change aucun écran, et le renvoi est le travail du lot d'intégration I10, qui retire ses appels et abaisse le cliquet `KitGlassRatchetTest`.
- Réponse au toucher : UNE valeur animée (`Animatable`, ressort `MeeshyMotion.springFast`), 0 au repos, 0,5 au survol, 1 à l'appui ; la recette de survol est la moyenne de celles du repos et de l'appui (reflet), l'échelle ne répond qu'au-delà du survol. Elle vient de la `InteractionSource` du contrôle (`clickable(interactionSource = …, indication = null)`, `hoverable`) ou d'un `pressed` figé (catalogue). Elle se lit en phase de dessin (`graphicsLayer {}`, `drawWithCache {}`) : le contenu ne se recompose pas à l'appui, et rien ne s'alloue par image (contour, trait, flou et pinceaux mis en cache ; le reflet intermédiaire est le pinceau de l'appui à opacité réduite). « Réduire les animations » (`LocalReduceMotion`) ⇒ `snap()` et échelle 1.
- Ton posé par l'hôte : `LocalMeeshyGlassTone` (`compositionLocalOf`, défaut `Deep`), posé par `ProvideMeeshyGlassTone`. Fondu de 200 ms du remplissage seul (`animateColorAsState`), `snap()` sous « réduire les animations », aucune animation pour `Theme`.
- Jamais de verre sur du verre : un verre pose `LocalMeeshyGlassNested` sur son contenu ; une surface de ton autre que `Theme` posée dedans ne porte ni flou, ni fond, ni reflet, ni liseré, ni ombre, et garde sa teinte et sa réponse au toucher `MeeshyGlassSurface` le pose aussi, comme `adaptiveLiquidGlass` dessiné le fait sur iOS : un verre du kit posé dans un verre du chrome n'y porte pas de seconde matière.
- La source d'interaction est écoutée une fois par source : « réduire les animations » change le ressort (`rememberUpdatedState`), jamais l'état en cours, et une surface rendue à sa source après un appui figé repart du repos. Témoin : `MeeshyGlassResponseTest` (Robolectric).
- Jetons : l'encre est `MeeshyMediaChromeColors.OnMedia`, le sombre du verre `MeeshyMediaChromeColors.MediaBackdrop` (noir, comme iOS ; la question 4 reste au porteur). Écarts assumés de rendu : l'ombre de Compose n'a pas de décalage vertical (`shadowYDp` est porté pour la parité) et le flou est un `BlurEffect` sans saturation (`saturation` est porté pour la parité) ; le flou est celui du fond enregistré (`LocalGlassBackdrop`), pas du média dessous.
- Le groupe garde une matière par surface (pas de fusion à faire sans Liquid Glass).
- Instantanés : `MeeshyGlassTone/<id>.<variante>.png` (`plain`, `deep`, `deep-dense`, `onlight`, `theme`, `teinte`, `opaque` en `clair` et `sombre`, `presse` pour ceux qui se touchent, planches `grande-police` et `rtl`), enregistrés par l'entrée `record_snapshots` d'`android.yml`, jamais sur un poste.
