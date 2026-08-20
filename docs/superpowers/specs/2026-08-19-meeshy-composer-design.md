# MeeshyComposer — un seul objet pour créer, un seul noyau pour lire

Date : 2026-08-19
Statut : **SPÉCIFIÉ (2026-08-20) — arbitrages tous tranchés** ; exécution :
`./2026-08-20-meeshy-composer-execution-spec.md` (6 lots parallèles, contrat gelé)
Succède à `2026-08-15-story-atelier-design.md`
Portée : composition ET lecture des quatre formats (Story · Post · Réel · Status)
Planches visuelles (16 planches, inventaire exhaustif + matrice outil × format +
revue système P15 + écart SOTA P16) : `./2026-08-19-meeshy-composer-views.html`
Révision 2026-08-20 : revue complète (optimisation · performance · compat 16→27, §8) ;
intégrés — vrais stickers & bibliothèque locale (§6b), collage d'image (§6b), son de
fond sur Post & loi des deux plans audio (§6a), « l'icône est le verbe » (§6c),
recensement complété + écart SOTA (§6d).

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
| Outils | Dock à 4 états, toujours présent | **rien par défaut** — un contrôle n'apparaît que si l'objet courant le rend possible |
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
  seed    : ce que l'origine apporte déjà (média capturé, post cité, brouillon…)
}
```

Le profil dérivé de `origin` fixe **quatre** choses, jamais plus :

| | ce que l'origine décide |
|---|---|
| **format initial** | `.storyTray → STORY`, `.reelTab → REEL`, `.feedComposer → POST`, `.moodChip → STATUS` |
| **capacités visibles** | un repost n'offre pas de capture caméra ; un mood n'offre pas la timeline |
| **état d'ouverture** | story → caméra prête ; post → clavier levé sur `content` ; repost → citation déjà posée |
| **audience par défaut** | héritée du contexte (repost : plafonnée par la source, cf. `isRepostVisibilityAllowed`) |

Le format reste **changeable** après coup — c'est un champ, pas une identité —
mais il n'est jamais *demandé*. Personne ne choisit « je fais une story » dans
un menu : on tape sur le tray, et le composer sait.

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
│  ▸ contextuel : n'apparaît   │  ← rien par défaut
│    que si l'objet courant    │
│    le rend possible          │
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

**Règle d'apparition** — un contrôle n'existe à l'écran que si trois conditions
sont vraies à la fois : l'objet courant l'accepte, le profil l'autorise, et
l'action a un effet ici et maintenant. Sinon il n'est pas grisé : il n'est pas
là. C'est ce qui fait disparaître le sentiment d'outillage.

**Le socle ne bouge jamais.** L'audience reste lisible pendant toute la
composition — c'est la seule information dont l'erreur est irréversible après
publication. L'aperçu et le bouton publier l'accompagnent : on doit pouvoir
partir à tout moment, sans chercher.

**Appui long = capture.** Sur la scène vide comme sur un objet média : maintenir
prend une photo (relâcher court) ou filme (maintenir). Aucun bouton dédié, aucun
mode à armer. Le geste conservé du reader (hold 0,45 s + slop 24 px, cf. les
conventions déjà figées) devient ici le geste de prise de vue.

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
les trois d'un coup : **hashtags et références** (objets `mention`/`hashtag`, ou
segments du `content` — cf. §7), **annotations**, **objets background/foreground
par layers**, **traduction par objet**, **géolocalisation en métadonnée ET en
objet épinglable**.

**La géolocalisation, une source et deux rendus.** `metadata.place` est la
vérité ; l'objet `kind: place` en est un rendu posé sur la scène, avec la même
transform que les autres (donc scalable, animable, ancrable à une bande). Poser
la pastille renseigne la métadonnée ; retirer la pastille ne perd pas le lieu.
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

**Coller une image** devient un geste de premier ordre : dans la scène (objet
`media`/`sticker`) ou dans le carrousel (nouvelle carte) selon le contexte du
composer. Lecture du presse-papiers UNIQUEMENT via le bouton système
(`PasteButton`/`UIPasteControl`, iOS 16+) — `hasImages` décide de MONTRER le
bouton sans rien lire, le prompt de confidentialité ne surgit jamais hors geste.
Downsample à l'import (≤ 2 048 px, ImageIO) ; HDR normalisé SDR.

**Les vrais stickers entrent par cette même porte.** Bitmoji, Memoji, Genmoji et
tout clavier tiers copient des images : coller en fait un sticker posé — et
l'ajoute à **« Mes stickers »**, la bibliothèque personnelle. Dès iOS 18, les
glyphes clavier inline (`NSAdaptiveImageGlyph`) arrivent en bonus ; le collage
reste le chemin universel 16→27.

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

## 7. Les arbitrages — TOUS TRANCHÉS (2026-08-20)

Décisions gelées dans la spec d'exécution
(`2026-08-20-meeshy-composer-execution-spec.md`, §B1) ; ce tableau conserve
l'argumentaire qui a fondé chaque décision.

| # | Question | Option A | Option B | Recommandation |
|---|---|---|---|---|
| **O1** | Mentions & hashtags | segments du `content` (comme aujourd'hui) | objets de scène posables | **A pour le texte du post, B pour la scène** — les deux coexistent déjà dans le modèle (INLINE vs PINNED) ; les unifier de force perdrait l'un des deux |
| **O2** | Migration du modèle | A : rupture · B : lecture double · C : fil inchangé | **TRANCHÉ — A′, rupture assumée** (porteur produit, 2026-08-20) | Le fil passe v3, strict. La rupture est rendue PROPRE par quatre pièces : (1) création v1 refusée net — `426 UPGRADE_REQUIRED` + message « mettez à jour » ; (2) **mise à jour forcée** : version plancher servie par le gateway + porte bloquante client (mécanisme À CRÉER — vérifié absent : aucun header de version, aucun plancher) ; (3) la LECTURE survit par **UN convertisseur serveur v1→v3 à la lecture** — sans lui, l'archive éternelle et `/republish` mouraient, ce que le refus de création ne couvre pas ; (4) brouillons locaux migrés one-shot au premier lancement. La reco C reste consignée en P17 comme analyse |
| **O3** | Scène pour un POST | toujours une scène (vide si texte seul) | `scenes: nil` tant qu'aucun objet visuel | **B** — un cadre vide EST une invitation à le remplir, exactement le sentiment d'outillage à éviter |
| **O4** | Timing par défaut | tout objet naît avec start=0, end=durée | timing `nil` = « suit la slide » | **B** — `nil` se distingue d'un choix, et c'est ce qui permet la piste fantôme |
| **O5** | Bandes actives | zones dédiées (contraintes) | ancrage sémantique, objets libres de déborder | **B** — un objet peut chevaucher la limite (une bulle à cheval sur l'image), l'ancrage n'est qu'un point de référence |
| **O6** | Plateau configurable | 3 teintes fixes | jeton de thème + palette étendue | **A d'abord** (noir · indigo profond · violet profond, la demande), B ouvert ensuite |
| **O7** | Export | rendu du registre (parité exacte, export web possible) | pipeline `StoryVideoExportService` conservé | **B maintenant, A en cible** — reprise du cas C8 de Story Atelier, inchangé |
| **O8** | Sticker posé : format d'upload ? | média du contenu claimable (TUS/PostMedia) | inline dans le blob (base64) | **A** — jamais d'inline : le blob est plafonné à 256 Ko et un sticker fantôme serait la répétition des « médias web jamais rattachés » |
| **O9** | Lecture du presse-papiers | PasteButton/UIPasteControl uniquement | lecture programmatique + gestion du prompt | **A** — le prompt système hors geste brûle la confiance ; `hasImages` suffit pour l'affordance |
| **O10** | Stickers interactifs : où vivent les votes ? | table serveur légère dédiée | dans le blob storyEffects | **A** — le blob est plafonné et illisible pour l'agrégation ; le sticker reste un objet, la donnée vit à côté |
| **O11** | Publication programmée | best-effort client (Étagère + BGTask) | `scheduledAt` serveur | **B pour l'annoncer, A comme prémisse silencieuse** — un « programmé » qui dépend de la vie de l'app ne se promet pas |

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
   serveur v1→v3 à la lecture** + **version plancher & mise à jour forcée**
   (header de version client, plancher gateway, `426`, porte bloquante iOS/web
   — mécanisme à créer, vérifié absent du dépôt). C'est la phase qui rend la
   rupture O2/A′ propre ; rien de visible pour un client à jour.
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

---

## 10. Statut

Rien n'est encore implémenté, mais ce document n'est plus une proposition ouverte : **les onze arbitrages sont tranchés** (O2 par le porteur produit ; O1, O3–O11 gelés dans la spec d'exécution du 2026-08-20, avec le découpage en six lots parallèles). Les points de §8
demandent un arbitrage produit avant qu'un plan d'implémentation soit écrit.
