## 2026-08-16 (2) : une préférence, un cache — la mémoire vit avec le résolveur, pas dans l'instance

**Statut** : Accepté

**Contexte** : le cycle précédent (ADR ci-dessous) a raccordé l'écran Confidentialité au rangement
que les portes de diffusion lisent. Restait ceci : ces portes MÉMOÏSENT, cinq minutes, et rien ne
purgeait. Couper ses accusés de lecture prenait donc effet jusqu'à cinq minutes plus tard — une
fenêtre pendant laquelle le serveur diffuse exactement ce que l'utilisateur vient de demander de
taire, pendant que l'écran lui confirme que le réglage est pris.

Le correctif évident — appeler `PrivacyPreferencesService.invalidateCache` depuis la route
d'écriture — ne pouvait PAS marcher, et c'est le vrai constat du cycle : il n'existait pas UN cache
à purger. Le processus en portait SIX, tous sur la même donnée :

| Mémoire | Portes servies |
|---|---|
| `Map` de l'instance du gestionnaire Socket.IO | indicateur de frappe, accusés de livraison, drain de reconnexion |
| `Map` de l'instance du singleton `PresenceVisibilityService` | statut en ligne, « vu à » |
| `Map` de l'instance du plugin `routes/messages.ts` | `broadcastReadStatus` |
| `Map` de l'instance du plugin `routes/conversations/messages.ts` | `broadcastReadStatus` |
| `Map` de l'instance du plugin `routes/message-read-status.ts` | `broadcastReadStatus` |
| `BoundedTtlCache` statique de `MessageReadStatusService` | 5 lecteurs d'accusés nominatifs |

`invalidateCache` existait — sans **aucun** appelant — et l'y brancher n'aurait purgé qu'une copie
sur six. Une purge qui laisse cinq lecteurs chauds ne corrige rien : elle donne seulement l'air
d'avoir corrigé, et le fait de façon non déterministe selon la porte que le client emprunte.

Cinq de ces mémoires venaient d'un seul choix : la `Map` était un champ d'INSTANCE, alors que le
service est construit une fois par plugin. Chacune traînait en prime son propre `setInterval` de
nettoyage, capturant `this` — cinq minuteurs pour la même donnée, et cinq instances que le GC ne
pouvait pas ramasser.

**Décision** : la mémoïsation descend au niveau MODULE, à côté du résolveur dont elle mémoïse le
résultat — `services/preferences/privacy-cache.ts`, voisin de `privacy-storage.ts`. Les deux
familles de lecteurs y passent : `PrivacyPreferencesService` perd sa `Map` et son minuteur,
`MessageReadStatusService._loadReadReceiptOptOuts` perd son cache statique.
`invalidatePrivacyPreferences(userId)` devient le point d'entrée UNIQUE, appelé par
`PUT`/`PATCH`/`DELETE /me/preferences/privacy` et par `DELETE /me/preferences`.

La règle générale : **la mémoire d'une donnée vit à la portée de la donnée, pas à celle de son
lecteur.** Un cache d'instance sur un service construit par plugin ou par requête n'est pas un
cache, c'est N caches — et un point d'invalidation qui n'en atteint qu'un est pire qu'aucun, parce
qu'il se lit comme une garantie.

Le cache étant au module, la purge ne demande AUCUN câblage : la route d'écriture importe une
fonction, elle n'a pas à remonter jusqu'à `fastify.socketIOHandler` pour trouver l'instance du
gestionnaire — chemin qui, de toute façon, n'aurait donné accès qu'à une des six.

**Ce qui a été délibérément écarté** :

- *Purger toutes les catégories.* `invalidateServerCache` ne fait rien hors `privacy` : seule cette
  catégorie a une mémoire côté serveur. Purger sur une écriture audio se lirait comme si les autres
  catégories en avaient une, et ferait payer un refroidissement pour rien.
- *Un cache partagé Redis.* Il réglerait aussi le cas multi-processus (voir Conséquences), au prix
  d'un aller-retour réseau sur des portes appelées à CHAQUE accusé de lecture. La donnée est
  minuscule, le TTL court, et l'écriture purge déjà le processus qui sert l'utilisateur.

**Conséquences** :

- Un réglage de confidentialité prend effet IMMÉDIATEMENT sur le processus qui l'a reçu, pour les
  six portes à la fois.
- Une seule lecture réchauffe tous les lecteurs : la porte des accusés de lecture réutilise
  désormais la lecture faite par le gestionnaire de présence, là où chacun payait la sienne.
- Cinq `setInterval` et cinq `Map` non bornées disparaissent au profit d'un `BoundedTtlCache`
  (5000 entrées, TTL 5 min) qui expire à la lecture et se borne à l'insertion.
- **Borne assumée** : la purge est LOCALE au processus. En déploiement multi-gateway, les autres
  processus rattrapent par l'expiration du TTL — au plus cinq minutes, contre « jamais » avant le
  cycle précédent et « cinq minutes partout » avant celui-ci. L'écriture est enregistrée sans délai
  dans tous les cas.
- Les tests des cinq suites qui vidaient `MessageReadStatusService.readReceiptOptOutCache`
  appellent maintenant `clearPrivacyPreferencesCache()` : la statique a disparu plutôt que d'être
  maquillée en façade, parce qu'un nom qui annonce « le cache des accusés » pour désigner le cache
  de TOUTE la confidentialité rouvrirait la confusion que ce cycle ferme.
