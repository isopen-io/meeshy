## Un balayage à l'échelle du FICHIER mesure la popularité d'un idiome, pas une propriété du site qui sert (#19977)

*2026-11-20, #19977. Pas de numéro de cycle : il s'alloue dans un espace de noms partagé, et un identifiant qui ne s'alloue pas ne collisionne pas (#5102).*

### Le motif

Le dépôt connaît déjà la forme générale — « un balayage qui cherche UN idiome
mesure sa popularité » (cycle 107, balayage JETÉ plutôt que gelé). Ce cycle en
mesure la variante la plus facile à commettre : **le bon idiome, cherché au
mauvais GRAIN.**

#19977 demandait un cliquet appariant « producteur de `message:edited` portant
`attachments` » × « interroge un plan signé ». Ma première rédaction cherchait
les deux dans le même FICHIER. Elle était verte sur le défaut qu'elle est écrite
pour attraper :

```
$ grep -cP '\breaderSignedPlan[A-Za-z]*\s*\(' MeeshySocketIOManager.ts   # AVANT le correctif
1
$ grep -cP '\bofflineSigned[A-Za-z]*\s*\('     MeeshySocketIOManager.ts
1
```

Les deux appels existaient bel et bien — trois cents lignes plus haut, dans
`_broadcastNewMessage`, pour `message:new`. Le fichier « consultait un plan ».
L'unité qui servait l'édition, non.

### La règle

**Le grain d'une garde est l'unité qui SERT, jamais le fichier qui la
contient.** Un fichier est une unité de RANGEMENT ; la propriété gardée — « ce
site a interrogé le plan avant de remettre cette adresse » — est une propriété
d'un chemin d'exécution. Les deux ne coïncident que dans les fichiers d'une
seule responsabilité, c'est-à-dire précisément ceux où le cliquet ne sert à
rien.

La forme outillée tient en une fonction : depuis l'index du site fautif, remonter
la pile des accolades ouvertes jusqu'à la première dont la ligne d'ouverture est
une tête d'UNITÉ (et non un `if (…) {`, qui a la même forme et réduirait la
fenêtre à la branche qui émet, où le plan calculé plus haut ne figure pas). La
fenêtre se trompe alors du côté TROP LARGE — jamais de celui qui ferait passer
un site pour gardé.

### Ce qui l'a attrapé, et c'est la part reproductible

Rien dans l'écriture du balayage. Il est passé au vert du premier coup, sur un
dépôt réparé, et je l'aurais livré.

Ce qui l'a attrapé est une mesure que j'ai faite pour le COMMIT, pas pour le
code : *« ce cliquet aurait-il rougi sur l'arbre d'AVANT ? »* — répondue en
reconstruisant l'arbre d'avant (`git show origin/dev:…` dans un `srcRoot`
jetable) et en y lançant le balayage.

> **Un cliquet neuf se livre avec la preuve qu'il ROUGIT sur le défaut qui l'a
> motivé, mesurée sur l'arbre d'AVANT.** « Il est vert sur le dépôt réparé » est
> une phrase que rend aussi bien un cliquet qui ne regarde rien. C'est la règle
> « toujours prouver le ROUGE » (CLAUDE.md § Tests) appliquée à l'outil plutôt
> qu'au témoin — et elle est plus chère à oublier, parce qu'un cliquet aveugle
> ne rougira jamais et se lira comme une garantie pendant des mois.

Et la preuve se RANGE : la fixture négative du cliquet reproduit la forme exacte
du défaut dans un fichier qui, ailleurs, consulte un plan pour un autre
événement. Sans ce voisinage, la fixture passerait aussi sous le balayage par
fichier — elle n'attesterait rien du choix de grain.

### Le corollaire d'énumération, troisième récidive

#9646 a fermé le transport REST en annonçant les transports d'édition ; #19939 a
fermé le transport socket en annonçant qu'il y en avait DEUX ; son audit a rendu
TROIS. Recomptés au 2026-11-20 : **quatre chemins d'émission, six sites de
composition** — et le doc-comment de `messageEditedPayload.ts`, la « source
unique » de ce noyau, écrivait « TROIS producteurs » en nommant la PORTE REST là
où la composition a lieu dans trois fichiers de routes, et en omettant
entièrement la ligne d'arrivées du salon global.

Le compte faux n'était pas dans un journal : il était dans le doc-comment que
chaque lot ouvre avant de toucher à l'événement. **Un compte écrit à l'endroit
le plus autorisé est celui qu'on recompte le moins.**

### Et le correctif de grain était lui-même à l'échelle du fichier, DEUX FOIS SUR CINQ

L'audit adversarial a remesuré le cliquet « réparé » et rendu ceci :

```
routes/conversations/messages-advanced-edit.ts:546  whole=false
routes/messages-writes.ts:455                       whole=false
socketio/callSummaryEditedDelivery.ts:93            whole=TRUE
socketio/handlers/MessageHandler.ts:1027            whole=TRUE   ← 2 265 lignes
```

La cause tient en une ligne : la tête d'unité était cherchée sur la LIGNE qui
porte l'accolade ouvrante (`\([^;]*\)\s*…\{\s*$`), et un paramètre-objet
multi-lignes — l'idiome DOMINANT du dépôt, celui de toutes les unités que ce
lot écrit — ferme son `{` sur `}): Promise<void> {`, une ligne sans aucune `(`.
Aucune tête ne matchait, la pile se vidait, et la fenêtre devenait le fichier.

> **Changer de grain ne suffit pas : il faut mesurer le grain qu'on obtient.**
> J'avais la bonne idée (l'unité), la bonne preuve (rouge sur l'arbre d'avant)
> et un instrument qui, sur deux sites réels, rendait exactement la mesure que
> je revendiquais avoir éliminée. La preuve de ROUGE ne l'a pas vue parce
> qu'elle ne porte que sur le VERDICT, et le verdict était juste par accident :
> le fichier fautif ne consultait de plan nulle part, donc « fichier » et
> « unité » rendaient le même « both ».

**Ce qui l'aurait attrapé, et qui est la règle à retenir : publier la MESURE
INTERMÉDIAIRE, pas seulement le verdict.** Un balayage qui décide d'une fenêtre
doit pouvoir dire QUELLE fenêtre il a prise — ici un champ `wholeFile`, promu
depuis en constat à part entière (`missing: 'unresolved-unit'`), parce qu'une
unité qu'on n'a pas su délimiter n'est ni gardée ni dispensée : c'est une panne
de l'instrument, et se taire dessus est la pire des trois réponses.

### Deux autres façons dont le même cliquet dispensait en silence

- **`DELEGATES` matchait la DÉFINITION autant que l'appel** : le fichier qui
  porte `export async function deliverCallSummaryEdit(` s'exemptait lui-même.
- **`blankComments` prenait un `/*` à l'intérieur d'une CHAÎNE pour un
  commentaire** : mesuré, quatorze chaînes de `services/gateway/src/` (des
  chemins de route comme `'/api/attachments/file/*'`) ouvraient un faux bloc,
  **612 lignes de code réel effacées**. Impact nul ce jour-là, et la direction
  de l'erreur exactement inverse de ce que le module revendique : elle DISPENSE.
  Un dépouilleur de commentaires est un AUTOMATE, pas une expression régulière.

### La forme générale, qui vaut au-delà de ce cliquet

Un balayage rend trois choses, et on n'en publie souvent qu'une :

| ce qu'il rend | vérifié d'habitude |
|---|---|
| le VERDICT (qui est fautif) | oui — c'est le test |
| la PORTÉE (qui a été regardé) | parfois — un plancher de couverture |
| la FENÊTRE (à quelle échelle on a regardé) | **presque jamais** |

La troisième est celle qui décide si les deux premières veulent dire quelque
chose. Et elle est invisible tant qu'on ne la nomme pas : rien dans un
inventaire vide ne distingue « rien n'est fautif » de « j'ai regardé le mauvais
objet ».

