# MeeshyComposer — un seul objet pour créer, un seul noyau pour lire

Date : 2026-08-19
Statut : **proposition de design, non validée** — succède à `2026-08-15-story-atelier-design.md`
Portée : composition ET lecture des quatre formats (Story · Post · Réel · Status)
Planches visuelles (14 planches, inventaire exhaustif + matrice outil × format) :
`./2026-08-19-meeshy-composer-views.html`

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
          ├── ratio du contenu porteur (16:9, 1:1, 9:16…)
          └── objects : [MeeshyObject]
```

Un `MeeshyObject` unique remplace les cinq familles :

```
MeeshyObject
├── id, kind        : text | media | sticker | audio | place | drawing | mention | hashtag | annotation
├── anchor          : .free(x,y) | .band(.top|.bottom) | .pinned(toObject:)   ← §2
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
d'un badge à part, et la timeline n'a plus qu'**un** type à afficher.

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

## 7. Les arbitrages ouverts

Ce sont les vraies décisions ; le reste en découle.

| # | Question | Option A | Option B | Recommandation |
|---|---|---|---|---|
| **O1** | Mentions & hashtags | segments du `content` (comme aujourd'hui) | objets de scène posables | **A pour le texte du post, B pour la scène** — les deux coexistent déjà dans le modèle (INLINE vs PINNED) ; les unifier de force perdrait l'un des deux |
| **O2** | Migration du modèle | `MeeshyObject` v3 en rupture | v3 dérivé de `StoryEffects`, lecture des deux | **B** — 20 h de stories vivantes en base à tout instant ; une rupture les casse |
| **O3** | Scène pour un POST | toujours une scène (vide si texte seul) | `scenes: nil` tant qu'aucun objet visuel | **B** — un cadre vide EST une invitation à le remplir, exactement le sentiment d'outillage à éviter |
| **O4** | Timing par défaut | tout objet naît avec start=0, end=durée | timing `nil` = « suit la slide » | **B** — `nil` se distingue d'un choix, et c'est ce qui permet la piste fantôme |
| **O5** | Bandes actives | zones dédiées (contraintes) | ancrage sémantique, objets libres de déborder | **B** — un objet peut chevaucher la limite (une bulle à cheval sur l'image), l'ancrage n'est qu'un point de référence |
| **O6** | Plateau configurable | 3 teintes fixes | jeton de thème + palette étendue | **A d'abord** (noir · indigo profond · violet profond, la demande), B ouvert ensuite |
| **O7** | Export | rendu du registre (parité exacte, export web possible) | pipeline `StoryVideoExportService` conservé | **B maintenant, A en cible** — reprise du cas C8 de Story Atelier, inchangé |

---

## 8. Ce qu'il faut vérifier avant d'engager

Trois inconnues que je n'ai pas levées et qui changeraient la forme du plan :

1. **Le coût du plan 2D sur du vieux matériel.** Une timeline qui rend N pistes
   vivantes au-dessus d'un canvas déjà animé est le point chaud évident. À
   mesurer avant de s'y engager — la mémoire du dépôt garde trace de réels qui
   chauffaient.
2. **La compatibilité descendante réelle.** `Post.storyEffects` est validé en
   `passthrough()` côté serveur : personne ne sait ce que les clients déployés
   ont écrit. Un audit des blobs en base doit précéder tout schéma strict.
3. **La profondeur de type SwiftUI.** Le dépôt a déjà connu un débordement de
   pile par profondeur de type (device 1008 Ko vs simu 8 Mo). Un composer
   générique bâti sur des `@ViewBuilder` imbriqués est exactement la forme qui
   déclenche ça — le registre doit rendre par effacement de type, pas par
   composition générique profonde.

---

## 9. Phasage proposé

Chaque phase est livrable seule et laisse le produit fonctionnel.

1. **L'objet** — `MeeshyObject` + `MeeshyDocument`, lecture des deux modèles
   (O2/B). Aucun changement visible. C'est la phase qui supprime les cinq
   copies de la géométrie et du temps.
2. **La scène** — cadre 9:16, bandes ancrables, plateau et socle permanent.
   Premier changement visible, sur le composer de story seul.
3. **Le plan 2D** — timeline verticale/horizontale, pistes fantômes.
4. **L'intention** — `ComposerIntent` et les profils ; les composers parallèles
   meurent un par un, en commençant par ceux qui n'ont qu'un site d'appel.
5. **Les viewers** — `MeeshyScenePlayer` sous les trois chromes ; les
   conventions de lecture déjà figées (durée, crédit sonore, rail figé, barre de
   langues) sont reprises telles quelles.
6. **Le nettoyage** — schéma strict côté serveur une fois l'audit fait (§8.2),
   retrait de la lecture v2.

---

## 10. Statut

Ce document est une **proposition**. Rien n'est implémenté. Les points §7 et §8
demandent un arbitrage produit avant qu'un plan d'implémentation soit écrit.
