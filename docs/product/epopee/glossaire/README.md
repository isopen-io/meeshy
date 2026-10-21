# Les glossaires de l'épopée et leur lexique machine

> Conception : `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` (§ 3.1, § 3.4, § 4, § 10). Issue : #11173.

Chaque langue du jeu a deux documents, qui disent la même chose à deux lecteurs :

| Fichier | Lecteur | Ce qu'il porte |
|---|---|---|
| `docs/product/epopee/glossaire/<langue>.md` | la personne qui écrit ou traduit | le récit, les deux voix, les concepts, les mots bannis et ce qui les remplace, les exemples |
| `packages/shared/design/game-epic-vocabulary/<langue>.json` | les gardes (web, iOS) | les motifs bannis et les noms canoniques, sous une forme qu'un test sait appliquer |

Le glossaire `.md` fait foi pour le SENS ; le `.json` en est la projection vérifiable. Une règle qui entre dans l'un entre dans l'autre, dans le même commit. Le français est la source : `fr.md` et `fr.json`. Les six autres langues (`en`, `es`, `de`, `it`, `pt`, `ar`, lot B #11174) traduisent ces deux fichiers terme pour terme. Le nom du fichier est le code de langue de l'interface web (`SUPPORTED_INTERFACE_LANGUAGES` : `pt`, pas `pt-BR`).

## Le format de `<langue>.json`

```json
{
  "$doc": "une phrase : ce que le fichier est et d'où il vient",
  "language": "fr",
  "banned": [
    {
      "pattern": "(?<![\\p{L}\\p{N}])dettes?(?![\\p{L}\\p{N}])",
      "flags": "iu",
      "instead": "« une ombre voile N étincelles de ta lumière » (l'Ombre)",
      "keys": ["game.league."],
      "except": ["game.rules."]
    }
  ],
  "names": {
    "game.tier.etincelle": "Étincelle"
  }
}
```

### `language`

Le code de la langue, égal au nom du fichier : `fr.json` porte `"language": "fr"`. Un fichier par langue.

### `banned` : ce qu'aucune valeur ne dit

Chaque entrée est un motif qu'AUCUNE valeur des catalogues du jeu ne doit porter.

- **`pattern`** : une expression régulière JavaScript, sans délimiteurs. Les paramètres `{…}` d'une valeur sont retirés avant la recherche : `{record}` est un nom de paramètre, pas un mot affiché.
- **`flags`** : parmi `i`, `m`, `s`, `u`. Le plus souvent `iu`. On retire le `i` quand la casse porte le sens : `trésor` en minuscule est le concept (banni, il devient l'Héritage), `Trésor` avec sa majuscule est la cinquième réserve (gardée).
- **Les limites de mot** : `\b` ne connaît que l'ASCII, et il se trompe sur « é », « ç » ou l'arabe. On écrit `(?<![\p{L}\p{N}])` avant le mot et `(?![\p{L}\p{N}])` après, avec le drapeau `u`. Les regards en arrière restent de LONGUEUR FIXE (`(?<!d[’'])`, jamais `(?<!fragments?\s+d’)`) : le moteur ICU de la garde iOS refuse les autres.
- **`instead`** : ce qui remplace le mot, tel que le glossaire le dit. La garde l'affiche dans son message d'échec.
- **`keys`** (facultatif) : un préfixe de clé, ou une liste de préfixes. Le motif ne s'applique qu'aux clés qui commencent par l'un d'eux. Sans `keys`, il s'applique partout. Exemple : « rang » n'est banni que dans les textes de la joute (`game.league.`, `game.state.league.`…), parce qu'ailleurs le rang est le nom du héros.
- **`except`** (facultatif) : une liste de préfixes (une clé entière en est un) que le motif épargne. Exemple : « étape » est banni dans `game.` sauf dans `game.guide.step_of` et `game.rules.section_steps`, qui comptent les étapes de l'accueil, le seul sens qui reste au mot ; « prix de base » est épargné dans `game.rules.`, où le calcul a sa place.

On formule un motif pour qu'il ne prenne QUE le sens banni : un faux positif pousse à affaiblir la garde, et une garde affaiblie ne garde plus rien. Avant d'ajouter un motif, on le lance sur les catalogues de la langue et on lit chaque valeur qu'il prend.

### `names` : ce que chaque nom dit, au caractère près

Un objet `clé → nom canonique`. L'identifiant d'un concept est la clé de catalogue qui porte son nom : ces clés `game.*` sont les mêmes sur le web et dans `Localizable.xcstrings` d'iOS, et elles ne changent jamais (§ 3.4). La valeur est le nom exact dans la langue du fichier, apostrophe typographique (’) comprise.

Le français nomme : les vingt états de la lumière (`game.tier.*`), les onze rangs (`game.rank.*`), les six contenants de l'Héritage (`game.treasury.*`), les cinq formes de la Flamme (`game.flame.form.*`), les huit cercles de la joute (`game.league.name.*`), les trois éditions de la Meesh (`game.edition.*`), les quatre actes du rêve (`game.difficulty.*`), les sept matières des médailles (`game.material.*`), les noms des concepts de Progression et du carnet des règles (`game.concept.*.name`, `game.rules.concept.*.name`), et les titres des portes et des cadres (`game.chest.title`, `game.notebook.page_title`, `game.gauge.*`…).

## Les gardes qui lisent ces fichiers

- **Web** : `apps/web/src/lib/game/epic-vocabulary.test.ts`. Elle lit TOUS les `packages/shared/design/game-epic-vocabulary/*.json` présents ; une langue entre sous la garde en posant son fichier. Pour chaque langue, elle fusionne les catalogues du jeu (le catalogue `game.*` entier, ses quatre parties, la pastille d'engagement `catalog-<langue>-engagement.ts`, l'accueil `catalog-onboarding-<langue>.ts`) et vérifie qu'aucune valeur ne porte un motif banni et que chaque clé de `names` existe et porte son nom canonique. Une clé de `names` absente du catalogue est un défaut : elle a été renommée ou retirée, et le lexique doit suivre.
- **iOS** (lot G, #11179) : la même lecture, sur les clés `game.*` de `apps/ios/Meeshy/Localizable.xcstrings` et les `defaultValue` du jeu. Elle reprend le format tel quel : `NSRegularExpression` comprend `\p{L}`, les regards de longueur fixe et les drapeaux `i`, `m`, `s` (le `u` y est implicite). Côté iOS, une clé de `names` que l'app ne porte pas (une clé propre au web) est ignorée, jamais ajoutée.

## Ajouter une langue

1. Traduire `fr.md` en `<langue>.md`, terme pour terme.
2. Écrire `<langue>.json` : les mêmes clés dans `names`, les noms de la langue ; les motifs de la langue dans `banned` (on ne traduit pas les expressions françaises, on bannit les mots comptables de la langue : « record », « counter », « debt »…).
3. Lancer la garde web : elle couvre la langue dès que le fichier existe. Corriger chaque valeur qu'elle signale, ou affiner le motif qui a pris un faux sens.
