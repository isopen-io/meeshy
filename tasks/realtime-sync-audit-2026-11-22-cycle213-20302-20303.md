# Cycle 213 — deux mutations temps réel qui n'atteignaient pas le PIXEL, sur le même écran (#20302, #20303)

**Date** : 2026-11-22. **Base** : `dev` à `33f05d700` (qui contient le cycle 210).
**Issues livrées** : #20302, #20303. **Issues ouvertes** : #20304, #20305, #20306.

## D'où vient ce lot

Le cycle commence par LANDER le cycle précédent : la PR #20293 (#20277, « le
détail d'une conversation sert les droits RÉSOLUS d'une entrée sans compte »)
était restée ouverte, verte et mergeable. Elle est fusionnée avant toute
écriture — c'est la base de ce cycle.

L'audit a ensuite balayé trois dimensions disjointes en parallèle : la file de
rejeu hors ligne, le cycle de vie de la socket, et **les mutations temps réel
qui n'atteignent pas le PIXEL** sur `apps/web`. La troisième a rendu les deux
défauts livrés ici.

## Ce que le cycle a corrigé

### #20302 — la ligne fantôme : quitter une conversation ne la retirait pas de la liste

`applyViewerMembershipEnded` écrivait `isMember: false` dans les DEUX caches.
L'écriture sur le **DÉTAIL atteint le pixel** — c'est #11415, et son témoin la
garde depuis. L'écriture sur la **LIGNE n'atteignait rien** : relevé des
lecteurs d'`isMember` dans `apps/web/src` — la carte d'un lien, le menu d'un
message, les deux unités de mention, le menu d'une ligne, le filtre du talkie —
**aucun ne décide qu'une ligne SE REND**. Ni `applyFilter` ni
`flattenConversationPages` ne portent de prédicat d'appartenance.

Et rien ne guérissait seul : le delta de liste est borné par
`Conversation.updatedAt`, qu'un départ comme un bannissement laissent intact
(les deux n'écrivent qu'un `participant.update`). C'est la raison déjà mesurée
pour #20227.

> **La passerelle ÉNONÇAIT le contrat, et les deux clients natifs l'honoraient.**
> `participant-ban-core.ts` et `leave.ts` écrivent, chacun, « ses appareils
> gardaient une ligne que `GET /conversations` ne sert plus … Le retrait côté
> client est idempotent, c'est ce qui permet de ne pas gater ici » — c'est
> pourquoi la salle personnelle du partant est ajoutée à l'éventail. iOS
> (`applyConversationDeleted`) et Android (`purge`) retirent la ligne sur les
> deux événements. **Le web était le seul dehors, et il avait l'air de faire
> quelque chose.**

`removeConversationRow` est désormais la loi UNIQUE du retrait de ligne,
partagée avec `applyConversationGone` : elle passe par le journal des écritures
vives, donc une relecture partie avant l'évènement ne ramène pas la ligne.

**Le DÉTAIL n'est PAS purgé**, et c'est la décision de #11415 : le fil OUVERT
reste ouvert et dégrade son menu, il ne se referme pas sous le lecteur.
`applyConversationGone` ne convenait donc pas tel quel — c'est sa moitié
« journal de liste » qui est la loi à partager, pas la fonction entière.

### #20303 — la tuile d'un message rappelé restait dans « Médias, liens et documents »

`applyMessageDeleted` n'écrivait que deux caches : le fil (pierre tombale) et
l'aperçu de la ligne. L'index de l'écran des médias est une racine de requête
SÉPARÉE (`mediaHubConversationKey`, #8180) et gardait le message ENTIER, pièce
jointe comprise : la tuile restait dans la grille, et la visionneuse plein
écran ouverte depuis elle servait le fichier qu'on venait de rappeler.

Ce chemin était le **seul des trois** à ne pas l'écrire :

| chemin | fil | index des médias | ligne |
|---|---|---|---|
| `attachment:deleted` (`stripFromHub`, #13611) | ✅ | ✅ | ✅ |
| « supprimer pour moi » (`hideRowsForReader`, #10587) | ✅ | ✅ | ✅ |
| **`message:deleted`** | ✅ | **❌** | ✅ |

Et le même cache manquait à `attachment:reaction-added` / `-removed` : le geste
LOCAL écrit les deux index **en disant pourquoi** (« la visionneuse qui en est
ouverte y relit sa page »), l'applieur temps réel qui le RÉCONCILIE n'écrivait
que le fil. La visionneuse ouverte depuis « Médias » initialisant « les
miennes » sur `currentUserReactions`, une réaction posée sur un autre appareil
n'y était pas rendue comme sienne — et la toucher planifiait un `add` au lieu
d'un `remove`. **Un contrôle INERTE**, la forme que le `CLAUDE.md` nomme déjà
au cycle 123 du Prisme.

## Ce que le cycle a appris

### Un témoin ROUGE peut l'être pour la mauvaise raison

Le premier jet du témoin de #20303 appelait
`applyMessageDeleted(client, { id: 'm-1', … })` quand le contrat de l'unité est
`messageId`. Il est passé au ROUGE — deux échecs, exactement les deux
assertions attendues — **et le correctif ne l'a pas fait passer au vert.** La
cause de sa chute n'était pas l'absence du correctif : c'était un champ
`undefined` qui ne matchait rien, nulle part.

> **Un témoin rouge n'atteste rien tant qu'on n'a pas vu le correctif le rendre
> VERT.** Le ROUGE prouve qu'une assertion tombe, pas POURQUOI. Un harnais mal
> adressé rend le même rouge qu'un défaut réel — et avec la même forme, au même
> nombre d'échecs. La seule mesure qui distingue les deux est le cycle complet :
> rouge, correctif, vert, **puis retrait du correctif et rouge à nouveau**.

C'est la troisième étape qui manque habituellement, et c'est elle qui a prouvé
ce lot : le correctif retiré, le témoin CORRIGÉ retombe à 2 rouges / 30 verts ;
remis, 32 verts. Détail :
`tasks/lessons/2026-11-22-un-temoin-rouge-peut-l-etre-pour-la-mauvaise-raison.md`.

### Un drapeau écrit dans deux caches n'est pas lu par les deux

Le défaut de #20302 a vécu parce que `applyViewerMembershipEnded` **avait l'air
complet** : deux écritures symétriques, détail et liste, sous un doc-comment qui
disait « dans le détail que le fil relit, et dans la liste ». La symétrie de
l'ÉCRITURE se lit comme une symétrie de l'EFFET.

> La question à poser à un applieur qui écrit N caches n'est pas « les
> écrit-il tous ? » mais **« qui LIT chacun des N, et pour en faire quoi ? »**.
> Ici le second cache était écrit, par la bonne fonction, avec la bonne valeur
> — et personne ne s'en servait pour décider ce que l'écran montre. C'est la
> règle du cycle 122 du Prisme (« qui AFFICHE ce qu'il élit ? ») appliquée à une
> donnée qui n'a rien d'une traduction.

Et le relevé qui l'attrape est mécanique : `grep` les LECTEURS du champ, puis
demander de chacun *décide-t-il de ce qui se rend ?*. Six lecteurs, zéro sur la
question posée.

### Trois balayages disjoints valent mieux qu'un balayage profond

Les trois audits du cycle ont rendu 2 défauts confirmés et livrés, 1 confirmé et
instruit (#20304), 1 piège armé (#20305), 1 écart multi-appareil (#20306) — et,
surtout, deux grandes surfaces **mesurées saines**, ce qui a autant de valeur :
le cycle de vie de la socket (écouteurs attachés une fois par instance, rooms
reconstruites à chaque ré-authentification, backoff avec gigue, démontage
complet au changement d'identité) et la mécanique de la file de rejeu
(dédoublonnage, tri FIFO total, quatre gardes de désérialisation, bornes et
TTL). Les deux sont écrites ici pour que le prochain cycle ne les re-balaie pas.

## Ce que le cycle a ouvert, et qu'il ne fait PAS

- **#20304** — après une reconnexion socket, le tableau d'exploitation gèle en
  AFFIRMANT qu'il est en direct, et son repli par sondage reste désarmé.
  `use-host-metrics` est le seul des six consommateurs de `watchLiveSocket` à
  faire une JONCTION DE ROOM, et `watchLiveSocket` ne rejoue ses observateurs
  que sur un changement d'OBJET de connexion — jamais sur une reconnexion.
- **#20305** — le transport REST de `message:edited` est le seul des quatre à ne
  pas signer sa charge ENFILÉE ni à se taire sur `PLAN_UNAVAILABLE`. Piège armé
  (aucune route REST d'édition ne porte de pièce jointe aujourd'hui), pas panne.
- **#20306** — ouvrir une vue unique sur un appareil ne l'annonce jamais aux
  autres appareils du même compte : la joignabilité est décidée par COMPTE, et
  le compte est connecté. `enqueuePersonalMessageMark` existe pour exactement
  ce problème sur trois autres familles, et n'a pas été appliqué ici.

## Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/socket-membership-realtime.test.ts` | ROUGE 3/18 avant, **18 verts** après |
| `bun test src/lib/api/realtime-message-mutations.test.ts` | ROUGE 2/32 avant, **32 verts** après, ROUGE 2/32 au retrait du correctif |
| `bun test src/lib/api/realtime-attachment-reactions.test.ts` | ROUGE 3/15 avant, **15 verts** après |
| `bun test src/lib/` (web) | **20 995 verts / 0 rouge**, 1 649 fichiers |
| `npx tsc --noEmit` (web) | **0 erreur** |
