## Une story part aussi en réel d'un seul geste : `alsoAsReel`, réel servi par COPIE, tout ou rien (2026-10-06, #9476)

**Statut** : Accepté

**Contexte** : le porteur a publié une story (photo, texte, son emprunté de 238 s) qu'il voulait aussi en réel. Un seul `POST /posts` `type: STORY` est parti : `CreatePostSchema` n'accepte qu'un `type`, et un `PostMedia` rattaché ne se réclame plus (`mediaOwnership.ts`) — un second appel du client n'aurait rien trouvé à attacher.

**Décision** :
1. `POST /posts` accepte un champ OPTIONNEL `alsoAsReel` (booléen). Absent : rien ne change — un ancien client qui n'envoie que `type` publie exactement comme avant. Vrai : admis sur une STORY ORIGINALE seulement (`400 ALSO_AS_REEL_REQUIRES_STORY` sinon : une republication désigne les médias de sa SOURCE).
2. **La règle du réel est jugée AVANT toute écriture** (`prepareReelCompanion`, `services/posts/storyReelCompanion.ts`) sur ce que la story réclamera : les médias de l'auteur (`claimableMediaWhere`, canevas compris — `withCanvasMedia`) et les sons empruntés autorisés (`borrowedSoundReelEntries`, sorti de `PostService` hors budget). Non qualifiant : `422 REEL_NOT_QUALIFIED`, rien n'est publié — jamais la dégradation silencieuse en POST que `createPost` réserve aux anciens clients.
3. **Le réel reçoit ses PROPRES `PostMedia`, lignes ET octets.** Les médias sont copiés (`MediaStorage.duplicate`, vignette comprise) en lignes EN ATTENTE au nom de l'auteur, puis réclamés par `createPost` sous la garde de propriété ordinaire. Un `PostMedia` garde un seul propriétaire, et un seul fichier : l'expiration d'une story détruit les octets de ses médias (`reclaimMediaRowBytes`), deux lignes sur un même fichier laisseraient le réel muet au lendemain — la garantie que `repostPost` tient déjà pour l'instantané d'une story.
4. **Les deux publications passent par `createPost`, puis par le même noyau de publication** (`runPublicationEffects`) : Prisme, mentions, diffusion, hashtags, éventail d'amis, sons. La réponse reste la story (le journal de mutation retient son id) ; le réel voyage à côté, sous la clé `reel`.
5. **Tout ou rien, par compensation** : une story qui échoue défait les copies ; un réel qui échoue, ou que `createPost` aurait dégradé, retire la story (`deletePost`) et ses copies. Une copie orpheline (crash entre deux étapes) est une ligne en attente : le balayage des 24 h (`sweepPendingPostMedia`) la détruit, octets compris.

**Alternatives rejetées** :
- *Deux appels du client* : le second ne peut rien réclamer (propriété unique), et re-téléverser doublerait l'envoi sur réseau mobile pour un fichier que le serveur possède déjà.
- *Deux lignes `PostMedia` sur le même fichier* : viole « un PostMedia n'a qu'un propriétaire » en pratique — la story expirée emporterait les octets du réel.
- *Une transaction Mongo englobant les deux `createPost`* : `createPost` n'est pas transactionnel (réclamation, légendes, traductions, captures de sons en dehors de toute transaction) ; l'y rendre aurait réécrit le cœur d'un fichier hors budget pour une garantie que la compensation rend au niveau observable.

**Conséquences** : un geste, deux publications ; l'éventail d'amis part pour chacune (story ET réel). Limite connue : un rejeu du même `X-Client-Mutation-Id` rend la story sans la clé `reel` (le journal ne retient qu'un id) — le réel est bien publié, le client ne le relit simplement pas dans cette réponse.
