# Cycle 126 — note de CONVERGENCE : deux passes ont trouvé le même défaut, séparément

> Ce document ne décrit pas un lot, il décrit une RENCONTRE. Le lot lui-même est
> `tasks/todo-cycle126-bannieres-jumelles-2026-08-24.md` et
> `tasks/realtime-sync-audit-2026-08-24-cycle126.md` — ceux de la passe qui a mergé la première.

## Ce qui s'est passé

Deux passes ont instruit le même suivi MESURÉ du cycle 124 en parallèle, sans se voir, et ont
trouvé le même défaut : **les éventails RÉPONSE et MENTION ne poussaient pas `messageCreatedAt` /
`messageType`**, donc la bulle que la NSE iOS pré-enregistre au démarrage à froid portait l'horloge
du DEVICE et se rendait en `text` — un rectangle vide pour une réponse vocale, ces éventails ne
poussant pas `attachmentMimeType` non plus (décision du cycle 125 bis).

Les deux correctifs sont **fonctionnellement équivalents**, y compris sur les trois arbitrages qui
comptent :

| arbitrage | passe mergée (PR #3483) | cette passe |
|---|---|---|
| une seule requête (colonnes ajoutées au `select` existant) | ✅ | ✅ |
| l'estampille N'EST PAS gardée comme du contenu (elle survit au placeholder de protection) | ✅ | ✅ |
| fail-OPEN : relecture en échec ⇒ aucune clé, jamais une horloge inventée | ✅ | ✅ |
| garde `instanceof Date` sur la colonne | ✅ | ✅ |

Elles ne diffèrent que par la FORME du type porteur — `MessageBannerSource` plat contre un
`MessageNotificationSource { prism, stamp }` imbriqué — et par le site de la projection
(`messageClockFields` dédié contre un `prePersistedMessageFields` élargi).

## Ce qui a été retenu, et pourquoi

**L'implémentation de la passe mergée la première**, conformément au précédent posé au cycle 123
(« Note de convergence — l'implémentation retenue est celle de l'itération 257, la première
mergée »). Faire cohabiter deux abstractions parallèles pour la même règle est strictement pire que
l'une des deux : c'est exactement le mécanisme qui a produit les familles divergentes des
cycles 118 à 122.

**Et elle couvrait PLUS.** La passe mergée a trouvé un second champ resté derrière le cycle 125 bis
que celle-ci n'avait pas vu : `notificationLocKey` — la clé qui QUALIFIE le placeholder de
protection et sert de SECOND VERROU à `createNotification`. Sa leçon (§ 279, « un lot qui fait
CONVERGER une chaîne laisse derrière tout ce qui la QUALIFIE ») généralise mieux que la formulation
de cette passe, centrée sur le seul helper.

## Ce que cette passe a apporté au lot mergé

Un témoin que le lot mergé n'avait pas, ajouté à son propre fichier
(`replyMentionBannerClock.test.ts`) :

> **`createMentionNotificationsBatch` — deux mentionnés ⇒ UNE seule relecture du message.**

Les témoins du lot mergé exercent `createMentionNotification` en SOLO. Le chemin de production est
le BATCH, et c'est lui qui porte le risque que ce correctif introduit : **élargir un `select` est
exactement le geste qui invite à ouvrir une seconde lecture**, et une lecture PAR DESTINATAIRE ne
rougit nulle part — elle se paie en latence de fan-out, sur un chemin que personne ne mesure.

Le témoin exige N > 1 : à un seul mentionné, « une lecture » et « une lecture par destinataire »
rendent le même compte, et l'assertion ne peut pas tomber. C'est la leçon 276 transposée — un
témoin de rang s'écrit sur un rang autre que le premier ; ici, sur un lot autre que le singleton.

**ROUGE prouvé** : en retirant le `prismSource` que le batch relaie, le témoin tombe (3 lectures au
lieu d'1) et **aucun autre témoin du dépôt ne bouge**.

## Gates de cette passe

| gate | résultat |
|---|---|
| `replyMentionBannerClock.test.ts` (fichier mergé + témoin ajouté) | **20 témoins verts** ; le nouveau prouvé ROUGE sous mutation |
| suite gateway complète, sur l'arbre APRÈS merge | **859 suites / 19 539 témoins verts** (exit 0) |
| `services/gateway` `tsc --noEmit` | 0 erreur |

Les 19 539 témoins de l'arbre mergé se comparent aux 19 527 mesurés sur cette passe seule et
aux 19 538 annoncés par la passe mergée : l'écart de +1 est le témoin de batch ajouté ci-dessus.

## La leçon de la rencontre elle-même

C'est la **deuxième** convergence de ce type en quatre cycles (la première : itération 257 ↔
cycle 123, qui avait câblé COMMENTAIRES et STATUS à l'identique). Les deux fois, le point de départ
était un **suivi MESURÉ écrit dans le dépôt** — et c'est précisément ce qui rend la collision
probable : un suivi bien écrit est une piste que n'importe quelle passe suivante saura reprendre.

> Ce n'est pas du gaspillage à supprimer, c'est le prix d'un backlog LISIBLE — et il se paie en
> travail dupliqué, jamais en défaut manqué. La contre-mesure n'est pas d'écrire des suivis plus
> vagues : c'est de **relire `origin/main` avant de committer**, et de converger sur la première
> implémentation mergée plutôt que de défendre la sienne.
