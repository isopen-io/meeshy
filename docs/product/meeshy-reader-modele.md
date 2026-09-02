# Meeshy Reader — le modèle de la LECTURE

> **Autorité déclarée sur le vocabulaire et les règles de la RESTITUTION**, comme
> `meeshy-composer-modele.md` l'est sur celui de la COMPOSITION. Les deux se
> lisent ensemble : le composer dit ce qu'on écrit, celui-ci dit ce qui le rend.
> Écrit le 2026-09-02 (issue #4769) ; tout ce qu'il affirme est mesuré dans le
> dépôt à cette date, et chaque affirmation cite son site.

## 0. Pourquoi ce document existe

La **loi 6** de la planche pose la doctrine :

> « Le lecteur EST l'aperçu : composer et viewers partagent un seul registre de
> rendu (`MeeshyScenePlayer`). L'aperçu du socle, la carte de feed, le viewer
> plein écran : trois chromes, un moteur. WYSIWYG par construction. »

Le composer a son document de sémantique ; la lecture n'en avait aucun, et
`grep -rni "meeshy reader"` sur le dépôt rendait **zéro**. La moitié qui RESTITUE
n'avait donc pas de mots à elle — alors que c'est elle que l'utilisateur voit.

## 1. Le mot « lecteur », et ce qu'il ne doit plus désigner

**Le code est cohérent ; c'est la prose qui surcharge le mot.** Trois
énumérations emploient `reader`, et les trois disent la MÊME chose :

| site | `reader` y signifie |
|---|---|
| `ScenePlayerMode.reader` | la surface de lecture **plein écran** |
| `AudioForegroundChip.Mode.reader` (`.composer` / `.reader`) | **en lecture**, par opposition à en composition |
| la famille `StoryReader*` (`…Context`, `…Prefetcher`, `…TimerController`, `…LoadingOverlay`, `…Representable`) | l'hôte de la lecture plein écran d'une story |

> **`reader` = « en lecture, pas en composition ».** C'est un état, jamais une
> pièce. Les trois sites sont d'accord, et il n'y a rien à renommer.

Ce qui est faux, c'est la phrase de la loi 6 : **le moteur partagé n'est pas
« le lecteur »**, c'est **le PLAYER de scène** (`MeeshyScenePlayer`). Appeler
« lecteur » à la fois le moteur et l'un de ses trois modes oblige tout lecteur du
code à deviner lequel des deux on désigne — et la devinette n'est écrite nulle
part.

| ce qu'on désigne | le mot, en prose | le nom, en code |
|---|---|---|
| le moteur unique de rendu | **le player** (de scène) | `MeeshyScenePlayer` |
| le mode plein écran | **le lecteur**, ou la lecture plein écran | `ScenePlayerMode.reader` |
| l'état « pas en composition » | **en lecture** | `.reader` (chips, hôtes) |

**Corollaire, et c'est le seul changement que ce document demande** : la loi 6
se relit « **Le PLAYER est l'aperçu** : composer et viewers partagent un seul
registre de rendu ». Aucun renommage de code — 41 sites emploient
`ScenePlayerMode` correctement.

## 2. Ce que le player REÇOIT — une SCÈNE, jamais une publication

```swift
MeeshyScenePlayer(document: CanvasV3, mode: ScenePlayerMode, carrier: StoryItem?, …)
```

C'est la ligne de partage la plus importante du modèle de lecture, et elle est
**asymétrique** avec le composer :

| | le composer écrit | le player rend |
|---|---|---|
| unité | une `MeeshyPublication` → N `MeeshySlide` | **UNE** `MeeshyScene` |
| qui regroupe | le publieur (§ 1 bis du modèle du composer : N posts, un par unité) | **l'HÔTE**, jamais le player |

Le player ne sait rien d'une publication, d'une suite de slides, ni d'une
progression. Il peint **un document, une fois**. La pagination d'un viewer
story, la file d'un feed, l'ordre des slides : tout cela appartient à l'hôte qui
le monte.

**Le PORTEUR (`carrier`) est la seconde moitié de ce qu'il reçoit, et il n'est
pas optionnel en pratique.** Le document dit ce qu'il faut PEINDRE ; il ne dit
pas où vivent les pixels. L'adresse des médias vit dans le `StoryItem` porteur,
et `toRenderableSlide` hydrate **au READ** ce que le composer n'a pas stampé :
`aspectRatio` (le composer pose toujours la sentinelle `1.0`), `duration`,
l'adresse d'un clip audio, le backdrop legacy. Sans porteur, le player sert une
coquille — licite pour une scène purement textuelle, jamais pour un viewer.

> **Une scène v3 n'est pas auto-suffisante pour être PEINTE.** Elle l'est pour
> être transportée. Tout site qui croit pouvoir rendre un `CanvasV3` seul rendra
> une scène sans médias, sans durée et au mauvais ratio.

## 3. Les trois chromes, et l'état MESURÉ de chacun

`ScenePlayerConfig(mode:)` est « la seule chose que le player décide de
lui-même ». Les trois modes ne diffèrent que par quatre témoins :

| mode | `isMuted` | `locksMute` | `loops` | `showsChrome` | monté par |
|---|---|---|---|---|---|
| `.reader` | non | non | non | **oui** | `StoryViewerView+Canvas` (2 sites) |
| `.card` | **oui** | **oui** | **oui** | non | `FeedPostCard` |
| `.preview` | non | non | non | non | **aucun site — retiré le 2026-08-24** |

`startsPaused` ne dépend PAS du mode : **les trois naissent en pause**, y compris
le plein écran, dont la lecture démarre par la commande du viewer.

`isMuted` et `locksMute` se lisent ENSEMBLE : le premier dit ce que le mode
PROPOSE quand l'hôte ne demande rien, le second si l'hôte a seulement le droit de
demander. Seule la carte de fil verrouille — un viewer porte son propre muet
persistant, piloté au rail.

### `.preview` est une absence DÉCLARÉE, pas un trou

L'œil du socle a été retiré au lot 4.9, et la raison est écrite au site
(`MeeshyComposerHost+Socle.swift`) :

> Il montait `MeeshyScenePlayer(mode: .preview)` sur
> `CanvasV3(migrating: viewModel.currentEffects)`, et **rien ne remplit
> `currentEffects`** sous les deux surfaces où le socle est peint : le mood n'a
> pas de canvas, le document n'a aucun outil d'ingestion servi. L'œil ouvrait
> donc une scène VIDE — de l'UI morte au sens de la loi 4.

Elle porte sa **condition de retour** (« que la surface qui le peint ait quelque
chose à lire ») et un témoin qui la garde —
`test_lOeilEtSonLecteur_vivent_etMeurent_ensemble` exige que le lecteur revienne
dans le MÊME commit que l'œil.

> **La loi 6 promet trois chromes ; deux sont montés et le troisième est retiré
> AVEC sa raison, sa condition de retour et son témoin.** C'est la forme juste
> d'une absence : elle se lit, elle se défend, et elle rougirait si quelqu'un la
> rebranchait à moitié. Ne pas la lire comme un oubli à réparer.

## 4. Ce que le lecteur reçoit de la PROJECTION

Le § 1 bis du modèle du composer arbitre l'écriture : une publication multi-unités
part en **N posts, un par unité**. La question symétrique — *le lecteur
regroupe-t-il ?* — a une réponse mesurée : **non, et personne ne le lui demande.**

Le player rend une scène (§ 2) ; l'hôte rend une liste. Il n'existe aujourd'hui
aucun site qui recompose N posts en une publication à la lecture, et **c'est
cohérent avec la projection** : ce qui est parti en N objets se lit en N objets.

> Si un jour le lecteur doit RE-grouper ce que la projection a séparé, il lui
> faudra une clé de groupe sur le fil — et cette clé est une décision de contrat,
> pas une affaire de vue. Tant qu'elle n'existe pas, tout regroupement à la
> lecture serait une heuristique, donc un endroit où deux clients divergeront.

## 5. Ce que ce document ne couvre pas

- **Le rendu lui-même** (`StoryCanvasUIView`, les couches, les dessinateurs) —
  c'est de l'implémentation, elle a ses doc-comments.
- **Le Prisme Linguistique à la lecture** — sa loi vit au `CLAUDE.md` racine, qui
  énumère ses quatre familles de résolveurs et reste l'autorité.
- **Le lecteur web et Android** — ce document décrit la doctrine et l'état iOS
  mesuré. Les deux autres surfaces la suivent ou s'en écartent ; le dire
  demanderait de les mesurer, et personne ne l'a fait à cette date. **Ne pas lire
  ce silence comme une conformité.**
