# Cycle 84 — Deux des trois « fuites » restantes n'atteignaient pas le fil. La troisième, si.

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ftmofu`
**Périmètre** : passerelle (`routes/conversations/sharing.ts`), le paquet
partagé (`utils/presence-visibility.ts`) et trois suites

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Une réponse REST change de contenu — voir §5.

---

## 1. D'où vient ce cycle

Le balayage du cycle 81 a nommé quatre surfaces servant `isOnline` sans gate.
Les cycles 82 et 83 en ont fermé deux. Ce cycle prend les deux dernières —
`routes/communities/search.ts` et `routes/conversations/sharing.ts` — pour
clore la famille.

Elle est close, mais pas comme prévu : **sur les trois portes examinées, une
seule fuyait.** Les deux autres ne servent rien du tout, chacune pour une raison
de sérialisation différente, et chacune est un défaut distinct qui deviendra une
fuite le jour où quelqu'un le « répare » sans savoir.

## 2. La fuite réelle : `PATCH /conversations/:id`

La route recharge la conversation mise à jour avec ses participants actifs :

```ts
participants: { where: { isActive: true }, select: { …, isOnline: true, lastActiveAt: true, user: { … } } }
```

`conversationParticipantSchema` **déclare** `isOnline` et `lastActiveAt` au
niveau du participant. Les deux champs atteignaient donc le fil, bruts, sans
jamais passer par `PresenceVisibilityService` — alors que
`routes/conversations/participants.ts` applique le gate depuis longtemps **sur
exactement les mêmes lignes `Participant`**, dans le même domaine, à quelques
fichiers de là.

Le lecteur est ici un admin ou modérateur de la conversation qui vient d'en
changer le titre. Il obtient en retour la présence de tous les participants,
préférences ignorées.

**Régime : `resolvePrefsOnly`.** La co-participation est un contexte d'accès
garanti des DEUX côtés — seules les préférences s'appliquent. C'est la ligne que
`services/gateway/CLAUDE.md` porte déjà pour « participants d'une conversation ».

**Et le défaut d'une carte absente s'INVERSE par rapport au critère strict.**
Sur `resolveForTargets` (cycles 82–83), un id non rendu vaut MASQUÉ : le
résolveur rend une entrée pour chaque id qu'on lui passe, donc un id manquant
est une anomalie, et une porte de confidentialité refuse par défaut. Sur
`resolvePrefsOnly`, un id manquant est au contraire la situation NORMALE et
légitime : les participants **anonymes** n'ont pas de `userId`, donc pas de
préférences, et ils doivent rester visibles. L'idiome de `participants.ts` dit
exactement cela, et ce cycle le recopie sans le « simplifier » :

```ts
isOnline: presenceVis.get(p.userId ?? '')?.showOnline === false ? false : p.isOnline,
```

`=== false` et non `?.showOnline ? … : …` : seule une préférence **explicitement
négative** masque. Les deux régimes ont des défauts opposés, et les deux ont
raison.

## 3. La première non-fuite : `POST /conversations/:id/invite`

Le handler renvoie :

```ts
return sendSuccess(reply, { member: newMember, message: … });
```

Le schéma de réponse déclare :

```ts
data: { properties: { message: …, membership: conversationParticipantSchema } }
```

`member` contre `membership`. fast-json-stringify supprimant tout champ non
déclaré, **la clé du handler est supprimée et la clé du schéma n'est jamais
posée** : le fil ne porte que `{ message }`. Le profil du nouvel adhérent —
présence comprise — n'a jamais atteint aucun client.

C'est mot pour mot la maladie que `api-schemas.ts` documente en long pour
`conversationResponseSchema` : « the actual wire response was effectively
`{ success: true, data: {} }` (the handler returned a flat conversation, but the
schema kept only the `data.conversation` key which the handler never set) ».
Le même piège, sur la route voisine, non détecté.

## 4. La seconde non-fuite : `GET /communities/search`

La requête charge un aperçu de 5 membres par communauté (avec `user.isOnline`)
et le `creator`. Le schéma les déclare ainsi :

```ts
creator: { type: 'object' },
members: { type: 'array', items: { type: 'object' } }
```

Un `type: 'object'` **NU** — sans `properties`. fast-json-stringify sérialise
cette forme en `{}`. Le fil porte donc `"creator": {}` et
`"members": [{}, {}, …]` : des objets vides, autant que de membres.

Vérifié côté client : la page de recherche web n'affiche que l'avatar, le nom,
`isPrivate` et `memberCount` — ni `members`, ni `creator`. **La jointure est
payée à chaque recherche, pour une charge utile que personne ne reçoit et que
personne n'attend.**

## 5. Ce qui change

`PATCH /conversations/:id` : `participants[].isOnline` vaut `false` et
`participants[].lastActiveAt` vaut `null` quand la préférence du participant
l'exige. Les anonymes sont inchangés.

Le `select` imbriqué `user: { … }` de cette même route est **retiré** : le
schéma du participant ne déclare aucune propriété `user`, cette moitié de la
jointure était donc supprimée au fil — zéro changement de sortie, une jointure
de moins. `userId` la remplace, que le gate exige.

Rien d'autre ne bouge : les deux non-fuites sont laissées telles quelles,
délibérément (§7).

## 6. Témoins

**Passerelle — la fuite** (`conversation-sharing.test.ts`, +4) : masquage d'un
participant qui a coupé sa présence, conservation quand les préférences
l'autorisent, résolution portant les `userId` des seuls participants
enregistrés, et l'anonyme qui reste VISIBLE sans préférences — ce dernier fige
l'inversion du défaut expliquée au §2.

**Passerelle — les deux non-fuites**, chacune gardée par la propriété de
confidentialité qui en découle, jamais par la forme du défaut :

- `conversation-invite-serialization.test.ts` (neuf, +2) monte le VRAI schéma
  dans un Fastify nu et traverse la sérialisation réelle — même patron que
  `friend-requests-pagination.test.ts`. Il atteste qu'aucune présence ne sort, et
  son second témoin montre que le schéma **saurait** la servir : seul le nom de
  la clé l'en empêche.
- `communities/search.test.ts` (+1) atteste que l'aperçu ne sert ni `isOnline`
  ni profil de membre.

Ces trois-là tombent le jour où quelqu'un aligne les noms ou déclare les
propriétés — et l'obligent alors à poser le gate dans le même lot. C'est leur
seule raison d'être : **ils gardent une porte, pas un bug.**

**Paquet partagé** (+2) : `applyPresenceVisibilityAsOffline` accepte désormais
un profil SANS `lastActiveAt` et ne fabrique pas la clé — une réponse ne gagne
pas un champ parce qu'on l'a filtrée. (Posé pour l'aperçu de membres, qui ne
charge que `isOnline` ; conservé parce que la contrainte est juste en soi.)

**ROUGE prouvé** : 3 des 4 témoins de la fuite tombent sur le code d'avant (le
quatrième — conservation quand les préférences autorisent — passe trivialement :
il borne la correction). Le témoin partagé neuf tombe aussi.

Suites rejouées : `routes/conversation*`, `routes/communities/`, `routes/users/`
— 72 suites, 1508 témoins verts. `tsc --noEmit` propre.

## 7. Ce que ce cycle ne fait PAS, et pourquoi

**Il ne « répare » ni `member`/`membership` ni l'aperçu de membres.** Les deux
réparations sont des changements de CHARGE UTILE, pas des correctifs de
confidentialité :

- aligner `member` sur `membership` ferait apparaître un objet participant sur
  une réponse qui n'en portait pas — et exigerait le gate du §2 dans le même
  lot ;
- déclarer les propriétés de l'aperçu ferait apparaître des profils de tiers sur
  une porte de DÉCOUVERTE (on cherche des communautés dont on n'est pas membre)
  — et exigerait, lui, le critère **STRICT**, pas les préférences seules.

Les deux méritent une décision produit — *veut-on cette charge utile ?* — et non
une décision d'agent de maintenance à 4 h du matin. L'alternative honnête, pour
l'aperçu, est de **retirer la jointure** plutôt que de la faire vivre : personne
ne la lit. Mais retirer les clés `creator` / `members` du fil, même vides,
touche des décodeurs iOS et Android que ce cycle n'a pas audités. Les deux
options sont donc nommées, gardées par un témoin, et laissées au cycle 85.

## 8. Ce qui reste ouvert

**La famille « présence non filtrée » du cycle 81 est CLOSE.** Ses quatre
surfaces sont traitées : deux gatées (cycles 82, 83), une gatée ici, deux
requalifiées en charge utile morte.

**Dette voisine, non traitée et maintenant visible :** le collapse prefs-only
`vis.get(id)?.showOnline === false ? false : x` est recopié à la main sur **huit
sites** (`conversations/core.ts` ×2, `search.ts`, `messages.ts` ×3,
`participants.ts`, `communities/members.ts`), et ce cycle en ajoute un neuvième.
Le cycle 82 a fait converger la famille STRICTE sur
`applyPresenceVisibilityAsOffline` ; la famille prefs-only mérite le même
traitement — mais **pas le même applicateur** : son défaut de carte absente est
l'inverse (§2). Un applicateur partagé devra exprimer les DEUX, et c'est ce qui
en fait un cycle à part entière plutôt qu'un ramassage en passant.

**Les deux domaines voisins du cycle 80 restent ouverts** : appartenance à une
communauté, épinglage / archivage de CONVERSATION.

**Dette d'environnement, inchangée depuis le cycle 79.** `npx eslint` échoue
dans ce conteneur (un ESLint global sous `/opt/node22` est résolu à la place de
celui du dépôt). C'est l'environnement, pas le diff.

## 9. La leçon

> **Un balayage qui liste des `select:` ne liste pas des fuites.** Le cycle 81 a
> cherché `isOnline: true` dans `routes/` et `services/`, et a rendu quatre
> surfaces. C'était la bonne question pour trouver où REGARDER, et la mauvaise
> pour conclure : deux des trois portes examinées ici ne servent rien du tout,
> chacune arrêtée par un accident de schéma différent — une clé mal nommée, un
> `type: 'object'` sans `properties`.
>
> C'est le corollaire exact de la leçon du cycle 83, retourné vers la méthode
> d'audit elle-même : là, un TÉMOIN de `select` n'attestait rien de la réponse ;
> ici, un AUDIT de `select` ne prouve rien de la réponse non plus. **Entre la
> requête et le fil il y a un sérialiseur, et il faut l'avoir traversé pour
> parler.**

Et le corollaire opératoire, qui est ce que ce cycle livre vraiment :

> **Une non-fuite par accident se garde, elle ne se célèbre pas.** Trois fois
> maintenant — `lastActiveAt` au cycle 82, l'aperçu et l'invitation ici — la
> donnée s'est arrêtée sur une omission de schéma que rien ne nomme
> « confidentialité ». Chacune est un piège armé : la première personne qui
> alignera les noms pour faire vivre la charge utile ouvrira la fuite sans
> qu'un seul témoin tombe. Le geste juste n'est ni de réparer à sa place, ni de
> passer : c'est de poser le témoin qui le forcera à voir ce qu'il ouvre.
