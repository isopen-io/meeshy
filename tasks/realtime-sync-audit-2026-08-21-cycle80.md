# Cycle 80 — Le rejet de la bannière d'épingle était un booléen collant

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-t88y9b`
**Périmètre** : web (`components/conversations/PinnedMessageBanner.tsx`, sa suite
de tests, `styles/lentille-tokens.css`)

**Clients touchés** : web seul. Aucun nom d'événement ajouté ni retiré du
contrat, aucune charge utile modifiée, aucune ligne de passerelle touchée.

---

## 1. D'où vient ce cycle

Le cycle 79 s'est clos sur une consigne explicite : « prendre les transitions
d'un même domaine et vérifier qu'elles forment une grille CLOSE, montantes et
descendantes appariées ». Le domaine « appartenance à une conversation » l'était
désormais ; les domaines voisins restaient à passer.

Ce cycle passe **l'épinglage de message**, et y trouve la même forme — mais
déplacée d'un cran. Le défaut n'est pas dans le couple d'événements du serveur
(`message:pinned` / `message:unpinned` sont parfaitement appariés, et les deux
émetteurs portent bien `conversationId`). Il est dans une transition **purement
locale** que rien n'appariait : **le rejet de la bannière par le lecteur**.

## 2. Une descendante sans sa montante

`PinnedMessageBanner` portait un `dismissed: boolean`, mis à `true` par la croix
et remis à `false` par **rien**. Or ce que le booléen prétend masquer — « l'épingle
courante » — change sous lui de deux façons :

| transition | ce qui bouge | ce que la bannière faisait |
|---|---|---|
| le lecteur ferme la bannière | `dismissed = true` | masque — correct |
| **un modérateur épingle un AUTRE message** | `data[0].id` change | **reste masquée** |
| **le lecteur change de conversation** | `conversationId` change | **reste masquée** |

Les deux dernières lignes sont le défaut. Une fois la croix touchée, la bannière
ne revenait plus : ni pour une nouvelle épingle, ni dans une autre conversation.

## 3. Pourquoi le changement de conversation ne réarmait rien

C'est le point non évident, et il tient au site de montage
(`ConversationView.tsx:362`) :

```tsx
<PinnedMessageBanner
  conversationId={conversation.id}
  onNavigateToMessage={(id) => void onNavigateToMessage(id)}
/>
```

**Aucun `key`.** `conversationId` n'est qu'une *prop* : React réconcilie par
position et par type, l'instance est donc RÉUTILISÉE d'une conversation à
l'autre, et son état local avec elle. La query, elle, est bien re-clée
(`['pinned-messages', conversationId]`) et refetche correctement — les données
changeaient, le `dismissed` non.

Conséquence concrète : un lecteur qui ferme la bannière une fois, n'importe où,
ne voit plus **aucune** épingle de **aucune** conversation, jusqu'à un
rechargement complet de la page. Aucun filet ne rattrape ça — ce n'est pas un
état de cache, c'est un `useState`.

## 4. Le correctif : retenir l'identité, jamais un booléen

Le champ devient `dismissedMessageId: string | null`, et le masquage se lit
`dismissedMessageId === pinnedMessage.id`.

Les `messageId` sont des ObjectId MongoDB, donc **globalement uniques** : un
identifiant rejeté dans la conversation A ne peut pas collider avec l'épingle de
la conversation B. **Un seul champ ferme donc les deux trous** — pas besoin d'une
clé composée `conversationId:messageId`, ni d'un `useEffect` de remise à zéro sur
changement de prop (qui aurait ajouté un rendu et une dépendance de plus).

C'est aussi la forme que la règle maison prescrit déjà pour la base
(« pas de booléen redondant : un champ nullable suffit, `null` = faux »),
appliquée ici à un état de composant.

Le témoin négatif compte autant que les positifs : **la même épingle re-servie
reste rejetée**. Sans lui, un correctif qui réarme à chaque refetch passerait —
et le bouton de fermeture ne fermerait plus rien.

## 5. Défaut voisin trouvé au passage : l'invalidation n'était pas bornée

Le même `useEffect` s'abonnait ainsi :

```ts
socket.on('message:pinned', invalidate);   // invalidate() ignorait la charge utile
```

Or la passerelle diffuse dans la room de **sa** conversation
(`to(ROOMS.conversation(conversationId))`, `routes/conversations/messages.ts`) et
le web est joint à **toutes** les rooms de ses conversations. Un épinglage
n'importe où déclenchait donc un `GET /conversations/<conversation OUVERTE>/pinned-messages`
dont le résultat est, par construction, identique à celui déjà en cache.

Le filtre lit la charge utile **par la NÉGATIVE**, comme le tri-état
`membershipRestored` du cycle 79 : on ne saute que sur une conversation **nommée
et différente**. Une charge utile sans `conversationId` ne prouve pas que
l'épingle est ailleurs — elle rafraîchit, comme avant. (Les deux émetteurs de
production le portent ; la lecture négative protège d'un troisième à venir.)

## 6. Ce qui a été vérifié

| garde | résultat |
|---|---|
| suite `PinnedMessageBanner` | **12/12** (6 nouveaux témoins) |
| suite web complète | **743 suites / 13 896 tests, 0 échec** |
| `tsc` web | **0 erreur sur le fichier touché** (base du dépôt : 1276, inchangée) |

**Preuve par mutation** — les trois témoins neufs échouent bien AVANT le
correctif, et chaque garde a été prouvée liante en la neutralisant une par une :

- masquage retiré (`if (!pinnedMessage)`) ⇒ **2 rouges**, dont le témoin négatif ;
- filtre de portée neutralisé (`if (false) return;`) ⇒ **1 rouge**, le témoin de
  portée exactement.

Le rouge initial de la portée était `Expected: 1, Received: 3` : deux épinglages
étrangers, deux refetch inutiles — le gaspillage mesuré, pas supposé.

## 7. Réparation d'un rouge de `main`, sans lien avec ce cycle

La suite web complète partait **déjà rouge sur `main` propre** (vérifié en
remisant le diff) : `__tests__/styles/lentille-tokens.parity.test.ts`, 78 jetons
CSS pour 82 en JSON. C'est le rouge des runs CI 11015 et 11016.

Le lot 9 Lentille avait enrichi `packages/shared/design/lentille-tokens.json`
(`list.focusCard` : `height: 104`, `padding.vertical: 14`, `avatarSize: 52`,
`nameSize: 17`) sans mirroir dans `apps/web/styles/lentille-tokens.css`.

Réparé **du côté du jeton, pas du test**, comme la philosophie inscrite en tête
de cette suite l'exige (« never repair the test by copying the drifted value ») :
les quatre propriétés personnalisées sont ajoutées avec les valeurs du JSON, qui
est la source de vérité déclarée. Parité rétablie 82/82.

**Collision bénigne, notée pour l'honnêteté du journal** : `main` a reçu la même
réparation en parallèle (`1def3504`, 23h57), **octet pour octet identique**. Le
merge manuel de `main` dans cette branche l'a résolue en un seul exemplaire — pas
de doublon de déclaration, vérifié à la main sur le fichier fusionné. La
contribution NETTE de ce cycle sur ce fichier est donc nulle ; seul le diagnostic
reste utile (le rouge venait bien du lot 9, pas du diff de ce cycle).

## 8. Pistes laissées ouvertes

**Le site de montage reste sans `key`.** Le correctif rend la bannière correcte
sans lui, et c'est volontaire — un `key={conversation.id}` aurait masqué le
défaut de classe plutôt que de le corriger, et aurait forcé un remontage complet
(donc un état de query jeté) à chaque changement de conversation. Mais tout
AUTRE état local ajouté un jour à ce composant héritera du même piège. À vérifier
si le composant s'étoffe.

**La famille est plus large que cette bannière.** « Un état local de rejet /
masquage / repli qu'aucune transition ne réarme » est cherchable, contrairement à
la question du cycle 79 sur l'effet des handlers. Le motif est
`useState(false)` + un seul `set…(true)` dans le fichier, sur un composant monté
sans `key` et paramétré par une entité. Passe à faire.

**Les domaines voisins nommés au cycle 79 restent ouverts** : appartenance à une
communauté, épinglage/archivage de CONVERSATION (distinct de l'épinglage de
message traité ici), blocage/déblocage d'un contact.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue dans
ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de celui
du dépôt). Reproduit sur un fichier non touché — c'est l'environnement, pas le
diff. Le lint du dépôt tourne normalement en CI.
