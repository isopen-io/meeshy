# Cycle 71 — « no one can write » avait été appliqué à UN seul verbe

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-hmb9uj`
**Périmètre** : gateway (`services/ReactionService.ts`,
`services/messaging/messageEditAdmission.ts`, `routes/reactions.ts`,
`routes/messages.ts`, `routes/conversations/messages-advanced.ts`,
`socketio/handlers/MessageHandler.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile
modifiés ; un code de refus s'ajoute — 410)

---

## 1. D'où vient ce cycle

Le cycle 70 a fermé l'ENTRÉE dans une conversation close et laissé cinq pistes.
La première nommait le sujet sans le trancher :

> **Un membre ACTIF d'une conversation close reste actif, indéfiniment.** […]
> C'est sans victime tant que chaque lecteur pense à opposer l'état de la
> conversation — ce que `conversationWriteAdmission` fait […] mais qui est une
> propriété de chaque lecteur pris un par un. **À instruire lecteur par
> lecteur.**

Instruire « lecteur par lecteur » demande de savoir QUI lit. Le balayage rend
autre chose que ce que la piste annonçait, et c'est le cycle entier :
le problème n'est pas du côté des lecteurs, il est du côté des **écrivains**.

`grep` de `admitConversationWrite|isConversationClosed` sur tout
`services/gateway/src` rend **trois** sites de production : le point de
convergence des envois (`MessagingService`) et les deux chemins de message par
lien. Rien d'autre. Aucun fichier de `src/socketio/` ne mentionne `closedAt`.

---

## 2. Le défaut

### 2.1 La phrase du schéma nomme un ÉTAT ; on l'a appliquée à un VERBE

`packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
« Conversation closed for all — **no one can write**, messages stay readable ».
Le cycle 31 a fait respecter cette phrase et l'a écrite en long dans
`conversationWriteAdmission`.

« Écrire » y a été lu comme « envoyer un message ». Or trois autres verbes
écrivent dans le même conteneur, créent une ligne, et **diffusent** :

| verbe | unité de convergence | transports | gardé avant ce cycle |
|---|---|---|---|
| envoyer | `admitConversationWrite` | 3 | ✅ cycle 31 |
| **réagir** | `ReactionService.addReaction` | **4** | ❌ |
| **éditer** | `admitMessageEdit` | **4** | ❌ |
| retirer / effacer | — | — | ❌ **et c'est voulu**, § 3 |

### 2.2 Ce que ça coûtait — le symptôme EXACT que le cycle 31 avait corrigé

`GET /conversations` filtre `isActive: true` à la racine, et les clients
retirent la conversation de leur cache sur `conversation:closed` (web
`use-socket-cache-sync`, iOS `SocialSocketManager`). Donc :

- une réaction posée après la clôture partait vers une room que **plus personne
  n'écoute**, et sa notification vers un fil **introuvable dans la liste** ;
- une édition diffusait `message:edited` dans les mêmes conditions, et mutait
  pour toujours le contenu d'un fil que le serveur a déclaré mort.

C'est mot pour mot le coût que le cycle 31 avait chiffré pour l'envoi. Il a
survécu trente-neuf cycles sous deux autres verbes.

### 2.3 Pourquoi personne ne l'a vu — la garde manquait à une liste qui semblait complète

`addReaction` est le cas frappant. Sa liste de gardes se lit comme exhaustive :

```
message existe → message non supprimé → message non « system » → l'appelant est participant actif
```

Quatre questions, quatre bonnes questions. **La cinquième — le conteneur
est-il vivant ? — n'y est pas**, et une relecture qui cherche « les gardes
sont-elles là ? » les trouve toutes et s'arrête. C'est la variante « liste
plausible » du piège du cycle 70 (« une question non posée n'a pas de réponse
fausse à corriger »).

Et surtout : **l'état du conteneur était DÉJÀ EN MAIN.** `addReaction` charge
`message.conversation` par un `include` depuis toujours — `isActive` et
`closedAt` étaient dans l'objet, à chaque appel, sans lecteur.

### 2.4 Les DEUX colonnes, encore

`isConversationClosed` lit `isActive === false || closedAt != null`. Ce n'est pas
de la ceinture : `leave.ts` a posé pendant trente-sept cycles `isActive: false`
SEUL. Ces lignes existent en base, rien ne les rétro-remplit, et un prédicat
mono-colonne les laisserait accepter du contenu. Les deux formes ont chacune leur
témoin, aux deux verbes.

---

## 3. Ce qui n'est PAS gardé, et pourquoi c'est une décision

`removeReaction` et `admitMessageDelete` restent ouverts sur un fil clos.

> **Un conteneur mort n'admet plus de contenu NEUF ; il continue d'admettre le
> RETRAIT de ce qu'il porte déjà.**

La clôture est **irréversible** — aucun écrivain du dépôt ne rallume
`Conversation.isActive` (constat du cycle 31, revérifié). Refuser la rétraction
enfermerait donc quelqu'un dans un contenu qu'il ne pourrait **plus jamais**
reprendre. C'est aussi la lecture littérale du schéma : « messages stay
readable » parle de lecture, pas d'immuabilité.

Le choix est GELÉ par un témoin (`conversationClosedWriteVerbs.test.ts` § 3) et
consigné sur `removeReaction`. S'il rougit un jour, c'est qu'on a étendu la garde
au retrait — ce qui demande un arbitrage produit, pas un correctif.

---

## 4. L'ordre de la garde d'édition est une propriété de SÉCURITÉ

`admitConversationWriteFor` tranche la clôture **en premier**.
`admitMessageEdit` la tranche **en dernier**, sur la seule décision qui allait
être admise. L'écart est délibéré et tient au périmètre des appelants :

- le point de convergence de l'envoi ne s'atteint qu'avec une conversation
  résolue et une appartenance prouvée — aucun oracle possible ;
- `PUT /messages/:messageId` s'atteint avec un `messageId` **nu**, et rend un 404
  volontairement indistinct sur tout refus non temporel pour ne pas devenir un
  oracle d'existence.

Trancher la clôture avant l'autorisation aurait rendu cet oracle — « ce message
existe, et son fil est clos » — à un inconnu, **sur les quatre transports d'un
coup**. Placée en dernier, la clôture ne se révèle qu'à qui aurait été admis
sans elle : chaque transport peut alors en dire le vrai motif sans rien fuiter.
Un témoin gèle la propriété (« ne révèle PAS la clôture à qui n'avait de toute
façon pas le droit d'éditer »).

---

## 5. La correction

### 5.1 Réagir — une garde, quatre transports, ZÉRO lecture de plus

Les quatre écrivains (`socket reaction:add`,
`POST /conversations/:id/messages/:mid/reactions`, `POST /reactions`, chemin
agent) convergent tous sur `ReactionService.addReaction`. La garde y est posée
une fois, sur la conversation que l'`include` ramenait déjà : **aucun
aller-retour ajouté**, mesuré par témoin.

### 5.2 Éditer — le paramètre est REQUIS, pas optionnel

`admitMessageEdit` reçoit `message.conversation`, **exigé** dans le type. C'est
la discipline du cycle 70 : optionnel, le transport qui l'oublie garde le trou et
personne ne le voit ; requis, la compilation échoue — elle a d'ailleurs nommé
elle-même les quatre appelants, et le nommera pour un cinquième transport qui
n'existe pas encore. Chacun élargit une lecture qu'il faisait déjà de deux
colonnes ; `PATCH /messages/:messageId` chargeait même la conversation entière.

### 5.3 Le refus ne retombe dans le `else` de personne

Deux endroits rangeaient tout motif AJOUTÉ dans leur branche par défaut — la
maladie que `describeConversationWriteRefusal` soigne côté envoi :

- les quatre transports d'édition auraient annoncé « vous n'êtes pas autorisé »
  pour un état qui n'a rien d'une autorisation ;
- `routes/reactions.ts` trie les erreurs du service **par comparaison de
  chaînes** et retombe sur `sendInternalError` : le refus serait sorti en
  **500**, donc en panne serveur, donc en client qui réessaie sans fin. La
  phrase est désormais une constante exportée
  (`CLOSED_CONVERSATION_REACTION_ERROR`), indissociable de son lecteur.

Statut retenu : **410**, avec la phrase déjà employée par les portes d'entrée du
cycle 70 (« Cette conversation est terminée »). Un 403 dirait « pas vous », quand
le sujet est « plus personne, plus jamais ». Les autres motifs gardent le
vocabulaire de LEUR transport — unifier les phrases retirerait à
`PUT /messages/:messageId` l'indistinction qui le protège (§ 4).

---

## 6. Vérification

### 6.1 Le ROUGE, mesuré et non supposé

Le fichier neuf commence par un rouge de COMPILATION (`TS2561`, champ inconnu) —
qui ne prouve rien, leçon 234. Le type a donc été posé SEUL, sans logique de
garde, pour obtenir un rouge de COMPORTEMENT :

```
Tests: 7 failed, 6 passed, 13 total
```

Les 7 rouges sont exactement les deux verbes × les deux formes de clôture, plus
les cas de rang. Les 6 verts sont les contre-épreuves — fil vivant, `null`
permissif, non-oracle, rétraction admise : elles **bornent** la correction et ne
détectent pas le défaut, c'est leur fonction.

Les deux témoins de route sont prouvés par mutation au scalpel de la SEULE ligne
de garde (`if (false && …)`) : 2 rouges, restaurés verts.

### 6.2 Aucun témoin existant n'a été réécrit

Aucune assertion existante n'est touchée. Le seul fichier modifié
(`messageEditAdmission.test.ts`) reçoit `conversation: null` — le permissif
explicite — parce que le compilateur l'exige, et chacune de ses assertions dit
exactement ce qu'elle disait. **Le défaut n'a pas survécu à un témoin : il a
survécu à leur absence**, comme aux cycles 68, 69 et 70 sur leurs familles.

### 6.3 Gates

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suites unités (admissions + réactions) | ✅ 413/413 |
| Suite de route `messages-advanced` | ✅ 153/153 (+2) |
| Suite gateway complète | ✅ (voir § 5 de la PR) |
| Clients (web / iOS / Android) | **aucun changement** |

---

## 7. Pistes pour le cycle 72

1. **`typing:start` n'oppose rien à la clôture** (`StatusHandler`). Non corrigé
   ICI, et c'est un arbitrage de coût : la garde demanderait une lecture de
   `Conversation` sur l'événement le PLUS fréquent du transport, pour un signal
   éphémère qui n'écrit rien et qui atterrit dans une room que les clients ont
   déjà retirée. Le corriger proprement demande de porter l'état du conteneur
   dans le cache de room, pas d'ajouter une requête — **à mesurer avant de
   livrer**.
2. **Les appels (`CallEventsHandler`) n'ont pas été audités sous cet angle.**
   Démarrer un appel dans un fil clos est un verbe d'écriture de plus, avec sa
   propre convergence. Non instruit par ce cycle.
3. **La piste 3 du cycle 70 reste ouverte** : les liens de partage d'une
   conversation close restent `isActive: true` en base, et les écrans
   d'administration les présentent comme vivants. Cosmétique, réel.
4. **Le tri d'erreurs par comparaison de chaînes de `routes/reactions.ts` reste
   la forme fragile.** Ce cycle en neutralise l'occurrence (constante partagée)
   sans changer la forme : tout nouveau `throw` du service y retombera encore en
   500. Le remède est un refus TYPÉ, comme `ConversationWriteAdmission` — coût
   moyen, non mesuré.
5. **La piste 1 du cycle 70 reste vraie et reste ouverte** : un membre actif
   d'une conversation close reste actif indéfiniment. Ce cycle instruit les
   ÉCRIVAINS ; il ne dit toujours rien des LECTEURS pris un par un.
