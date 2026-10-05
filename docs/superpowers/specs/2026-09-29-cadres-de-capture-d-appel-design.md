# Cadres de capture d'appel — design (2026-09-29)

Retour porteur du 2026-09-29 : « une centaine de cadres avec plusieurs modèles, où l'on a toujours un
filigrane de Meeshy, du logo ou les deux ; d'autres avec les pseudos des utilisateurs ; pour les
groupes, le nom du groupe. Les cadres s'activent selon qu'on soit à plusieurs ou à deux : ceux d'un
appel à 10 ne s'affichent pas à 4, ceux d'un appel à 2 pas à 5. Plusieurs variantes du même style
selon le nombre d'interlocuteurs. Distingué, élégant, jovial, déconnecté, corporate, fantastique,
futuriste, glauque, hors norme, morbide, féerique. Réutiliser les polices et styles des images de
message et de commentaire (Imager). »

Issues : voir le milestone « Pendant un appel, on capture l'instant dans un cadre signé Meeshy adapté
au nombre de participants ». Ce document porte le CONTRAT (vocabulaire, règles, rendu attendu) ; l'état
des tâches vit dans les issues.

## 1. Ce qu'est un cadre

Un **cadre** est une composition complète de la capture : fond, disposition des visages, forme et
traitement de chaque case, bordure, ornements, signature Meeshy, noms, titre. Il est DÉCLARATIF : une
donnée, jamais une fonction. Les deux clients l'INTERPRÈTENT avec le même vocabulaire fermé — c'est ce
qui permet d'en avoir cent sans cent fonctions de dessin.

- **Source unique** : `packages/shared/design/call-capture-frames/<ambiance>.json`, un fichier par
  ambiance. Le web l'importe tel quel ; iOS le reçoit par un fichier Swift GÉNÉRÉ
  (`packages/shared/scripts/generate-call-frames-swift.ts` →
  `apps/ios/Meeshy/Features/Main/Models/CallFrames/CallFrameCatalogue+Generated.swift`), dont la
  fraîcheur est gardée par un test de `packages/shared`.
- **Les treize montages existants** (`screen`, `cover`, `gold`, … `heart`) restent tels quels, rangés
  sous l'ambiance « Classiques ». Ils ne sont pas réécrits dans ce vocabulaire.

## 2. Nombre de participants et variantes

Le nombre `n` est celui des PERSONNES de l'appel, moi compris (caméra coupée ⇒ avatar ou initiale,
jamais une case retirée). `n ≥ 2`. Plafond produit actuel : `CallRules.maxParticipants = 6` (maillage
sans SFU) — la tranche `tablee` est déjà dessinée et reste dormante tant que ce plafond tient.

| tranche | personnes | ce qui la distingue |
|---|---|---|
| `duo` | 2 | face-à-face : dispositions `split`, `diagonal`, noms de part et d'autre, titre « A & B » |
| `comite` | 3–4 | petit comité : `arch`, `orbit`, `hero`, `grid` |
| `groupe` | 5–6 | `tiers`, `mosaic`, `honeycomb`, noms en liste possible |
| `tablee` | 7–12 | grande tablée (dormante) |

Un **motif** (ex. `elegant.gala`) déclare une apparence de base et une VARIANTE par tranche qu'il sait
servir. Un **cadre** = motif × tranche, d'identifiant stable `<ambiance>.<motif>.<tranche>` (ex.
`elegant.gala.duo`). Un motif peut ne servir que le duo (« Cœur à cœur ») ou que les groupes (« Photo
de classe »).

**Règle de filtrage** : à `n` personnes, le carrousel ne montre QUE les cadres dont la tranche contient
`n`. Changement de `n` pendant le mode (arrivée, départ) : le cadre choisi passe à la variante du même
motif pour la nouvelle tranche ; à défaut, au premier cadre de la même ambiance ; à défaut, au premier
classique.

## 3. Navigation (≤ 2 gestes pour le chemin nominal)

- En haut de la barre du mode Montage : une rangée de **puces d'ambiance** (Classiques, Signature,
  Distingué, Élégant, Jovial, Déconnecté, Corporate, Fantastique, Futuriste, Glauque, Hors norme,
  Morbide, Féerique). Seules les ambiances qui ont au moins un cadre pour `n` s'affichent.
- En dessous : le carrousel existant, nourri des cadres de l'ambiance choisie pour `n`.
- Toucher une puce = une réponse immédiate (le carrousel change dans la même image), aucune attente
  réseau (catalogue et polices chargés à l'entrée du mode).
- Les gestes du carrousel restent ceux de #8625 : deux tapes sur le cadre choisi = photo, appui long =
  vidéo. Le défilement ne sélectionne qu'une fois POSÉ (#8736).
- Les vignettes ne se rendent que pour la fenêtre visible (± 3) : le coût ne dépend pas de la taille du
  catalogue.

## 4. Vocabulaire (fermé)

Toutes les tailles sont des FRACTIONS de `unit = min(largeur, hauteur)` de la toile, sauf mention. Les
couleurs sont des hex `#RGB`, `#RRGGBB` ou `#RRGGBBAA`. La toile vaut 1080 × 1920 en portrait (1920 ×
1080 en paysage sur le web) ; chaque disposition sait servir les deux.

### 4.1 `layout`
`{ arrangement, margin, gap, top, bottom }` — `margin`, `gap` en fractions de `unit` ; `top`, `bottom`
en fractions de la HAUTEUR, réservées au titre (haut) et à la signature / liste de noms (bas). La
**zone de contenu** est la toile moins la marge, moins `top` et `bottom`.

| arrangement | règle (n cases dans la zone de contenu) |
|---|---|
| `split` | 2 moitiés égales séparées de `gap` : empilées en portrait, côte à côte en paysage. n ≠ 2 ⇒ `grid` |
| `diagonal` | case 1 : 64 % de la zone, collée en haut à gauche ; case 2 : 64 %, collée en bas à droite, dessinée par-dessus. n ≠ 2 ⇒ `grid` |
| `hero` | case 1 : 62 % de la hauteur (portrait) / largeur (paysage) ; les autres en une rangée de médaillons carrés dans le reste |
| `grid` | la grille équilibrée existante (`gridRects`) |
| `row` | une seule ligne selon le grand axe, cases carrées centrées |
| `column` | une seule ligne selon le petit axe, cases carrées centrées |
| `arch` | cases carrées égales posées sur un demi-cercle ouvert vers le bas (arc de 180° à 360°), centré |
| `orbit` | case 1 au centre (38 % de la zone), les autres en cercle autour, à égale distance |
| `scatter` | la grille, chaque case réduite à 88 % et décalée de façon déterministe (graine = index) |
| `tiers` | rangées en gradins : la rangée du fond (la plus haute) 86 % de la taille de celle de devant, décalées d'une demi-case |
| `mosaic` | case 1 : 2/3 du grand axe ; les autres empilées dans le tiers restant |
| `honeycomb` | hexagones en quinconce (la forme de case est alors `hex`) |
| `cascade` | cartes égales (60 % de la zone) en escalier du coin haut-gauche au coin bas-droit, chacune par-dessus la précédente |

### 4.2 `slot` — chaque case
`{ shape, radius?, stroke?, double?, glow?, shadow?, card?, tilt, tone, duotone?, look? }`

- `shape` : `rect`, `round` (coins `radius`, fraction du petit côté), `circle`, `oval`, `arch` (haut en
  plein cintre), `hex`, `diamond`, `heart`, `star` (5 branches, rayon intérieur 0,5), `ticket` (coins
  encochés), `stamp` (bord perforé), `blob` (organique, déterministe) ; depuis #9197 : `torn` (bords
  rongés vers l'intérieur, dents ≤ 2,5 % du petit côté, déterministe), `polaroid` (photo CARRÉE, marges
  fines en haut et sur les côtés — 6 % du petit côté —, marge du bas ≥ 20 % de la hauteur ; le papier
  lui-même reste l'affaire de `card`), `frame-oval` (médaillon : ovale vertical 3:4, le plus grand qui
  tient).
- `look` (facultatif, #9197) : 2 looks au plus de la bibliothèque Meeshy, `{ id, amount?, size? }`,
  `id` ∈ `instant-film`, `film-grain`, `oil-paint`, `scratch-film`, `halftone`, `vignette`, `bloom` ;
  `amount` = intensité, `size` = taille du grain, de la touche ou de la trame (fractions). Appliqué
  APRÈS le lissage de peau ; `tone` reste pour la compatibilité. Reçu par les deux moteurs, dessiné à
  l'étape 3.5.
- `stroke` `{ color, width }` ; `double: true` ajoute un second trait intérieur à 40 % de l'épaisseur.
- `glow` : halo coloré (flou = 12 % du petit côté) ; `shadow: true` : ombre portée douce.
- `card` `{ color, pad, foot }` : la case est posée sur une carte (polaroid, vignette de timbre) ; `pad`
  et `foot` en fractions du petit côté de la case.
- `tilt` : `none` · `gentle` (±4°) · `wild` (±9°), angle déterministe par index.
- `tone` : `color` · `mono` · `sepia` · `noir` (mono contrasté) · `warm` · `cool` · `faded` · `duotone`
  (`duotone: [ombre, lumière]`, niveaux de gris multipliés par la lumière puis éclaircis par l'ombre).

### 4.3 `background`, `pattern`, `border`
- `background` : `{ kind: 'solid', color }` · `{ kind: 'linear', colors, angle }` (angle en degrés, 0 =
  de haut en bas) · `{ kind: 'radial', colors }` (du centre vers les bords) · `{ kind: 'accent' }`
  (le dégradé de la couleur d'accent de la conversation, repli indigo Meeshy `#6366F1 → #4338CA`).
- `pattern` (facultatif, entre le fond et les cases) : `{ kind, color, opacity }`, `kind` ∈ `dots`,
  `stripes`, `grid`, `checker`, `halftone`, `scanlines`, `grain`, `stars`, `confetti`, `sunburst`,
  `waves`, `circuit`, `damask`, `hearts`.
- `border` (facultatif, autour de la toile) : `{ kind, color, width, inset }`, `kind` ∈ `hairline`,
  `double`, `deco` (coins art déco), `baroque` (coins ornés), `filmstrip` (perforations), `ticket`,
  `perforated`, `neon`, `brackets` (coins de viseur), `torn` (papier déchiré), `mourning` (large bande
  noire), `vines`, `bulbs` (ampoules de loge), `polaroid` (marge blanche épaisse en bas).

### 4.4 `ornaments`
Liste de `{ kind, color, density, layer, motion? }` — `density` ∈ `low`/`mid`/`high`, `layer` ∈ `back` (sous les
cases) / `front` (dessus, jamais sur un visage : les ornements `front` se posent dans les marges et les
réserves `top`/`bottom`). Placement DÉTERMINISTE (graine fixe) : l'aperçu ne scintille pas. `motion`
(#9197) ∈ `still` (défaut), `loop`, `onAppear` : animé SEULEMENT en direct (étape 3.2) ; en capture,
l'ornement se peint immobile.

`sparkles`, `bokeh`, `confetti`, `balloons`, `stars`, `hearts`, `fireflies`, `petals`, `leaves`,
`bubbles`, `snow`, `rays`, `glitch`, `scanlines`, `grain`, `vignette`, `lightleak`, `crown`, `ribbon`,
`tape`, `rec`, `crosshair`, `orbits`, `runes`, `cobwebs`, `drips`, `lightning`, `notes`, `candles`,
`moon`, `clouds`, `bats`, `skulls`, `roses`.

### 4.5 Textes : `brand`, `names`, `title`, `subtitle`
- **`brand` — FACULTATIF depuis #9197** (décision de Jacques, 2026-10-02 ; il était obligatoire)
  `{ mark, place, color, size, font?, watermark? }` : `mark` ∈ `logo` (les trois traits
  Meeshy, géométrie de `BrandMark`/`AnimatedLogoView`), `wordmark` (le mot « meeshy », en minuscules —
  l'UNIQUE graphie des cadres), `both` ; `place` ∈ `top`, `bottom`, `top-left`, `top-right`,
  `bottom-left`, `bottom-right`, `watermark` (mot répété en diagonale, très discret, par-dessus
  l'ensemble) ; `size` ∈ `s`/`m`/`l`. Police par défaut : arrondie (SF Rounded / Fredoka). Un cadre
  sans `brand` se peint sans marque et ne réserve aucune rangée pour elle ; le catalogue Meeshy, lui,
  reste signé partout (témoin du § 6).
  `watermark` (facultatif, réservé à `place: 'watermark'`) `{ content, orientation, opacity }` — le
  filigrane des Imager (« Meeshy @pseudo » en quinconce) : `content` ∈ `brand`, `brand-handle` ;
  `orientation` ∈ `diagonal-up` (−π/7, celle d'aujourd'hui), `diagonal-down` (+π/7), `horizontal`,
  `vertical`, `cross` (les deux diagonales) ; `opacity` ≤ 0,08 (il passe sur la vidéo). Reçu par les
  deux moteurs ; tant que l'étape 3.4 n'est pas livrée, le filigrane se peint comme aujourd'hui
  (diagonale −π/7, 12 %).
- **`names`** `{ show, style, font, color, fill? }` : `show` ∈ `none`, `name` (nom affiché), `handle`
  (@pseudo), `both` ; `style` ∈ `caption` (sous la case), `plate` (bandeau dans le bas de la case),
  `ribbon` (banderole à bouts pliés), `badge` (pastille), `bubble` (bulle de BD), `tag` (étiquette
  manuscrite inclinée), `list` (tous les noms dans la réserve basse).
- **`title`** `{ source, font, color, place, size, effect?, case? }` et **`subtitle`** (même forme,
  sous le titre) : `source` ∈ `group` (nom du groupe ; hors groupe ⇒ `names`), `names` (« Awa & Karim »
  ; au-delà de trois : « Awa, Karim, Lina + 2 »), `brand` (« meeshy »), `date` (date du jour, format
  court de la langue), `none` ; depuis #9197 : `time`, `datetime`, `place`, `landmark`, `emotion` (qui
  n'écrivent RIEN tant que l'étape 3.3 n'est pas livrée — un texte vide se tait). `effect` ∈ `none`,
  `shadow`, `glow`, `outline` ; `case` ∈ `upper`, `as-is`. `form` (facultatif, #9197) : la forme de la
  spec 01 § 2, réservée à SA source — `time` : `digital`, `digital-seconds`, `analog`, `words`,
  `moment` ; `date` : `short`, `long`, `day-month`, `calendar-tile`, `roman` ; `datetime` : `inline`,
  `stacked`, `stamp` ; `place` : `city`, `city-country`, `neighborhood`, `street`, `address`,
  `country-flag`, `coordinates`, `pin`, `map-silhouette` (jamais plus précis que le réglage de
  l'utilisateur : le cadre ne peut qu'en afficher moins) ; `landmark` : `name`, `line-art`, `badge`,
  `skyline` ; `emotion` : `emoji`, `word`, `color-aura`, `particles`, `sticker`.
- **`elements`** (facultatif, #9197) : 6 textes ou pictogrammes au plus, posés librement — même forme
  que `title`, avec `place` ∈ `top`, `bottom`, `top-left`, `top-right`, `bottom-left`, `bottom-right`,
  `center-left`, `center-right` (le pourtour de la zone des visages, jamais son centre). Dessinés à
  l'étape 3.3.
- **Polices** : les dix-huit `StoryTextStyle` (`bold`, `neon`, `typewriter`, `handwriting`, `classic`,
  `calligraphy`, `cartoon`, `futuristic`, `fantasy`, `curve`, `tag`, `italic`, `retro`, `elegant`,
  `poster`, `bubble`, `note`, `brush`) — celles des images de message et de commentaire (Imager). iOS
  résout par `StoryTextStyle.fontName`, le web par `STORY_FONT_FAMILIES` / pile native, chargées AVANT
  le premier rendu (`document.fonts.load`).

### 4.6 Frames en direct et packs (#9197, doc 06 § 3 — étape 3.1)
Le format des cadres de capture est ÉTENDU, pas doublé : toutes les clés ci-dessous sont FACULTATIVES,
les douze fichiers d'ambiance se lisent sans changement, et un cadre qui ne les porte pas se rend
comme avant (les fichiers Swift générés du catalogue actuel sont inchangés octet pour octet). Les
moteurs REÇOIVENT ces clés et ignorent ce qu'ils ne dessinent pas encore.

- Au niveau du **motif** (valent pour toutes ses tranches, aucune variante ne les surcharge) :
  - `credits` `{ author, createdAt, updatedAt? }` — dates `AAAA-MM-JJ`, auteur ≤ 80 caractères ;
    affiché au tap sur la signature, ou à l'appui long sur le cadre (étape 3.4) ;
  - `surfaces` — sous-ensemble NON VIDE et sans doublon de `capture`, `live` ; absent ⇒ `['capture']`.
    Un cadre n'est proposé en direct que s'il déclare `live` et que son coût le permet ;
  - `cost` ∈ `light`, `standard`, `rich` — mesuré à la validation (spec 02 § 3.1).
- Dans l'**apparence** (une variante peut les surcharger, clé par clé) :
  - `scene` — 12 couches au plus `{ id, kind, depth, src?, preset?, color?, amount?, max? }` : `kind`
    ∈ `image`, `lottie`, `sprite`, `video-loop`, `particles`, `light` ; `depth` ∈ `back`, `front`,
    `effects`. Les couches à fichier (`image`, `lottie`, `sprite`, `video-loop`) exigent `src`, un
    chemin DU pack sous `assets/` (aucun schéma d'URL, aucune remontée `..`) ; `particles` exige
    `preset` (une sorte d'ornement) et `max` ≤ 150 ; `light` exige `color`. Plafonds de la scène : 2
    `video-loop`, 2 `light`, 150 particules au total, identifiants uniques (spec 02 § 3.3) ;
  - `behaviors` — `{ trigger, when?, target?, action, duration?, color? }` : `trigger` ∈ `onTap`,
    `onShake`, `onTilt`, `onSmile`, `onEmotion`, `onTime`, `onSpeaking`, `onCallEvent` ; `action` ∈
    `burst`, `calm`, `tint`, `play`, `stop`, `show`, `hide`, `shake` ; `when` précise le déclencheur
    et lui est RÉSERVÉ — une émotion pour `onEmotion` (`joy`, `love`, `pride`, `calm`, `surprise`,
    `nostalgia`, `party`, `gratitude`), un moment pour `onTime` (`morning`, `day`, `evening`,
    `night`), un événement pour `onCallEvent` (`start`, `end`) ; `target` = l'`id` d'une couche ;
    `duration` ≤ 10 s ;
  - `fallbacks` `{ reduced?, minimal? }`, chaque palier `{ hide?, still? }` — les couches qu'il masque,
    et celles qu'il remplace par un fichier fixe du pack (`{ layer, src }`). Le reste des paliers
    (particules divisées, looks en demi-résolution, `off` en fondu) est la règle du MOTEUR (spec 02
    § 3.2), pas une déclaration du cadre.

## 5. Règles de rendu communes

1. Ordre : fond → motif → ornements `back` → cartes/ombres/halos → visages (forme, ton) → traits de case
   → bordure → ornements `front` → noms → titre/sous-titre → signature.
2. Un texte ne couvre jamais un visage, sauf `plate`/`badge`/`bubble` qui sont DANS la case, en bas ou
   en coin, sur un fond propre.
3. Un texte trop long rétrécit jusqu'à 60 % de sa taille puis se tronque d'une ellipse.
4. La capture n'est JAMAIS en miroir (loi de #8719) ; l'aperçu non plus : le cadre montre ce qui partira.
5. Rendu en couches : ce qui ne dépend pas des visages (fond, motif, ornements, bordure, textes) se
   calcule UNE fois par (cadre, n, taille, textes) et se réutilise à chaque image.
6. Les noms et le nom de groupe sont ceux que l'utilisateur voit déjà dans l'appel ; l'image n'est
   partagée que par l'utilisateur lui-même (aucun envoi automatique).

## 6. Témoins

- Catalogue : ≥ 100 cadres ; identifiants uniques et stables ; chaque ambiance ≥ 3 motifs et au moins
  un cadre pour chaque `n` de 2 à 6 ; signature présente partout ; polices ∈ les dix-huit ; couleurs
  valides ; `split`/`diagonal` réservés au duo.
- Disposition, pour chaque cadre et chaque `n` de sa tranche : une case par personne, toutes dans la
  toile, déterministe.
- Rendu : la signature est tracée pour chaque cadre ; le titre de groupe n'apparaît qu'en groupe.
- Parité : le fichier Swift généré est à jour du JSON ; chaque vocabulaire du générateur est celui de
  `frame-spec.ts`, et chaque énumération Swift (`CallFrameSpec.swift`, `CallFrameFormatExtension.swift`)
  en porte les valeurs brutes.
- Extension (#9197) : l'exemple du doc 06 se lit au schéma ; chaque clé ajoutée refuse ce qui sort de
  son vocabulaire (forme hors de sa source, filigrane > 8 %, fichier hors `assets/`, plafonds de scène,
  `when` hors de son déclencheur) ; un cadre sans signature se peint sans marque ; les trois nouvelles
  formes se tracent dans leur case (`frame-spec-extension.test.ts`, `CallFrameFormatExtensionTests`).
