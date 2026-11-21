## 2026-11-19 — Un témoin qui MARCHE page par page pose la question de la frontière ; un témoin qui demande UNE page ne la pose jamais (routine messagerie, cycle 184, #19881)

Neuf témoins de rang gardaient `GET /conversations` — la route la plus chaude du
produit — et aucun ne voyait que **deux conversations de rang identique à la
frontière d'une page font perdre la seconde**, définitivement (la page suivante
borne sur un rang inférieur au sien ; la ligne ne revient qu'à la réconciliation
complète du client, 24 h).

Le défaut n'a pas été cherché. Il s'est présenté en écrivant, pour un AUTRE lot
(#19836, la fenêtre des deux flux), un témoin qui marche page par page à
`limit: 1` : la question « et deux lignes de rang IDENTIQUE ? » est devenue
inévitable dès que le témoin a eu à calculer une borne depuis la ligne qu'il
venait de servir.

> **La forme d'un témoin décide des questions qu'on se pose en l'écrivant.**
> Un témoin qui demande UNE page vérifie un contenu ; un témoin qui MARCHE
> vérifie une transition, et une transition a des cas limites qu'il faut nommer
> pour pouvoir écrire l'assertion suivante. Devant une pagination, écrire la
> marche complète — même quand le défaut visé n'est pas à la frontière.

### Corollaire — prouver le ROUGE SITE PAR SITE, jamais « le lot tombe-t-il ? »

Le correctif touchait trois sites qui doivent s'accorder (la borne, les deux
`orderBy`, la fusion). Le témoin écrit pour le défaut tombait — donc le lot avait
l'air prouvé. Muté site par site :

| mutation | verdict |
|---|---|
| la borne retombe sur le rang nu | 3 échecs |
| l'ordre du flux A sans `id` | 2 échecs |
| **l'ordre du flux B sans `id`** | **0 échec** |
| **la fusion sans départage** | **0 échec** |

Deux changements de production n'étaient défendus par **aucune mesure**, et le
témoin vert les couvrait. Deux témoins de plus ont été écrits pour eux.

> « Le témoin du lot tombe » répond *une partie est gardée*. La question est
> **laquelle**, et elle se répond en mutant chaque site SÉPARÉMENT. Un lot à
> N sites demande N mutations, pas une.

### Corollaire — un double de test ment aussi par ce qu'il IGNORE

Les deux formes connues : un double ment par ce qu'il RÉPOND (`[]` rend tout
témoin de contenu trivialement vert) et par ce qu'il ACCEPTE (un id que la
colonne refuserait). Troisième forme, mesurée ici.

Les quatre doubles des suites de rang divergeaient sur ce qu'ils honorent, et
celui de `populated-activity` fixait `skip` à zéro pour le flux « par activité »
— la production n'en passe pas. Sous ce double, la mutation « ajouter
`skip: offset` au flux B », qui sert la MAUVAISE ligne, était **indétectable** ;
et `skip` n'étant pas déclaré dans le type du collaborateur
(`RankedPagePrisma`), le compilateur ne la voyait pas davantage.

> Un double qui n'honore qu'une partie des arguments de son collaborateur GÈLE
> cette partie. Un double de requête honore donc **tous** ses leviers — `where`,
> `orderBy`, `skip`, `take` — y compris ceux que la production n'utilise pas
> aujourd'hui, qui sont précisément ceux dont l'apparition ne rougit nulle part.

Réparation : un moteur UNIQUE pour les cinq suites
(`__tests__/helpers/list-rank-engine.ts`), et non quatre doubles corrigés.

### Corollaire — une strictesse de harnais se MESURE avant d'être gardée

Ce moteur JETAIT d'abord sur une clé d'`orderBy` qu'aucune ligne ne porte, pour
qu'un tri sans effet ne rende pas un témoin vert. L'intention est juste et la
garde était **fausse** : le flux B trie sur `lastActivityAt` même quand pas une
ligne ne la porte — l'état de TOUTE conversation avant #19800, et ce qu'une des
suites exerce exprès. Elle transformait un cas de PRODUCTION en échec de
harnais.

> Une garde de harnais s'instruit comme une garde de production : contre ce que
> la production FAIT, pas contre ce qu'on trouve propre. Et quand on la retire,
> on écrit pourquoi — sans quoi la prochaine session la repose.

### Et la jumelle vivait sous l'autre branche du premier `if`

`loadRankedConversationPage` ouvre sur son chemin delta, qui trie
`[{ updatedAt: 'asc' }, { id: 'asc' }]` **et dont le doc-comment explique que
« `id` départage les égalités »**. Le chemin de rang, onze lignes plus bas, ne
l'a jamais reçu.

> Les formes connues de « cette entité a-t-elle une jumelle ? » cherchent dans
> une autre table, un autre site, un autre moment, un autre médium. Celle-ci est
> **intra-fonction** : invisible à tout outil qui raisonne par site, et portée
> par la branche qu'on lit EN PREMIER. Quand une unité porte deux régimes, les
> comparer l'un à l'autre coûte une lecture.

### Enfin, le correctif n'a rien coûté en contrat

`beforeCursor` EST un `Conversation.id` : `resolveListCursor` le lit, l'autorise
dans le scope du lecteur, puis **n'en garde que le rang**. L'information
manquante était jetée une ligne avant d'être utile — ni format de curseur à
changer, ni rétrocompatibilité à instruire. Devant un défaut de pagination,
demander d'abord **ce que le curseur tient déjà**.

Et `?? null` sur cet id n'est pas une politesse : **Prisma IGNORE un champ
`undefined`**, donc `{ id: { lt: undefined } }` apparierait TOUT et la branche de
départage admettrait la page précédente en entier. Un id absent retombe sur la
borne stricte — qui perd le départage et jamais la borne.
