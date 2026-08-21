# Cycle 79 — Le bannissement retirait la ligne, la levée ne la remettait pas

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-mxv14y`
**Périmètre** : web (`hooks/queries/use-socket-cache-sync.ts`, sa suite de tests)

**Clients touchés** : web seul. Aucun nom d'événement ajouté ni retiré du
contrat, aucune charge utile modifiée, aucune ligne de passerelle touchée. Le
serveur faisait déjà sa part — c'est le récepteur qui n'écoutait pas.

---

## 1. D'où vient ce cycle

Le cycle 78 s'est terminé sur une matrice « contrat × clients qui écoutent »,
livrée explicitement comme **passe d'inventaire à refaire, pas comme gate**. Ce
cycle en refait une, sur un axe voisin et plus étroit : non pas « qui écoute ce
nom ? » mais **« ce que le récepteur fait de ce nom a-t-il un effet ? »**

Un abonnement qui existe, se déclenche, s'exécute sans erreur et ne change rien
est invisible aux trois gardes de contrat déjà en place. Il est écouté (garde du
cycle 76), il est émis (garde du cycle 77), il figure comme écouté dans la
matrice du cycle 78. Il ne fait simplement rien.

## 2. Les quatre fins d'appartenance, et la seule qui remonte

Une appartenance à une conversation a **trois façons de finir** et **deux façons
de commencer**. Le dépôt les a unifiées côté serveur — le delta `updatedSince=`
les rend toutes dans `deletedConversationIds` (`delta-tombstones.ts`) — et le
chemin temps réel les a rattrapées une par une au fil des cycles :

| transition | événement | ce que le web fait |
|---|---|---|
| on m'ajoute | `conversation:new` | lecture bornée → la ligne entre |
| je pars | `conversation:participant-left` (moi) | la ligne sort |
| on me retire | idem | la ligne sort |
| on me bannit | `conversation:participant-banned` (moi) | la ligne sort |
| **on me débannit** | `conversation:participant-unbanned` (moi) | **rien** |

La cinquième ligne est le défaut de ce cycle. Le handler existait, il recevait
l'événement, et son corps entier se résumait à `applyMemberCount` — qui mappe
sur la liste en cache pour y **réécrire un effectif**. Or la conversation n'y est
plus : le bannissement venait de l'en retirer. Le `map` ne trouve rien, le cache
ressort identique, aucune erreur n'est levée. **Un no-op muet.**

## 3. Pourquoi rien ne rattrapait

Trois filets existent, et aucun ne couvre ce cas :

- **`staleTime: Infinity`** — le QueryClient ne relit jamais de lui-même. C'est
  le choix d'architecture du dépôt : Socket.IO EST la source de vérité.
- **Le delta borné** (`use-conversations-delta-sync`, reconnexion + focus) est
  **upsert-only sur `Conversation.updatedAt`**. Or une levée de bannissement
  écrit une ligne `Participant`, pas la conversation : elle ne fait bouger aucun
  watermark, donc elle n'apparaît dans aucune réponse `updatedSince=`.
- **La réconciliation complète** existe — `FULL_RECONCILE_INTERVAL_MS = 24 h`,
  jumeau du `fullReconcileInterval` iOS — mais c'est un filet de dernier recours,
  déclenché une fois par fenêtre de 24 h.

Donc : réintégré côté serveur, rejoint à la room de conversation, recevant les
messages en temps réel — **et sans ligne où les lire**, jusqu'à **24 heures**
plus tard ou un vidage de cache.

## 4. L'émetteur tenait sa part

Le point qui rend le défaut net : la passerelle fait exactement ce qu'il faut, et
son propre commentaire le dit (`routes/conversations/ban.ts`, chemin `unban`) :

> Effectif APRÈS la levée : quand elle restaure l'appartenance, la cible est de
> nouveau active et figure donc dans ce compte ET dans l'audience — **elle
> apprend ainsi son retour sur sa propre ligne de liste**, ce que la room de
> conversation ne pouvait pas lui dire.

La chaîne `emitToConversationParticipants` adresse les rooms personnelles des
participants actifs, et la cible en fait partie dès l'appartenance restaurée. Le
serveur avait donc explicitement construit le chemin par lequel la ligne devait
revenir. Le client recevait le paquet et n'en faisait rien.

C'est une troisième forme de la famille ouverte au cycle 77-bis :

| cycle | forme |
|---|---|
| 77-bis | un état d'interface avec un lecteur et **aucun écrivain** |
| 78 | un producteur alimenté et **aucun lecteur** |
| **79** | un lecteur **branché**, qui s'exécute, et **dont l'écriture ne porte sur rien** |

Les deux premières se voient à un `grep`. La troisième non : les deux bouts sont
là, le fil est complet, et seule la coïncidence entre ce que le handler écrit et
ce que le cache contient à cet instant décide s'il se passe quelque chose.

## 5. Le correctif

Un geste, exactement l'inverse de celui du bannissement.
`dropConversationFromCache` avait déjà été extrait au cycle qui a unifié les
trois fins d'appartenance ; son pendant montant vivait, lui, enfermé dans le
corps de `handleConversationNew`. Il en sort sous le nom
`fetchConversationIntoCache` et sert désormais les **deux** entrées — un ajout,
et une réintégration. Elles diffèrent par ce qu'elles savent, pas par ce
qu'elles ont à faire.

Trois propriétés conservées mot pour mot du chemin `conversation:new` :

- **lecture BORNÉE** (`GET /conversations/:id`), jamais un rejeu de pages — la
  route de liste pagine par OFFSET sur un tri `lastMessageAt` décroissant, et la
  rejouer duplique une ligne à chaque frontière en en perdant une autre ;
- **idempotence** — une ligne déjà en cache sort avant la requête, et un second
  test à la résolution ferme la fenêtre où les deux entrées nommeraient la même
  conversation à quelques millisecondes d'écart ;
- **le `.catch` de dernier recours** reste l'unique invalidation de ce préfixe
  dans le fichier, au même endroit et pour la même raison : la lecture bornée
  vient d'échouer, et une ligne manquante à vie coûte plus qu'un rejeu.

Le tri-état est lu comme partout ailleurs dans ce couple d'événements :
`membershipRestored === false` dit « la levée n'a réadmis personne » (j'étais
parti de moi-même avant d'être banni) ; **son absence dit « restauré »**, parce
qu'un serveur antérieur au champ restaurait toujours. D'où `!== false`, jamais
`=== true` — même lecture que `membershipEnded` au bannissement, et même lecture
que `didRestoreMembership = membershipRestored ?? true` dans le SDK iOS.

## 6. La grille des frères, refermée

Leçon du cycle 77 : *une correction de charge utile se termine par un `grep` des
FRÈRES.* Faite, et elle rend cette fois un résultat **positif** :

- `SERVER_EVENTS` ne contient **aucun** `conversation:reopened` ni
  `conversation:restored` — `conversation:closed` et `conversation:deleted` n'ont
  pas de pendant montant, il n'y a donc pas d'autre no-op de cette forme à
  chercher de ce côté ;
- `conversation:participant-joined` **écarte délibérément l'arrivant** de son
  éventail (`participants.ts`, requête `NOT: { userId }`) : il reçoit
  `conversation:new`, dont l'effectif le compte déjà. Aucun trou ;
- `conversation:joined` / `conversation:left` sont des acks de ROOM, pas des
  changements d'appartenance — établi au cycle qui a retiré leur décrément.

**`conversation:participant-unbanned` était donc le seul pendant montant que le
contrat possède, et c'était exactement celui qui ne portait sur rien.**

## 7. Preuves

| gate | résultat |
|---|---|
| 3 nouveaux témoins de restauration, contre le handler de `main` | **ROUGE** (0 requête émise, liste vide après la levée) |
| leurs 3 témoins négatifs (débanni ≠ moi, `membershipRestored: false`, déjà en cache) | verts des deux côtés |
| `use-socket-cache-sync` après correctif | 87/87 verts |
| web — `__tests__/hooks` + `__tests__/services` + `hooks/queries/__tests__` | **178 suites, 4268 tests verts**, 2 skipped |
| `tsc` web | **0 erreur sur les deux fichiers touchés** (base du dépôt : 1276, inchangée) |

Les trois témoins négatifs comptent autant que les rouges : ils sont verts
**avant comme après**, et ce sont eux qui interdisent la sur-correction — la
levée qui ne réadmet personne, celle qui concerne quelqu'un d'autre, et le cas
où la ligne n'était jamais partie ne doivent ouvrir aucune requête.

Une note de forme sur le harnais : `createWrapperWithClient()` monte un
QueryClient à `gcTime: 0`. Une entrée posée par `setQueryData` **sans
observateur** y est ramassée au tick suivant, donc invisible après un `await` —
les premiers témoins asynchrones lisaient `undefined` et échouaient pour la
mauvaise raison. Les témoins asynchrones de ce bloc montent donc leur propre
client, comme le font déjà les témoins de rejeu de pages plus bas dans le même
fichier.

## 8. Pistes laissées ouvertes

**iOS porte le MÊME défaut, à l'identique.**
`ConversationListViewModel.swift` : le sink `participantBanned` teste `isMe` et
appelle `dropConversationLeftByMe` ; le sink `participantUnbanned`, vingt lignes
plus bas, n'a aucun test d'identité — son `convIndex(for:)` rend `nil` sur une
ligne absente et le sink sort en silence. Le correctif y est un miroir exact et
petit : la méthode d'insertion existe déjà
(`fetchAndPrependMissingConversation(id:source:)`, avec sa propre déduplication
`pendingMissingFetches`), et le tri-état est déjà lu correctement
(`didRestoreMembership = membershipRestored ?? true`). Il demande d'ajouter un
cas à l'énumération `source`.

**Non corrigé ici faute de pouvoir le VÉRIFIER** : ce conteneur est sous Linux,
sans Xcode ni toolchain Swift (`which swift swiftc xcodebuild` ne rend rien).
Une modification iOS n'y serait ni compilée ni testée, et la règle de cette
routine est de ne fusionner que ce qui est prouvé — même raison, mot pour mot,
qu'au cycle 78 pour `connectionRTT` et les listes de notifications mobiles. Le
constat est consigné avec l'emplacement exact, pas corrigé.

**Android n'a pas ce défaut-ci, il en a un plus petit.** Son SDK n'écoute pas
`conversation:participant-unbanned` du tout, et son seul consommateur de
`participant-banned` (`ConversationMembersViewModel`) ne touche pas la LISTE : il
retire la personne du **roster** d'une conversation ouverte. Aucune ligne ne
disparaît, donc rien à remettre — mais le roster garde le banni absent après sa
réintégration, jusqu'à une relecture. C'est un écart de parité fonctionnelle, de
la même classe que les entrées « écart produit » de la matrice du cycle 78.

**Ce que cette passe pourrait devenir, et pourquoi elle n'est pas une garde.**
« Ce handler a-t-il un effet ? » ne s'automatise pas : l'effet dépend de l'état
du cache à l'instant de la réception, pas du texte du handler. Ce qui
s'automatiserait — « ce handler écrit-il dans une collection dont un autre
handler retire des éléments ? » — rendrait un bruit de fond énorme. La sortie
utile reste ce qu'elle a été ici : **prendre les transitions d'un même domaine
et vérifier qu'elles forment une grille close**, montantes et descendantes
appariées. Le domaine « appartenance à une conversation » l'est désormais côté
web. Les domaines voisins restent à passer — appartenance à une communauté,
épinglage/archivage, blocage/déblocage d'un contact.

**Dette d'environnement, sans lien avec ce cycle.** `npx eslint` échoue dans ce
conteneur (`Oops! Something went wrong! — ESLint: 10.1.0`) : un ESLint global
sous `/opt/node22` est résolu à la place de celui du dépôt, et
`eslint-plugin-react` y casse sur la détection de version. Reproduit à
l'identique sur un fichier NON touché — c'est l'environnement, pas le diff. Le
lint du dépôt tourne normalement en CI.
