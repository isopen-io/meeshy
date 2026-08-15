# Audit synchro temps réel — cycle 39 (2026-08-15)

## Ce cycle a d'abord été un doublon, et c'est son principal enseignement

La piste ouverte en clôture du cycle 37 — le conflit des deux rôles d'`args.userId`
dans `broadcastReadStatusUpdate` — a été instruite **deux fois en parallèle**, par
deux sessions de la même routine, sans que ni l'une ni l'autre ne le sache :

| | Session A (PR #3052) | Session B (ce cycle) |
|---|---|---|
| Défaut trouvé | identique | identique |
| Diagnostic | « une variable servait deux rôles qui divergent sur cette population » | « l'ORIGINE de la valeur prédit sa justesse : colonne Prisma vs contexte d'auth » |
| Correctif | `actorUserId = isAnonymous ? null : userId` en ligne sur 4 sites + signature `actorUserId: string \| null` | unité nommée `resolveBroadcastActor` rendant les deux moitiés |
| Fichier d'audit | `…-cycle38.md` | `…-cycle38.md` — **même nom** |
| Mergé | 21:06 | jamais — arrivé après |

Le correctif de la session A est entré dans `main` **une heure avant** que celui
de la session B n'ouvre sa PR. Les deux ont vu les mêmes 5 RED, les deux ont
écrit les mêmes gardes anti-sur-correction, les deux ont produit un journal
d'audit portant le même nom de fichier.

**Ce qui a été livré ici n'est donc PAS le correctif** — il existait déjà, il est
juste, et le redéposer aurait produit un conflit sur du code fraîchement mergé
pour aucun gain. Ce qui reste est le **bout que la session A n'a pas fermé**, et
qui n'existe que PARCE QUE son correctif est juste.

## Le bout qui restait ouvert

En rendant `payload.userId` légitimement `null` pour un invité de lien partagé,
la PR #3052 a rendu **inapplicable, pour cette population, le seul contrat qui
disait comment revendiquer `lastReadAt` et `unreadCount`** :

> `Scoped to userId: it lets that user's OTHER devices sync their own read
> cursor. Recipients whose id differs from userId MUST ignore it.`

Un client sans compte compare `userId` à sa propre identité, ne trouve `null`, et
laisse tomber deux champs qui lui étaient précisément destinés. La synchro de
curseur multi-appareils de la population anonyme n'a plus de clé.

**Le payload porte pourtant déjà l'identité qui convient.** `participantId` est la
ligne d'appartenance de l'acteur :

- non nulle pour TOUTE la population ;
- partagée par tous les appareils d'une même identité — une seule ligne
  `Participant` par couple conversation/identité, pour un inscrit comme pour un
  invité ;
- **exactement la même règle que celle qui nomme la room personnelle**
  (`personalRoomKey = actorUserId ?? participantId`, PR #3052).

L'acteur se reconnaît donc par `userId ?? participantId`, dans cet ordre. Une
seule règle d'identité d'acteur dans tout le système, pas deux.

## Ce que ça coûte, et à qui

**Rien, à personne.** Un client à compte compare son `User.id` et n'a rien à
changer : la seconde branche ne s'ouvre que là où la première est nulle. Aucun
changement de code serveur — la valeur voyage déjà dans le payload, seul son
statut de clé revendicable était tu.

Vérifié avant écriture, les trois consommateurs :

| Consommateur | Lit `lastReadAt`/`unreadCount` ? | Impact |
|---|---|---|
| iOS `ConversationStoreSocketBridge` | oui, gate `event.userId == me` | aucun — pas de session sans compte sur iOS ; la branche `participantId` reste inutilisée et le gate est juste tel quel |
| web `presence.service.ts` | non — ne déclare même pas ces champs, ne relaie que `summary` | aucun |
| Android `ReadStatusUpdatedEvent` | ne porte pas ces deux champs | aucun |

## Livré

- `packages/shared/types/socketio-events.ts` — la clé de portée nommée sur les
  deux champs (source de vérité du contrat)
- `packages/MeeshySDK/.../MessageSocketManager.swift` — miroir iOS, avec la note
  que ce client n'exerce que la première branche
- `apps/android/.../SocketEvents.kt` — KDoc sur `userId`, absent jusqu'ici
- `services/gateway/src/socketio/README.md` § « La regle a une SECONDE moitie » —
  le README énonçait la moitié ROOM comme une loi du dépôt et n'a jamais nommé la
  moitié DIVULGATION ; le corollaire par-acteur y est désormais rattaché

## Écarté délibérément

**L'unité nommée `resolveBroadcastActor`.** Construite et testée pendant ce cycle,
puis retirée. La règle est écrite à la main sur 4 sites dans `main`, ce que le
README interdit pour la règle SŒUR (« re-ecrite a la main neuf fois, et ratee
huit ») — l'extraction était donc défendable. Elle ne passe pas le test du coût :
la session A a typé le paramètre `actorUserId: string | null`, et **c'est ce type
qui ferme le trou que l'unité aurait fermé** — il interdit désormais de fournir
`authContext.userId` par recopie. Extraire un ternaire d'une ligne de code mergé
une heure plus tôt, abondamment commenté à chaque site, aurait été du brassage
pour un gain déjà acquis autrement. *Une duplication n'est pas un défaut en soi :
elle l'est quand elle laisse passer l'erreur qu'elle répète.*

## Validation

- Aucun changement de comportement : ce cycle ne touche AUCUN fichier `.ts`
  d'exécution — contrat, miroirs clients et README uniquement
- `bunx tsc --noEmit` gateway : propre
- `packages/shared` : build propre
- Suite gateway complète, sur la base à jour : **724 suites / 17 732 tests verts** — le compte exact de la PR #3052, inchangé : ce cycle n'ajoute aucun test, faute de comportement à figer

## Piste pour le cycle suivant — repérée, NON livrée

Inchangée depuis le cycle 38, et toujours pas instruite : le commentaire de
`broadcastReadStatusUpdate` justifie l'ABSENCE de `lastReadAt`/`unreadCount` sur
un `type: 'received'` en partie parce qu'ils « divulgueraient inutilement
l'arriéré de l'acteur à tous les pairs de la room ». Le même raisonnement
s'applique mot pour mot au `type: 'read'`, où ces deux champs SONT diffusés à
toute la conversation par `emitToConversationParticipants`. La règle est écrite,
admise, et appliquée à une seule des deux branches.

Ce cycle rend la question plus nette, pas moins : maintenant que l'acteur se
reconnaît par `userId ?? participantId`, le canal par lequel il pourrait recevoir
ces champs SANS éventail — sa room personnelle, celle qui porte déjà le
`conversation:unread-updated` — est nommé et disponible. Reste à trancher ce que
deviennent les clients qui lisent les deux champs sur l'événement de
conversation.

## Enseignement de coordination — à ne pas perdre

Deux sessions de la même routine ont dépensé un cycle chacune sur le même défaut,
parce que la piste du cycle 37 était écrite dans un fichier que les deux ont lu et
qu'aucune ne pouvait réserver. Le coût n'est pas nul : un correctif complet,
testé, documenté, jeté. **La lecture de `main` au DÉMARRAGE ne suffit pas quand un
cycle dure plus d'une heure — il faut la refaire avant d'ouvrir la PR, et sur les
FICHIERS visés, pas seulement sur le graphe des commits.** Voir leçon 273.
