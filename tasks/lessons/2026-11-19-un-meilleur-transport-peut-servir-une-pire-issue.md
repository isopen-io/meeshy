## Un meilleur TRANSPORT peut servir une PIRE issue — classer l'erreur fait partie du correctif qui la fait voyager

**Lot** : #19786, PR #19809. **Trouvé par** : l'audit adversarial obligatoire (#9226), verdict BLOQUANT sur un lot dont le cœur était juste et prouvé.

### Ce que le lot faisait

Un verrou de génération de clé au repos ne portait que son `resolve` : quand la génération échouait, tout appelant entré par `return existingLock.promise` détenait une promesse qui ne se réglait **jamais**. Le correctif donne au verrou son `reject`. Mesuré, falsifiable, quatre témoins qui tombent chacun sous sa mutation. Et justifié par #9223 : **un envoi sans réponse est pire qu'un envoi refusé.**

### Ce que l'audit a mesuré

L'erreur qui voyageait désormais jusqu'aux appelants était l'erreur de base **BRUTE**. Elle ne passait aucun prédicat de `MessagingService`, tombait dans sa branche terminale « erreur interne », et se servait en **HTTP 400**. Or `outcomeOf` (`apps/web/src/lib/api/outcome.ts`) ne tient que 408, 425 et 429 pour rejouables : tout autre 4xx est **`permanent`**, et `isPermanentFailure` retire le bouton « Réessayer ».

La pendaison d'avant, elle, expirait au bout de 15 s en `status: 0, code: TIMEOUT` — c'est-à-dire en **transitoire RETRYABLE**.

| | ce que l'utilisateur obtient, pendant un incident Mongo transitoire |
|---|---|
| avant le lot | pas de réponse, puis un délai dépassé → **rejeu offert** |
| après le lot | un refus immédiat → **« rejeté », aucun rejeu offert** |

Le lot échangeait donc un mauvais transport contre une pire issue PRODUIT, et sa propre justification (#9223) ne tenait plus : « un envoi refusé » valait mieux que « un envoi sans réponse » à condition que le refus soit RETRYABLE.

### La règle

> **Un correctif qui fait VOYAGER une erreur jusqu'à un appelant a la charge de la CLASSER.** La question n'est pas « l'erreur arrive-t-elle ? » mais **« sous quel STATUT arrive-t-elle, et qu'est-ce que le client en fait ? »** — et elle se répond en lisant la classification du client, jamais en supposant qu'une erreur propagée vaut mieux qu'un silence.

Trois corollaires, tous mesurés sur ce lot :

- **Un témoin posé sur la LEVÉE ne peut pas voir le statut servi.** Les quatre témoins du lot assertaient `rejects.toThrow(...)` : la chaîne entière — `EncryptionService` → `MessagingService` → route — était hors de leur portée, et c'est exactement là que vivait la régression. Un témoin de ce lot traverse désormais `app.inject()` et observe le CODE HTTP, avec la vraie `MessagingService` et le vrai coffre (seule la base est doublée). Sans le classement, il rend **400** ; avec, **503 + `Retry-After`**.
- **Un prédicat nommé par son MÉCANISME refuse en silence tout nouveau membre.** `isUncommittedMessageWrite` décidait « rien n'est écrit, le même envoi rejoué aboutit » sous le nom du seul mécanisme par lequel on l'avait rencontré (P2034/P2028). L'échec de génération de clé a cette propriété et pas ce mécanisme : il n'avait aucune branche où tomber. Renommé `isRetryableMessageWrite`, le prédicat porte la propriété — et le second membre s'y range sans discussion.
- **Ne pas reclasser ce qui était déjà classé.** Un refus de clé MAÎTRESSE (`ServerAtRestUnavailableError`) dit autre chose : il durera tant que l'exploitant n'agira pas. L'avaler dans « rejouable » promettrait un rejeu qui échouera identiquement, indéfiniment. Il traverse tel quel, et un témoin de contrôle le garde.

### Le second constat du même audit, de la même famille

Le `finally` du verrou arme un minuteur de 100 ms qui ne capturait que le `conversationId`. Un essai ÉCHOUÉ supprimait donc, 100 ms plus tard, le verrou d'un essai **SUIVANT** encore en vol — mesuré à **deux `ServerEncryptionKey` pour une conversation**, sous un verrou dont le commentaire dit « prevents TOCTOU race condition ».

Le `delete` nu était **préexistant**. Ce que le lot change est décisif, et c'est la leçon :

> **Un lot qui rend un chemin NOMINAL réveille les dangers qui dormaient dessus.** Sur le chemin de succès, ce minuteur était inoffensif ; sur le chemin d'échec, il n'y avait personne pour arriver après, puisque les attendants PENDAIENT. Le lot qui fait du réessai le cas nominal — c'est précisément ce que son témoin n° 4 institue — hérite de la charge de fermer ce qu'il vient de rendre atteignable.

Et le `finally` n'était gardé par **aucun témoin** : retiré en entier, 69 témoins restaient verts. Un retrait lié à l'identité de l'entrée (`if (map.get(k) === monEntrée) delete`) + son témoin, qui tombe sous la version inconditionnelle en nommant les deux `keyId`.

### Ce que l'audit a aussi corrigé dans mes AFFIRMATIONS

- J'avais écrit que la garde `void lockPromise.catch` évitait la **chute de la passerelle**. Faux en production : `server.ts` enregistre son propre `process.on('unhandledRejection')`, dont le `process.exit(1)` est explicitement commenté. La garde reste NÉCESSAIRE (sans elle, le worker jest meurt — « Tests: 0 total », mesuré), mais sa RAISON écrite était fausse, et une raison fausse se propage comme une mesure.
- J'avais écrit que l'ordre `delete` puis `reject` « laissait un appelant suivant refaire le chemin complet ». L'ordre est **indifférent** : deux instructions synchrones du même job, aucun code JS ne peut s'exécuter entre elles. C'est le `delete` seul qui produit l'effet. Un commentaire qui affirme une CAUSALITÉ est une affirmation, au même titre qu'un compte ou un tri.
- J'avais listé `setConversationKey` parmi les chemins d'échec couverts. Il **ne rejette jamais** (il attrape tout et résout `void`), et de toute façon la carte et la base ne peuvent pas diverger : `rememberConversationKey` tourne avant son `try`. Ce tiers de l'affirmation était vide et invérifiable.
- La portée du correctif n'est pas totale : un `create` qui ne se règle **jamais** pend les attendants comme avant. Suivi : #19826.

### Ce qui s'applique au prochain lot

1. Avant de faire voyager une erreur, suivre la jusqu'au STATUT et à ce que le client en déduit. « Elle arrive » n'est pas un résultat.
2. Nommer un prédicat par la PROPRIÉTÉ qu'il décide, jamais par le mécanisme qui l'a fait découvrir.
3. Devant un lot qui rend un chemin nominal, relire ce qui vivait sur ce chemin en comptant sur son improbabilité.
4. Faire l'audit adversarial **avant** de se convaincre qu'un lot est fini. Celui-ci a confirmé le cœur, prouvé les quatre mutations — et rendu BLOQUANT sur ce qui partait À CÔTÉ.
