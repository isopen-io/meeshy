## Leçon 142 — Un `void` détache la promesse : le `try/catch` qui l'entoure n'en garde que la moitié

Suite directe de la leçon 139 (« un TEST est un lecteur CIRCULAIRE »), appliquée à une famille
entière : les canaux latéraux *fire-and-forget*.

Le motif est partout dans la gateway — l'ACK est déjà parti, l'écriture est déjà commitée, et un
effet de bord best-effort part sans être attendu :

```ts
try {
  void this._createPostReactionNotification(postId, emoji, userId);
} catch (error) { onError?.(error); }
```

**Le `try/catch` ne couvre RIEN de ce qui compte ici.** Il attrape un `throw` SYNCHRONE — un double
de manager sans la méthode, un délégué Prisma absent. Le rejet ASYNCHRONE de la promesse, lui, passe
à côté : `void` l'a détachée, et sous le `--unhandled-rejections=throw` par défaut de Node 22 un
rejet sans écouteur **termine le process**. Un aléa MongoDB sur un canal dont tout le contrat est
d'être best-effort fait tomber toutes les WebSockets de la gateway.

**Pourquoi les deux sites fautifs étaient invisibles — et c'est le cœur.** Chacun avait un témoin
qui prouvait la moitié rassurante :

| Site | Ce que le test existant prouvait | Ce qu'il ne regardait pas |
|---|---|---|
| `PostReactionHandler` | `createPostLikeNotification` rejette → avalé | le `prisma.post.findUnique` AU-DESSUS, nu |
| `broadcastMessageMutation` | `enqueue` qui `throw` **synchronement** → reporté | un `enqueue` `async` qui **rejette** |

Dans les deux cas le témoin porte sur la seule moitié déjà gardée. Sa présence ne signale pas le
trou : **elle le masque**, parce qu'elle fait lire « ce cas est couvert » là où il fallait lire « ce
cas-CI est couvert ».

**Le commentaire est un lecteur, pas une preuve.** Le site fautif portait :
`// _createPostReactionNotification handles errors internally; void to be explicit.`
C'était FAUX à moitié — le callee gardait son appel de notification (`.catch`) et laissait son
`findUnique` nu. Un commentaire qui affirme une propriété du COLLABORATEUR vieillit sans que rien ne
le rouge ; seule une garde locale ne dépend de personne.

**La règle** : `void p` exige `p.catch(...)`, toujours, sans exception et sans raisonnement sur
l'implémentation actuelle du callee. Deux gardes, parce qu'il y a deux modes d'échec disjoints :
le `try/catch` pour l'APPEL, le `.catch` pour la PROMESSE RENDUE. Aucun ne subsume l'autre.

**Corollaire d'interface structurelle** : quand la dépendance est déclarée structurellement
(`MessageMutationManager` = « tout objet portant cette méthode »), « l'implémentation actuelle avale
ses erreurs » n'est pas une garantie que le fichier POSSÈDE — n'importe quelle implémentation
conforme peut rejeter. La garantie doit vivre du côté qui la promet, pas du côté qui l'honore par
hasard. C'est l'argument qui rend le durcissement de `broadcastMessageMutation` obligatoire alors
même que son callee de production ne rejette pas aujourd'hui.

**Corollaire de balayage** : la famille se grepe (`^\s*void ` dans `services/gateway/src` — 36 sites),
mais le grep ne TRIE pas. Deux raisons, et elles tirent en sens inverse :
- un `.catch` peut être plusieurs lignes plus bas dans la même chaîne (`messagePostSaveEffects`,
  `MessagingService`) — le détecteur naïf les déclare fautifs à tort ;
- un call site sans `.catch` est parfaitement sûr si son callee garde TOUT (`CallService`,
  `server.ts`, les `void (async () => { try {` qui ouvrent sur un `try`).

Le tri se fait donc en LISANT chaque callee jusqu'à sa première instruction non gardée. Sur ce
dépôt : 36 sites, 2 fautifs — et plusieurs des 34 corrects portent déjà, en commentaire, le nom
exact du danger Node 22. Le savoir était présent ; il n'avait simplement jamais été appliqué en
balayage.

**Corollaire de témoin** : le témoin d'un rejet abandonné n'est PAS la valeur de retour — `void` sur
une promesse rejetée laisse l'appelant résoudre normalement. C'est l'événement `unhandledRejection`
du process, sondé après deux tours de boucle (Node ne le signale qu'une fois la file de microtâches
vidée). Écrire l'assertion sur le retour aurait produit un test vert des deux côtés de la mutation.

---
