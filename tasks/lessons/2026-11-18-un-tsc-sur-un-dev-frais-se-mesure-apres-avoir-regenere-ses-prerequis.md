## Un `tsc` sur un `dev` fraîchement tiré se mesure APRÈS avoir régénéré ses prérequis (cycle 176, #19525)

*Rien n'a été cassé : la leçon est un défaut ÉVITÉ de justesse, et c'est pour
cela qu'elle vaut d'être écrite — ce piège ne laisse aucune trace quand on tombe
dedans.*

### Ce qui s'est passé

Après la fusion du lot, j'ai tiré `dev` et lancé `tsc --noEmit` dans la
passerelle pour rendre le verdict que la CI n'avait pas rendu. Résultat :
**75 erreurs**, dont une qui avait la forme d'un défaut documenté du dépôt —

```
src/socketio/relationEvents.ts(62,65): error TS2345:
  Type '[any, { userId: string; at: string; }]' is not assignable to
  '[event: "heartbeat:ack", payload: HeartbeatAckEventData]'
```

`emitBlockedByMe` calcule son nom d'événement par un ternaire
(`params.blocked ? USER_BLOCKED_BY_ME : USER_UNBLOCKED_BY_ME`), et le
`CLAUDE.md` du gateway consacre une section entière à cette forme : « un nom
calculé est une union », « le `switch` est le seul moyen de CORRÉLER ». L'erreur
nommait même un événement ÉTRANGER (`heartbeat:ack`), ce que cette section
décrit comme la signature de l'effondrement de l'union.

Tout concordait. J'étais à un pas de corriger le code d'un lot qu'une autre
session venait de fusionner, et d'ouvrir une issue « `dev` ne compile plus ».

**Les 75 erreurs étaient à moi.** Le client Prisma et le `dist` de
`packages/shared` de mon conteneur dataient d'avant les cinquante-quatre commits
que `dev` venait de recevoir — d'où, dans la même liste,
`Property 'communityJoinRequest' does not exist on type 'PrismaClient'` et
`has no exported member 'communityEntryStatsSchema'`. Après
`npx prisma generate --generator client` et `bun run build` dans
`packages/shared` : **`tsc` EXIT=0, zéro erreur.** Le ternaire est juste dès que
les types du contrat sont à jour.

### La règle

**Un `tsc` ou une suite lancés sur un arbre qu'on vient de tirer ne mesurent
rien tant que les artefacts GÉNÉRÉS n'ont pas été refaits.** Deux commandes, que
le `CLAUDE.md` racine écrit déjà comme prérequis de parité :

```bash
cd packages/shared && npx prisma generate --generator client
cd packages/shared && bun run build
```

Le hook de démarrage de session en lance une — **à l'ouverture de la session**,
donc contre le schéma de ce moment-là. Plusieurs heures et cinquante-quatre
commits de `dev` plus tard, elle ne dit plus rien.

### Pourquoi le piège est bon

**L'erreur était plausible et bien documentée.** Elle tombait pile dans une
famille que le dépôt décrit, nomme et sait corriger. Plus une erreur ressemble à
un défaut connu, moins on interroge l'instrument qui la rend.

**Le volume rassure dans le mauvais sens.** 75 erreurs se lisent comme « la base
est cassée », pas comme « mon environnement est périmé » — alors que c'est
l'inverse : un défaut réel fraîchement fusionné en produirait UNE ou DEUX, pas
soixante-quinze étalées sur des modules sans rapport.

**Les erreurs HÉTÉROGÈNES étaient le signal, et je les avais sous les yeux.**
`communityJoinRequest` absent du client Prisma et `communityEntryStatsSchema`
absent de `api-schemas` ne sont pas des erreurs de LOGIQUE : ce sont des erreurs
de GÉNÉRATION. Deux familles d'artefacts périmés dans la même liste nomment la
cause.

> **Avant d'accuser un arbre, demander ce que mon arbre a de PÉRIMÉ.** Et devant
> une liste d'erreurs, trier par NATURE avant de lire la première : une erreur
> de génération (`Property X does not exist on PrismaClient`, `has no exported
> member`) accuse l'environnement ; une erreur de logique accuse le code.
> Mêlées, les premières expliquent les secondes.

### Corollaire : ne pas « réparer » le lot d'une autre session sur cette foi

Le correctif que j'allais poser — un `switch` à la place du ternaire — est la
forme que le dépôt prescrit, et il aurait compilé. Il aurait aussi réécrit sans
raison le code de quelqu'un d'autre, fusionné vingt minutes plus tôt, en
laissant derrière un commit qui affirme avoir corrigé un défaut qui n'existait
pas. **Un correctif juste posé sur un diagnostic faux est une dette qui a l'air
d'un gain.**

### Et la garde du journal l'a rattrapé une seconde fois

La première rédaction de ce fichier commençait par `# ` et portait cinq
sous-titres `## `. `journal-one-file-per-entry-guard` (#7711) exige qu'un
fichier du dossier soit UNE entrée : première ligne en `## `, et **un seul**
titre `## ` hors bloc de code. Elle est tombée en CI, sur une PR d'un seul
fichier Markdown — la forme la plus inoffensive qui soit.

> Une leçon sur « mesurer avant d'affirmer » livrée sans faire tourner le gate
> du dossier où elle se pose est la même faute, un cran plus bas. **Un fichier
> ajouté à un dossier GARDÉ se vérifie contre sa garde, quel que soit son
> contenu.**
