## Leçon 453 — Avant de balayer les sites d'une somme, demander s'il existe un VÉRIFICATEUR : la même journée, le même dépôt, deux réponses opposées

En ajoutant `TimelineClipKind.place` (#4840), une session voisine m'a mis en
garde, sur la foi de deux défauts de la semaine :

> Quand tu ajoutes un cas à une somme, cherche les cascades qui l'énumèrent en
> `removeAll {}` et en fermetures de mutation, pas seulement en `first(where:)`
> — c'est exactement là que la pastille de lieu est devenue ineffaçable (#4758)
> et que `bringForward`/`sendBackward` ont cessé de la classer (#4759).

L'avertissement est juste, et il ne s'appliquait pas. La différence n'est pas le
soin qu'on met à chercher : **c'est qu'un vérificateur existait d'un côté et pas
de l'autre.**

| | `MeeshySceneObject` (#4758, #4759) | `TimelineClipKind` (#4840) |
|---|---|---|
| forme de la somme | énumérée par des CASCADES (`first(where:)`, `firstIndex`, `removeAll`) | énumérée par des `switch` EXHAUSTIFS, somme fermée dans le module |
| qui trouve les sites | **personne** — une cascade incomplète compile, s'exécute, rend `nil` | **le compilateur** : 19 erreurs `switch must be exhaustive`, une par site |
| ce que le balayage manuel coûte | obligatoire, et il rate ce qu'on n'a pas nommé | inutile — et il aurait raté 8 des 19 |

Huit des dix-neuf sites étaient dans des `switch` composés de tables ou de cas
groupés (`case .text, .sticker:`) qu'aucune requête sur `.sticker` n'aurait
rendus dans le bon ordre. Le compilateur, lui, les a donnés un par un, avec leur
ligne, et il a refusé de s'arrêter avant le dernier.

> **La première question devant une somme à élargir n'est pas « où sont les
> sites ? » mais « qu'est-ce qui, ici, refuse de compiler tant qu'il en reste
> un ? ».** S'il existe une réponse, la suivre exhaustivement et ne balayer
> RIEN. S'il n'y en a pas — cascade, table, `default:`, énumération traversant
> un module à évolution de bibliothèque —, le balayage manuel est obligatoire et
> il est le seul filet.

Corollaire de conception, plus utile encore que la règle : **cette différence se
choisit.** `MeeshySceneObject` pourrait faire refuser la compilation là où il
rend `nil` ; c'est un travail d'exhaustivité, pas une fatalité de langage. Un
`switch` exhaustif écrit à la place d'une cascade est un vérificateur qu'on
s'offre pour tous les lots à venir — `clipTransform(id:)` l'a fait au #4591, avec
exactement ce commentaire : « le `switch` exhaustif ne change aucun comportement
— il rend la décision visible, et oblige une sixième famille à la prendre ».
