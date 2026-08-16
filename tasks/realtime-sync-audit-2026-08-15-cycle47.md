# Cycle 47 — le réglage était pris, et six caches continuaient de diffuser l'ancien

## 1. D'où vient la piste

Le cycle 46 laissait deux dettes nommées, dont celle-ci, textuellement :

> **Invalider les caches à l'écriture.** `PUT`/`PATCH /me/preferences/privacy`
> n'appelle ni `PrivacyPreferencesService.invalidateCache` (TTL 5 min) ni le
> cache d'opt-out de `MessageReadStatusService` : un réglage met jusqu'à cinq
> minutes à prendre effet. […] Le traiter demande de raccorder la route à
> l'instance du manager (`fastify.socketIOHandler`), donc de toucher au câblage.

La dette était bien réelle. **Son analyse, elle, était fausse sur un point qui
change tout** : il n'y a pas *deux* caches à purger, et le raccordement à
`fastify.socketIOHandler` n'aurait pas suffi — il n'aurait même pas atteint la
majorité des lecteurs.

## 2. Le constat

Une seule préférence — « montrer mes accusés de lecture », « mon statut en
ligne », « mon vu à », « que je suis en train d'écrire » — gouverne **six**
portes de diffusion. Le processus portait **six mémoires** de cette donnée :

| # | Mémoire | Portée | Portes servies |
|---|---|---|---|
| 1 | `Map` d'instance | gestionnaire Socket.IO | frappe (`StatusHandler`), accusés de livraison (`MessageHandler`), drain de reconnexion |
| 2 | `Map` d'instance | singleton `PresenceVisibilityService` | statut en ligne, « vu à » |
| 3 | `Map` d'instance | plugin `routes/messages.ts` | `broadcastReadStatus` |
| 4 | `Map` d'instance | plugin `routes/conversations/messages.ts` | `broadcastReadStatus` |
| 5 | `Map` d'instance | plugin `routes/message-read-status.ts` | `broadcastReadStatus` |
| 6 | `BoundedTtlCache` statique | module `MessageReadStatusService` | 5 lecteurs d'accusés nominatifs |

Les lignes 1 à 5 sont **le même code**. `PrivacyPreferencesService` déclarait sa
mémoire comme un champ d'instance (`private cache = new Map(...)`), et le
service est construit cinq fois dans le processus. Personne n'a jamais décidé
d'avoir cinq caches : c'est la conséquence mécanique d'une portée mal choisie.

Chacune de ces cinq instances traînait de surcroît son propre `setInterval` de
nettoyage — capturant `this`, donc empêchant la collecte de l'instance — pour
une donnée qu'un `BoundedTtlCache` expire seul. Cinq minuteurs, cinq `Map` non
bornées.

## 3. Pourquoi le correctif « évident » était un piège

`PrivacyPreferencesService.invalidateCache(userId)` existait déjà, écrit,
documenté (« à appeler après mise à jour des préférences »), et **sans un seul
appelant dans tout le service**. Le geste naturel — le brancher depuis la route
d'écriture, via `fastify.socketIOHandler.getManager().privacyPreferencesService`
— aurait purgé **une copie sur six** : celle du gestionnaire Socket.IO.

Le résultat aurait été pire qu'aujourd'hui à un égard précis : la frappe et les
accusés de livraison auraient réagi immédiatement, les accusés de lecture non —
selon la porte empruntée par le client, la même préférence aurait pris effet ou
pas. Une purge partielle ne corrige pas un défaut de fraîcheur, **elle le rend
non déterministe**, et elle se lit dans le code comme une garantie tenue.

C'est le motif qui vaut d'être retenu : *une méthode d'invalidation sur un objet
construit N fois n'invalide rien.* Le seul indice disponible avant de compter
les instanciations était la présence d'une API d'invalidation sans appelant —
elle n'a pas été écrite morte, elle est devenue inapplicable quand le service
s'est mis à être construit par plugin.

## 4. Le correctif

La mémoïsation descend au niveau **module**, à côté du résolveur dont elle
mémoïse le résultat : `services/preferences/privacy-cache.ts`, voisin immédiat
de `privacy-storage.ts` créé au cycle 46.

```
loadPrivacyPreferencesCached(prisma, userIds) → Map<userId, StoredPrivacyPreferences>
invalidatePrivacyPreferences(userId)          → le point d'entrée UNIQUE
clearPrivacyPreferencesCache()                → isolation des tests
```

- `PrivacyPreferencesService` perd sa `Map`, son TTL, son `setInterval` et ses
  deux méthodes de récupération ; il ne reste que la règle métier
  (`{ ...défauts, ...stocké }`) et le traitement des anonymes.
- `MessageReadStatusService._loadReadReceiptOptOuts` perd son cache statique et
  sa boucle de résolution partielle : le cache partagé fait déjà le tri entre
  connus et manquants.
- Les quatre portes d'écriture appellent `invalidatePrivacyPreferences` :
  `PUT`, `PATCH`, `DELETE /me/preferences/privacy`, et `DELETE /me/preferences`
  (la remise à zéro globale efface aussi `privacy` — elle n'émettait déjà rien,
  elle ne purgeait rien non plus).

**La règle générale à retenir : la mémoire d'une donnée vit à la portée de la
donnée, pas à celle de son lecteur.** Le cache étant au module, la purge ne
demande *aucun* câblage — la route importe une fonction. Le raccordement à
`fastify.socketIOHandler` qu'anticipait le cycle 46 disparaît avec le problème
qu'il devait résoudre.

## 5. Effets de bord, tous du bon côté

- **Une lecture réchauffe tous les lecteurs.** La porte des accusés de lecture
  réutilise la lecture faite par la présence, là où chacune payait la sienne.
  Un témoin le fige (`documentReads() === 1` après deux lectures par deux
  services distincts).
- **Cinq `setInterval` et cinq `Map` non bornées** disparaissent au profit d'un
  `BoundedTtlCache` unique (5000 entrées, TTL 5 min) qui expire à la lecture et
  se borne à l'insertion.
- **Les utilisateurs sans réglage stocké sont mémoïsés aussi** (`{}`), là où
  l'ancien `_loadReadReceiptOptOuts` les repayait à chaque lot inédit.

## 6. La borne assumée

La purge est **locale au processus**. En déploiement multi-gateway, les autres
processus rattrapent par l'expiration du TTL : au plus cinq minutes.

C'est une amélioration stricte à chaque étape — « jamais » avant le cycle 46,
« cinq minutes partout » avant celui-ci, « immédiat là où l'utilisateur écrit,
cinq minutes ailleurs » maintenant — et l'écriture est enregistrée sans délai
dans tous les cas. Un cache Redis partagé refermerait complètement l'écart, au
prix d'un aller-retour réseau sur des portes appelées à CHAQUE accusé de
lecture, pour une donnée minuscule à TTL court. Écarté, et nommé dans l'ADR
plutôt que laissé implicite.

## 7. Gates

- [x] 4 témoins discriminants vus ROUGES avant correctif :
      cross-instance (deux `PrivacyPreferencesService` partagent la mémoire),
      cross-service (la porte des accusés réutilise la lecture des préférences),
      purge → relecture côté préférences, purge → relecture côté accusés
- [x] 6 témoins de route : chaque verbe purge (`PUT`, `PATCH`, `DELETE`
      catégorie, `DELETE` global) ; une écriture d'une AUTRE catégorie ne purge
      PAS ; une écriture qui ÉCHOUE ne purge pas
- [x] Gardes : une écriture d'un utilisateur ne jette pas la mémoire des
      autres ; un échec de lecture n'est jamais mémoïsé (la lecture suivante
      retente) ; une entrée périmée est relâchée à la lecture
- [x] `bunx tsc --noEmit` gateway : 0
- [x] Suite gateway complète verte (730 suites / 17 826 témoins)
- [x] CHANGELOG + ADR `services/gateway/decisions.md` + ce journal + leçon 203

## 8. Écarté délibérément

**Purger toutes les catégories.** `invalidateServerCache` ne fait rien hors
`privacy`. Purger sur une écriture audio ou vidéo se lirait comme si ces
catégories avaient elles aussi une mémoire côté serveur — elles n'en ont pas,
leur seul lecteur est le `GET` de la même porte — et ferait payer un
refroidissement pour rien.

**Maquiller `readReceiptOptOutCache` en façade.** Cinq suites de tests vidaient
`(MessageReadStatusService as any).readReceiptOptOutCache`. Un shim
`{ clear: clearPrivacyPreferencesCache }` aurait évité de les toucher — au prix
d'un nom qui annonce « le cache des accusés » pour désigner le cache de TOUTE la
confidentialité. La statique a été retirée et les cinq suites appellent
`clearPrivacyPreferencesCache()` : c'est ce que le code fait, donc c'est ce que
le test doit dire.

## 9. Pistes pour le cycle 48 — repérées, NON livrées

1. **`DELETE /me/preferences/:category` n'émet aucun `preferences:updated`.**
   Les `PUT` et `PATCH` le font ; la remise à zéro, non. Un client qui réinitialise
   depuis un appareil ne l'apprend sur les autres qu'au prochain `GET`. Repéré en
   posant la purge juste à côté, délibérément laissé hors de cette tranche — c'est
   la staleness CLIENT, symétrique de la staleness SERVEUR que ce cycle ferme,
   et elle mérite ses propres témoins.
2. **Supprimer `services/preferences/PreferencesService.ts`** (dette du cycle 46,
   toujours ouverte) : intégralement orphelin, et seul écrivain survivant du
   rangement clé/valeur hérité — donc le moyen tout prêt de recréer la divergence
   que le cycle 46 a fermée.
3. **Verrouiller `allowAnonymous: false`** sur `userPreferencesRoutes` par un
   témoin (dette du cycle 46) : `getPreferencesForUsers` sert les anonymes par
   les défauts sans consulter la base, ce qui n'est correct que tant que cette
   valeur tient, et rien ne la garde.
