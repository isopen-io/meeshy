## 2026-08-23 — Une CI verte qui n'a rien exécuté, et une garde qui rougit sur du code correct (238i)

Deux leçons du même run, toutes deux sur la **fiabilité du signal** plutôt que
sur le code.

### 1. Lire le NOM du check, pas seulement sa couleur

Le premier run de la PR 238i est revenu **tout vert** — et n'avait exécuté
aucun test iOS. Le job `ios-tests` est nommé DYNAMIQUEMENT (`ios.yml:250`) :
`Build app + tests unitaires` quand la suite tourne, `Build app (app + cibles de
test)` quand elle ne fait que compiler. La suite est en **opt-in** : poussée
réelle sur `main`, `workflow_dispatch`, ou `smoke test|run test|to test` dans le
**SUJET** du commit de tête — le corps ne compte pas.

Le lot dont l'apport tenait à **une garde neuve et une suite réécrite** allait
être annoncé vert sans qu'aucun des deux n'ait tourné. C'est la « suite verte
par omission » de la leçon 236i, par un autre chemin : non plus le pbxproj mais
la portée du run.

- **Avant d'annoncer « CI verte », vérifier que le check a fait ce que son nom
  promet.** Un projet qui nomme ses jobs dynamiquement le fait précisément
  parce que la distinction compte.
- **Un lot dont la valeur EST un test doit forcer l'exécution de ce test.**
  Amender le sujet du commit (même arbre, force-push sur sa propre branche)
  n'est pas un commit vide : c'est le mécanisme documenté du dépôt.

### 2. Une fenêtre en NOMBRE DE CARACTÈRES est une bombe à retardement

`test_statRing_isSingleVoiceOverElement_withLabelAndValue` a rougi alors que le
code de production la satisfaisait toujours. La garde découpait le corps de la
struct avec `prefix(2600)` ; un doc-comment ajouté plus haut a déplacé le motif
de l'offset 2411 à 2595, et comme le motif fait 30 caractères, sa **FIN** est
passée hors fenêtre.

**La marge résiduelle sur `main` était de 5 caractères.**

- **Une garde qui rougit sur du code correct est le PIRE mode d'échec possible** —
  pire qu'un faux vert, parce qu'elle envoie corriger ce qui n'est pas cassé,
  et qu'elle entraîne à se méfier des gardes.
- **Borner une garde de source SÉMANTIQUEMENT** (jusqu'à la déclaration
  suivante), jamais par un nombre. Une borne sémantique n'a pas de marge à
  épuiser.
- **Ne pas « faire rentrer » son code dans la fenêtre.** C'était la correction
  tentante ici : raccourcir le commentaire. Elle réarme le piège avec ENCORE
  MOINS de marge, pour le prochain qui touchera la struct.
- **Élargir une borne exige de prouver qu'on ne crée pas de faux vert.** Ici la
  struct suivante (`ArcGauge`) porte le même `.accessibilityElement(children:
  .ignore)` : sans borne elle satisferait les assertions à la place de
  `StatRing`. D'où un test dédié qui vérifie la borne dans les deux sens.
