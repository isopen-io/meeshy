# Cycle 73 — fermer un fil n'éteignait pas ce qu'il portait de vivant

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-fq83pa`
**Périmètre** : gateway (`socketio/handlers/LocationHandler.ts`,
`socketio/announceConversationClosed.ts` — neuf,
`socketio/MeeshySocketIOManager.ts`, `routes/conversations/{core,leave,delete-for-me}.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile modifiés ;
un `location:live-stopped` de plus part, sur un événement que les trois clients
traitent déjà)

---

## 1. D'où vient ce cycle

Le cycle 72 a fermé l'ouverture d'appel et la création de lien sur un fil clos,
et a laissé quatre pistes. La deuxième nommait le site suivant de la famille :

> **Le partage de position vive (`LocationHandler`) est le prochain site de la
> même famille**, et le plus proche de l'appel : il diffuse dans la room de
> conversation et arme une minuterie jusqu'à 8 heures, sans jamais interroger
> l'état du fil.

Le balayage confirme la piste et rend davantage. `LocationHandler` est le
DERNIER émetteur de `socketio/handlers/` à écrire dans une room de conversation
sans lire l'état du conteneur — mais il porte AUSSI, seul de tous les sites de la
famille, un état serveur qui SURVIT à la clôture. Le défaut n'est donc pas
seulement une porte ouverte : c'est une porte ouverte **et** une pièce qu'on
n'éteint pas en partant.

---

## 2. Le défaut

### 2.1 Deux verbes, et le second n'existait dans aucun cycle précédent

| verbe | garde avant ce cycle | ce que ça coûtait |
|---|---|---|
| **DÉMARRER** un partage dans un fil clos | ❌ | accepté, diffusé, armé pour ≤ 8 h |
| **le partage DÉJÀ en cours** quand la clôture tombe | ❌ | l'épingle survit à la conversation, sans recours |

Le premier est la forme habituelle de la famille (cycles 31 / 70 / 71 / 72) : une
garde manquante à une porte. Le second est neuf, et c'est le cœur de ce cycle —
aucun des trois chemins de clôture n'éteignait quoi que ce soit ; ils
ANNONÇAIENT, et c'est tout.

### 2.2 Ce que ça coûtait — la propre argumentation du fichier, poussée d'un cran

L'en-tête de `LocationHandler` chiffre déjà ce défaut pour une autre cause, la
mort du socket :

> les pairs gardent une épingle qui se présente comme vivante, figée sur la
> dernière position connue, jusqu'à `expiresAt` : **jusqu'à 8 heures**
> (`durationMinutes` ≤ 480). Sur une fonction dont le contrat entier est « voici
> où je suis MAINTENANT », c'est un défaut de sécurité avant d'être un défaut
> d'affichage.

La clôture ajoute à cela ce qu'aucune des trois autres fins de vie n'ajoute :
**le partageur ne peut plus l'arrêter lui-même.** Les clients RETIRENT la
conversation de leur cache en recevant `conversation:closed` (web
`use-socket-cache-sync`, iOS `SocialSocketManager`) et `GET /conversations`
filtre `isActive: true` à la racine. Le fil disparaît donc de tous les écrans —
avec, dedans, l'unique commande `location:live-stop`. Une position réelle
continuait d'être diffusée pendant des heures depuis un écran auquel personne
n'a plus accès.

### 2.3 Pourquoi personne ne l'a vu — la fin qu'on cherche est celle du PARTAGE

L'en-tête énumère trois fins de vie, les traite toutes les trois, et les nomme
par leur mécanisme : le socket meurt, le terme arrive, la passerelle redémarre.
Les trois sont des fins du **partage**. La quatrième est une fin du
**CONTENEUR**, et une relecture qui demande « les fins de vie sont-elles
couvertes ? » trouve une liste qui se présente comme exhaustive et s'arrête.

C'est la même forme que le piège du cycle 71 (`addReaction` et ses quatre bonnes
gardes, dont la cinquième manquait) : **une liste plausible est plus dangereuse
qu'une liste vide**, parce qu'elle répond à la question qu'on est venu poser.

### 2.4 Le balayage — et pourquoi ce registre est le seul concerné

Trois unités de `socketio/` tiennent un registre en mémoire. Vérifié, pas
déduit :

| unité | clé | durée de vie | la clôture le concerne ? |
|---|---|---|---|
| `StatusHandler.activeTypers` | **socketId** | quelques secondes (TTL 30 s, geste client) | **non** — ni keyé par conversation, ni survivant au geste |
| `CallEventsHandler` (6 registres) | appel | l'appel | **hors périmètre assumé** — piste 1, décision produit |
| **`LocationHandler.sessions`** | **(conversation, compte)** | **jusqu'à 8 heures** | **oui, et lui seul** |

`LocationHandler` est donc à la fois le dernier émetteur de `socketio/handlers/`
à écrire dans une room de conversation sans lire l'état du conteneur, ET le seul
à porter un état serveur qui lui survit assez longtemps pour que ça compte.

---

## 3. L'implémentation

### 3.1 Un point de convergence, pas trois gardes

Trois routes ferment une conversation — `DELETE /conversations/:id`
(`core.ts`), le départ du dernier membre (`leave.ts`), la suppression pour soi
qui emporte le fil (`delete-for-me.ts`). Chacune portait sa copie de l'annonce,
alignées à la main et alignées trois fois.

Le dépôt a déjà payé cet alignement deux fois : le cycle 67 (`leave.ts`
n'écrivait qu'`isActive: false` là où ses jumeaux posaient les trois champs —
trente-sept cycles d'écart) et le cycle 71 (une règle appliquée à un verbe quand
quatre l'exigeaient). **Ajouter un appel à chacune des trois routes aurait donc
reproduit exactement la structure qui a produit les deux défauts précédents.**

`socketio/announceConversationClosed.ts` est l'unité qui les remplace :

```ts
manager?.endLiveLocationsForClosedConversation?.(conversationId);
if (participants.length === 0) return [];
return emitToConversationParticipants({ …, event: SERVER_EVENTS.CONVERSATION_CLOSED, … });
```

Fermer un fil n'est plus « émettre un événement » : c'est **éteindre ce que le
fil portait de vivant, PUIS l'annoncer**. Le prochain chemin de clôture hérite
des deux, parce qu'il n'y a plus qu'une façon d'annoncer.

### 3.2 L'ORDRE, et pourquoi il n'est pas indifférent

L'extinction précède l'annonce. Les clients retirent la conversation de leur
cache en recevant `conversation:closed` : un `location:live-stopped` émis APRÈS
tomberait sur un fil qu'ils ne connaissent plus, et l'épingle resterait à
l'écran — dans un état dont, cette fois, plus aucun écran ne permet de sortir.
Un témoin tient l'ordre (§ 4).

### 3.3 L'extinction n'invente AUCUN mécanisme

`endSessionsForClosedConversation` **avance le terme à maintenant** et diffuse le
retrait, c'est-à-dire qu'elle fait de la clôture une expiration anticipée. Les
trois propriétés du cycle de vie sont donc déjà écrites et déjà gardées :

| propriété | ce qui la tient | écrit par ce cycle |
|---|---|---|
| les `live-update` d'après sont tus | la borne `now >= session.expiresAt` de `handleLiveLocationUpdate` | **rien** |
| le rattrapage ne rejoue plus l'entrée | le même test dans `replayLiveLocationsTo` | **rien** |
| la déconnexion la ramasse sans rediffuser | `wasLive = now < session.expiresAt` dans `handleSocketDisconnecting` | **rien** |

Supprimer l'entrée aurait au contraire cassé la première : l'en-tête pose qu'« une
session INCONNUE n'est jamais une session TERMINÉE » (sans quoi tout partage
mourrait à chaque redéploiement), donc une entrée effacée laisse passer les mises
à jour suivantes. Avancer le terme est la seule forme qui obtient les trois
propriétés sans en écrire une.

### 3.4 La garde de DÉPART, et le chemin chaud qu'elle ne touche pas

`handleLiveLocationStart` interroge l'état du fil — une lecture, `select:
{ isActive: true, closedAt: true }`, avec `isConversationClosed` de
`conversationWriteAdmission` comme les quatre portes d'entrée. **Aucune lecture
n'est ajoutée à `handleLiveLocationUpdate`**, qui est le chemin chaud (une
position par seconde et par partageur) : les mises à jour d'un partage ouvert
avant la clôture sont tues par le terme avancé, sans base de données. Un témoin
tient cette absence.

La garde est posée APRÈS l'appartenance : l'état d'un fil ne se raconte pas à qui
n'y est pas.

---

## 4. Les gardes, et lesquelles comptent

**20 témoins neufs**, deux fichiers, plus 4 témoins de route.

`socketio/handlers/__tests__/LocationHandler.closedConversation.test.ts` (14) —
les deux formes de clôture (`closedAt` ; `isActive: false` SEUL, la population
héritée que rien ne rétro-remplit), l'absence de session ouverte, le contrôle
« conversation ouverte », l'absence de lecture sur le chemin chaud, et les sept
propriétés de l'extinction (diffusion, mises à jour tues, rattrapage muet,
pas de double annonce à la déconnexion, minuterie désarmée, autres conversations
intactes, partage déjà terminé sauté).

`socketio/__tests__/announceConversationClosed.test.ts` (6) — l'ORDRE
extinction → annonce, l'extinction même sans audience, la charge utile, le
fan-out room de conversation + rooms personnelles (invité de lien compris), et
les deux formes de passerelle dégradée.

### 4.1 Les deux témoins qui ne pouvaient pas être devinés

**Le `select`.** `isConversationClosed` accepte une ligne n'ayant qu'UNE des deux
propriétés : en retirer une **compile**, et le double mocké rend de toute façon
l'objet qu'on lui dicte. Tous les témoins de comportement restent VERTS pendant
que la production rouvre la porte à toute la population héritée. Mesuré, pas
supposé :

| mutation | témoins de comportement | témoin de requête |
|---|---|---|
| `isActive` retiré du `select` | **13 verts** | **1 ROUGE** |

**L'ordre.** Inverser extinction et annonce ne fait tomber aucun témoin de
présence : les deux appels ont lieu. Seul un témoin qui enregistre la SÉQUENCE
peut le voir, et c'est ce que fait `order` dans le double.

### 4.2 RED prouvé, à chaque étage

| production retirée | témoins tombés |
|---|---|
| `LocationHandler.ts` | **12 sur 14** (les 2 survivants sont le contrôle « ouverte » et l'absence de lecture chaude — verts par construction sans la garde) |
| les 3 routes de clôture | **4 sur 4** des témoins de route, et eux seuls |

### 4.3 Une assertion DÉPLACÉE, pas retirée

Le témoin `happy path: … broadcasts CONVERSATION_CLOSED` de
`conversation-core.test.ts` est tombé sur l'uniformisation de la garde
d'audience vide (`core.ts` émettait sans condition ; ses deux jumeaux non). Sa
fixture posait `participants: []` — une clôture dont l'auteur, ACTIF à l'instant
de l'écriture, ne figure pas dans l'audience, ce qui n'arrive pas en production.
La fixture a été rendue réaliste et **l'assertion d'audience vide déplacée dans
un témoin qui la nomme**, plutôt que retirée (leçon du cycle 71).

---

## 5. Vérification

- `services/gateway` : suite complète VERTE (`bun run test`).
- `tsc --noEmit` gateway : propre.
- Aucun schéma Prisma, aucune migration, aucune dépendance.

---

## 6. Pistes pour le cycle 74

1. **Les appels EN COURS restent la piste 1 du cycle 72, et elle est maintenant
   plus étroite.** `announceConversationClosed` est l'endroit où la réponse
   s'écrirait si la décision produit était prise — une ligne, au même endroit que
   l'extinction des positions. La décision reste PRODUIT : couper une
   conversation vocale en cours n'est pas de même nature qu'éteindre une épingle
   que plus personne ne peut retirer.
2. **`POST /links` avec `conversationId === "meeshy"`** (piste 3 du cycle 72,
   intacte) : la branche résout l'appartenance par `findFirst({ identifier:
   "meeshy" })` puis relit la conversation par `findUnique({ where: { id:
   "meeshy" } })` — l'identifiant littéral, pas l'`ObjectId` résolu juste
   au-dessus. À instruire pour savoir si elle a jamais rendu autre chose qu'un
   404.
3. **La moitié COMMUNAUTÉ des préférences** (piste 4 du cycle 72, intacte) :
   `POST /user-preferences/communities/reorder` écrit et se TAIT là où sa jumelle
   CONVERSATION diffuse `USER_PREFERENCES_REORDERED`, et `PUT
   /user-preferences/communities/:id` est un upsert **sans garde
   d'appartenance**. La seconde moitié est une faille d'autorisation et ne
   demande aucun travail client — elle peut être traitée seule.
4. **Le registre des partages est par PROCESSUS.** Une passerelle répliquée
   n'éteint que les sessions dont elle porte l'entrée ; les autres instances
   continuent de relayer jusqu'au terme. Sans conséquence tant que le déploiement
   est mono-instance, à nommer avant qu'il ne cesse de l'être. Le même constat
   vaut déjà pour les trois fins de vie existantes — ce cycle n'aggrave rien, il
   rend la borne visible.
