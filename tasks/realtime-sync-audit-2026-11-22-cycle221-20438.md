# Cycle 221 — le rattrapage du web couvrait treize familles quand le socket en écrit vingt-sept

Routine « amélioration continue du temps réel », 2026-11-22.
Suite directe des cycles 217 (#20336), 218 (#20349), 219 (#20421) et de la
moitié 2 de #20353.

| lot | plateforme | issue | état |
|---|---|---|---|
| toute famille écrite par un écouteur socket est rattrapée, ou exemptée avec sa raison | web | #20438 | livré |

---

## Comment il a été trouvé

Les trois cycles précédents ont fermé, un par un, des trous du rattrapage web :
les quatre familles de publication entrées dans une seule branche (#20336), les
projections du document de réglages (#20349), la FICHE d'une conversation
(#20421). Chacun a posé la question « cette famille-là est-elle rattrapée ? ».

Celui-ci a posé l'autre : **la LISTE est-elle complète ?** — et il a commencé par
mesurer la prémisse sur laquelle tenaient tous les verdicts d'indulgence.

## Le fait qui change l'arbitrage de toutes les fenêtres mesurées jusqu'ici

`unqueuedFamilyVerdict.ts` (passerelle) et #20353 raisonnent sur le `staleTime`
du consommateur, en s'appuyant sur `refetchOnReconnect: true`
(`apps/web/src/lib/api/query-client.ts`). Le discriminant de #20353 était déjà
plus fin que le `staleTime` seul — « ce qui garantit la relecture est
l'appartenance à `CATCH_UP_FAMILIES` » — mais sans dire **pourquoi** le
`staleTime` ne suffit pas. Mesuré :

1. **`refetchOnReconnect` est branché sur l'`onlineManager` de TanStack**, qui
   écoute les transitions `online` / `offline` du NAVIGATEUR. Relevé dans
   `apps/web/src` : aucun site ne le relie au socket (seule occurrence du nom :
   un commentaire de `lib/view/cold-state.ts`). Les coupures de socket les plus
   fréquentes n'ont aucune transition réseau — redémarrage de la passerelle,
   déploiement, expiration d'inactivité, coupure de proxy,
   ré-authentification.
2. **Une requête seulement PÉRIMÉE n'est jamais relue.** TanStack relit sur un
   DÉCLENCHEUR (montage, focus, reconnexion réseau, invalidation), jamais sur
   l'écoulement du `staleTime`.

> **Pour une coupure de socket, le rattrapage explicite d'`onAuthenticated` est
> le SEUL rattrapage du web.** Un `staleTime` n'atténue que le démarrage à
> FROID, par `refetchOnMount` ; il n'atténue rien d'un écran OUVERT.

Le dépôt avait déjà la moitié de ce fait, écrite ailleurs et jamais généralisée :
#20224 — « un socket qui se rouvre SANS changement de réseau (redémarrage de la
passerelle) ne lève aucun `online`, et la file restait bloquée jusqu'à un
geste ». Ce lot-là en a tiré un déclencheur pour la file d'envoi. Personne n'en a
tiré la conséquence pour le cache de requêtes, qui dépend du même drapeau.

## Le défaut, mesuré

`CATCH_UP_FAMILIES` portait treize familles ; le socket en ÉCRIT vingt-sept.
Les onze qu'aucune branche ne périmait :

| famille | écrivain | ce qu'une coupure laissait faux |
|---|---|---|
| `['conversation-members', id]` | `conversation-members-live` (5 événements) | un membre BANNI ou parti en liste, un arrivant absent |
| `['communities', 'detail' \| 'list' \| 'members' \| 'join-requests', …]` | `community-live`, `community-member-live` | rang, entrée, départ, demande d'adhésion |
| `['me', 'engagement']` | `game-state-live` | solde, acte du Rêve, Offrande |
| `['me', 'stickers']` | `library-sync` | un sticker ajouté ou retiré ailleurs |
| `['me', 'packs', …]`, `['me', 'sticker-packs', …]`, `['pack', …]`, `['sticker-pack', …]` | `installation-sync` (#20354) | un pack acheté ou GAGNÉ ailleurs |
| `['directory', 'people', …]` | `socket.ts`, `profile-decor/equip` | l'état d'amitié, le décor équipé |
| `['attachment-status-details', id]` | `socket.ts` | ouvertures, écoutes, position de lecture |
| `['calls', 'history', …]` | `call-socket-bridge` | un appel manqué pendant la coupure |

**Le plus cher est le trombinoscope**, et pour une raison de NATURE, pas de
taille : c'est une surface de MODÉRATION. Un administrateur agit sur une ligne
que le serveur a retirée, et reçoit un refus qu'aucun écran n'explique — le
symptôme de #20277 (« un tiroir de composeur ouvert sur des droits périmés »),
un cran plus haut. Sa clé est de plus HORS de `['conversations', …]` par
décision écrite, donc hors du seul préfixe que la branche de reconnexion périme :
**la décision qui la met hors de ce préfixe est exactement ce qui la met hors du
rattrapage, et rien ne reliait les deux.**

## Ce que le lot NE fait pas, et pourquoi

**Cinq familles restent dehors, avec leur raison.** Les états de proximité
(`['relations', 'battery' | 'phone-calls' | 'phone-reachability']` et les deux
clés HORS DISQUE `['hors-disque', 'relations', 'falls' | 'inactivity']`) portent
CHACUNE son propre rattrapage, écrit sur place : « à chaque socket accrochée,
`GET /relations/…` rattrape ». C'est un mécanisme plus FIN que celui-ci — il
départage par l'horloge du DÉPART de la demande, donc n'efface pas ce qui est
arrivé depuis. Les métriques d'exploitation (`['admin','ops','metrics']`) sont
sondées. Ces décisions existaient ; elles n'étaient écrites nulle part où la
liste du rattrapage puisse les lire.

## La forme : dériver l'obligation, déclarer les exceptions

Ajouter onze lignes à une liste aurait rejoué ce que les trois cycles précédents
ont chacun constaté : « corriger une énumération ne lui donne aucun moyen de
rester vraie » (#18602). Le cliquet
(`socket-missed-catch-up.test.ts` § #20438) relève donc l'obligation :

1. les modules de PRODUCTION branchés sur un espace d'événements serveur
   (`SERVER_EVENTS.` **ou** `<DOMAINE>_SERVER_EVENTS.` — la batterie, les
   chutes, l'inactivité et les deux familles de téléphone ont le leur) ;
2. leurs ÉCRITURES de cache, jamais leurs lectures — `getQueryData` /
   `getQueriesData` ne créent aucune famille ;
3. la clé de chaque écriture résolue en un PRÉFIXE littéral (alias, spread,
   constante de chaîne et `X[0]` compris ; le module LOCAL prime sur le dépôt,
   parce que `LIST_KEY` est déclaré deux fois avec deux valeurs) ;
4. et une PREUVE par le branchement, famille par famille : une sonde posée à ce
   préfixe doit être périmée par `onAuthenticated`, sur les DEUX branches.

**Le cliquet ne se satisfait pas d'une ligne d'inventaire** : une famille neuve
ne passe au vert que si elle est réellement rattrapée, ou si elle est exemptée
avec une raison — et une exemption dont la famille n'est plus écrite rougit à son
tour.

**Et il PUBLIE ce qu'il ne sait pas résoudre** (leçon 261 : « zéro trouvé » et
« zéro existe » ne sont pas la même affirmation). Cinq écritures n'ont pas de
littéral à lire : deux clés viennent d'une LECTURE du cache
(`getQueriesData(…).forEach`), trois sont des membres de l'objet rendu par
`packQueryKeys(domain)`. Chacune est inventoriée avec sa raison.

## ROUGE prouvé, trois fois

| mutation | ce qui tombe |
|---|---|
| la production revertie (liste d'avant) | **22** témoins de famille, sur les deux branches |
| un module de production NEUF qui écrit une famille inconnue | le cliquet dérivé, sur cette famille, nommément |
| une exemption qui nomme une famille que personne n'écrit | la sentinelle d'exemptions |

## Un témoin de portée qui ne pouvait pas rougir

`socket-missed-catch-up.test.ts` § « la racine `['me']` n'est pas balayée »
justifiait sa sentinelle ainsi : « les deux clés sont des FEUILLES sous `['me']`,
qui porte aussi le profil et le journal d'appels ». **Le journal d'appels n'est
pas sous `['me']`** — `CALL_HISTORY_QUERY_PREFIX` vaut `['calls','history']`, il
est seulement DÉCLARÉ dans `me-keys.ts`. Le témoin assertait donc qu'une clé
d'une AUTRE racine n'était pas touchée : il ne pouvait pas tomber si quelqu'un
balayait `['me']` par préfixe, puisque l'autre clé qu'il observe
(`MY_PROFILE_QUERY_KEY`) est elle-même dans la liste et DOIT être périmée. La
même phrase vivait dans le commentaire de production de `CATCH_UP_FAMILIES`.

> **Un module de DÉCLARATION n'est pas une racine.** `me-keys.ts` existe pour que
> le morceau du temps réel nomme une requête sans tirer son port ; il n'a jamais
> prétendu que tout ce qu'il déclare vit sous `['me']`. Deux fois — dans un
> témoin et dans un commentaire de production — le FICHIER a été lu comme la
> CLÉ. Devant une phrase de la forme « X est une feuille sous Y », ouvrir X.

## Suivi

- **#20353 garde sa moitié 2**, et ce cycle lui donne sa mesure manquante : le
  discriminant juste n'est pas « `staleTime` + `CATCH_UP_FAMILIES` » mais
  « `CATCH_UP_FAMILIES`, point, parce que `refetchOnReconnect` n'est pas branché
  sur le socket ». Un verdict `reload-serves-truth` dont le consommateur est le
  web tient à l'appartenance à la liste, et à rien d'autre.
- **Les autres clients ne sont pas relevés.** iOS et Android ont leurs propres
  mécanismes de rattrapage (`CacheCoordinator` et ses TTL, le filigrane
  `updatedSince` de la passe de liste) ; la question « quelles familles un
  écouteur socket y écrit-il sans qu'une coupure les relise ? » est la même, et
  elle n'est pas posée ici. Elle mérite son issue par plateforme, et elle ne se
  compile pas depuis un conteneur Linux.
- **`['me','e2ee-devices']` n'a pas d'écrivain socket mesuré**, donc le cliquet
  ne le voit pas. S'il en recevait un, l'annuaire d'appareils chiffrés est
  comparé par égalité EXACTE côté passerelle (`isDeviceSetExact`) : une
  divergence y coûte un `409 DEVICES_MISMATCH` par envoi, pas un affichage
  périmé. À instruire si quelqu'un y branche un écouteur.
