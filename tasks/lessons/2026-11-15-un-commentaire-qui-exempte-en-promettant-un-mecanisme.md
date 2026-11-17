## Un commentaire qui EXEMPTE en promettant un mécanisme se vérifie en suivant le mécanisme (cycle 172, #18617)

*2026-11-15.*

### Le fait

`POST /links/:identifier/messages` — la seule surface d'envoi de message qui
contourne `MessageProcessor.saveMessage` — écrivait en base sans aucune des
trois couches d'idempotence du dépôt. Elle en était dispensée par ceci, posé
juste au-dessus de son `create` :

```ts
// Pas de catch-P2002 ici (chemin anonyme simple) — un retry serveur
// produit le même cid donc Prisma renvoie une 409 que la couche
// Fastify mappe en réponse 409 Conflict côté client.
```

Mesuré, les trois moitiés de la phrase sont fausses au même endroit : le `create`
vit dans le `try` du gestionnaire, dont la branche terminale est
`sendInternalError` ; **aucun mappeur Fastify n'est atteint** ; et le bloc
`response:` de la route ne déclare même pas de 409. Le `clientMessageId` étant
OBLIGATOIRE sur cette surface, le conflit n'était pas un cas limite mais le
verdict **garanti** d'un renvoi — et ce verdict était **500**.

### Pourquoi celui-là est plus coûteux qu'un commentaire simplement faux

La leçon du cycle 94 dit qu'un commentaire qui ÉNONCE une contrainte est une
affirmation. Celui-ci fait autre chose, et c'est pire : il **nomme un
mécanisme** — « Prisma renvoie », « la couche Fastify mappe » — et il s'en sert
pour **exempter le site d'une règle**.

Une affirmation invite à vérifier un fait. Une exemption motivée invite à ne pas
regarder : elle a déjà répondu à la question « pourquoi cette surface n'a-t-elle
pas la garde des autres ? ». Et sa plausibilité est son camouflage — un mappage
d'erreur Prisma → statut HTTP est une chose qui EXISTE dans beaucoup de dépôts,
donc la phrase se lit comme un rappel d'architecture et non comme une
hypothèse.

> **La question à poser à un commentaire qui exempte n'est pas « est-ce
> plausible ? » mais « où est ce mécanisme ? ».** Elle se répond en SUIVANT le
> chemin qu'il décrit — ici : quelle branche attrape, quel mappeur transforme,
> quel statut le schéma déclare — jamais en jugeant la phrase. Les trois
> vérifications coûtent trois `grep` ; l'exemption a tenu toute la vie de la
> route.

Corollaire de recherche : **une exemption se cherche là où une règle est
PARTAGÉE par plusieurs surfaces.** Compter les surfaces qui appliquent la règle
et les comparer à celles qui devraient — ici trois couches d'idempotence sur un
transport, zéro sur l'autre — est ce qui fait apparaître la quatrième.

### Corollaire : un piège ARMÉ se reconnaît à son binding client déjà livré

Aucun client de première partie ne POSTe sur cette route : le web passe par
`/conversations/:id/messages`, iOS déclare l'adresse sans appelant, et Android a
le binding Retrofit **déjà écrit** (`LinkDetailApi.postMessage`) sans appelant.
Ce n'était donc pas une panne, mais le premier client qui adopte l'adresse
hérite du défaut — et la règle du cycle 84 vaut : on ne laisse pas un piège armé
au motif que personne n'a encore marché dessus.

### Corollaire : une fixture peut être HORS de la question

La branche du doublon compose sa réponse depuis le contenu **stocké**, pas
depuis la requête. Mon témoin « ne résout pas à nouveau les mentions » mettait
en scène une requête qui nomme `@bob` et une ligne relue dont le contenu était
`Hello!` : la mutation qui recalcule les mentions court-circuitait sur « pas de
`@` » et **passait au vert**. La fixture ne posait pas la question du témoin.

C'est la forme du cycle 169 (« une garde ne se met pas en scène depuis son
énoncé, mais depuis la loi qu'elle interroge »), avec un discriminant utile :
**mettre en scène la donnée que la branche LIT, pas celle que l'appelant
ENVOIE.**

### Corollaire : une garde peut dégrader vers le MÊME observable

Retirer `if (!existing) throw error` rend aussi 500 — par un `TypeError` sur
`stored.id` quelques lignes plus bas. Aucun témoin de statut ne peut donc tenir
cette garde, et ce qu'elle préserve n'est pas la réponse mais le **diagnostic** :
elle relance le `P2002` d'origine là où son absence fait accuser `undefined`
dans le gestionnaire, loin de la course perdue sur l'index unique.

Elle reste posée, son inobservabilité est écrite à côté d'elle, et le journal la
NOMME au lieu de la compter comme prouvée — le dépôt a déjà cette pratique
(cycle 169, septième mutation ; cycle 171, projection `sealAtRest`).
