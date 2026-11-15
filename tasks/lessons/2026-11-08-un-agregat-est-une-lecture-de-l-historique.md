## Un AGRÉGAT est une lecture de l'historique, et les gardes posées message par message ne le voient pas

*2026-11-08 — #17076, cycle 150*

### Ce qui s'est passé

Le plancher d'historique d'un invité de lien (`allowViewHistory: false`) est une
des lois les mieux tenues du dépôt. Cinq surfaces la respectent, chacune avec
son témoin : le fil, la recherche, les fils de réponses, les traductions
partagées, les accusés de lecture. Un module entier — `services/historyFloor.ts`
— en est la source unique, avec une forme unitaire, une forme ensembliste, une
forme tolérante et une forme fail-closed.

`GET /conversations/:id/stats` n'en portait aucune occurrence. Il servait la
ligne `ConversationMessageStats` — un agrégat PRÉCALCULÉ sur toute la vie de la
conversation — à quiconque franchit `canAccessConversation`. Un inscrit entré
aujourd'hui par un lien sans historique y lisait le `firstMessageAt` de chaque
participant, le volume écrit par chacun, et l'activité des quatre-vingt-dix
derniers jours. Le SDK iOS et Android appellent cette route.

### Pourquoi la loi ne l'avait pas atteint

Parce que **la langue de la loi est le MESSAGE.** Toutes ses formes rendent un
`Date | null` destiné à un `where.createdAt`, et tous ses appelants sont des
requêtes qui rendent des messages. Un agrégat ne ressemble à aucun de ces
appelants : il n'a pas de `where` à borner, il ne rend pas de lignes, et sa
charge ne porte le mot « message » que dans des noms de compteurs.

Un balayage qui chercherait « quelles requêtes de messages oublient le
plancher ? » rend `[]` sur ce site. Il n'y a pas de requête de messages : il y a
une lecture d'une TABLE DE COMPTEURS, qui se trouve décrire des messages.

> **La question à poser à une loi d'historique n'est pas « quelles lectures de
> messages la respectent ? » mais « qu'est-ce qui, dans ce dépôt, DÉCRIT des
> messages sans en être une ? »** — un agrégat, un compteur daté, une
> distribution par auteur, un export, une statistique d'usage. Chacun est une
> lecture de l'historique sous un autre nom.

### Les deux fausses sorties, et pourquoi aucune n'était acceptable

**Plafonner l'agrégat** — servir les totaux, borner les dates. Refusé : le
lecteur connaît sa propre fenêtre par construction, donc il déduit l'avant par
soustraction. Un agrégat plafonné ne cache rien à celui qu'il est censé borner.

**Refuser la route au lecteur planchéisé.** Refusé aussi, et c'est la sortie
qu'on prend par réflexe quand on ne voit que le risque : la fenêtre d'un lecteur
à plancher EST celle que `GET …/messages` lui sert déjà. Replier l'agrégat
dessus ne publie RIEN de neuf, et garde la feature pour cette population.

> **Une garde de confidentialité qui retire une feature n'est pas plus sûre
> qu'une garde qui la borne — elle est seulement plus facile à écrire.** Avant
> de refuser, demander : la fenêtre que je veux cacher est-elle déjà servie
> ailleurs à ce même lecteur ?

### Le piège de l'implémentation, qui n'est pas celui du constat

Replier l'agrégat demande le même pli que le recalcul autoritatif. Ce pli vivait
MÊLÉ à son `upsert`, et la réutilisation naïve — appeler `recompute()` avec une
borne — aurait **écrit la ligne de TOUS depuis la fenêtre d'UN seul**, corrompant
les compteurs de la conversation pour tout le monde au premier appel d'un invité.
Le pli est donc extrait PUR, et un témoin assert qu'une lecture planchéisée
n'appelle ni `upsert` ni `update`.

Même piège au cache : le seau existant est clé par `conversationId`. Y ranger un
agrégat planchéisé l'aurait servi à toute la conversation — la fuite INVERSE de
celle qu'on ferme. Le second seau est à deux niveaux (conversation → plancher)
pour que `invalidate` reste en O(1) : une clé composite dans la carte d'origine
aurait obligé chaque nouveau message à la balayer.

> **Un correctif de confidentialité qui réutilise un chemin d'ÉCRITURE ou un
> cache PARTAGÉ peut créer une fuite plus large que celle qu'il ferme.** Les
> deux se lisent pareil dans le diff : un appel de plus, une clé de cache de
> plus.
