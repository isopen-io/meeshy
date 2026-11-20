## 2026-11-20 — Une assertion qui DÉRIVE son attendu de la chose testée devient vacue sous la mutation même qu'elle vise (routine messagerie, cycle 185, #19904)

Témoin censé garder que le flux « par activité » ne lit que les lignes qui en
portent une :

```ts
expect(JSON.stringify(filtres)).toContain(JSON.stringify(stream.where).slice(1, -1));
```

Il passe. Il passe aussi sous la mutation qu'il prétend garder — `stream.where`
ramené à `{}` : `JSON.stringify({})` vaut `'{}'`, la tranche rend la chaîne
**VIDE**, et `toContain('')` est vrai de n'importe quoi. Mesuré : 0 échec sur 8.

> **Un attendu DÉRIVÉ de la source qu'on teste suit la source dans sa chute.**
> Quand la dérivation est une projection qui peut s'effondrer proprement — une
> tranche, un `join`, un `.map().filter()`, un `Object.keys()` — elle ne produit
> pas une erreur mais une valeur NEUTRE, et une valeur neutre dans un matcher
> d'inclusion est toujours satisfaite. Le témoin est le **SECOND site** : il
> épingle en toutes lettres, et c'est à lui de rougir quand le premier change
> d'avis.

Ce n'est pas la leçon « un témoin qui ne peut pas tomber » sous une autre forme :
celui-ci POUVAIT tomber, et il tombait bien sur d'autres mutations. Il ne tombait
pas sur **celle-là**, et précisément parce qu'elle était celle qu'il visait.

### Comment on le trouve, et comment on ne le trouve pas

Pas en relisant. En **exécutant** la mutation. Mon protocole — muter chaque site
séparément plutôt que demander « le lot tombe-t-il ? » (leçon du cycle 184) — l'a
rendu visible au premier coup : trois mutations, deux rouges, une verte. Sans ce
protocole, le témoin serait parti vert, et aurait certifié la règle qu'il ne
gardait pas.

### Corollaire — un contrat porté par la POSITION dans un tableau ne rougit nulle part

`rankStreams()` rend `[fluxParMessage, fluxParActivite]`. Un consommateur qui les
PARCOURT (c'est le cas de `highestRanked`) n'a pas d'opinion sur l'ordre ; un
consommateur qui les DISTINGUE — la liste paginée lit le premier en lignes
complètes avec `skip`, le second en clés seules — en aurait fait un contrat que
rien n'énonce. Inverser les deux lignes du tableau aurait donné à la liste le
mauvais flux sans qu'une compilation tombe.

> Quand deux éléments d'une collection ont des RÔLES distincts chez un
> consommateur, ils se nomment. `rankStreamByMessage()` / `rankStreamByActivity()`,
> et `rankStreams()` qui en dérive : la garde n'est pas un témoin, **c'est le
> nom**. Un témoin d'identité (« le flux 0 trie bien sur `lastMessageAt` ») aurait
> gardé la même chose en laissant le piège armé.

### Corollaire — devant une garde de TYPE qui refuse votre appel, normaliser au bord plutôt que relâcher le type

`outranks` exige un `RankedConversationRow` dont les trois colonnes sont
REQUISES, et son doc-comment dit pourquoi : un `select` qui en oublie une rend un
rang faux sans que rien ne rougisse. `ListRankRow` les déclare optionnelles, donc
l'appel ne compile pas.

Relâcher le type partagé aurait coûté la garde **à tous ses appelants** pour
satisfaire un seul. La normalisation au bord (clé absente ⇒ `null`, ce que Prisma
fait déjà) la laisse entière. Et l'écart était de HARNAIS, pas de production :
les témoins construisent des DOCUMENTS Mongo, où une clé jamais écrite est
absente et non nulle.

### Et deux sites qui s'ACCORDENT ne sont pas un site unique

Le cycle précédent avait écrit que les deux lecteurs du rang « convergent plutôt
qu'ils ne divergent ». Vrai du CONTENU, faux de la STRUCTURE : ils disaient la
même chose par deux affirmations indépendantes — l'état exact d'une jumelle juste
le jour où on l'écrit. **« Ils sont d'accord » est une mesure datée ; « il n'y a
qu'un site » est une propriété.** Le lot ne se termine pas quand les deux
s'accordent, mais quand l'un des deux a disparu.
