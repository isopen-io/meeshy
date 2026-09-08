> Dossier des cibles de la v3.1 (issue #5672) — analyse de faisabilité produite le 2026-09-08 sur `claude/web-v3-parite` à `0c4141b444`, en lecture seule, contre l'app iOS DRAPEAUX BÊTA ACTIVÉS. Les numéros de ligne cités valent pour ce commit. Captures : `thread.river.*`, `river.scrolled.*`, `river.time-handle.*` dans ce dossier.

# La Rivière — analyse de conception et de faisabilité pour `apps/web-v3` (v3.1)

> Lecture seule ; aucun fichier du dépôt écrit. Dépôt : `/Users/smpceo/Documents/v2_meeshy-w3`,
> branche `claude/web-v3-parite`. Directive porteur 2026-09-08 : « si c'est possible d'avoir
> résumé et rivière tout de suite alors les intégrer ». Ce document ne traite que la Rivière.

---

## 0. VERDICT DE FAISABILITÉ IMMÉDIATE

### **OUI SOUS CONDITION**

La Rivière est de très loin le moins cher des deux modes hors périmètre, pour une raison qu'aucun document de la v3.1
ne dit : **sa loi est déjà écrite en TypeScript dans `@meeshy/shared`, et une peau React complète existe déjà dans le
dépôt.** Ce n'est pas une écriture, c'est un portage.

La condition n'est ni la donnée ni la loi : c'est **D-15**. La peau React existante monte *toutes* les bulles et
mesure le `getBoundingClientRect()` de chacune (`apps/web/components/conversations/riviere/RiverThread.tsx:180-200`,
`:305-330`). Sur le fil de 500 messages que D-15 impose de tenir (`apps/web-v3/decisions.md:308-320`), c'est
exactement le défaut que la virtualisation vient de corriger. **La Rivière entre au périmètre le jour où son tracé
sait vivre sur une fenêtre virtualisée** — mécanisme qu'iOS possède déjà (`RiverCanvasRankPlacement`,
`apps/ios/Meeshy/Features/Main/Riviere/View/RiverLaneCanvas.swift:38-51`) et que la peau legacy n'a pas.

### 0.1 Les DONNÉES

| ce qu'il faut | où ça vit | la v3.1 peut-elle le lire ? |
|---|---|---|
| `activeParticipantCount` (éligibilité) | **n'existe pas** — la passerelle sert `activeParticipantCount: null` (`services/gateway/src/routes/conversations/core-list.ts:665`, commenté `:664` « aucun décompte serveur honnête d'"actif" — JAMAIS 0 ») | non, et **ce n'est pas ce qu'iOS lit** |
| `memberCount` (ce qu'iOS lit RÉELLEMENT dans le fil) | `packages/shared/types/conversation.ts:330` ; servi par `GET /conversations/:id` (`core-detail.ts:191`, `:218` `memberCount: ['_count']`) ; au schéma `packages/shared/types/api-schemas/conversation.ts:244` | **OUI, déjà lu** : `apps/web-v3/src/routes/thread.tsx:361` l'affiche, `src/lib/api/fixtures.ts:331` le porte |
| messages (`id`, `senderId`, `createdAt`, `replyToId`, `messageSource`, `isDeleted`) | `@meeshy/shared/types/conversation` → `Message`, réexporté par `apps/web-v3/src/lib/api/types.ts:24` | **OUI** — `fixtures.ts:126` (`messageSource`), `:255-256` (`replyToId` + `replyTo`) |
| participants (graine de couleur) | **aucun fetch** : iOS les dérive des EXPÉDITEURS (`RiverConversationMapping.swift:78-81`) | **OUI**, et heureusement : `participants` est tronqué à cinq par la passerelle (`src/lib/view/conversation.ts:49`) |
| couloirs par participant | **calculés**, jamais servis — `resolveRiverLanes()` (`packages/shared/utils/river-lanes.ts:603`) | **OUI** |

**G-123 ne bloque pas la Rivière.** G-123 est le lot passerelle du « pont ✦ »
(`packages/shared/types/conversation.ts:405`, `core-list.ts:571`) ; il porte `activeParticipantCount: null` faute de
définition serveur d'« actif ». Le commentaire de `apps/web-v3/src/lib/reading-mode/decision.ts:42-46` (« la v3.1 n'a
AUCUNE source de ce compte aujourd'hui — comme iOS avant G-123 ») est **exact pour les surfaces de LISTE**
(`LentilleReadingModeContext.activeParticipantCount(for:)` rend `nil`,
`apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleReadingModeContext.swift:65-67`, qui se déclare « INERTE EN
PRATIQUE » `:80-85`) et **faux pour le FIL OUVERT** : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:569`
passe `activeParticipantCount: conversation?.memberCount ?? 0`. L'effectif du groupe, pas un décompte d'actifs —
rapprochement assumé côté iOS, jamais documenté comme tel, et **la seule raison pour laquelle la Rivière s'ouvre sur
un iPhone aujourd'hui**.

Conséquence : **la parité iOS coûte UNE ligne** (`decision.ts:56`, `activeParticipantCount: input.memberCount`), plus
`isRiverFlagEnabled: true` — absent de l'appel (`decision.ts:52-57`), et le paramètre étant optionnel
(`packages/shared/utils/reading-modes.ts:265`) son absence vaut `false`, donc `river` n'entre jamais dans
`availableModes` (`reading-modes.ts:356`).

**Ce que les fixtures peuvent mimer : tout.** `fixtures.ts:378` porte déjà `memberCount: 128`. Il manque un jeu de
messages à **≥ 3 voix entendues** dans une même fenêtre de silence, sinon la loi sérialise (`river-lanes.ts:255`,
`:636-641`) et l'écran rend un fil vertical — le cas exact du « corpus qui ne peut pas faire échouer un test ne peut
pas le valider ». Un corpus Rivière doit porter : ≥ 5 membres, ≥ 3 voix à moins de 30 min d'écart, une réponse croisée
(connecteur), un avis système (`messageSource: 'system'`), et un cas à > 7 voix simultanées pour éprouver
`aboveMaximum` (`river-lanes.ts:203`).

### 0.2 La TAILLE

**Ce qui ne coûte RIEN — déjà écrit, déjà éprouvé :** la loi des couloirs (`packages/shared/utils/river-lanes.ts`, **1
044 l**, portage **0** : c'est un `import`), ses témoins (`packages/shared/__tests__/river-lanes.test.ts`, 1 001 l),
ses **61 vecteurs inter-plateformes** (`fixtures/reading-modes/river-lanes` 24 · `river-step` 22 · `river-headers`
15), l'éligibilité et sa raison trifurquée (`reading-modes.ts:200-360`).

**Ce qui existe en React et demande une ADAPTATION** — `apps/web/components/conversations/riviere/`, peau complète
écrite pour le legacy, **jamais montée** (garde `apps/web/__tests__/riviere/riviere-screen-not-mounted.test.ts:71`) :

| fichier | l. | rôle | adaptation |
|---|---|---|---|
| `RiverThread.tsx` | 347 | hôte, grille CSS, `role="grid"`, clavier | **lourde** (virtualisation) |
| `river-paint.ts` | 232 | tracé pur → primitives SVG | légère |
| `RiverBubble.tsx` | 231 | la bulle | moyenne (tokens, `cn`, `getInitials`) |
| `RiverLaneOverlay.tsx` | 136 | le SVG | légère |
| `RiverLaneHeaderStrip.tsx` | 84 | bande de noms | légère |
| `river-metrics.ts` | 68 | lecture de deux tokens CSS | moyenne (§ 8.2) |
| `river-focus.ts` | 63 | `focusRank` fractionnaire, pur | **nulle** |
| `river-column-layout.ts` | 47 | rail/gouttière, pur | **nulle** |
| `river-bubble-types.ts` | 44 | contrat de contenu | nulle |
| **total** | **1 252** | + **952 l** de témoins (`__tests__/`, a11y, garde R15) | |

**Ce qui n'a aucun miroir web et se porte du Swift** (détail et volumes en § 8.1) : le mapping messages→loi et la
RECHERCHE de fenêtre de silence (`RiverConversationMapping.swift`, 443 l → **~200 l TS**, dont
`silenceWindowLadder:153-164`, indispensable) ; l'échelle de temps (`RiverTimeScale.swift`, 174 → **~140**) ; la
poignée (`RiverTimeHandle.swift`, 170 → **~130**) ; le curseur et l'atterrissage (`RiverNavigationController.swift` 67
+ `RiverStreamHost.swift:245-300` → **~90**) ; l'avis système pleine largeur (`RiverBubbleView.swift:341-370` → ~40) ;
le contour de groupe partagé (`:127-180` → ~30) ; l'identité vivante (`:600-641` → ~50) ; les badges hors-champ
(`RiverLaneHeaderStrip.swift:71-143` → ~60) ; le pince (`RiverConversationHost.swift:261-286` → ~40).

**Verdict : MOYEN.** ≈ **1 300–1 800 lignes web** (adaptées + neuves) et **400–600 de témoins**, contre 4 284 lignes
Swift — le rapport tient parce que la moitié du volume Swift est de la loi déjà partagée et de la documentation
d'arbitrage. **Découpable en quatre travaux** (§ 8.4).

### 0.3 Ce qui peut être livré INCRÉMENTALEMENT

1. **La loi câblée, sans écran** — `activeParticipantCount: memberCount`, `isRiverFlagEnabled`, un `river/geometry.ts`
   qui appelle `resolveRiverLanes()` avec l'échelle de fenêtres, et les **61 vecteurs rejoués sous `bun test`**. Zéro
   pixel, zéro risque. *Ne pas dégriser le menu à ce stade* : un mode sélectionnable sans peau viole D-8 dans sa
   formulation générale.
2. **Le canvas + la bulle** — grille, tracé SVG, bulles, groupes, avis système. Le mode devient rendable. C'est le
   travail qui contient la condition D-15.
3. **La bande d'en-tête + `focusRank`** — les noms qui s'allument et s'éteignent (`resolveRiverLaneHeaders`,
   `river-lanes.ts:899`), plus les badges hors-champ.
4. **La navigation** — curseur, `resolveRiverStep` au clavier ET au balayage, poignée du temps, saut de citation,
   appui long.

### 0.4 Ce qui MANQUERAIT pour une livraison complète

- **Les gestes.** La peau legacy n'a que le CLAVIER (`RiverThread.tsx:245-252`) ; iOS a le balayage à deux axes
  (`RiverStreamHost.swift:596-620`), le pince (`RiverConversationHost.swift:271-286`), la poignée qui vole le pan au
  scroller (`RiverTimeHandle.swift:146-150`), le tap-curseur (`RiverStreamHost.swift:566`) et l'appui long
  (`RiverBubbleView.swift:398-421`). **Rien de cela n'existe côté web** (§ 5).
- **60 fps** — la condition, à quoi s'ajoute que la Rivière défile sur DEUX axes : le tracé doit se re-mesurer après
  chaque défilement horizontal (iOS y consacre un écrivain UIKit dédié, `RiverStreamHost.swift:640-712`).
- **Accessibilité** — la peau legacy tient sa promesse `role="grid"` (`RiverThread.tsx:143-158`), déjà mieux qu'iOS ;
  manquent les étiquettes des badges hors-champ (`RiverLaneHeaderStrip.swift:112-123`), l'annonce du curseur, la
  valeur de la poignée (`RiverTimeHandle.swift:58-59`) et le RTL (§ 5).
- **Hors-ligne : rien à faire.** La Rivière ne consomme AUCUN endpoint (`reading-modes.ts:294-300`) — **c'est le mode
  le plus compatible avec le précache.**

---

## 1. Sources lues

**iOS** — les 14 fichiers de `apps/ios/Meeshy/Features/Main/Riviere/` (4 284 l ; volumes par fichier en § 0.2), dont `Core/RiverLaneResolver.swift` **lu en entier** ; le montage et la porte : `Views/ConversationView.swift:540-600`, `:603`, `:1144`, `:1415-1512`, `:2029` ; `Focal/Core/ReadingModeOrchestrator.swift:142`, `:405-460` ; `Lentille/Mode/LentilleReadingModeContext.swift:45-99` ; `Lentille/Core/LentilleFeatureFlag.swift:1-80`.

**Partagé** — `utils/river-lanes.ts` (1 044, **lu en entier**), `utils/reading-modes.ts:200-360`, `design/lentille-tokens.json` → `river`, `fixtures/reading-modes/river-*.vectors.json`, `__tests__/river-lanes.test.ts`, `__tests__/vectors/river-*.vectors.test.ts`, `types/conversation.ts:330`, `types/api-schemas/conversation.ts:244`, `package.json`. **Passerelle** — `routes/conversations/core-list.ts:571`, `:664-665` ; `core-detail.ts:118`, `:191`, `:208-233`. **Legacy web** — les 9 fichiers de `apps/web/components/conversations/riviere/` (1 252 l) + 952 l de témoins ; `apps/web/styles/lentille-tokens.css:160-205`. **v3.1** — `src/lib/reading-mode/{decision,catalog,metrics}.ts`, `src/routes/thread.tsx` (610), `decisions.md` (D-8 `:102`, D-13 `:208`, D-14 `:253`, D-15 `:308`, D-19 `:586`), `budgets.json`, `vite.config.ts:363-380`, `src/lib/api/{types,fixtures,prism}.ts`, `src/styles/ios.css:23` ; `.cache/web-v3-workflow/specs/thread.md` (`:24`, `:30-33`, `:69-74`, `:123-124`, `:225-229`).

---

## 2. Ce que la Rivière EST

Une conversation à plusieurs lue sur **deux axes** : le **vertical est le temps** (un `rank` par message, ordre
chronologique strict — et c'est aussi l'ordre du DOM et du lecteur d'écran), l' **horizontal est les interlocuteurs**
(un `laneIndex` par branche). `river-lanes.ts:1-46`.

### 2.1 La loi des couloirs (`river-lanes.ts` / `RiverLaneResolver.swift`)

**Une branche n'est pas une ligne infinie : c'est une SUITE DE SEGMENTS.** Elle naît à la première interaction de son
propriétaire, court tant que la conversation l'entretient, **meurt `silenceWindowMs` après sa dernière interaction**,
et **renaît plus tard dans LA MÊME COLONNE** (`river-lanes.ts:18-27`).

Le pipeline de `resolveRiverLanes` (`:603`), en sept temps :

| # | étape | ce qu'elle tranche |
|---|---|---|
| 1 | `placeMessages` `:315` | un `rank` par tri `temps puis identifiant` (`byTimeThenId:306`), pour que deux plateformes dessinent la MÊME rivière ; un horodatage illisible est **écarté**, jamais inventé (`:310-314`) |
| 2 | `spokenOnly` `:342` | **un avis système n'est la voix de personne** — « X a rejoint » porte l'ARRIVANT pour auteur, donc sans la marque `isSystem` (`:63-72`) la loi lui donnait une branche à son nom et pouvait déplier la rivière sur la foi d'une annonce. Il garde son rang, il est servi dans `bubbles`, et n'entre dans aucun des deux autres axes |
| 3 | `collectEngagements` `:351` | « on vit tant qu'on parle **ou qu'on vous parle** » : écrire ⇒ nœud `bubble`, se voir répondre ⇒ nœud `addressed` (`:109`) ; une réponse à soi-même n'en produit pas (`:373`) |
| 4 | `toSpans` `:396` | un segment se coupe au-delà de `silenceWindowMs` **et survit à ses propres bulles** jusqu'au dernier rang de la fenêtre qui suit — *sans cette seconde règle une branche ne serait qu'un point par message et la rivière n'aurait aucune largeur navigable* ; `isOpen` (`:126`) distingue « encore vivante au bas de la fenêtre » de « éteinte ici » |
| 5 | `orderLaneIds` `:442` | le lecteur d'abord (colonne 0, la rive), puis par ordre de NAISSANCE ; **une colonne est réservée à vie**, « sinon la rivière tremblerait latéralement à chaque arrivée » |
| 6 | `packColumns` `:494` | au-delà de `maxLanes`, coloration gloutonne d'intervalles : chaque voix prend la colonne libre la plus à gauche dont aucun occupant ne parle en même temps qu'elle, **la rive restant au lecteur seul** (`:497`, `:503`) ; si une voix n'en trouve aucune ⇒ `overflowed` |
| 7 | le verdict `:636-641` | `serialized` si `overflowed` (`aboveMaximum`) ou `voiceCount < minVoices` (`belowMinimum`) — deux causes, **jamais un booléen** : « elles ne se réparent pas de la même façon » (`:196-203`) |

Deux règles s'y greffent. **`isGroupHead`** (`:586`, via `continues:571`) : l'expéditeur change, le jour calendaire
change (`dayIndex:555`, avec `dayBoundaryOffsetMinutes`), ou l'un des deux est un avis — **miroir déclaré de
`apps/web/utils/message-grouping.ts` et de `MessageDayGrouping.isGroupHead`, toute évolution touchant les trois**
(`:562-569`). **Les connecteurs** (`:683`) : une cible hors fenêtre ne produit AUCUN trait — « un connecteur ne pend
jamais dans le vide » (`:676`).

Quatre constantes, une seule maison chacune (garde R15, rappelée par `RiverMetrics.swift:10-17`) :
`RIVER_LANE_SILENCE_WINDOW_MS` = 30 min (`river-lanes.ts:230` / `RiverLaneResolver.swift:280`), `RIVER_MAX_LANES` = 7
(`:243` / `:285`), `RIVER_MIN_VOICES` = 3 (`:255` / `:291`), `RIVER_HEADER_FADE_RANKS` = 2 (`:261` / `:295`). Et **7
n'est pas un plafond de participants, c'est un plafond de couloirs SIMULTANÉS** : « une conversation à quarante voix
se lit très bien en Rivière tant qu'il n'y en a jamais plus de sept à la fois dans le même instant » (`:236-242`).

Trois lectures complètent la loi : `resolveRiverLivingLanes` (`:727`, les branches vivantes à un rang — la largeur
réelle de l'axe à cette hauteur), `resolveRiverLaneAt` (`:754`, QUI occupe cette colonne à cette hauteur — question
que le partage rend nécessaire), `resolveRiverLaneHeaders` (`:899`, § 2.4).

### 2.2 Trois règles PURES autour de la loi

**L'échelle de temps** — `RiverTimeScale.swift` (174 l, **aucun miroir web**). « Zéro pixel, zéro horloge : le calendrier entre en paramètre » (`:10-12`). L'unité suit l'amplitude RÉELLE (`:55-63`) : `< 36 h` ⇒ heures, `< 21 j` ⇒ jours, `< 120 j` ⇒ semaines, `< 730 j` ⇒ mois, au-delà ⇒ années. Les graduations tombent aux **frontières d'unité** (`:110-129`), jamais à intervalle régulier ; `maxTicks = 8` (`:108`), et au-delà « une graduation sur N : la piste reste lisible, la poignée garde toute la finesse du temps ». `fraction(ofRank:)` est **linéaire dans le TEMPS, pas dans les rangs** (`:86-89`) — une rafale de vingt messages en deux minutes occupe deux minutes de piste. `resolve` rend `nil` « quand il n'y a rien à graduer : moins de deux rangs, ou un fil écrit au même instant » (`:67-71`).

**La disposition en colonnes** — `RiverColumnLayout.swift` (69 l), arithmétique pure, aucune donnée de la loi. Le rail passe au **centre** du couloir (`railX = laneIndex * laneWidth + laneWidth / 2`, `:45-47`), les couloirs sont **contigus** — la gouttière vit DANS chaque couloir (`:32-37`) ; `bubbleContentWidth = laneWidth − gutter × 2` (`:51-53`). `horizontalOffset(centeringLane:paneWidth:)` (`:64-68`) n'existe que parce que *`ScrollViewProxy.scrollTo` ne bouge qu'un axe* — **le web n'a pas ce problème** (`scrollLeft` est adressable) et n'a donc pas à porter cette fonction. Miroir web déjà écrit : `river-column-layout.ts` (47 l, **portable sans une ligne de changement**).

**La poignée du temps** — `RiverTimeHandle.swift` (170 l). Une piste graduée au bord droit et une poignée qu'on tient ; elle **apparaît au défilement, s'efface au repos** (`restDelay = 1,4 s`, `RiverTimeScale.swift:172-173` ; déclenchée par le changement des cadres publiés, `RiverStreamHost.swift:455-462`). Elle ne calcule **aucun temps ni aucun rang** : elle lit l'échelle, pose la poignée à `fraction`, rend à l'hôte la fraction où le doigt l'a laissée (`:8-10`) — l'hôte traduit en rang, demande son couloir à la loi, et cadre (`RiverStreamHost.swift:475-484`). Cotes propres à iOS, hors JSON partagé : piste 3, poignée 30 × 44, graduation 8, libellés 10 et 13 (`RiverTimeScale.swift:164-173`).

### 2.3 La bulle de rivière — `RiverBubbleView.swift` (732 l)

Sept traits la distinguent de la bulle standard. **Le contour EST la ligne** — même couleur, même épaisseur (2,5) que
le trait de branche : « le bord de la bulle EST un segment de sa ligne » (`:274-282`). **L'identité est HORS de la
bulle**, en frère du rectangle (§7ter A.5, `:264-273`), le nom **borné à 44 %** de la largeur pour que la branche, à
l'aplomb du centre du couloir, **croise du vide, jamais un mot**. **L'heure vit en BASE, pour TOUS les rangs**
(`footerTime:643-653`) — après un état où une même conversation lisait son horloge à deux endroits selon le rang
(`:474-480`). **Aucun `lineLimit`** : « le message en ENTIER » (§7ter A1, `:470`) — c'est ce qui rend la hauteur du rang
**MESURÉE** plutôt que supposée. **Le groupe partage UNE bordure** (lot G) : `RiverBubbleOutline` (`:127-180`) ouvre le
contour du côté partagé, le fond n'arrondit que les coins extérieurs (`:490-494`), et la jointure est un POINTILLÉ
unique (`sharedEdge:516-538`) — « jamais deux contours fermés plus un trait ». **La forme sérialisée** (§7ter A.6,
`:540-575`) ne garde que le bord gauche et le bord bas colorés : « aucune ligne n'aborde la bulle en vue sérialisée, un
contour complet y mimerait une branche que le verdict vient de retirer ». **L'avis système** est pleine largeur,
centré, heure en tête, avec les vues et clés i18n DU FIL (`:346-370`). Enfin **elle publie son CADRE**
(`MessageFramePreferenceKey` sur le conteneur EXTÉRIEUR, identité comprise, `:400-408`) — c'est ce que le canvas LIT.
Elle porte aussi le **badge de transfert** (`:432-440`, #5058) et la **citation de story détachée** en 9:16
(`:456-464`, #5059), deux features dont la Rivière était « le seul des quatre modes » à ne pas disposer.

### 2.4 La bande d'en-tête des couloirs

**Une colonne ne porte pas un nom fixe : elle porte celui de la voix qui l'occupe À LA HAUTEUR OÙ L'ON LIT**
(`river-lanes.ts:822-828`). Le nom s'allume à la naissance, s'éteint à la mort, sur `fadeRanks` rangs — **et c'est la
DONNÉE qui décide de la forme du fondu** (`:833-843`) : deux occupations qui se **touchent** se croisent (les deux
noms coexistent brièvement — un vrai relais) ; deux occupations séparées par du **vide** s'éteignent l'une avant
l'autre, et sur les rangs du vide **la colonne ne porte aucun nom** — « nommer une branche morte mentirait sur une
présence, exactement comme une pastille grise sur un avatar hors ligne ». `headerAlpha` (`:846-864`) est une rampe
symétrique mesurée depuis le vide qui borde l'occupation ; une occupation d'un seul rang plafonne à `1/fadeRanks` — «
un passage éclair n'a pas à s'imposer autant qu'une présence installée » ; une occupation encore ouverte **emprunte sa
borne de mort à la FENÊTRE** et ne s'estompe jamais dedans. En mode sérialisé, les occupations sont les **groupes** de
bulles consécutives (`serializedOccupancies:868`).

`focusRank` **peut être FRACTIONNAIRE** : la peau le calcule depuis son défilement avec la MÊME bande de focus que le
reste de la Lentille (`FOCUS_BAND_OFFSET`) — « jamais une seconde loi de défilement » (`:829-832`). Miroir web déjà
écrit : `river-focus.ts:35-56`.

La vue (`RiverLaneHeaderStrip.swift`) **ne recalcule rien** (`:6-9`) : un `Text` par entrée à l'opacité fournie, borné
à la largeur EXACTE de la bulle qu'il annonce et aligné sur son bord gauche (`:40-55`). Elle ajoute les **badges de
hors-champ** (`:71-125`) : « la vue doit signaler les personnes les plus à droite qu'on ne voit pas encore, et les
plus à gauche » — sans quoi un plan de sept couloirs sur un écran qui en montre un et demi laisse croire que la
conversation tient sous les yeux. Une pastille par voix jusqu'à trois, puis le compte (`:127-143`).

### 2.5 La navigation

`RiverNavigationController` (67 l) **ne décide RIEN** : il tient le curseur et délègue chaque pas à la loi (`:4-8`,
`:50-59`). Il publie `cursor`, `lastReason` (`moved`/`edge`/`empty`, `river-lanes.ts:944`) et `edgeBounceToken` — un
compteur incrémenté à chaque bord, « pour que la peau accroche son rebond sans avoir à comparer deux curseurs »
(`:26-28`).

`resolveRiverStep` (`river-lanes.ts:1000`) : **horizontal** — la branche vivante suivante, les mortes **enjambées**,
sans quitter l'instant ; l'atterrissage vise la bulle la plus PROCHE du segment vivant et, **à égalité, la plus
ANCIENNE** — « traverser ne doit jamais faire sauter le lecteur en avant dans un temps qu'il n'a pas lu »
(`landingRank:972`). **Vertical** — la bulle suivante **de la MÊME PERSONNE**, par-dessus la mort de sa branche : «
c'est le "Suivre Mia" du procès — la rivière raconte une trajectoire que le fil ne sait pas raconter » (`:983-989`).
**Sérialisée** — plus d'axe horizontal (`edge` de part et d'autre), et l'axe vertical **redevient le TEMPS**
(`:1005-1015`).

Le curseur **survit** aux nouveaux messages (`RiverNavigationController.swift:37-45`) ; il n'est re-cadré que sur la
première géométrie peuplée et sur des **rangs préfixés** (le réseau rend 200 messages plus anciens que les 20 du cache
: chaque rang glisse, le curseur reste sur son MESSAGE — `RiverConversationHost.swift:213-243`). **Le pop interactif
est DÉSACTIVÉ** : `ConversationView.swift:1144` pose `InteractivePopEnabler(allowsEdgeSwipe: … != .river)` — le
balayage depuis le bord gauche est un geste de la Rivière, il ne peut pas être aussi le retour.

---

## 3. Anatomie de l'écran

```
┌──────────────────────────────────────────────────┐
│ en-tête FLOTTANT du fil — zIndex 100             │ ← safeAreaTop + 44 + sm (CV:603, :1442)
│ ░ transparent : les bulles DÉFILENT derrière ░    │
├──────────────────────────────────────────────────┤
│ ‹● │ ● AMINA     ● KWAME     ● TOI    │ ●●● ›     │ ← bande d'en-tête, 38
├──────────────────────────────────────────────────┤
│   ╭─┴─────╮     │           │              12h┃  │ ← rails au CENTRE des couloirs
│   │ texte │     ┆           │                 ┃  │   300 (min 210, max 540), gouttière 28
│   │ 09:41 │   ╭─┴─────╮     │              13h┃  │ ← contour 2,5, rayon 14, retrait 14
│   ╰─┬─────╯╌╌▷│ texte │     │                 ┃  │ ← connecteur 1,4 pointillé [4,3]
│     ○ (addressed, anneau creux)              ▓  │   bow = max(34, |Δx|·0,5)
│     ┊ (queue en dégradé — branche morte)     ┃  │
│ ┌──────────────────────────────────────────┐ ▁  │ ← avis système, PLEINE LARGEUR
│ │ 09:52  👤 Kwame a rejoint la conversation │    │   (jamais dans un couloir)
│ └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│      ● ● ●  Amina écrit…  (overlay, capsule)     │ ← TypingIndicatorBubble, plate
│ [ Message…                             ] [ ➤ ]   │ ← composeur, zIndex 85
└──────────────────────────────────────────────────┘
```

**Cotes** — source unique `packages/shared/design/lentille-tokens.json` → `river`, miroir Swift `RiverMetrics.swift` :

| jeton | valeur | ligne | jeton | valeur | ligne |
|---|---|---|---|---|---|
| `line.width` (trait de branche ET bordure de bulle, le MÊME) | **2,5** | `:41` | `bubble.contentPadding` | **14** | `:87` |
| `lane.widthReference` | **300** | `:53` | `identityNameMaxWidth` (le JSON porte `"44%"`) | **0,44** | `:88` |
| `lane.widthMin` / `widthMax` (bornes du pince) | **210** / **540** | `:60-61` | `flatBorderWidth` | **1** | `:89` |
| `lane.gutter` | **28** | `:62` | `connector.strokeWidth` | **1,4** | `:97` |
| `bubble.detourRadius` | **14** | `:79` | `minBow` / `bowRatio` | **34** / **0,5** | `:98-99` |
| `bubble.baseGap` (écart de PILE, pas marge) | **8** | `:80` | `row.gap` | **14** | `:121` |
| `continuationDashLength` / `Gap` | **3** / **4** | `:131-132` | `laneHeader.height` | **38** | `:157` |
| `Motion.landingDuration` (hors JSON) | **0,35 s** | `:144` | `Motion.handleFadeDuration` (hors JSON) | **0,2 s** | `:146` |

**Polices** — aucune propre à la Rivière : elle emprunte `FocalMetrics` (texte `:467`, nom `:622`, heure `:648`,
avatar `:634` dans `RiverBubbleView.swift`). La bande d'en-tête a ses deux seules valeurs propres : nom **11,5
semi-gras en MAJUSCULES**, pastille **7 × 7** (`RiverLaneHeaderStrip.swift:162-164`).

**Couleurs** — la couleur d'un couloir est celle de la VOIX, pas de la conversation :
`DynamicColorGenerator.colorForName(colorSeed)` où `colorSeed` est le nom affiché (`RiverLaneCanvas.swift:270-272`,
`RiverBubbleView.swift:299`, `RiverLaneHeaderStrip.swift:152`). **La loi ne calcule aucune couleur : elle nomme la
graine** (`river-lanes.ts:70-73`). Le miroir TS existe et est déjà importé par `river-paint.ts:29` (`colorForName` de
`@meeshy/shared/utils/conversation-colors`). Deux nuances de tracé : branche vivante à **0,85**
(`RiverLaneCanvas.swift:218`), queue en dégradé vers **0,6** si `isOpen` sinon **0** (`:228`) ; connecteur à **0,5**,
ou **0,3** au-delà de quatre rangs — « une réponse lointaine remonte le fil, elle ne doit pas dominer le tracé des
branches » (`:157-162`).

---

## 4. Quand elle s'ouvre, comment on en sort

**La porte est TRIPLE, et aucun étage ne se réécrit.** (1) Le drapeau de la Lentille,
`MeeshyFeatureFlags.isReadingModesEnabled` (`ConversationView.swift:561`) — sans lui, `resolveCapabilities` rend
`['bubbles']` (`reading-modes.ts:349-351`). (2) Le drapeau propre à la Rivière, `riviere_mode`
(`ConversationView.swift:568`), « distinct de `isFlagEnabled` : la Rivière s'allume APRÈS, sur son propre calendrier »
(`reading-modes.ts:259-266`) — défaut OFF, mais **couvert par la bascule « Activer les bêta »** depuis le 2026-08-19
(`LentilleFeatureFlag.swift:41-44`). (3) L'éligibilité : `≥ 5` (`reading-modes.ts:200`,
`ReadingModeOrchestrator.swift:142`), **jamais en `direct`** (`reading-modes.ts:326`) ; un compte `null` ne rend
jamais éligible — « le risque reste un faux négatif temporaire, jamais un faux positif » (`:270-277`).
`RiverModeGate.isSelectable` (`RiverModeGate.swift:26-28`) **n'ajoute aucune règle** : il demande seulement si
`.river` figure dans le catalogue rendu par la loi — « une seconde loi d'éligibilité réécrite ici serait un bug de
contrat » (`:11-13`).

**La raison TRIFURQUE** (amendement S1, `reading-modes.ts:207-231`) : `neverEligible` (conversation directe — «
promettre une porte qui n'existe pas est une donnée fabriquée comme une autre »), `belowThreshold` avec un compte,
`belowThreshold` avec `current: null` (le seuil SEUL, jamais « 0 aujourd'hui »).

**Le montage** — `ConversationView.swift:1425-1512` : `Color.clear.overlay(RiverConversationHost(...))` plutôt que
l'hôte nu, parce qu'un `ScrollView` rend la taille IDÉALE de son contenu et que « l'écran hôte s'élargissait à ~2 100
pt et CENTRAIT ses voisins dessus — bouton "Retour" à x = −683, hors écran, malgré son `zIndex(100)` » (`:1435-1441`).
`zIndex(80)`, `.ignoresSafeArea(edges: .top)` ; le composeur passe **au-dessus** en `zIndex(85)` (`:2029`), le pane
lui réservant sa hauteur par `bottomInset`.

**Les sorties** — appui long → « Ouvrir dans le fil » (`select(.script)` + atterrissage, `:1483-1487`) ou « Répondre »
(`select(.script)` + `triggerReply` + atterrissage, `:1488-1494`) ; « Copier » reste dans la Rivière
(`RiverBubbleView.swift:417-421`) ; le menu de mode par le chip ; **le retour arrière système est supprimé** (§ 2.5).
Effet de bord : la Rivière **ne rend jamais bulle par bulle**, donc elle n'alimente aucun `seenIds` — le rattrapage
passe par un canal dédié, `onReachPresent` → `markCaughtUpFromSummaryOrRiver()` (#3901,
`RiverConversationHost.swift:40-47`, `:254-257` ; `ConversationView.swift:1500-1501`).

---

## 5. États, gestes, accessibilité

| état | ce qui se passe |
|---|---|
| compte INCONNU (`null`) | jamais éligible ; le libellé se tait sur le nombre (`reading-modes.ts:270-277`, `catalog.ts:57`) |
| conversation directe | `neverEligible` (`catalog.ts:56`) · sous le seuil ⇒ les deux nombres (`catalog.ts:58`) |
| **fenêtre à < 3 voix** | `serialized`/`belowMinimum` : la rivière redevient un fil vertical et le canvas ne dessine AUCUN trait (`RiverLaneCanvas.swift:77`) |
| **> 7 voix simultanées** | `serialized`/`aboveMaximum` (`river-lanes.ts:636-641`) |
| chargement | la Rivière naît sur une géométrie VIDE (le fil s'ouvre avant ses messages) ; la PREMIÈRE géométrie peuplée pose le curseur au présent (`RiverConversationHost.swift:218-237`) |
| vide | `rankCount == 0`, `initialCursor` vaut `(0,0)` (`RiverConversationMapping.swift:322-327`) |
| **erreur / hors-ligne** | **aucun état propre** — la Rivière ne consomme aucun endpoint (`reading-modes.ts:294-300`) |
| rangs préfixés | le curseur suit son MESSAGE, pas son numéro (`RiverConversationHost.swift:238-243`) |
| frappe | overlay bas, tenue plate + capsule `.ultraThinMaterial`, **couleur de la VOIX** ; **jamais une entrée de la loi** — « une voix qui n'a encore rien DIT ne doit pas faire naître un couloir » (`RiverStreamHost.swift:88-95`, `:428-450`) |

| geste | effet |
|---|---|
| défilement vertical | le temps ; recalcule `focusRank` donc la bande de noms, et réveille la poignée (`RiverStreamHost.swift:170-196`, `:455-462`) |
| défilement horizontal | les voix ; la bande translate à l'identique (`RiverLaneHeaderStrip.swift:60`) |
| **balayage ≥ 40 pt** | direction dominante → `resolveRiverStep`, en `simultaneousGesture` pour ne jamais disputer le pan natif ; **le signe passe par `ReadingDirection.readingDelta` pour l'arabe** (#4297, `RiverStreamHost.swift:596-620`) |
| **pince** | élargit les COULOIRS entre 210 et 540 — « ce n'est pas un `scaleEffect` : un `scaleEffect` aurait rapetissé le TEXTE et faussé les cadres mesurés dont le canvas dépend » (`RiverConversationHost.swift:271-286`, `RiverMetrics.swift:54-59`) |
| tap sur une bulle | pose le curseur — **pas un pas de la loi** (`RiverStreamHost.swift:566`) ; sur une citation, mène à sa cible (`:302-310`) |
| tap sur le nom / l'avatar | fiche de profil ; l'anneau de story non lue ouvre la story (`RiverBubbleView.swift:583-598`) |
| appui long | « Ouvrir dans le fil » · « Répondre » · « Copier » (`RiverBubbleView.swift:398-421`) |
| **glisser la poignée** | capté côté UIKit car « sur un `ScrollView` à deux axes, un `DragGesture` SwiftUI — même prioritaire — laissait le pan emporter le doigt » (`RiverTimeHandle.swift:32-53`, `:146-150`) |
| bord atteint | haptique légère via `edgeBounceToken` (`RiverStreamHost.swift:464`) |

**Accessibilité.** L'ordre du DOM/VoiceOver EST l'ordre chronologique strict, la grille étant peuplée `0..<rankCount`
rang-majeur (`RiverStreamHost.swift:512-518`, garanti par `RiverStreamHostSourceGuardTests`). Le tracé est décoratif,
`accessibilityHidden` (`RiverLaneCanvas.swift:95`) — « les traits ne portent aucune information que le contenu ne
porte déjà » ; les cellules vides ne portent aucun contenu accessible (`:578`). Les noms de la bande sont décoratifs
(ils vivent déjà dans chaque bulle en tête de groupe) mais **les badges hors-champ gardent leur étiquette** — « ils
portent une information que RIEN d'autre ne donne » (`RiverLaneHeaderStrip.swift:64-68`, `:112-123`). La bulle est un
élément combiné, label = nom + texte + heure + « en réponse à X » (`RiverBubbleView.swift:722-735`) ; la poignée
annonce « Axe du temps » et rend pour valeur le libellé de l'instant sous le doigt (`RiverTimeHandle.swift:57-59`).
**Reduce motion** : le canvas ne s'anime JAMAIS — « satisfaisant §7bis par construction plutôt que par une branche
conditionnelle à maintenir » (`RiverLaneCanvas.swift:18-21`). **RTL** : badges en `backward`/`forward`, jamais
`left`/`right` (`RiverLaneHeaderStrip.swift:100-103`).

**Le web legacy fait mieux qu'iOS sur un point** : `RiverThread.tsx:143-158` annonce `role="grid"` +
`aria-rowcount`/`aria-colcount` et **tient la promesse** en intercalant des couches `row`/`gridcell` en `display:
contents` — « elles n'ont aucune boîte, donc la bulle reste l'enfant de grille qu'elle était » (`:104-113`) ; les
index viennent des `rank`/`laneIndex` de la LOI, jamais d'un compteur de rendu.

---

## 6. Le Prisme dans la bulle de rivière

**La bulle de rivière ne résout AUCUNE langue.** C'est écrit deux fois, une par plateforme : `RiverBubbleContent`
(`RiverBubbleView.swift:7-11`) — « le Prisme s'applique ICI, côté appelant, comme pour toute bulle du Fil ; cette vue
ne résout AUCUNE langue » — et `river-bubble-types.ts:6-10` — « ce fichier et les composants qui le consomment ne
résolvent AUCUNE langue, AUCUN `useQuery` ». Le texte est **injecté** par une closure résolue au point de montage
(`ConversationView.swift:1502-1504`) : `viewModel.preferredTranslation(for: message.id)?.translatedContent ??
message.content`. `preferredTranslation` PROJETTE `ReaderPrism.resolve(for:)`, la descente STRICTE des rangs 1→4 ; le
repli sur `message.content` est **la règle 1 du Prisme** — « si aucune traduction ne matche la langue préférée,
afficher le contenu ORIGINAL », jamais `translations.first`.

**Et le Prisme fait partie de la clé de mémoïsation** (#3946, `RiverConversationMapping.swift:379-384`) : « une
traduction qui arrive ne change ni le nombre de messages ni leurs identifiants. Une clé posée sur la seule empreinte
servirait "Hello" alors que "Bonjour" vient d'arriver : **c'est le pire des trois, parce que c'est le principe produit
lui-même** ». `ContentsKey` porte donc les RÉSULTATS des trois closures (texte, présence, anneau), jamais les
closures.

**Pour la v3.1, la descente existe déjà** : `apps/web-v3/src/lib/api/prism.ts:52` appelle `resolvePrismTranslation` de
`@meeshy/shared` (D-14, `decisions.md:253-270`). **Le portage du Prisme en Rivière coûte zéro ligne nouvelle** — c'est
l'appel que `thread.tsx` fait déjà. Un manque à noter : la bulle de rivière iOS **ne rend que du texte** — aucun
conteneur média, aucun lecteur audio, explicitement et assumé (`RiverConversationMapping.swift:256-273`, « la bulle de
rivière rend un `Text` et rien d'autre ») : la famille AUDIO du Prisme n'a donc **aucun consommateur en Rivière**, ni
sur iOS ni sur le web.

---

## 7. Élément iOS → v3.1 : où en est-on

| élément | iOS | legacy `apps/web` | **`apps/web-v3`** |
|---|---|---|---|
| la loi (`resolveRiverLanes`) | miroir Swift 1 047 l | **importée** de `@meeshy/shared` | ✅ **importée** (`geometry.ts`, 2026-09-08, #5696) |
| `resolveRiverStep` / `…LaneHeaders` | ✅ | ✅ (`RiverThread.tsx:80`, `:216`) | ✅ consommées par les vecteurs (`geometry.test.ts`, 2026-09-08) — pas encore par un rendu |
| les 61 vecteurs partagés | `RiverLaneVectorTests` | suite Jest | ✅ **rejoués** à travers le mapping (`geometry.test.ts`, 2026-09-08, #5696) |
| disposition en colonnes · `focusRank` | ✅ | ✅ (`river-column-layout.ts`, `river-focus.ts`) | ✅ **portés** (`columns.ts`, `focus.ts`, 2026-09-08, #5696) — pas encore consommés par un rendu |
| tracé (branches, connecteurs, anneaux, naissance, queue) | `RiverLaneCanvas.swift` | ✅ (`river-paint.ts` + `RiverLaneOverlay.tsx`) | ❌ |
| la bulle (contour, identité 44 %, heure en base, citation) | `RiverBubbleView.swift` | ✅ `RiverBubble.tsx` | ❌ |
| bande d'en-tête (noms, fondu) | ✅ | ✅ `RiverLaneHeaderStrip.tsx` | ❌ |
| **badges hors-champ** | ✅ `:71-143` | ❌ | ❌ |
| **contour de groupe partagé** (lot G) | ✅ `:127-180`, `:516-538` | ❌ | ❌ |
| **avis système pleine largeur** | ✅ `:341-370` | ❌ | ❌ |
| **identité vivante** (avatar, présence, story) | ✅ `:600-641` | ❌ (initiales seules) | ❌ |
| **badge de transfert · citation de story 9:16** | ✅ `:432-440`, `:456-464` | ❌ | ❌ |
| **poignée du temps · échelle de temps** | ✅ | ❌ | ❌ |
| **mapping messages → loi · fenêtre de silence** | ✅ `RiverConversationMapping.swift` | ❌ (prop `contents`) | ✅ **porté** (`geometry.ts` : `riverLanesInput`, `resolveRiverGeometry`, `SILENCE_WINDOW_LADDER_MS`, 2026-09-08, #5696) |
| **curseur / atterrissage** | ✅ | partiel (état local) | ✅ **porté** (`cursorForMessageId`, `initialCursor`, `isAtPresent`, 2026-09-08, #5696) |
| **frappe · pince · gestes tactiles** | ✅ | ❌ (clavier seul) | ❌ |
| **virtualisation** | ✅ (`LazyVStack` + `RankExtent`) | ❌ | — (D-15 l'exige) |
| `role="grid"` complet | ❌ | ✅ | ❌ |
| **point de montage** | ✅ `ConversationView.swift:1425` | ❌ (garde d'absence) | ❌ |

**Ce que `catalog.ts` rend DÉJÀ, et bien.** La ligne « Rivière » existe au menu en 5e position (`MENU_ORDER`,
`catalog.ts:12`), titre `'Rivière'` (`:29`), sous-titre par défaut « Les couloirs de la conversation » (`:37`). Elle
est **désactivée tant que le catalogue de RENDU ne la porte pas** (`THREAD_RENDERABLE_MODES`, D-8) et son sous-titre
est **remplacé par la raison réelle**, **QUADRIFURQUÉE** depuis #5696 (`riverReason`, `catalog.ts`) : « Jamais en
conversation directe » · « S'ouvrira à 5 personnes actives » · « S'ouvrira à 5 personnes actives — N aujourd'hui » ·
« Bientôt disponible » (groupe déjà ÉLIGIBLE, pas encore rendu — la forme PROPRE au web, D-21).

**Le troisième libellé, SOLDÉ le 2026-09-08 (#5696) : `decision.ts` lit désormais `memberCount` (obligatoire,
`Conversation.memberCount`, le même rapprochement qu'iOS `ConversationView.swift:569`) et le passe à la loi comme
`activeParticipantCount` — `reason.current` porte le compte RÉEL, `thread.tsx` transmet la MÊME valeur que celle
affichée trois lignes plus haut (« N participants »).** `c-deploiement` (`memberCount: 3`, sous le seuil) affiche
désormais « S'ouvrira à 5 personnes actives — 3 aujourd'hui » ; `c-salon-riviere` (`memberCount: 5`, ÉLIGIBLE, mais
`river` hors `THREAD_RENDERABLE_MODES`) affiche la quatrième forme, « Bientôt disponible » — jamais « … — 5
aujourd'hui », le libellé FAUX qu'iOS montre drapeau `riviere_mode` OFF sur un groupe éligible
(`ReadingModeLensSheet.swift:91-99`). Preuve : `check-reading-mode.mjs` (blocs 1 et 11), `decision.test.ts`,
`catalog.test.ts`.

---

## 8. Le plan de portage, si OUI

### 8.1 Fichiers web à créer (noms anglais, D-13)

```
apps/web-v3/src/lib/river/          (pur, sans DOM — le pendant de Core/ iOS)
  geometry.ts  ~150   messages → resolveRiverLanes() ; RECHERCHE de fenêtre de silence
                      (RiverConversationMapping.swift:127-164) ; groupPositions ;
                      initialCursor ; cursorForMessageId ; isAtPresent
  paint.ts     ~230   portage direct de apps/web/.../river-paint.ts
  columns.ts   ~ 50   portage direct de river-column-layout.ts (aucun changement)
  focus.ts     ~ 65   portage direct de river-focus.ts (aucun changement)
  time-scale.ts ~140  portage de RiverTimeScale.swift (Intl.DateTimeFormat)
  metrics.ts   ~ 60   cotes river DÉRIVÉES (§ 8.2)
  navigation.ts ~ 90  curseur : resolveRiverStep + moveTo + edgeBounce
  *.test.ts    ~380   dont les 61 VECTEURS partagés rejoués

apps/web-v3/src/components/river/   (la peau — le pendant de View/ iOS)
  river-thread.tsx  ~380  hôte : grille, role=grid, VIRTUALISATION, gestes
  river-bubble.tsx  ~260  bulle + groupe partagé + avis système + identité
  river-lanes.tsx   ~140  overlay SVG
  river-headers.tsx ~150  bande + badges hors-champ
  river-handle.tsx  ~130  poignée du temps
  *.test.tsx        ~400
```

≈ **1 465 l de source** et **780 l de témoins**. La séparation `lib/` ⟂ `components/` reproduit `Core/` ⟂ `View/`, que
la garde R15 fait respecter côté iOS.

### 8.2 Ce qui s'importe de `@meeshy/shared` (D-14)

`resolveRiverLanes`, `resolveRiverStep`, `resolveRiverLaneHeaders`, `resolveRiverLivingLanes`, `resolveRiverLaneAt`,
les quatre constantes et tous les types depuis `@meeshy/shared/utils/river-lanes` ; `FOCUS_BAND_OFFSET`
(`utils/focus-curve`) ; `colorForName` (`utils/conversation-colors`) ; `resolvePrismTranslation`
(`utils/conversation-helpers`). Le sous-chemin `./utils/*` est exporté (`packages/shared/package.json`), et
`apps/web-v3/src/lib/api/prism.ts:3` prouve que la chaîne fonctionne déjà.

**Les cotes de peau demandent un arbitrage.** Elles vivent dans `lentille-tokens.json` → `river`, que le legacy
consomme via `apps/web/styles/lentille-tokens.css:163-205` — mais **la v3.1 n'importe pas ce fichier** : elle importe
`@meeshy/design-tokens/ios.css` (`src/styles/ios.css:23`) et `tokens.css` (`app.css:20`). L'importer ferait entrer 205
lignes dont la v3.1 n'utilise qu'un dixième **et la rattacherait à `tokens.css`, « la table de `web-old-version3` qui
MOURRA avec elle »** (`CLAUDE.md` racine). La bonne forme est **une `lib/river/metrics.ts` de littéraux dérivés**, sur
le patron exact de `src/lib/reading-mode/metrics.ts:1-14` — « une comparaison texte-à-texte sur des LITTÉRAUX, jamais
une importation de tout le SDK dans une application de 25 Ko » — gardée par un `scripts/check-river-metrics.mjs`
calqué sur `check-curve.mjs`. **C'est le patron que la v3.1 a déjà choisi deux fois.**

### 8.3 Ce qui se porte du Swift

**Portage direct, aucun choix** : `columns.ts`, `focus.ts`, `paint.ts` (ils existent en TS et sont purs). **Portage de
règle** : `time-scale.ts` (les cinq seuils d'unité, `RiverTimeScale.swift:55-63`, et les frontières de calendrier
`:110-129`) et `geometry.ts` (l'échelle de fenêtres, `RiverConversationMapping.swift:153-164`, et
`groupPositions:188-201`). **Portage d'INTERACTION, où le web ne peut pas copier** : la poignée (le
`UIPanGestureRecognizer` qui fait échouer le pan du scroller devient `pointerdown` + `setPointerCapture`), le pince,
le balayage — et l'atterrissage, où **le web est plus SIMPLE qu'iOS** : `scrollTo({left, top})` remplace l'écrivain
UIKit de `RiverStreamHost.swift:640-712`.

### 8.4 Le découpage en quatre travaux

| # | travail | livre | fin |
|---|---|---|---|
| **1** | **la loi et sa preuve** | `lib/river/{geometry,columns,focus,metrics}.ts` + 61 vecteurs sous `bun test` ; `activeParticipantCount: memberCount` ; `isRiverFlagEnabled: true` ; **le menu affiche enfin « — N aujourd'hui »** | 61 vecteurs verts ; `river` **reste** hors `THREAD_RENDERABLE_MODES` |
| **2** | **le plan** | `paint.ts` + `river-{thread,bubble,lanes}.tsx` virtualisés ; groupes, avis système, verdict sérialisé | `river` entre au catalogue de rendu ; gate de poids ; 500 messages sans image perdue |
| **3** | **les voix** | `river-headers.tsx` + `focusRank` au défilement + badges hors-champ + identité vivante | le nom s'allume et s'éteint ; les voix hors champ sont annoncées |
| **4** | **le parcours** | `navigation.ts` + `time-scale.ts` + `river-handle.tsx` + balayage + pince + saut de citation + menu contextuel | flèches ET balayage passent par `resolveRiverStep` ; la poignée annonce sa valeur |

Le travail 1 est **livrable seul et sans risque** : il ne rend rien à l'écran et corrige au passage un libellé
menteur. Les travaux 2 à 4 sont ordonnés par dépendance stricte.

### 8.5 Les TÉMOINS

**Les 61 vecteurs partagés**, rejoués tels quels — **le meilleur témoin du dépôt pour ce chantier** : trois
plateformes, un seul jeu de faits (modèles : `packages/shared/__tests__/vectors/river-*.vectors.test.ts`, 431 l ;
`RiverLaneVectorTests`). **`bun test`** sur `lib/river/*`, sans DOM. **Un gate de source à la R15**, calqué sur
`apps/web/__tests__/riviere/riviere-source-guard-r15.test.ts` (114 l) : aucun littéral de cote dans
`components/river/`, aucune arithmétique de couloir hors de `lib/river/columns.ts`. **Un gate visuel** sur `lanes` ×
`serialized` × {`belowMinimum`, `aboveMaximum`} × {clair, sombre} × {LTR, RTL} — **le corpus doit pouvoir faire
échouer le test** : sans fixtures à ≥ 3 voix dans la même fenêtre de silence, tout rend `serialized` et le gate est
vert par omission. **Un gate d'a11y**, portage de `apps/web/__tests__/a11y/river-thread.a11y.test.tsx` (100 l). **Le
gate de poids** (§ 8.7).

### 8.6 La place dans `thread.tsx` : même route, **hôte séparé**

Même route `/c/:conversation`, **hôte séparé** — c'est le parti d'iOS (`ConversationView.swift:1425` : la Rivière est
un overlay au-dessus du fil, pas une variante de rangée) et le seul tenable ici. `focal` et `script` partagent
`FocalRow` et ne diffèrent que par la perspective (D-19, `decisions.md:606-612`) ; **`river` ne partage rien** — ni la
cellule, ni la grille, ni les axes. `thread.tsx` fait déjà 610 lignes, pour un budget de 1 000–1 200 avec un plafond
DUR à 1 200 (`CLAUDE.md` racine). Et le virtualiseur de `thread.tsx:185-192` est **mono-axe** et compte des rangées de
fil, là où la Rivière compte des RANGS et défile sur deux axes. La forme juste : `thread.tsx` garde le chip, le menu,
le composeur, l'en-tête et la décision, et **monte `<RiverThread/>` derrière `mode === 'river'`** en `lazy()`.
`usesFlatRow` (`decision.ts:129`) est déjà la garde de type qui rend cette bifurcation propre.

### 8.7 Le poids : le chunk Rivière est **à la demande**, sans discussion

`budgets.json` plafonne la **première peinture** à 40 Ko, mesurée à ~26,4 Ko (D-15), et le sujet du plafond est
explicite : « les chunks d'écran chargés à la demande n'y sont pas — c'est ce que le découpage par route achète ».
`vite.config.ts:367-378` porte le précédent exact : `@tanstack/react-virtual` **et** `@tanstack/virtual-core` sont
nommés dans un chunk `virtual`, parce que la règle par défaut (`node_modules ⇒ core`) aurait fait passer la première
peinture de 26,33 à **31,44 Ko** pour un module que seul le fil monte. Le code de la Rivière n'étant pas dans
`node_modules` mais dans `src/`, il suffit que **le point d'entrée soit un `lazy()`** pour que rolldown le sorte du
socle. Poids attendu : **8 à 12 Ko gzip** — **zéro octet avant le premier pixel, et zéro pour qui n'ouvre jamais la
Rivière**.

---

## 9. Ce que D-8 devient — texte proposé

> Proposition. **Ce document n'a modifié aucun fichier** ; l'édition appartient au travail qui
> livrera le premier lot.

```markdown
## D-8 · `summary` est hors périmètre ; `river` y entre — 2026-09-08 (#5566, révisée)

**RÉVISION (directive porteur : « si c'est possible d'avoir résumé et rivière tout de suite alors
les intégrer »).** La formulation d'origine traitait `summary` et `river` comme un seul cas. Elle
avait tort sur un point mesurable : la Rivière est le mode le MOINS cher du produit, le Résumé le
plus cher. **La règle générale ne bouge pas : ne jamais afficher un mode qu'on ne sait pas
rendre** — le mode reste listé et désactivé au menu, avec sa raison RÉELLE.

**`summary` reste hors périmètre.** Il lit `GET /conversations/:id/analysis` et `/stats`, tous
deux `requiredAuth` : sans transport (#5493) il n'a rien à afficher, et un invité recevrait 403.

**`river` entre au périmètre.** Sa loi est **déjà en TypeScript** —
`packages/shared/utils/river-lanes.ts` (1 044 l), 1 001 l de témoins, **61 vecteurs
inter-plateformes** que la Rivière iOS rejoue déjà ; **une peau React complète existe dans le
dépôt** — `apps/web/components/conversations/riviere/` (1 252 l + 952 l de témoins), écrite pour
le legacy et jamais montée ; et elle **ne consomme AUCUN endpoint** — elle dessine des couloirs à
partir des messages que le fil rend déjà, marche donc hors ligne sur le précache, et est accordée
aux invités.

**LA DONNÉE, tranchée.** L'éligibilité demande `activeParticipantCount`, et `GET /conversations`
sert explicitement `null` — aucune définition serveur d'« actif » n'existe (G-123). **Mais ce
n'est pas ce qu'iOS lit dans le fil** : `ConversationView.swift:569` passe
`conversation?.memberCount ?? 0`, l'effectif du groupe, **déjà affiché par `thread.tsx:361`**. La
v3.1 fait le même rapprochement et le NOMME : ce n'est pas un décompte d'actifs, c'est l'effectif
— un faux POSITIF possible, jamais un faux négatif, et la loi absorbe le cas d'elle-même (à moins
de trois voix entendues, elle sérialise). Effet de bord : le troisième libellé de `catalog.ts:58`
(« — N aujourd'hui ») cesse d'être inatteignable.

**LA CONDITION, unique : D-15.** La peau legacy monte TOUTES les bulles et mesure le
`getBoundingClientRect()` de chacune — exactement le défaut que la virtualisation vient de
corriger. La Rivière n'entre à l'écran qu'avec une fenêtre virtualisée, ce qui demande le
mécanisme qu'iOS possède déjà (`RiverCanvasRankPlacement` : un rang sans cadre est AU-DESSUS s'il
précède le premier rang connu, AU-DESSOUS s'il suit le dernier) — sans quoi le tracé disparaît dès
qu'on quitte le haut de l'histoire.

**Le découpage** : quatre travaux (loi + 61 vecteurs sans écran · plan virtualisé · voix ·
parcours) ; seul le deuxième fait entrer `river` dans `THREAD_RENDERABLE_MODES`. **Le poids** : le
chunk est chargé À LA DEMANDE (`lazy()`), comme `@tanstack/react-virtual`.
```

---

## 10. Les cinq faits qui décident

1. **La loi de la Rivière est déjà en TypeScript dans `@meeshy/shared`** — `packages/shared/utils/river-lanes.ts`, 1
   044 l, 1 001 l de témoins, **61 vecteurs** que la Rivière iOS rejoue. Coût de portage de la loi : **zéro**.
2. **Une peau React complète existe déjà dans le dépôt et n'est montée nulle part** —
   `apps/web/components/conversations/riviere/`, 1 252 l de source et 952 de témoins, avec un `role="grid"` qui tient
   sa promesse (mieux qu'iOS), gardée par un témoin d'absence de montage.
3. **`activeParticipantCount` n'existe pas, et iOS ne l'utilise pas** : le fil iOS passe `conversation?.memberCount ??
   0` (`ConversationView.swift:569`), un champ que la v3.1 **affiche déjà** (`thread.tsx:361`). Le commentaire « comme
   iOS avant G-123 » (`decision.ts:43`) est vrai des surfaces de LISTE et faux du FIL — c'est cette confusion qui a
   rangé la Rivière avec le Résumé.
4. **La condition unique est D-15, pas la donnée.** La peau legacy monte toutes les bulles et mesure chacune ; iOS
   résout le problème par `RiverCanvasRankPlacement` (`RiverLaneCanvas.swift:38-51`). Sans ce mécanisme, virtualiser
   fait disparaître le tracé dès qu'on quitte le haut du fil.
5. **La Rivière ne consomme aucun endpoint** (`reading-modes.ts:294-300`) : le mode le plus compatible avec le
   précache, et le seul accordé aux invités. Le Résumé lit deux routes `requiredAuth` — **les deux modes n'ont pas le
   même coût, et D-8 les traitait comme un seul cas.**
