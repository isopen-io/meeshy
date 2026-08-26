# MeeshyComposer — un seul objet pour créer, un seul noyau pour lire

Date : 2026-08-19
Statut : **SPÉCIFIÉ (2026-08-20) — arbitrages tous tranchés** ; exécution :
`./2026-08-20-meeshy-composer-execution-spec.md` (8 lots, contrat gelé)
Succède à `2026-08-15-story-atelier-design.md`
Portée : composition ET lecture des quatre formats (Story · Post · Réel · Status)
Planches visuelles (24 planches — inventaire exhaustif, matrice outil × format,
revue système P15, écart SOTA P16, entrées externes P18, continuité P19, rupture
vécue P20, spécimen des styles P21, iconographie des contrôles P22, éditeurs
trim·crop·cut P23, cas d'usage carrousels & audio P24) :
`./planche-meeshy-composer.html`
Révision 2026-08-20 : revue complète (optimisation · performance · compat 16→27, §8) ;
intégrés — vrais stickers & bibliothèque locale (§6b), collage d'image (§6b), son de
fond sur Post & loi des deux plans audio (§6a), « l'icône est le verbe » (§6c),
recensement complété + écart SOTA (§6d).
Révision 2 (2026-08-20, revue totale 4 axes) : entrées externes — partage entrant
& média reçu → post (§6f), PiP & continuité de lecture (§6g), collage : la surface
décide (§6b), états AMORCE/INSPECTEUR du contextuel (§4), `translations` par objet
au contrat (§1), O12–O16 gelés dans la spec rév. 4.
Révision 3 (2026-08-20) : l'alignement de lecture (§6h, O17) — l'archive toujours
restituée, la sentinelle qui invite à mettre à jour ; planches P22 (iconographie),
P23 (éditeurs trim·crop·cut), P24 (cas d'usage carrousels & réels avec audio).

---

## 0. Ce que cette proposition change par rapport à Story Atelier

Story Atelier a tranché juste sur trois points, qui sont **repris tels quels** :
tout est un élément d'un registre unique ; le lecteur EST l'aperçu ; le format
est un champ, jamais un outil. Le reste évolue.

| Sujet | Story Atelier (2026-08-15) | MeeshyComposer |
|---|---|---|
| Surface d'édition | canvas plein écran, chrome par-dessus | **scène 9:16 fixe**, posée dans un plateau sombre qui lui appartient |
| Contenu 16:9 | rogné ou letterboxé passivement | **bandes ACTIVES** — le hors-champ est une zone de pose comme une autre |
| Publication | barre en haut, aperçu séparé | **socle permanent en bas** : audience · aperçu · publier, jamais masqués |
| Outils | Dock à 4 états, toujours présent | **AMORCE/INSPECTEUR — rien d'inutile** : un contrôle d'OBJET n'apparaît que si l'objet courant le rend possible ; les portes de création gardent un domicile (AMORCE, §4 — cible, I7) |
| Timeline | repliée dans le Dock, vue unique | **plan 2D** : vertical = empilement, horizontal = durée |
| Sans visuel | non traité | **document sans scène** — un post texte n'invente pas un canvas |
| Lecture | Reader séparé, conventions listées | **mêmes objets, même moteur** : les 3 viewers sont trois chromes sur un noyau |

La différence de fond : Story Atelier unifie **la composition**. MeeshyComposer
unifie **l'objet** — et les viewers en découlent au lieu d'être écrits en face.

---

## 1. Le noyau : un document, des objets, une scène optionnelle

Aujourd'hui, `StoryEffects` porte cinq familles parallèles — `textObjects`,
`mediaObjects`, `stickerObjects`, `locationObjects`, `audioPlayerObjects` — et
**chacune redéclare** `scale`, `rotation`, `zIndex`, `startTime`, `keyframes`
(vérifié : `StoryModels.swift` lignes 272-276, 629-664, 914-928, 1081…). Cinq
copies de la même géométrie et du même temps, qui divergent une à une.

```
MeeshyDocument
├── format      : POST | REEL | STORY | STATUS      ← destination, TTL, où vit le texte
├── content     : String?                            ← le texte indexé/traduit du post
├── audience    : Visibility + userIds
├── metadata    : place?, sound?, language, discoverability…
└── scenes      : [Scene]?                           ← nil = document SANS scène
     └── Scene (9:16)
          └── objects : [MeeshyObject]      ← le ratio se lit du média PORTEUR (S8)
```

Un `MeeshyObject` unique remplace les cinq familles :

```
MeeshyObject
├── id, kind        : text | media | sticker(emoji|image) | audio | place | drawing | mention
│                     (+ hashtag · annotation · interactive : RÉSERVÉS, hors v1 — O1/S5/O10)
├── anchor          : .free(x,y) | .band(.top|.bottom)   (.pinned : RÉSERVÉ, hors v1 — S5)
├── layer           : plane (.background | .content | .foreground) + z dans le plan
├── transform       : scale, rotation, opacity            ← UNE définition
├── timing          : start?, end?, keyframes[]            ← UNE définition, optionnelle
├── payload         : le propre de chaque kind
│                     (text : + translations {lang: contenu} — le Prisme par
│                      objet a un LOGEMENT au contrat ; résolution lecteur =
│                      ordre du prisme, JAMAIS translations.first)
└── locale          : langue d'origine déclarée            ← alimente le Prisme, §6
```

**Ce que ça règle immédiatement**, sans rien ajouter : un sticker devient
animable (il n'a pas de keyframes aujourd'hui), un lieu devient déplaçable et
redimensionnable comme un texte (demande explicite : « scalabilité, tout comme
pour tous les autres objets »), une mention devient un objet posable au lieu
d'un badge à part, et la timeline n'a plus qu'**un** type à afficher. Et le
sticker cesse d'être un emoji obligatoire : son payload accepte une IMAGE — la
porte d'entrée des vrais stickers (§6b).

---

## 2. La scène : 9:16 fixe, bandes actives

Le cadre est **toujours** 9:16, quel que soit le ratio du média porteur. Un
16:9 posé au centre laisse deux bandes ; ces bandes ne sont pas du vide décoratif
mais des **zones d'ancrage de premier ordre**.

```
┌───────────────┐  ← bande HAUTE : titre, mention, lieu, sticker…
│               │
├───────────────┤
│               │
│   contenu     │  ← média porteur, ratio libre
│   porteur     │
│               │
├───────────────┤
│               │  ← bande BASSE : légende, crédit son, CTA…
└───────────────┘
```

**Pourquoi l'ancrage sémantique et non des coordonnées.** Un objet posé « à
y=0.08 » saute dès que l'utilisateur remplace un 16:9 par un 4:3 : la bande
change de hauteur, le texte chevauche le média. `anchor: .band(.top)` survit au
changement, parce qu'il désigne une INTENTION (« au-dessus du contenu »), pas
une position. C'est la même leçon que le Prisme : on stocke le rang, pas le
résultat.

Trois conséquences directes :

- **Un réel 16:9 n'est plus rogné** : il garde son cadrage, et les bandes
  deviennent l'espace éditorial. C'est ce qui permet « un film complet sur le
  canvas ».
- **Un post sans visuel n'a pas de scène du tout** (`scenes: nil`). Il n'y a
  rien à cadrer. La scène naît au premier objet visuel — et si l'utilisateur
  retire ce dernier objet, elle disparaît. Le composer ne montre jamais un cadre
  vide qu'il faudrait « remplir ».
- **Le fond de scène est un objet** (`kind: media` ou couleur, plan
  `.background`), donc déplaçable, animable et traduisible comme les autres.

---

## 3. L'intention : la préconfiguration, pas la configuration

« L'utilisateur ne doit pas sentir grand-chose, comme si son intention était
connue et tout préfait. »

Le composer ne s'ouvre jamais nu : il s'ouvre **déjà déterminé** par son point
d'entrée. Un seul type, plusieurs profils.

```
ComposerIntent {
  origin  : .storyTray | .feedComposer | .reelTab | .moodChip
            | .repost(of:) | .edit(of:) | .draft(id:) | .share(payload:)
            | .conversationMedia(messageId:, attachmentId:)   // e9 — §6f, O13
  seed    : ce que l'origine apporte déjà (média capturé, post cité, brouillon,
            média reçu matérialisé…)
}
```

Le profil dérivé de `origin` fixe **quatre** choses, jamais plus :

| | ce que l'origine décide |
|---|---|
| **format initial** | `.storyTray → STORY`, `.reelTab → REEL`, `.feedComposer → POST`, `.moodChip → STATUS`, `.conversationMedia → POST` (modifiable) |
| **capacités visibles** | un repost n'offre pas de capture caméra ; un mood n'offre pas la timeline |
| **état d'ouverture** | story → caméra prête ; post → clavier levé sur `content` ; repost → citation déjà posée |
| **audience par défaut** | héritée du contexte (repost : plafonnée par la source, cf. `isRepostVisibilityAllowed`) |

Le format reste **changeable** après coup — c'est un champ, pas une identité —
mais il n'est jamais *demandé*. Personne ne choisit « je fais une story » dans
un menu : on tape sur le tray, et le composer sait.

**La porte ne fixe que l'état INITIAL** (rév. 2, revue totale U2). Les
capacités visibles sont une fonction du FORMAT COURANT (et du seed), recalculée
à chaque bascule — basculer S→P fait apparaître le champ `content` (qui naît
VIDE), basculer P→S fait réapparaître les slides. **Le texte ne migre
jamais** : les objets de scène restent des objets, le `content` reste du
contenu — aucune conversion silencieuse dans un sens ni dans l'autre.

**L'audience « dernière utilisée » est PAR FORMAT** (rév. 2, revue totale U7) —
mémoires S/P/R/M séparées : un post Public ponctuel ne contamine jamais la
story intime suivante. C'est la PRÉSERVATION d'un comportement existant
(`StoryVisibilityPreferenceStore` côté stories, `lastStatusVisibility` côté
mood), pas un mécanisme neuf. Le chip du socle se met en évidence quand
l'audience diffère de l'habituelle du format.

**Le « + Créer » de l'Étagère est une porte comme les autres** (rév. 2, revue
totale U12) : format = dernier format créé par l'utilisateur (STORY au premier
lancement — c'est déjà le bouton `onCreateStory` de MyStoriesView), audience =
dernière utilisée du format. Préconfiguré, jamais un menu.

**Le point de vigilance**, appris à nos dépens sur `UnifiedPostComposer` : un
profil qui masque une capacité ne doit pas laisser le code de cette capacité
monté et inatteignable. Une capacité absente du profil n'est **pas montée** —
et un test de source le vérifie, comme aujourd'hui pour les chips du panneau.

---

## 4. Le chrome : permanent en bas, contextuel ailleurs

Le plateau sombre (noir · indigo profond · violet profond, **jeton de thème
choisi par l'utilisateur dans ses préférences d'interface**) n'est pas un fond :
c'est le meuble qui porte la scène.

```
┌─────────────────────────────┐
│  ▸ contextuel : AMORCE ou    │  ← deux états nommés, jamais vide-mystère
│    INSPECTEUR selon la       │
│    sélection (règle infra)   │
│                              │
│      ┌───────────────┐       │
│      │               │       │
│      │  scène 9:16   │       │  ← le canvas VIT dans le plateau
│      │               │       │
│      └───────────────┘       │
│                              │
│  audience · aperçu · publier │  ← SOCLE : jamais masqué
└─────────────────────────────┘
```

**La zone contextuelle a DEUX états nommés** (revue totale C3 — la doctrine
« vide par défaut » contredisait les wireframes qui montrent des chips hors
sélection). **Périmètre (rév. 3, I7) : c'est la CIBLE — en v1, la zone reste
celle du composer SDK existant (lot C, déscope §F) ; AMORCE/INSPECTEUR
arrivent avec l'écriture v3 native du composer.** Les deux états :

- **AMORCE** (aucune sélection) : la rangée FIXE des kinds que le profil
  autorise — Aa · sticker · son · lieu (+ `content` pour P·R). C'est la porte
  de création : l'action primaire du composer a toujours un domicile visible.
- **INSPECTEUR** (un objet sélectionné) : les contrôles de l'objet courant,
  et eux seuls.

**Règle d'apparition** (loi 4, portée PRÉCISÉE) — elle s'applique aux
*contrôles d'objet*, pas aux portes de création : un contrôle d'objet n'existe
à l'écran que si trois conditions sont vraies à la fois — l'objet courant
l'accepte, le profil l'autorise, et l'action a un effet ici et maintenant.
Sinon il n'est pas grisé : il n'est pas là. C'est ce qui fait disparaître le
sentiment d'outillage.

**Le socle ne bouge jamais — et il n'a que TROIS membres** : audience ·
aperçu · publier (rév. 2, revue totale M13). Le sélecteur de FORMAT vit en
barre HAUTE (« Story ▾ » — rév. 2, M8 : P2 le plaçait au socle, P4 en barre
haute ; la barre haute gagne, le socle est réservé à la publication) ; la
qualification réel est un badge du chip format, non interactif ; la langue de
publication vit dans le panneau — elle ne fait surface que si la détection
contredit la langue système. L'audience reste lisible pendant toute la
composition — c'est la seule information dont l'erreur est irréversible après
publication. L'aperçu et le bouton publier l'accompagnent : on doit pouvoir
partir à tout moment, sans chercher.

**Une exception NOMMÉE à la loi 4, au socle seulement** (rév. 2, revue totale
U6) : dans le sélecteur d'audience d'un repost, les niveaux interdits par le
plafonnement (FRIENDS/COMMUNITY incomparables) restent VISIBLES, verrouillés,
avec la raison en une ligne (« borné par la publication de @source »). Une
liste silencieusement amputée se lit comme un bug ; l'audience mérite la
pédagogie que la loi 4 refuse aux outils.

**Le plateau n'existe que quand une scène existe** (rév. 2, revue totale U18 —
cohérent avec O3 : la scène naît au premier objet visuel). Un document SANS
scène (post texte) suit le thème de l'app, jetons ThemeManager ; le plateau
sombre apparaît AVEC la première scène. Un utilisateur en thème clair qui tape
un post texte ne bascule pas dans un meuble sombre qui n'a rien à porter.
Sur iPad, la scène 9:16 reste centrée dans le plateau élargi — le plateau
absorbe la largeur, la scène jamais (rév. 2, G6).

**Appui long = capture.** Maintenir sur la scène OUVRE LE VISEUR (v1 —
`CameraView` existant, geste réversible : glisser hors viseur = annuler) ; la
cible post-v1 est le viseur inline où relâcher court = photo, maintenir =
vidéo. Aucun bouton dédié, aucun mode à armer. Le geste conservé du reader
(hold 0,45 s + slop 24 px, cf. les conventions déjà figées) devient ici le
geste de prise de vue — et comme il porte d'autres verbes ailleurs (pause au
reader, retirer dans « Mes stickers », menu de modes sur le chip Références),
la planche P9 publie LA table geste × contexte qui rend chaque sens
prédictible (rév. 2, revue totale U4).

**Post et Réel : le texte reste du contenu.** Le texte principal voyage en
`Post.content` — indexé, traduit, rendu natif dans le feed — et non comme objet
de scène. Il s'atteint par une icône du contextuel, pas par un champ toujours
ouvert qui volerait la place au visuel.

---

## 5. La timeline : un plan, pas une liste

C'est la demande la plus structurante, et celle qui n'existe nulle part
aujourd'hui : les 32 vues de timeline actuelles montrent **une** piste à la fois.

Le plan proposé a deux axes, et ils ne veulent pas dire la même chose :

```
       ── temps ──────────────────────────────────▶
 layer  ┌──────────────────────────────────────┐
   ▲    │ ▓▓▓▓▓▓▓▓ texte « bravo »              │  foreground
   │    ├──────────────────────────────────────┤
   │    │      ▓▓▓▓▓▓▓▓▓▓ sticker              │
   │    ├──────────────────────────────────────┤
   │    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ vidéo          │  content
   │    ├──────────────────────────────────────┤
   │    │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ son            │  background
   ▼    └──────────────────────────────────────┘
```

- **Vertical = empilement.** Faire glisser une piste vers le haut la rapproche
  du spectateur. L'ordre visuel À L'ÉCRAN et l'ordre des pistes sont la même
  chose — pas de champ `zIndex` à régler ailleurs, pas de « avancer/reculer »
  dans un menu. Les trois plans (`background` · `content` · `foreground`)
  bornent le geste et donnent un sens de lecture.
- **Horizontal = durée.** Étirer un bord règle `timing.start` / `timing.end`.
  Un objet **sans timing** (le cas majoritaire : un texte posé) n'affiche pas
  une barre pleine largeur mais une **piste fantôme** qui dit « présent tout du
  long ». Le distinguer d'une durée explicitement fixée évite de figer par
  accident ce que l'utilisateur voulait laisser suivre la slide.
- **Le cadre reste uni quand la timeline dort.** Elle ne s'ouvre que sur demande,
  et le canvas reste vivant au-dessus — on règle le temps en regardant l'image,
  jamais un tableau abstrait.

**Ce que ça débloque** : le même plan sert le montage d'un film sur plusieurs
slides et le simple « ce texte apparaît à 2 s ». Une seule vue, deux échelles de
zoom, aucune vue « avancée » séparée.

---

## 6. Les viewers découlent du même noyau

Un `MeeshyScenePlayer` (le registre en mode lecture) rend un `MeeshyDocument`.
Les trois viewers ne sont plus trois lecteurs : ce sont **trois chromes** sur le
même moteur.

| | Story | Post | Réel |
|---|---|---|---|
| Moteur | `MeeshyScenePlayer` | idem | idem |
| Chrome | barres de progression, rail, réponse | carte de feed, `content` natif | plein écran, rail, boucle |
| Temps | auto-avance | tap = plein écran | boucle |
| Fenêtre | 20 h puis archive | permanent | permanent |

Tout ce que la demande énumère devient une propriété du noyau, donc valable dans
les trois d'un coup : **références** (objets `mention` posés, ou segments du
`content` — cf. §7 ; les kinds `hashtag` et `annotation` sont RÉSERVÉS au
schéma, hors v1 — O1/S5), **objets background/foreground par layers**,
**traduction par objet**, **géolocalisation en métadonnée ET en objet
épinglable**.

**La géolocalisation, une source et deux rendus.** `metadata.place` est la
vérité ; l'objet `kind: place` en est un rendu posé sur la scène, avec la même
transform que les autres (donc scalable, animable, ancrable à une bande). Poser
la pastille renseigne la métadonnée ; retirer la pastille ne perd pas le lieu —
**mais le lieu n'est JAMAIS joint invisible** (rév. 2, revue totale U10) : dès
que `metadata.place` existe sans pastille, un chip « 📍 lieu joint » apparaît
(panneau Lieu + rappel au socle, à côté de l'audience), tap = le retirer. Une
seule surface de vérité visible — l'inverse exact de la fuite que le cas C5 de
Story Atelier corrigeait.
C'est l'option retenue par Story Atelier (cas C5) — reprise sans changement,
parce que l'inverse a déjà causé une fuite iOS où le lieu partait sans que
l'utilisateur l'ait posé.

**La traduction suit l'objet.** Chaque objet porte sa `locale` d'origine ; le
Prisme s'applique par objet, avec la langue de publication en valeur héritée.
Un texte allemand posé sur une story française reste allemand à l'origine et se
traduit selon le lecteur — ce que le modèle actuel ne sait pas dire, faute de
champ.

---

## 6a. Le son : la loi des deux plans (2026-08-20)

Un chip audio n'existe que pour le son de **premier plan** — Story et Réel, là où
l'objet posé EST du contenu. Le son de **fond** n'est jamais un chip : il s'annonce
juste après les détails d'auteur et **boucle tant que la timeline du contenu
court**, exactement comme la vidéo de fond.

**La forme de l'annonce dit la provenance** (directive 2026-08-20) :

- `♫〰` (note puis onde) **si et seulement si le son est ORIGINAL** — la piste
  propre de l'auteur, ou le son natif de sa vidéo ;
- **crédit complet `« titre · @pseudo · M:SS »`** (marquee, décompte) **si le son
  vient de la bibliothèque** — une œuvre empruntée s'attribue, toujours.

Ce n'est pas une règle neuve mais la PROMOTION d'un atome existant :
`AudioChipDisplay.resolve` tranche déjà ainsi (soundId = emprunt → marquee ;
piste propre → sinusoïde). Il devient l'unique résolveur des trois formats, au
lieu que chaque header re-fabrique son crédit — c'était précisément une rupture
assumée de Story Atelier, la voilà systématisée. Note sur la loi 7 (« l'icône est
le verbe ») : l'attribution d'une œuvre empruntée est une *information*, pas un
verbe — le crédit complet ne la contredit pas.

**L'annonce n'existe que si la piste existe.** Pas de son ⇒ rien : ni glyphe
barré, ni emplacement réservé — la présence du signe EST l'information (la loi 4
du composer, appliquée au chrome de lecture).

**Le bouton audio.** Partout où un contenu porte du son — carte de fil, vue
détail, plein écran — un bouton (🔇/🔊) coupe ou rétablit d'un tap. Monté à la
même condition d'existence, servi par le canal audio unique
(`PlaybackCoordinator`) : c'est l'affordance qui rend supportable le « fil muet
par défaut ».

Nouveau : **un Post peut porter un son de fond, carrousel compris.** La piste est
liée à la timeline du post, jamais à l'index de page — on feuillette, le son
continue (même leçon que le compteur didSet qui rembobinait la clé audio du
composer : le temps appartient au contenu, pas à la navigation). Le fil reste muet
(règle d'autoplay existante). Le Réel adopte la même annonce après l'auteur.

## 6b. Vrais stickers, collage, bibliothèque locale (2026-08-20)

**Coller une image : LA SURFACE DÉCIDE** (O12 — revue totale C2 : deux cartes
disaient deux pipelines pour le même geste, une photo collée devenait
silencieusement un sticker 512 px). La règle, une phrase, partout la même :

- le `PasteButton` de la **scène** (ou du composer Post) produit TOUJOURS un
  **objet `media`** — pleine qualité, downsample ≤ 2 048 px, carte de carrousel
  si le composer est en Post sans scène ;
- le `PasteButton` du **panneau Stickers** produit un **sticker posé**
  (PNG ≤ 512 px) ET l'ajoute à « Mes stickers » ;
- la promotion média→sticker est une action EXPLICITE de l'inspecteur
  (« Garder dans Mes stickers ») — jamais un side-effect.

Lecture du presse-papiers UNIQUEMENT via le bouton système
(`PasteButton`/`UIPasteControl`, iOS 16+) — `hasImages` décide de MONTRER le
bouton sans rien lire, le prompt de confidentialité ne surgit jamais hors
geste. HDR normalisé SDR.

**Les vrais stickers entrent par le panneau.** Bitmoji, Memoji, Genmoji et
tout clavier tiers copient des images : coller DANS LE PANNEAU STICKERS en fait
un sticker posé — et l'ajoute à **« Mes stickers »**, la bibliothèque
personnelle. Dès iOS 18, les glyphes clavier inline (`NSAdaptiveImageGlyph`)
arrivent en bonus ; le collage reste le chemin universel 16→27.

**La bibliothèque est LOCALE — feature d'application, pas de plateforme.** Aucune
synchronisation backend, jamais (DiskCacheStore, policy dédiée, LRU 64 Mo,
PNG ≤ 512 px). La distinction qui porte tout : un sticker *posé* dans un contenu
publié voyage comme média du contenu — claimable comme n'importe quel média,
sinon il n'existerait pas chez les lecteurs (même famille de défaut que les
« médias web jamais rattachés ») ; la *collection*, elle, ne quitte pas l'appareil.

## 6c. L'icône est le verbe (2026-08-20)

`@marc · ↻ @aïcha` — jamais « a republié » : le glyphe suffit, l'air compte. La
règle est GÉNÉRALE, pas un cas : tout glyphe établi (`↻` republication, `♫〰` son
de fond, `👁` vues) remplace son texte partout où il apparaît. iOS est conforme
depuis le 2026-08-19 (attribution icône + @handle) ; le web s'aligne dans le lot
de parité.

## 6d. Recensement complété & écart SOTA (2026-08-20)

Le re-recensement contre le code a corrigé QUATRE ratés de l'inventaire initial —
des features existantes que la proposition doit porter, pas inventer :

- **Transitions** : entrée/sortie PAR SLIDE (`opening`/`closing:
  StoryTransitionEffect`) + transitions entre clips (`clipTransitions`,
  Timeline V2) — un « manque SOTA » supposé qui n'en était pas un.
- **Historique** : annuler/refaire global (`undoGlobal`/`redoGlobal`) + pile
  dédiée pendant le dessin.
- **Transfert en message** depuis les viewers (`sharedContentWrapper`) et
  **trail de stories épinglées** au profil — l'épinglage n'est pas que pour les
  posts.
- **`canvasAspectRatio` par slide** (l'import d'un fond paysage impose un canvas
  16:9) : la scène 9:16 fixe **l'absorbe** — le porteur garde son ratio, le
  cadre plus jamais ; lecture v1 letterboxée, à couvrir par O2.

S'y ajoutent la transcription embarquée (`mobileTranscription`), le flash caméra,
et un fait précieux : **`PostMedia.alt` existe côté serveur sans aucun écrivain
client** — l'alt text n'est pas un manque de plateforme, c'est un champ orphelin.

**Écart SOTA** (détail en planche P16, avec la colonne « serveur ? » honnête) :
prémisses proposées — stickers interactifs (kind `interactive`, votes = contrat
léger, O10) · détourage sujet → sticker (VisionKit, iOS 16 pile notre plancher) ·
GIF animés par collage · `timing.rate` (vitesse) · presets d'animation de texte
(des keyframes prégénérés, zéro vue) · layouts par presets d'ancres ·
publication programmée (Étagère, fiabilité = `scheduledAt` serveur, O11) ·
alt text (le champ est déjà là) · limitation des commentaires (drapeau + garde).
Explicitement PAS en v1 : duet, co-auteur, beat-sync. Non-buts : filtres AR de
visage, live, voice changer.

Le test de validité du modèle unique : chaque prémisse tient dans MeeshyObject
sans le déformer — un kind, un champ, ou des données. Une feature qui exigerait
une famille d'objets à part signalerait un modèle raté.

## 6e. La passe de simplification (2026-08-20)

Question posée : que peut-on couper **sans perdre le gain utilisateur final** ?
Réponse structurelle d'abord : le gain vit à ~90 % côté CLIENT (édition, rendu,
timeline, bandes, socle). La proposition transportait aussi un chantier
d'HYGIÈNE serveur (schéma strict, nouveau format de fil, verbe de publication
unique) hérité de Story Atelier — c'est lui qui portait le blocage, et il se
découple. Huit coupes, chacune avec le gain conservé :

| # | Coupe | Gain utilisateur conservé — pourquoi sans perte |
|---|---|---|
| S1 | ~~Le fil ne change pas~~ — **remplacée par la décision O2/A′** (rupture assumée, porteur produit 2026-08-20) | la simplification survit sous une autre forme : **UN convertisseur, côté serveur, à la lecture** — un seul endroit connaît les deux formes, au lieu d'un adaptateur par client. Les clients neufs ne parlent QUE v3 |
| S2 | **PublishIntent différé.** Le composer unifié APPELLE les trois chemins d'envoi existants (createStory/createPost/status) | l'utilisateur voit UN composer ; le verbe unique est de l'hygiène, pas un gain |
| S3 | **Mood hors v1.** `StatusComposerView` actuel conservé tel quel ; il rejoint MeeshyComposer en dernier, ou jamais si le gain reste nul | l'UX mood ne change pas d'un pixel — elle est déjà saine (petit composer, 6 audiences, brouillon, offline) |
| S4 | **Timeline v1 sans édition de keyframes dans le plan.** Le plan 2D montre pistes, plans, durées, fantômes ; les keyframes s'éditent dans l'inspecteur (existant) | la demande est « empiler + durées » — servie ; l'édition fine keyframe-par-keyframe dans le plan est un raffinement, et c'était LE point chaud perf à mesurer |
| S5 | **Trois ancres, pas quatre.** `.free`, `.band(.top)`, `.band(.bottom)` ; `.pinned(toObject:)` et le kind `annotation` qui en dépend partent en « plus tard » | personne n'a demandé l'ancrage relatif ; c'est de la complexité de solveur sans demande |
| S6 | **« Mes stickers » v1 = les récents.** Grille LRU des derniers collés ; appui long = retirer. Pas de gestion (dossiers, renommage) | le geste demandé — coller, retrouver, reposer — est intégralement servi |
| S7 | **L'Étagère = MyStoriesView étendue.** Elle a DÉJÀ Published/Drafts (vérifié à l'écran) ; on ajoute file d'envoi + archive, on ne construit pas une vue neuve | même surface pour l'utilisateur, coût divisé |
| S8 | **`Scene.ratio` supprimé du modèle.** Le ratio se lit du média PORTEUR (il le connaît déjà) — un concept de moins | aucun : c'était une redondance |

Ce que la passe NE touche pas — le cœur du gain : scène 9:16 à bandes actives,
socle permanent, profils d'intention, loi des deux plans audio, bouton 🔇,
collage, `↻` sans verbe, les 18 styles.

## 6f. Les entrées externes (2026-08-20, rév. 2)

Deux portes manquaient au recensement : celle qui vient d'AILLEURS (la feuille
de partage iOS) et celle qui vient de l'INBOX (un média reçu en conversation).
Les deux réutilisent l'infrastructure vérifiée du dépôt — rien ne se réinvente.

**Partage entrant — l'extension DÉCRIT, l'app compose (O14).**
`MeeshyShareExtension` existe et n'envoie aujourd'hui que vers des
conversations (texte + 1 URL + ≤ 20 fichiers, staging streaming App Group
`share_pending_media/`, fiche de reprise atomique `share_pending_sends/`,
envoi TUS opportuniste ≤ 8 Mio — `ShareViewController.swift`,
`ShareMediaStaging.swift`, `SharePendingShare.swift`). Elle gagne une
destination **« Post / Story »** à côté des conversations :

- l'extension écrit une fiche versionnée dans un répertoire SÉPARÉ
  (`share_pending_posts/`, motif exact de `SharePendingShare` — un répertoire
  distinct isole les cycles de vie et garde la rétro-compat triviale) et NE
  TENTE AUCUN envoi réseau : un post exige des choix (audience, scène) que la
  feuille ne peut pas porter — invariant existant « l'extension copie et
  décrit, ne garantit jamais l'upload » ;
- côté app, un `SharePendingPostConsumer` — décalqué de
  `SharePendingSendConsumer`, dont il reprend les DEUX points d'appel (boot
  après `configure(pool:)`, retour avant-plan) ; `NSEPendingPostConsumer`
  partage le point avant-plan et prouve le motif « fichier App Group par
  entité → consumer au réveil » pour les POSTS — convertit
  chaque fiche en **BROUILLON de l'Étagère** ;
- l'utilisateur est prévenu par une **bannière discrète** « votre partage vous
  attend » au foreground — JAMAIS une modale au boot : un lancement appartient
  à sa cause (tap de notification, appel entrant). N fiches = N brouillons ;
  un partage vieux de plusieurs jours reste un brouillon, pas une embuscade ;
- cycle de vie des octets : grâce 1 h, TTL 7 j, wipe-logout
  (`WidgetDataManager.wipeAll`) — les mécanismes existants, branchés sur le
  nouveau répertoire ; plafonds `ShareLimits` conservés (20 fichiers, 500 Mio).

**Média reçu → post : la porte e9 (O13).** Depuis un média reçu en
conversation, créer un post tient en 2 gestes : appui long sur la bulle →
« Créer un post » → composer préconfiguré (profil P modifiable), média déjà
posé. La mécanique réutilise l'existant pièce par pièce :

- l'action entre dans `MessageActionResolver`/`MessageMoreSheet` (le menu
  contextuel existant — jamais un menu parallèle), avec les gardes des actions
  sœurs : `!isViewOnce` (même règle que `isForwardable`), jamais `.location` ;
- le fichier est matérialisé **cache-first** (`AttachmentMediaSaveResolver.resolveLocalFile(for:)`
  — la cascade du flux « Enregistrer » : file:// direct → cache typé →
  téléchargement) ; dans le cas nominal les octets sont DÉJÀ sur disque,
  zéro réseau ;
- v1 = **re-upload TUS depuis le cache local** (pipeline
  `uploadContext:"post"` + `createPost(mediaIds:)` existant, offline compris) ;
  le pont serveur MessageAttachment→PostMedia (modèle
  `copyForwardedAttachments`, qui réutilise le blob sans copie) est la cible
  post-v1 — l'économie de bande passante, pas le geste ;
- un média `isEncrypted` passe par le SEUL chemin re-upload local (le blob
  serveur est chiffré) ; un **document** reçu devient une pièce jointe du post
  sans scène — jamais un objet, jamais une carte de carrousel ;
- **AUCUNE référence automatique vers l'expéditeur** : un média reçu en privé
  n'est pas une publication — l'attribuer d'office exposerait la relation
  privée. Le repost pose une SILENT parce que la source est PUBLIQUE ; ici,
  mention manuelle seulement. C'est une règle de confidentialité, pas une
  omission.

## 6g. PiP & continuité de lecture (2026-08-20, rév. 2)

**Loi 8 — un seul temps, celui du contenu.** La position de lecture et l'état
de piste survivent au changement de chrome : carte → détail → plein écran →
PiP. Le contenu ne rembobine jamais parce que l'écran a changé.

Ce n'est pas un vœu : le dépôt possède DÉJÀ le moteur, et la loi ne fait que
nommer son contrat. `SharedAVPlayerManager` (singleton MeeshyUI) est l'unique
moteur vidéo hors canvas ; la continuité existe par **identité d'URL** —
`load()` est un no-op si `urlString == activeURL`, donc la surface suivante
adopte le player et sa position (prouvé en prod : feed→Réels
`ReelsPlayerView.swift:1547-1580`, inline→fullscreen
`MeeshyVideoPlayer+Renderers.swift:519-545`, fullscreen→PiP au swipe-down
`:719-733`). La position froide est persistée par attachmentId
(`VideoPlaybackPositionStore`, zone morte de reprise) ; le PiP est intégré au
moteur (`configurePip`, `canStartPictureInPictureAutomaticallyFromInline`,
restauration in-app vs fermeture X distinguées) et **opt-in par surface**
(`MeeshyVideoSurface.enablesPip = false` par défaut — attacher un controller
arme l'auto-PiP système) ; le transport complet existe
(`VideoTransportControls` : ±10 s, scrub prioritaire, vitesse, AirPlay, PiP).

Le ScenePlayer FORMALISE ce contrat (O16) :

- la clé de continuité devient l'**identité du média**
  (attachmentId/postMediaId) plutôt que la chaîne d'URL — l'URL résolue varie
  (cache local vs distante), l'identité non ;
- pour le kind `media` porteur en lecture, le rendu passe par
  `SharedAVPlayerManager` — JAMAIS un AVPlayer privé, qui perdrait d'un coup
  la continuité, la télémétrie de consommation (WatchSample, watch progress)
  et l'arbitrage global (`PlaybackCoordinator`, un seul média joue) ;
- l'arbitrage avec le **PiP d'appel** reste le flux événementiel existant :
  début d'appel → `stopAll()` → le PiP vidéo meurt ; tout `play()` est gaté
  sur `!isCallActive` (`MediaSessionCoordinator`) — deux contrôleurs, un seul
  vivant, sans registre neuf ;
- le **mute** suit la surface sur les cartes (autoplay muet du fil) et le
  CONTENU en immersif — dé-muter le détail ne dé-mute pas le fil ;
- la **preview du composer** garde ses players privés (canvas CALayer, loop
  muet) : le handoff de position composer→lecture est un raffinement post-v1
  (§F de la spec), dette nommée — la lecture, elle, est couverte v1.

## 6h. L'alignement de lecture — personne ne lit du vide (2026-08-20, rév. 3)

La question du porteur produit : « est-ce que les ANCIENS posts et réels
restent toujours restitués ? et à un moment donné, tout client à jour reçoit
les données, tout client précédent reçoit une donnée qui l'invite à mettre à
jour ? » La réponse est OUI, par trois garanties dont chacune a son
mécanisme (O17, spec rév. 5) :

**1. L'archive est toujours restituée — pour tout le monde.** Un blob v1
servi à un ancien client part TEL QUEL (sa forme d'origine — restitution
garantie par construction) ; servi à un client à jour, il part converti v3
par le convertisseur serveur permanent. Les anciens réels sont de purs posts
vidéo : ils ne dépendent même pas du blob. Rien de l'existant ne devient
illisible, jamais.

**2. Tout client à jour reçoit les données.** Un client v3-capable s'annonce
par `X-Canvas-Caps: 3` — posé au même funnel que `X-App-Version` (iOS lot C,
Android lot H, couche fetch web lot F). Caps ≥ 3 ⇒ v3 natif toujours, archive
convertie quand `CANVAS_V3_READ` est armé (sinon v1, qu'il lit aussi — rév. 3,
précision du cycle final). L'ABSENCE de cet en-tête ne bloque jamais (au
contraire du plancher d'écriture) : elle sert la forme compatible. Le
paramètre lecteur est THREADÉ des routes aux services de feed (le point
d'attache, spec rév. 7/F1) ; le temps réel fait exception NOMMÉE : le
broadcast porte une seule forme, un vieux client peut rendre un fond par
défaut transitoire sur une story-scène v3-native, corrigé au premier fetch
REST négocié.

**3. Tout client ancien reçoit une INVITE, jamais du vide.** Le seul contenu
qu'un vieux binaire ne sait pas lire est le v3-NATIF (composé par un client
neuf — l'encodage B7 émet v3 dès le lot C). Pour lui, le gateway génère à la
lecture une **sentinelle v1** : fond sobre + un `textObject` « Mets à jour
Meeshy pour voir ce contenu », localisé via `resolveUserLanguage` du LECTEUR
— le Prisme s'applique même à l'invite. Un post/réel dont le porteur est un
attachment média reste servi tel quel (le média se lit, seuls les overlays
manquent — on ne pose pas une sentinelle par-dessus une vidéo). Et à
l'ÉCRITURE, le même vieux binaire prend le 426 + invite (O15, longue
traîne) : les deux sens convergent vers la mise à jour, aucun ne casse.

Ces trois garanties tiennent parce que l'extension est un APPAREILLAGE de
lecture, pas un gel : `CANVAS_V3_READ` ne gouverne que la conversion de
l'archive ; la sentinelle est active dès le merge du lot A — c'est elle qui
couvre la fenêtre où les binaires neufs émettent du v3-natif pendant que des
binaires anciens circulent encore.

## 7. Les arbitrages — TOUS TRANCHÉS (2026-08-20)

Décisions gelées dans la spec d'exécution
(`2026-08-20-meeshy-composer-execution-spec.md`, §B1) ; ce tableau conserve
l'argumentaire qui a fondé chaque décision.

| # | Question | Option A | Option B | Recommandation |
|---|---|---|---|---|
| **O1** | Mentions & hashtags | segments du `content` (comme aujourd'hui) | objets de scène posables | **A pour le texte du post, B pour la scène** — les deux coexistent déjà dans le modèle (INLINE vs PINNED) ; les unifier de force perdrait l'un des deux |
| **O2** | Migration du modèle | A : rupture · B : lecture double · C : fil inchangé | **TRANCHÉ — A′, rupture assumée** (porteur produit, 2026-08-20) | Le fil passe v3, strict. La rupture est rendue PROPRE par quatre pièces : (1) création v1 refusée net — `426 UPGRADE_REQUIRED` + message « mettez à jour » ; (2) **mise à jour forcée** : version plancher servie par le gateway + porte bloquante client (mécanisme À CRÉER — vérifié absent : aucun header de version, aucun plancher) ; (3) la LECTURE survit par **UN convertisseur serveur v1→v3 à la lecture** — sans lui, l'archive éternelle et `/republish` mouraient, ce que le refus de création ne couvre pas ; (4) brouillons locaux migrés one-shot au premier lancement. La reco C reste consignée en P17 comme analyse. *Rév. 3 (C5/O15) : l'écriture stricte vit SOUS DRAPEAU — au merge, aucun écrivain n'émet v3 ; armée après les trois, le 426 sert la longue traîne* |
| **O3** | Scène pour un POST | toujours une scène (vide si texte seul) | `scenes: nil` tant qu'aucun objet visuel | **B** — un cadre vide EST une invitation à le remplir, exactement le sentiment d'outillage à éviter |
| **O4** | Timing par défaut | tout objet naît avec start=0, end=durée | timing `nil` = « suit la slide » | **B** — `nil` se distingue d'un choix, et c'est ce qui permet la piste fantôme |
| **O5** | Bandes actives | zones dédiées (contraintes) | ancrage sémantique, objets libres de déborder | **B** — un objet peut chevaucher la limite (une bulle à cheval sur l'image), l'ancrage n'est qu'un point de référence |
| **O6** | Plateau configurable | 3 teintes fixes | jeton de thème + palette étendue | **A d'abord** (noir · indigo profond · violet profond, la demande), B ouvert ensuite |
| **O7** | Export | rendu du registre (parité exacte, export web possible) | pipeline `StoryVideoExportService` conservé | **B maintenant, A en cible** — reprise du cas C8 de Story Atelier, inchangé |
| **O8** | Sticker posé : format d'upload ? | média du contenu claimable (TUS/PostMedia) | inline dans le blob (base64) | **A** — jamais d'inline : le blob est plafonné à 256 Ko et un sticker fantôme serait la répétition des « médias web jamais rattachés » |
| **O9** | Lecture du presse-papiers | PasteButton/UIPasteControl uniquement | lecture programmatique + gestion du prompt | **A** — le prompt système hors geste brûle la confiance ; `hasImages` suffit pour l'affordance |
| **O10** | Stickers interactifs : où vivent les votes ? | table serveur légère dédiée | dans le blob storyEffects | **A** — le blob est plafonné et illisible pour l'agrégation ; le sticker reste un objet, la donnée vit à côté |
| **O11** | Publication programmée | best-effort client (Étagère + BGTask) | `scheduledAt` serveur | **B pour l'annoncer** — un « programmé » qui dépend de la vie de l'app ne se promet pas. *(Rév. 2 : la « prémisse silencieuse A » est ABANDONNÉE — le gel O11 est hors v1 INTÉGRAL, prémisse comprise ; un design qui la recommandait contredisait la spec.)* |

---

## 8. Revue système — optimisation, performance, compatibilité iOS 16→27 (2026-08-20)

Revue de TOUT le système — composer, ScenePlayer, timeline, collage, stickers,
audio. Chaque risque est ancré à un piège documenté de ce dépôt ; chaque garde est
nommée. Détail visuel : planche P15. **Le plancher produit est iOS 16.0 — rien
en dessous n'est supporté, ni testé, ni visé** (cible de déploiement du projet) ;
un plancher d'API inférieur à 16 dans la table des portes dit seulement que l'API
couvre TOUTE notre plage, jamais que la plage descend. Appareil plancher : A11
(iPhone 8 / SE 2) sous iOS 16, 2-3 Go de RAM.

### Budgets imposés par le plancher

| Surface | Budget | Garde |
|---|---|---|
| Fil + CanvasPlayer | 1 lecteur actif max, autoplay muet ; vignettes (thumbHash) ailleurs ; pause hors écran, pool | le piège « réels qui chauffent » ne se rejoue pas |
| Scène | 1 vidéo de fond 1080p + ≤ 20 layers ; un objet = un CALayer, jamais une vue SwiftUI par objet | le canvas reste UIKit (StoryTextLayer + encre par métriques conservés) |
| Image collée/importée | downsample ImageIO ≤ 2 048 px AVANT UIImage (48 Mpx décodée ≈ 190 Mo) ; HDR → SDR | export AVAssetWriter déterministe |
| « Mes stickers » | DiskCacheStore dédié, LRU 64 Mo, PNG ≤ 512 px | store existant, zéro code de stockage neuf |
| Timeline plan 2D | pistes virtualisées ; barres + keyframes dessinées en un passe | lanes 52 pt + graduation dérivée des libellés : invariants réutilisés |
| Audio de fond | boucle liée à la timeline (AVPlayerLooper), canal unique | PlaybackCoordinator inchangé |
| Polices (18) | 0 octet embarqué, cache CoreText | test de disponibilité — vérifié 18.2 ET 26.1 |

### Portes API — aucune branche morte sur 16→27

| API | Plancher | Conduite |
|---|---|---|
| `PasteButton`/`UIPasteControl` | 16 | seule voie de lecture — couvre toute la plage |
| `hasImages`/`detectedPatterns` | 10/15 | affordance sans lecture ⇒ jamais de prompt |
| `NSAdaptiveImageGlyph` | 18 | bonus clavier inline, `@available` + repli collage |
| `PHPicker` · `AVPlayerLooper` · `preferredFrameRateRange` | 14 · 10 · 15 | existant / boucle / 120 Hz opportuniste |
| Matériaux Liquid Glass | 26 | automatiques — rien à gater, rien à imiter |

**Bilan : aucune API > iOS 16 n'est requise.** iOS 18 et 26 n'apportent que des
bonus à repli naturel ; pour iOS 27, rien de privé ni de déprécié — les
sentinelles (test des polices, gardes de source) rougissent d'elles-mêmes.

### Registre des risques → mitigations (précédents du dépôt)

1. **Profondeur de type SwiftUI** (pile device 1 008 Ko vs simu 8 Mo) → registre
   par effacement de type, canvas UIKit, interdit `@ViewBuilder` génériques
   imbriqués sur le chemin du player — garde de source dédiée.
2. **Thermique** (« réels qui chauffent ») → 1 décodeur actif, résolution
   adaptative, pause hors écran.
3. **Self-sizing récursif** (UIHostingConfiguration + invalidateLayout) →
   hauteur EXPLICITE des cellules autour du CanvasPlayer.
4. **Invariants de lecture** (né en pause · cache gèle le fade · 4 chemins
   relancent · boucle = fond seul) → repris comme lois du ScenePlayer ; la
   surface de gardes source existante reste verte par construction.
5. **Blobs v1 inconnus** (passthrough 256 Ko) → avec O2/A′, l'audit REDEVIENT
   un intrant — celui du convertisseur serveur v1→v3, pas d'un débat de schéma.
   Le convertisseur est TOLÉRANT par contrat : champ inconnu ignoré, rendu
   dégradé plutôt qu'échec — une story de 2026 mal formée s'affiche moins bien,
   elle ne disparaît jamais.
6. **Prompt presse-papiers** → PasteButton uniquement (O9).
7. **Sticker fantôme** (posé mais invisible aux lecteurs) → média du contenu
   claimable (O8) ; seule la bibliothèque reste locale.
8. **Le carrousel coupe le son à la page** (leçon du didSet qui rembobinait) →
   piste liée à la timeline du post, jamais à l'index de page.
9. **Mémoire A11 vs captures modernes** (24-48 Mpx dès iOS 26) → downsample
   avant décodage, jamais `UIImage(data:)` brut.

Restent ouvertes — les seules choses que cette revue ne peut pas clore ici : le
**coût mesuré** du plan 2D sur A11 (prototype à chronométrer), l'**audit des
blobs** en production, et une **exécution réelle sur un appareil iOS 16**.

## 9. Phasage proposé

Chaque phase est livrable seule et laisse le produit fonctionnel.

1. **Le contrat** — v3 strict (Zod, `packages/shared`) + **convertisseur
   serveur v1→v3 à la lecture** + négociation O17 (sentinelle, §6h) +
   **version plancher & mise à jour forcée** (header de version client,
   plancher gateway, `426`, porte bloquante NATIVE — iOS et Android, lot H ;
   le web est EXEMPT, R6 : il se déploie en lockstep). Rév. 3 (I4) : la
   validation stricte d'écriture et le 426 vivent sous
   `CANVAS_V3_WRITE_STRICT` (défaut OFF — le merge est inerte aux deux
   sens), armés quand les TROIS écrivains émettent v3 (O15). « Rien de
   visible pour un client à jour » est vrai au sens fort.
2. **La scène** — cadre 9:16, bandes ancrables, plateau et socle permanent.
   Premier changement visible, sur le composer de story seul. Le collage d'image
   et « Mes stickers » (§6b) entrent ici : purement client, aucun contrat serveur.
3. **Le plan 2D** — timeline verticale/horizontale, pistes fantômes.
4. **L'intention** — `ComposerIntent` et les profils ; les composers parallèles
   meurent un par un, en commençant par ceux qui n'ont qu'un site d'appel.
5. **Les viewers** — `MeeshyScenePlayer` sous les trois chromes ; les
   conventions de lecture déjà figées (durée, crédit sonore, rail figé, barre de
   langues) sont reprises telles quelles — plus la loi des deux plans audio et
   l'annonce du fond après l'auteur, ♫〰 ou crédit selon la provenance (§6a), et
   l'attribution `↻` sans verbe généralisée au web (§6c).
6. **Le nettoyage** — retrait des chemins clients legacy. Le convertisseur
   serveur, lui, RESTE tant que l'archive porte du v1 — elle est éternelle
   (« ne plus jamais supprimer ») ; sa mort passe par une migration batch de
   l'archive, tâche d'hygiène optionnelle et jamais bloquante.
7. **Les entrées externes** (lot G, après C) — porte e9 « média reçu → post »
   et destination Post/Story du partage entrant (§6f) : le composer devient
   joignable depuis TOUT ce que l'utilisateur reçoit ou possède.

---

## 10. Statut

**Rév. 4 (2026-08-24) — cette section disait « Rien n'est encore implémenté ».
C'était faux, et depuis quatre jours.** La correction vient d'une sonde de
LECTURE SEULE menée le 2026-08-24 sur le worktree `../v2_meeshy-composer`,
branche `main` à `fb7afd471` : fichiers ouverts un par un
(`canvas-v3.ts`, `storyEffectsV3.ts`, `core.ts`, `MeeshyScenePlayer.swift`,
`ComposerIntent.swift`, `MeeshyComposerHost.swift`,
`ComposerDocumentSurface.swift`, `MessageActionResolver.swift`) et
`git log --oneline` sur les commits de bascule. **Aucun build, aucune suite de
tests n'a été lancé** : tout ce qui suit est une lecture de source et
d'historique, jamais une mesure d'exécution — un « sur `main` » ci-dessous
signifie « le commit de bascule est un ancêtre de `fb7afd471` et le code est là
quand on ouvre le fichier », pas « la suite est verte aujourd'hui ». Le phasage
du §9 ne change pas ; cette section dit seulement OÙ il en est, et le dit avec
des `fichier:ligne` pour que la prochaine session puisse le réfuter au lieu de
le croire.

### Ce que cette section disait de juste, et qui tient

Ce document n'est pas une proposition ouverte : **les arbitrages sont
tranchés** — O1–O11 (O2 par le porteur produit), puis O12–O16 (revue totale du
2026-08-20) et O17 (négociation de lecture — l'archive toujours restituée, la
sentinelle qui invite, §6h), gelés dans la spec d'exécution rév. 7. **Les plans
d'exécution A–F existent** —
`docs/superpowers/plans/2026-08-20-meeshy-composer-lot-{a,b,c,d,e,f}.md` —
passés par deux cycles de revue adversariale (43 constats, 43 réels, tous
intégrés). **Le lot G reste à écrire** à son lancement : `ls` sur le répertoire
des plans ne rend aucun `lot-g`. **Le lot H (Android) est SUSPENDU** — non par
manque d'équipe, mais par directive produit du 2026-08-23, consignée au §G de la
conception v2 (`2026-08-23-meeshy-composer-v2-design.md`). Les inconnues de §8
ne sont pas des questions ouvertes mais des GATES de lots : la mesure A11 est un
critère de sortie du lot D, l'audit des blobs v1 l'intrant du convertisseur du
lot A.

### Où en est le §9 — état mesuré le 2026-08-24

| §9 | Lot | État | Ce qui le prouve, ouvert |
|---|---|---|---|
| 1. Le contrat | A | **sur `main`**, les deux drapeaux DÉSARMÉS | `packages/shared/types/canvas-v3.ts` · `services/gateway/src/services/posts/storyEffectsV3.ts` · bascule `23765e7c6` |
| 2. La scène | C | **à moitié** — plateau et surfaces oui, **socle NON PEINT** | `apps/ios/.../Composer/` (11 fichiers) · `MeeshyComposerHost.swift:269` `chromeOwner = .atelier` |
| 3. Le plan 2D | D | **sur `main`** | `MeeshyUI/Story/Timeline/` (65 fichiers `.swift`), dont `Logic/Plan2DLayout.swift` et `Views/Plan2D/Plan2DView.swift` · bascule `24d1bf752` |
| 4. L'intention | C | **table complète, câblage à moitié** — 4 portes sur 9 routent encore vers un legacy, **1 seule porte a un appelant** | `ComposerIntent.swift` (325 l. à HEAD) · `StoryTrayActions.swift:192` |
| 5. Les viewers | B · E · F | **sur `main`** | `MeeshyScenePlayer.swift` (274 l., 3 modes) + 4 montages de production · bascules `d36869973`, `e9e674a55`, `7f1de533f` |
| 6. Le nettoyage | — | **non commencé** | quatre composers historiques debout, comptés ci-dessous |
| 7. Les entrées externes | G | **non commencé** | aucun plan `lot-g` · `MessageActionResolver.swift:11-22` sans action « Créer un post » |

**Phase 1 — le contrat : livré, et volontairement INERTE.** Le schéma Zod v3
vit dans `packages/shared/types/canvas-v3.ts` (kinds réservés `hashtag` ·
`annotation` · `interactive` refusés par `superRefine`, sept kinds actifs,
invariant `TIMING_END_BEFORE_START`). Le convertisseur serveur et la négociation
O17 vivent dans `services/gateway/src/services/posts/storyEffectsV3.ts` (22 Ko) :
`negotiateWireStoryEffects` (`:510`) est réellement lu par
`postReferences.ts:156` et `:183` — la sentinelle n'est pas du code mort. Le 426
existe (`utils/response.ts:159`, `sendError(reply, 426, …, { code: 'UPGRADE_REQUIRED' })`)
et sa porte cliente aussi (`apps/ios/.../Composer/UpgradeGateController.swift`,
`UpgradeGateView.swift`). **Les trois interrupteurs restent au repos**, ce qui
est exactement ce qu'O15 et R6 exigeaient : `CANVAS_V3_READ` est relu à chaque
appel (`storyEffectsV3.ts:514`, `=== '1'`), `CANVAS_V3_WRITE_STRICT` aux deux
gardes d'écriture (`routes/posts/core.ts:108` et `:146`, `!== '1'` ⇒ sortie
immédiate), et le plancher de version rend `''` par défaut
(`utils/appVersion.ts:2`, `process.env.MIN_APP_VERSION ?? ''` — plancher vide =
porte désarmée). Aucun fichier d'`infrastructure/` ne pose l'une de ces trois
variables. En revanche, **les trois clients annoncent déjà ce qu'ils savent
lire** : iOS `ClientInfoProvider.swift:77`, web `apps/web/services/api.service.ts:115`,
Android `ClientCapabilitiesInterceptor.kt:37` — `X-Canvas-Caps: 3` partout.

**Phases 2 et 4 — la scène et l'intention (lot C) : le meuble EXISTE, il n'a
qu'une porte et pas de socle.** Le répertoire `apps/ios/Meeshy/Features/Main/Composer/`
porte onze fichiers : `ComposerPlateau.swift` (les trois teintes, jetons
`MeeshyColors`), `ComposerIntent.swift` (**9 portes** — `storyTray`,
`feedComposer`, `reelTab`, `moodChip`, `repost`, `edit`, `draft`, `share`,
`conversationMedia`), `ComposerFormatFan.swift` (l'éventail, loi 4 : un éventail
à une entrée ne se peint pas), `MeeshyComposerHost.swift` (le meuble),
`ComposerDocumentSurface.swift` (419 l. — la surface « document sans scène »,
que la spec v1 posait comme condition de bascule de `.feedComposer`),
`PasteDestination.swift` / `PasteIntoComposer.swift` / `StickerLibraryStore.swift`
(O12 et « Mes stickers »), `UpgradeGateController.swift` / `UpgradeGateView.swift`.
L'Étagère à quatre onglets existe (`MyStoriesTab.swift:14`). Le meuble monte
réellement ses deux surfaces (`MeeshyComposerHost.swift:297-300`, `.scene` ⇒
atelier SDK, `.document` ⇒ `ComposerDocumentSurface`) et l'éventail (`:406`).

Deux manques mesurés, et ils gouvernent tout le reste du chantier. **(a) Le
socle n'est peint sur AUCUNE surface** : `chromeOwner` vaut `.atelier`
(`MeeshyComposerHost.swift:269`), `ComposerChromeOwner.atelier.assembles(_)`
rend `true` pour tout contrôle (`MeeshyUI/Story/StoryComposerView+TopBar.swift:37-38`),
donc le `if !chromeOwner.assembles(.publish) { socle }` du `body` (`:277`) est
faux en permanence — audience, œil et flèche restent ceux de l'atelier du SDK.
Les deux conditions de levée sont NOMMÉES sur place (`:260-268`) et vivent toutes
deux dans `MeeshyUI`. **(b) Le meuble n'a qu'UN site de construction en
production** : `StoryTrayActions.swift:192`, `ComposerIntent(origin: .storyTray)`
— `grep` sur `apps/ios/Meeshy` et `packages/MeeshySDK/Sources` ne rend aucune
autre construction (les 12 autres sont dans `MeeshyTests`). À HEAD, **quatre des
neuf portes routent encore vers un composer historique** : `.feedComposer` →
`.feedComposer`, `.moodChip` → `.statusComposer`, `.repost` → `.repostComposer`,
`.edit` → `.storyEdit`. Les cinq autres rendent `routesToLegacy: nil` — mais
quatre d'entre elles (`.reelTab`, `.conversationMedia`, `.draft`, `.share`) n'ont
aucun appelant : la table décrit un contrat que la production n'exerce pas
encore.

**Phase 3 — le plan 2D : livré.** `packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/`
compte 65 fichiers `.swift` répartis en `Engine` · `Logic` · `Model` · `Util` ·
`ViewModel` · `Views`, dont `Logic/Plan2DLayout.swift` et `Views/Plan2D/Plan2DView.swift`.
Bascule sur `main` : `24d1bf752`, avec la dérogation produit sur le budget D4
consignée par `0ee8e5429`.

**Phase 5 — les viewers : livrée, y compris le viewer story que le lot E avait
laissé bloqué.** `MeeshyScenePlayer.swift` (274 l.) déclare ses trois modes et
**quatre montages de production** existent :
`MeeshyComposerHost.swift:489` (l'œil du socle, `.preview`),
`StoryViewerView+Canvas.swift:1260` et `:1316` (`.reader`),
`FeedPostCard.swift:350` (`.card`). Le message de merge du lot E (`e9e674a55`)
excluait encore le viewer story ; deux commits postérieurs l'ont réglé —
`73f4a5de5` (« le viewer story lit ses scènes par le lecteur, plus par l'hôte
nu »), puis `e09a3edc7`, qui restreint la prise de main au **v3 natif** pour que
l'archive garde son hôte. Le miroir web est sur `main` (lot F, `7f1de533f`).

**Phase 6 — le nettoyage : rien n'a commencé.** Aucun composer historique n'est
mort. Comptés au `wc -l` le 2026-08-24 :
`apps/ios/.../Views/StatusComposerView.swift` **361 l.** ·
`packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` **739 l.** ·
`apps/ios/.../Components/EditPostSheet.swift` **658 l.** (et non 498 : le commit
`690e575f7` du 2026-08-23 l'a agrandi) ·
`FeedComposerSheet`, déclaré `FeedView+Attachments.swift:765` dans un fichier de
**1 876 l.** — celui-là ne se retire pas, il s'extrait.

**Phase 7 — les entrées externes : rien n'a commencé.** Pas de plan `lot-g` ;
`MessageActionResolver.MoreItem` (`:11-22`) énumère 19 actions et aucune ne crée
un post ; `grep` ne trouve ni `SharePendingPostConsumer` ni `share_pending_posts`
dans l'arbre. La porte e9 `.conversationMedia` a son profil écrit
(`ComposerIntent.swift`) et zéro appelant. **Nuance importante pour qui reprendra
ce lot** : le « re-upload TUS local » que la mission du lot G décrit a été
doublé par un chemin SERVEUR livré le 2026-08-23 —
`POST /posts/from-attachment` (`routes/posts/core.ts:205`) et
`services/posts/publishAttachment.ts`. Le lot G n'a donc plus le même contenu que
le jour où il a été spécifié.

### La suite ne s'appelle plus « lots A–H »

Le chantier a une **extension** datée du 2026-08-23,
`docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md`, qui promeut une
partie du « Hors v1 » et découpe la suite en lots 0 · 0 bis · 1 → 7. Elle ne
remplace ni ce document ni le contrat gelé du 2026-08-20 : elle les prolonge, et
son §A bis dit explicitement que ses lots « deviennent la suite, pas un compte
parallèle ». Quatre de ses lots ont un plan d'exécution écrit le 2026-08-24
(`docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-{4,5,6,7}.md`) ; les
lots 3 et 0 bis étaient en cours d'implémentation à l'heure de cette sonde.

### Rév. 5 (2026-08-24, quelques heures plus tard) — deux commits ont déplacé ce tableau

Cette section a été écrite à `fb7afd471`. **`main` est depuis à `d4a40f600`**, et
deux des lignes ci-dessus sont devenues fausses **le jour même** — c'est
exactement le mode d'échec que la rév. 4 corrigeait, et il faut le dater plutôt
que de réécrire par-dessus.

- **`96b707da6` (lot 3, v2)** — `.feedComposer` passe à `routesToLegacy: nil`.
  La ligne « 4. L'intention » et le paragraphe « Phases 2 et 4 » disent **quatre
  portes sur neuf routent encore vers un legacy** : elles sont désormais
  **trois** (`.moodChip → .statusComposer` `ComposerIntent.swift:231`,
  `.repost → .repostComposer` `:249`, `.edit → .storyEdit` `:271`). Le fichier
  fait **372 l.** et non 325. **Ce que le lot 3 n'a PAS fait, et qu'il dit
  lui-même** : aucun écran n'est recâblé — le meuble garde son unique site de
  construction, `StoryTrayActions.swift:191`. Il a en revanche armé une garde
  neuve, `MeeshyComposerHostGuardTests.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`,
  qui rougit le jour où un site monterait le meuble sur une porte-document que le
  document ne sait pas tenir.
- **`d4a40f600` (lot 0 bis, v2)** — le repost web vise la RACINE et non le
  maillon, et la page de détail gagne son ANCRAGE (`onRepostAsPost`). 27
  fichiers, dont `packages/shared/utils/repost-target.ts` (**neuf**, jumeau de
  `RepostTargeting` iOS) et `Post.originalRepostOfId` au contrat. Il a aussi
  corrigé, dans `PostService.ts`, le commentaire du repli `?? PostType.POST` :
  il porte désormais un paragraphe daté « ÉTAT AU 2026-08-24 ».
- **Ancres remesurées** pour qui reprendra ce texte : `MeeshyComposerHost.swift`
  **578 l.** — `chromeOwner = .atelier` **`:269`** (inchangé), les deux surfaces
  `:294-302`, l'éventail `:437`, `MeeshyScenePlayer` **`:499`** (et non `:489`).
  Les **quatre** montages de `MeeshyScenePlayer` sont confirmés
  (`MeeshyComposerHost.swift:499`, `StoryViewerView+Canvas.swift:1260` et
  `:1316`, `FeedPostCard.swift:350`).
- **Ce qui NE bouge pas** : la phase 6 reste non commencée (les quatre composers
  historiques sont debout, `wc -l` inchangés), la phase 7 aussi, et les trois
  interrupteurs du contrat restent au repos.

### Deux avertissements de lecture

1. **Un plan n'est pas une livraison.** Ce document a menti quatre jours en
   affirmant l'inverse de la réalité ; il mentirait tout autant en comptant un
   plan pour du code. Les lots 4 à 7 ci-dessus ont un plan, et **aucune ligne de
   code**. Les lots 3 et 0 bis ont du code non committé, ce qui n'est pas
   davantage une livraison.
2. **L'arbre de travail était VIVANT pendant cette sonde.** `git status` rendait
   23 fichiers modifiés non committés (dont `ComposerIntent.swift` et
   `MeeshyComposerHost.swift`) ; `git diff --stat`, quelques minutes plus tard,
   en rendait 25 ; et `ComposerIntent.swift` a gagné 9 lignes (363 → 372) entre
   deux `wc -l` de la même session. Toutes les lignes citées ci-dessus
   viennent donc de `git show HEAD:` quand elles portent sur ces deux fichiers,
   et de l'arbre de travail sinon. Le tableau de bord
   `planche-meeshy-composer.html` n'a **pas** été touché par cette
   révision : sa règle de maintenance veut qu'il bouge dans le MÊME commit que
   le gate d'un lot, et deux lots étaient en vol.
