## Leçon 157 — L'argument qui justifie un élargissement de diffusion doit être appliqué à CEUX QU'IL EXCLUT (2026-08-14, routine messaging, cycle 122)

Trois routes de la gateway — `leave.ts`, `participants.ts`, `ban.ts` — avaient déjà été
corrigées : leur événement d'appartenance n'atteignait que `ROOMS.conversation(id)`, et
l'écran de LISTE, qui rend l'effectif, a précisément quitté cette room. Le correctif a
ajouté les rooms personnelles des membres **restants**. Il a laissé dehors la seule
personne dont l'événement parle : le partant, le retiré, le banni.

**Et le code écrivait sa propre justification** : « la room de conversation reste en tête
de chaîne : elle porte le partant lui-même, encore dedans à cet instant ». C'est vrai — de
l'appareil qui a le FIL ouvert. C'est faux de tous ses autres appareils, qui sont sur
l'écran de liste, c'est-à-dire *hors de la room*, ce que la phrase d'à côté venait
d'établir. Deux commentaires voisins, l'un énonçant la règle, l'autre l'oubliant pour un
cas particulier.

**La règle** : quand on élargit une diffusion parce qu'« une population lit ailleurs que
dans la room », lister explicitement QUI reste hors de l'éventail après le correctif, et
repasser l'argument sur chacun. Le raisonnement ne s'applique pas moins au sujet de
l'événement qu'à ses témoins — il s'y applique PLUS FORT, parce que ce qu'il rate chez le
sujet n'est pas un compteur faux mais une ligne qui n'existe plus.

**Corollaire — la gravité ne suit pas la symétrie apparente.** Les restants voyaient un
compteur d'un cran à côté. Le sujet gardait dans sa liste une conversation que
`GET /conversations` ne sert plus, cliquable, et PERSISTÉE des deux côtés (cache disque
iOS, `staleTime: Infinity` web). Le défaut « secondaire » du même correctif était le plus
grave — écho direct de la leçon 155.

**Corollaire — un rattrapage différé masque un trou temps réel, et le rend plus dur à
voir.** Le delta `updatedSince=` unifiait DÉJÀ les quatre fins d'appartenance dans un seul
`deletedConversationIds` (`delta-tombstones.ts` les énumère nommément : fermeture,
suppression-pour-moi, départ, bannissement). La ligne fantôme finissait donc par partir —
à la reconnexion suivante au mieux, 24 h plus tard au pire. Rien ne devenait rouge, aucun
symptôme ne remontait, et le module de rattrapage se lisait comme la PREUVE que le cas
était traité. **Quand un chemin de réconciliation énumère des cas, chacun de ces cas est
une question à poser au chemin TEMPS RÉEL** : « qui envoie ça tout de suite, et à qui ? ».
Ici la réponse était « personne » pour trois cas sur quatre — et le quatrième
(`conversation:deleted`) visait bien `ROOMS.user`, en le documentant. Un exemplaire correct
au milieu de trois fautifs est le signal le plus lisible qu'il y avait à lire.

**Corollaire — un garde écrit pour protéger une VALEUR ne doit pas garder une EXISTENCE.**
`membershipEnded: false` (bannir quelqu'un déjà parti) existe pour empêcher un décrément de
compteur injustifié. Placé avant le test d'identité, il aurait aussi empêché le RETRAIT de
la ligne — et précisément dans le cas qui en a le plus besoin : le ban qui suit un départ
non synchronisé, donc celui où la ligne fantôme est encore là. L'ordre des gardes n'est pas
cosmétique ; il faut lire ce que chaque garde protège avant de choisir son rang.

**Corollaire — `==` et `!=` sur une identité ne sont pas symétriques quand le repli est une
valeur vide.** `currentUserId` retombe sur `""` tant que l'auth n'est pas résolue. Le
voisin existant, `guard event.userId != currentUserId`, est inoffensif dans cet état (un
vrai `userId` diffère de `""`). Son miroir `==` retirerait une ligne au hasard sur un
payload au `userId` vide. Copier la forme du voisin sans rejouer le cas dégradé aurait
introduit le défaut ; d'où `isMe()` (app) et `!me.isEmpty` (SDK).
