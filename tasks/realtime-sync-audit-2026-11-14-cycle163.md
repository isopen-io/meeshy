# Cycle 163 — une fenêtre, deux rattrapages, et la liste qui n'existait nulle part

*2026-11-14. Branche `claude/exciting-planck-ksw6yk`, partie de la tête de `dev`
(`c03087602`).*

**Livré** : #18573 — la première connexion du socket web rattrape les quatre
familles personnelles qu'une coupure rattrape. **Ouvert, mesuré** : #18575 — la
clause LOCKSTEP de `_seq` nomme trois observateurs et il y en a deux.

---

## Pourquoi ce cycle a quitté le contrat socket

Les cycles 156 à 162 ont bâti et miné les six cliquets du contrat socket
(noms, émetteurs, orphelins, parité des plateformes, forme des charges, champs
morts, puis la direction montante). Trois questions ont été posées à la porte
d'entrée de ce cycle, et deux ont rendu MÛR :

- **idempotence de l'envoi** : la déduplication nominale
  `(conversationId, clientMessageId)` existe, tenue par un index unique partiel
  rattrapé au `P2002`, avec une fenêtre de contenu en second filet
  (`contentWindowDedup.ts`) et une admission dédiée pour le rejeu d'un envoi
  avec pièces jointes (`attachmentSendAdmission.ts`). Rien à trouver.
- **ordre des éditions** : la garde d'ORDRE est posée sur les trois clients —
  web (`isStaleEdit`), iOS (`markEdited`), Android. Une édition plus ancienne
  que celle en place est ignorée, et la citation embarquée l'est aussi.

La troisième a rendu le lot : **qu'est-ce qui SURVIT à une surdité du socket, et
qui le rattrape ?**

## Le relevé qui a ouvert le lot

Côté serveur, la file durable (`delivery-queue.ts`) est mûre : dix-sept familles
d'`eventType`, chacune avec sa clé de dédup raisonnée, un index inverse pour que
le clair d'un message détruit ne survive pas dans Redis, deux plafonds distincts
pour deux ressources distinctes. Rien à y reprendre.

Côté web, `onAuthenticated` porte le rattrapage — et la passerelle émet
`authenticated` à CHAQUE (ré)authentification. Mis côte à côte, les deux
branches ne se ressemblent pas :

| branche | ce qu'elle relisait |
|---|---|
| reconnexion | `['conversations']`, `['notifications','list']`, `['notifications','counts']`, `['friends']`, `['starred-messages']` |
| **première** connexion | `['conversations']` seule, puis `return` |

**La fenêtre est pourtant la MÊME, et le dépôt le dit lui-même** (#10573) : « le
socket se branche après la première peinture, et ce qui est parti entre la
lecture REST et l'entrée dans les rooms était perdu ». Chaque raison écrite pour
les quatre autres familles s'applique mot pour mot à cette fenêtre-là.

## Ce qui rend la lacune chère, et ce n'est pas la fenêtre

Une lacune de rattrapage se rattrape souvent ailleurs. Celle-ci, non — mesuré :

- l'unique lecteur des compteurs (`use-notification-counts.ts`) ne relit que sur
  **FOCUS de fenêtre**, et un démarrage à froid n'en produit AUCUN : la fenêtre
  est déjà au premier plan ;
- `refetchOnReconnect` (`query-client.ts`) ne couvre que le retour de
  `navigator.onLine`, que rien ne déclenche ici.

La pastille restait donc fausse **jusqu'à ce que l'utilisateur quitte l'onglet et
y revienne**. Pour la reconnexion, le commentaire du dépôt avait déjà écrit cette
mesure ; personne ne l'avait relue contre l'autre branche.

## La cause racine : une liste qui n'existe nulle part

Les quatre familles étaient épelées en quatre `invalidateQueries` **dans la seule
branche de reconnexion**. #6288 (la cloche), #6321 (les demandes d'amitié) et
#7378 (les favoris) ont chacun ajouté la sienne **à cette branche**, sans voir
l'autre.

> **Une liste qu'il faut retaper à chaque branche est une liste qu'une branche
> finira par ne pas avoir.** Le défaut n'est pas l'oubli d'un lot : c'est que
> trois lots de suite pouvaient l'oublier sans que rien ne le dise. Même forme
> que les huit copies de la porte d'émission (cycle 104) et que les dix-sept
> sites qui lisaient `user.systemLanguage` à cru (cycle 124) — la règle vaut là
> où quelqu'un l'a récitée.

`CATCH_UP_PERSONAL_FAMILIES` est déclarée une fois, avec la raison de chaque
famille, et les DEUX branches la consomment. La seule différence qui subsiste est
le **PRÉDICAT**, et c'est la bonne :

| branche | prédicat | pourquoi |
|---|---|---|
| première connexion | `servedAndAtRest` | une requête jamais servie part APRÈS l'entrée dans les rooms ; une requête en vol a une réponse postérieure à son départ — les deux couvrent déjà la fenêtre, et les relancer coûte une requête sur le chemin de la première peinture |
| reconnexion | aucun | la coupure PROUVE que ce socket n'a rien vu de l'intervalle |

Les **conversations** restent hors de la liste, et il faut le dire pour que ça ne
se relise pas comme un oubli : les deux branches n'en prennent pas la même
PORTÉE — racine entière contre liste + fil vivant, ni la case ni une fenêtre
ancrée n'étant nourries par ce que l'intervalle a emporté (#7420).

## Trois témoins gelaient la lacune, dans trois fichiers

C'est le fait le plus instructif du cycle. Le défaut n'était pas non couvert : il
était **affirmé**, trois fois, par trois témoins qui gardaient chacun autre chose
à juste titre.

| fichier | la phrase |
|---|---|
| `socket-missed-catch-up.test.ts` | « la case d'une conversation, une fenêtre ancrée **et la cloche** ne sont pas touchées » |
| `socket.test.ts` | « une RE-authentification invalide **aussi** les demandes d'amitié », avec un contrôle `false` sur la première |
| `notifications-realtime.test.ts` | idem pour la cloche |

Le premier est le cas pur : ses deux premières assertions sont JUSTES (ni la
case, ni une fenêtre ancrée ne sont nourries par `message:new`), et la troisième
a été balayée dans la même phrase.

> **La forme du cycle 114 — « un témoin qui nomme correctement la moitié qu'il
> garde GÈLE l'autre » — a ici une variante plus coûteuse : le témoin ne gèle pas
> une assertion voisine, il gèle une FAMILLE voisine.** L'intitulé énumère trois
> objets dont deux appartiennent à la même classe (« ce que `message:new` ne
> nourrit pas ») et le troisième à une autre (« une famille personnelle que
> l'intervalle emporte »). L'énumération est ce qui les rend comparables, et
> c'est elle, pas le code, qui a tenu la lacune.

Les deux autres sont de la forme « fire, assert false, fire, assert true » — un
contrôle sur la première authentification. Un contrôle est l'endroit le plus
discret où geler un défaut : il n'affirme rien du sujet du témoin, donc personne
ne l'instruit.

## Ce que l'audit a rendu MÛR, et qu'il faut dire

Deux balayages n'ont rien trouvé, et le taire ferait repayer la question :

- **idempotence de l'envoi** et **ordre des éditions** (ci-dessus) ;
- **les familles du rattrapage de reconnexion** : les cinq sont justes, chacune
  avec sa mesure écrite. C'est la branche d'à côté qui ne les avait pas.

## #18575 — la clause qui gouverne `_seq` nomme un consommateur disparu

Trouvé en mesurant « qui observe `_seq` ? ». Le doc-comment d'`emitWithSeq` porte
la règle LOCKSTEP et nomme **trois** observateurs. Mesuré :

| client | observe `_seq` | envoie `seq` à `/sync` |
|---|---|---|
| iOS | oui (`SyncSeqTracker.observe`) | oui |
| Android | oui (`SEQ_KEY`) | oui |
| **`apps/web`** | **aucun** | **jamais** |

Le fichier que la clause NOMME — `observeSyncSeq`, dans
`notification-socketio.singleton` — a quitté le dépôt avec le legacy (#7668), et
le web a sa propre porte, qui le dit comme une décision
(`conversations-delta.ts` : « La porte est `GET conversations.root?updatedSince=`,
pas `GET /sync` »).

Deux conséquences qui ne se recouvrent pas : un lot qui estampille un événement
de plus croira une obligation de lockstep tenue sur un client qui n'a aucun
observateur ; et `hasGap` est INATTEIGNABLE pour le web, qui n'envoie jamais
`seq` — personne ne doit l'y lire comme acquis. Forme du cycle 107 : la clause
n'était pas fausse quand elle a été écrite, elle l'est DEVENUE, et elle ne peut
pas rougir. Verdict laissé au produit : inventorié, pas tranché.

## Preuves

| preuve | résultat |
|---|---|
| ROUGE avant correctif | 4 échecs, un par famille, tous sur « déjà servie et au repos ⇒ relue » |
| ROUGE conservé | « en vol ⇒ pas doublée » / « jamais servie ⇒ rien demandé » passaient déjà : ils gardent le PRÉDICAT, que le correctif ne relâche pas |
| `bun test` — 3 fichiers touchés | 91/91 |
| `bun test` — suite web | 32 584 pass / 5 fail, les 5 IDENTIQUES sur la base |
| `tsc --noEmit` (web) | EXIT=0 |
| `bun run build` | EXIT=0 |
| `measure-weight.mjs` | EXIT=0 — chunk `realtime` 14,84 Ko contre **14,80 Ko sur la base** (+0,04 Ko : la liste et la boucle, aucune arête d'import nouvelle), plafond 32 |

**Les 5 rouges de la suite entière pré-existent**, et c'est mesuré plutôt que
supposé : `focal-row`, `lens-row` et `act-leak-guard` rendent **106 pass / 1 fail
à l'identique** sur `origin/dev` stashé et sur la branche. `act-leak-guard` tombe
dans les deux ; les deux témoins de présence passent isolément dans les deux et
ne tombent qu'en suite complète — un ordre, pas ce lot.

`check-notifications.mjs` et `check-lens.mjs` n'ont pas pu tourner : gates
Playwright, et le Chromium du conteneur ne porte pas le chemin que la version
épinglée attend (`browserType.launch` échoue avant toute ligne du projet). À la
CI de les rendre — ne pas lire cet échec comme un dépôt cassé.

## Suivi ouvert

| # | ce que c'est | état |
|---|---|---|
| #18575 | la clause LOCKSTEP de `_seq` et ses deux observateurs réels | **ouverte, mesurée** ; verdict de produit à rendre |
| #10573 | le rattrapage web, dont ce lot solde la moitié « première connexion » pour les familles personnelles | ouverte — le retour d'un onglet endormi et la traduction en vol restent |
| #18499 | les 5 canaux montants sourds + les 3 noms hors contrat | inventoriés |
| #18342 | la jumelle descendante (6 événements qu'aucun client ne déclare) | ouverte |
| #18115 | les trois champs morts d'`AttachmentUpdatedEvent` | ouverte |
| #18456 | le consommateur iOS d'`AttachmentReactionUpdateEvent.userId` | ouverte — demande Xcode |
