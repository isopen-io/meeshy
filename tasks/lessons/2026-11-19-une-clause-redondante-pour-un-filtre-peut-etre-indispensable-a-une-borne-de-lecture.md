## 2026-11-19 — Une clause logiquement REDONDANTE avec un filtre en aval peut être indispensable à la BORNE DE LECTURE (routine messagerie, cycle 183, #19836)

`routes/conversations/utils/list-rank.ts` sert le top-K par rang de
`GET /conversations` en lisant deux flux bornés. La borne du flux « par
activité » portait deux clauses :

```ts
byActivity: [{ lastActivityAt: { lt: bound } }, { lastMessageAt: { lt: bound } }],
```

La seconde est **démontrablement redondante** avec le filtre `isLifted` qui suit :
une ligne dont `lastActivityAt < bound ≤ lastMessageAt` a pour rang son
`lastMessageAt`, donc n'est jamais « remontée », donc `isLifted` l'écarte de toute
façon. L'audit l'a retirée et les **neuf** témoins de rang du dépôt sont restés
VERTS. Ils avaient raison : sur le jeu de lignes qu'ils rendent, le verdict final
est identique.

Elle ne l'est pas pour la **FENÊTRE**. Le flux lit `take: offset + limit` lignes
triées par `lastActivityAt desc`. Sans cette clause, ces K places se remplissent
de lignes de la page 1 — qu'`isLifted` écarte, mais **après** qu'elles ont
consommé la fenêtre. Une ligne réellement remontée de la page 2 en est évincée,
et elle est perdue **pour de bon** : la page suivante borne sur un rang inférieur
au sien.

> **Un filtre en aval corrige une ligne de TROP ; il ne rend pas une ligne qui
> n'a pas été LUE.** La redondance d'une clause de `where` se juge donc sur le jeu
> de lignes RENDU par la lecture, jamais sur le verdict du prédicat qui la suit.
> Devant toute clause qu'on s'apprête à qualifier de redondante, la question est :
> **cette lecture est-elle BORNÉE ?** Si oui, la clause participe au choix des
> candidats, et aucun filtre en mémoire ne peut la remplacer.

C'est la même famille que « un gate qui s'exprime par un PROXY ne couvre pas
forcément tous ses membres » (cycle 114), vue par l'ordre des opérations : ici le
gate est juste et couvre tout — il arrive simplement **après** la troncature.

### Corollaire — un double de test ment aussi par le paramètre qu'il IGNORE

La leçon connue dit qu'un double ment par ce qu'il RÉPOND (`[]` rend tout témoin
de contenu trivialement vert) et par ce qu'il ACCEPTE (un `conversationId` que la
colonne ObjectId refuserait). Troisième forme, mesurée ici : **par ce qu'il
ignore.**

Le moteur du témoin jumeau (`conversation-list-rank-populated-activity.test.ts`)
fixe `skip` à zéro pour le flux B, parce que la production n'en passe pas. Sous
ce double, la mutation « ajouter `skip: offset` au flux B » — qui sert la
MAUVAISE ligne — est **indétectable**, et le compilateur ne la voit pas non plus :
`skip` n'est pas déclaré dans `RankedPagePrisma`, donc son apparition ne casse
aucun type. Le moteur du témoin neuf lit `args.skip ?? 0`.

> Un double qui n'honore qu'une partie des arguments de son collaborateur gèle
> cette partie : la régression qui ajoute l'argument ignoré passe au vert. Un
> double de requête honore donc **tous** les leviers de la requête — `where`,
> `orderBy`, `skip`, `take` — y compris ceux que la production n'utilise pas
> aujourd'hui, qui sont précisément ceux dont l'apparition ne rougit nulle part.

### Corollaire — une jumelle peut vivre dans la MÊME fonction, sous l'autre branche

Les formes connues de « cette entité a-t-elle une jumelle ? » cherchent dans une
autre table, un autre site, un autre moment, un autre médium.
`loadRankedConversationPage` en porte une à **onze lignes** de distance : son
chemin delta trie `[{ updatedAt: 'asc' }, { id: 'asc' }]` et son doc-comment
explique pourquoi (« `id` départage les égalités ») ; son chemin de rang trie
`{ lastMessageAt: 'desc' }` **sans départage**, et sa borne de curseur est une
date nue. Deux conversations de rang identique à la frontière d'une page font donc
perdre la seconde (mesuré, #19881) — alors que la discipline qui l'évite est écrite
dans la même unité, sous l'autre branche du premier `if`.

> Quand une unité porte deux régimes, les comparer l'un à l'autre coûte une
> lecture et attrape ce qu'aucun balayage inter-fichiers ne cherchera jamais :
> **la divergence est intra-fonction, donc invisible à tout outil qui raisonne
> par site.**
