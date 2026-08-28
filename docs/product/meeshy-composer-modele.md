# MeeshyComposer — le modèle : slides, scènes, objets

> **Statut** : normalisation arrêtée le 2026-08-27 (directive porteur). C'est le
> vocabulaire UNIQUE du composer — issues, code neuf, UI, documentation.
> La planche (`planche-meeshy-composer.html`) porte la VISION ; ce fichier porte
> la SÉMANTIQUE. En cas d'écart, ce fichier a raison sur les noms et les règles.

## 1. Les quatre noms, et rien d'autre

| Nom | Ce que c'est | Ce que ce n'est PAS |
|---|---|---|
| **`MeeshyObject`** | l'unité posée sur une scène : `kind` + `anchor` + `plane` + `z` + `transform` + `timing?` + `locale?` + `payload` | pas un fichier ; pas une pièce jointe |
| **`MeeshyScene`** | la surface qui restitue des objets, à un ratio donné, sur trois plans | pas un écran ; pas un éditeur |
| **`MeeshySlide`** | **UNE scène + UNE description** | pas un conteneur de plusieurs scènes |
| **`MeeshyPublication`** | un **profil** (S · R · P · M) + ses slides | pas un brouillon ; pas un post serveur |

```
MeeshyPublication  (profil S | R | P | M)
└── slides: [MeeshySlide]                     1..10
     └── MeeshySlide = MeeshyScene + description
          └── MeeshyScene (ratio)
               └── objects: [MeeshyObject]    plans: background · content · foreground
```

**Réponse à la question posée** : on manipule des `MeeshyObject` posés sur une
`MeeshyScene` ; une `MeeshySlide` **EST** une scène plus sa description — elle ne
la *contient* pas à côté d'autre chose. Une publication est un profil et ses slides.

### Les sept kinds d'objet
`text` · `media` · `sticker` · `audio` · `place` · `drawing` · `mention`
— exactement les `ACTIVE_KINDS` du contrat partagé (`packages/shared/types/canvas-v3.ts:5`).
Aucun kind neuf ne s'invente ici ; en ouvrir un est une décision de contrat.

### Ce qui appartient à la PUBLICATION et non à une scène

Trois choses se posent sur une `MeeshyPublication` et ne sont **jamais** des `MeeshyObject` : son
**lieu** (d'où l'on publie), son **audience**, sa **langue déclarée**. Elles gouvernent ce qui PART,
pas ce qui se voit sur une scène.

La confusion la plus facile est le lieu, parce que le mot est le même des deux côtés :

| | ce que c'est | où ça vit |
|---|---|---|
| le **lieu** de la publication | d'où l'on publie ; gouverne `location` et la découvrabilité | `MeeshyPublication` |
| un `MeeshyObject` de kind `place` | une pastille POSÉE sur une scène, qui décore une image | `MeeshyScene`, plan `foreground` |

Les deux peuvent coexister sur une même publication sans se contredire — l'un décrit l'origine,
l'autre est du contenu. Un composant qui gouverne le premier ne doit jamais être décrit comme
« posant un lieu » : il n'en pose aucun.

### Les trois plans
`background` (le fond : UN visuel, et UN son) · `content` (le porteur) · `foreground` (ce qui se pose dessus, ordonné par `z`).

## 2. La simplification : une slide est TOUJOURS une scène

Il n'existe **pas** deux formes de slide (« un média » d'un côté, « une scène » de
l'autre). Une slide qui ne porte qu'un média est une scène **dont le seul objet est
son fond**. Un utilisateur qui poste une photo ne « crée » jamais une scène : il pose
une photo, et s'il ajoute un texte ou un sticker par-dessus, la scène **était déjà là**.

**Pourquoi cette forme.** Elle tient déjà dans le contrat (« chaque slide est une Scene
du document », planche ligne 1193 ; « une scène projetée en familles v1 EST une slide »,
ligne 562) — donc elle ne coûte aucune migration de fil. Elle supprime une question que
l'utilisateur n'a aucune raison de se poser. Et elle rend vraie, sans cas particulier, la
demande de départ : *une scène doit pouvoir être un seul média présentable dans un réel
ou dans un post.* La complexité se paie dans le code, jamais chez l'utilisateur (loi 11).

## 3. Ce qu'une slide SIGNIFIE dépend du profil

C'est le point le plus important de cette normalisation, et le plus facile à rater :
**le même objet `MeeshySlide` ne veut pas dire la même chose selon le profil.**

| | **Story (S)** | **Réel (R)** | **Post (P)** | **Mood (M)** |
|---|---|---|---|---|
| Une slide EST | **une story entière** | **le réel entier** — le réel EST la scène | **UN média du post** | — |
| Nombre de slides | plusieurs | **1** | plusieurs | 0 |
| Le texte de la slide est | **le contenu** | **le contenu** | **la légende de ce média** | — |
| `content` de la publication | = le texte de sa slide | = le texte de sa slide | **propre au post**, distinct des légendes | le contenu, et lui seul |
| Sortir un média de la scène | **interdit** | autorisé | autorisé | — |

**Conséquence directe sur l'UI** : en profil **P**, la description sous la scène n'est
PAS le `content` du post — c'est la **légende de cette slide**. Le `content` du post est
un champ distinct, au niveau de la publication. En **S** et **R**, les deux se confondent :
il n'y a qu'un texte, celui de la slide.

> Le champ posé par la Phase 2 (`sceneDescriptionField`) est aujourd'hui lié au
> `content` du document. **C'est juste en S/R et faux en P** : en P il doit être la
> légende de la slide courante, et le `content` du post doit avoir son propre logement.

## 4. Poser un média : une seule règle

1. La scène n'a **pas** de fond ⇒ le média posé **devient le fond**.
2. La scène a déjà un fond ⇒ le média posé devient un objet de **premier plan**, au-dessus des précédents.
3. Un **audio** posé devient le **son de fond** s'il n'y en a pas ; sinon un objet audio de premier plan.

Aucune question n'est posée à l'utilisateur. Le placement se déduit de l'état de la scène.

## 5. Un objet de la scène se manipule par appui long

Appui long sur un `MeeshyObject` de la scène ⇒ ses actions, **et elles seules** (loi 4 —
un contrôle existe ssi l'objet l'accepte, le profil l'autorise, et l'action a un effet) :

| Action | Quand elle est servie |
|---|---|
| **Monter** / **Reculer** | objet de premier plan, et au moins un autre objet partage son plan |
| **Modifier** | l'objet a un éditeur (image, vidéo, son) |
| **Sortir de la scène** | profil **≠ Story** — le média quitte la scène et redevient un média du post |

**« Dans la scène » vs « hors de la scène » est la distinction structurante** : un média
dans la scène est un `MeeshyObject` (il a une position, un plan, un z, un temps) ; un
média hors de la scène est une slide à lui seul. Sortir un média de la scène, c'est le
promouvoir en slide ; l'y poser, c'est l'inverse.

## 6. Le chrome de base

```
┌──────────────────────────────────────────────────────────┐
│  ✕      [ Post ▾ ]      ▭ ▭ ▭ ＋              ⋯          │   barre haute
├──────────────────────────────────────────────────────────┤
│                                                          │
│                    la scène courante                     │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  description de la slide (P) / le contenu (S·R)          │
│  [ zone contextuelle — Amorce ou Inspecteur ]            │
│  [ rangée d'outils ]                                     │
│  🌐 Audience            👁            ⬆ Publier          │   socle
└──────────────────────────────────────────────────────────┘
```

La barre haute porte, dans cet ordre : **✕** (fermer) · le **type de publication**
(sélecteur) · le **rail des slides** (vignettes + ajouter) · **⋯** (le reste).
Le rail des slides monte dans la barre haute : c'est là qu'on navigue entre les slides,
pas au milieu du document.

## 7. Correspondance avec ce qui existe

Le vocabulaire est neuf ; les représentations ne le sont pas. Rien à migrer au fil.

| Vocabulaire | Au fil (partagé) | En mémoire iOS (v1, derrière le pont) |
|---|---|---|
| `MeeshyObject` | `ObjectV3` (`packages/shared/types/canvas-v3.ts:37`) | `StoryTextObject` · `StoryMediaObject` · `StoryStickerObject` · `StoryAudioPlayerObject` · `StoryLocationObject` |
| `MeeshyScene` | `CanvasV3.scenes[i]` | `StorySlide.effects` (`StoryEffects`) |
| `MeeshySlide` | une scène + son texte | `StorySlide` |
| `MeeshyPublication` | le document `CanvasV3` + le profil | `StoryComposerViewModel.slides` + le profil |

Le pont existe déjà dans les deux sens : `CanvasV3Migration.swift`
(`CanvasV3.init(migrating:)` / `StoryEffects.init(rendering:sceneIndex:)`), avec un
golden PARTAGÉ comme oracle.

**Le CHROME a son propre inventaire, et il vit dans la planche.** Les quatre noms ci-dessus décrivent
le contenu ; la barre haute, l'éventail, le rail, la rangée d'outils, l'inspecteur, les amorces et le
socle décrivent ce qui l'entoure. Leur table — avec, pour chacun, le niveau du modèle sur lequel il
agit — est dans `planche-meeshy-composer.md` § « Ce que les quatre noms NE couvrent pas ». Ce
fichier-ci reste l'autorité sur les noms du CONTENU ; la planche l'est sur ceux du CHROME.

**Règle de nommage** : tout code NEUF, toute issue, toute chaîne d'UI parlent
`MeeshyObject` / `MeeshyScene` / `MeeshySlide` / `MeeshyPublication`. Les types `Story*`
restent en place comme représentation v1 derrière le pont — les renommer est un chantier
à part, jamais un effet de bord d'un lot de feature.
