# Cycle 222 — le socle de diffusion sociale quitte `SocialEventsHandler` (#20440)

**Date** : 2026-11-22 · **Branche** : `claude/socialevents-decoupe-20440` · **Issue** : #20440

## Pourquoi ce lot existe, et pourquoi MAINTENANT

`SocialEventsHandler.ts` était à **996 lignes** pour un plafond **DUR** de 1000
(`gateway-file-size-budget`, `MAX_LINES = 1000`). Ce n'est pas une dette
abstraite : **#20430 était bloqué avant d'écrire.** Il doit ajouter un paramètre
de séparation à neuf sites de diffusion de ce fichier — le CONTENU d'un post qui
part vers `ROOMS.post` sans exclusion, la dernière vraie lacune de la famille que
#20236, #20338 et #20429 ont fermée pièce par pièce.

Et le cycle 221 l'a vérifié dans le mauvais sens : le premier jet de ses
doc-comments a porté le fichier à **1019 lignes**, qu'il a fallu resserrer pour
revenir sous le plafond. Un lot de sécurité a donc déjà payé le prix du budget
en rognant sa propre documentation — exactement ce qu'il ne faut pas que le
plafond produise.

> **Un plafond atteint ne se paie pas en documentation.** Quand un fichier
> arrive au seuil, le lot suivant a deux issues : découper, ou abréger ce qui
> porte la preuve. La seconde est invisible en revue — elle ressemble à de la
> concision.

## Le découpage suit la RESPONSABILITÉ, pas une tranche

Le fichier mêlait deux choses de natures différentes : un SOCLE, qui ne grossit
qu'avec les lois, et quarante FAMILLES de diffusion, qui grossissent à chaque
feature. Seul le second doit grandir dans un handler.

`socialEmissionCore.ts` (neuf, **531 lignes**) prend les trois responsabilités
qui ne sont pas des familles :

| responsabilité | ce qui déménage |
|---|---|
| les **AUDIENCES** | `getFriendIds`, `getCircleAudience`, `cachedAudience`, `getUnblockedFriendIds`, `getVisibilityFilteredRecipients`, `invalidateFriendsCache`, et les deux helpers qu'elles seules appellent |
| les **ADRESSES** | `emitToFriends`, `emitToFeedsAndPostRoom`, `emitToUser`, `emitToUserFeedAndPostRoom`, `emitPostToAudience`, `commentBroadcastRooms`, `commentEmitter`, `emitCommentActivity`, `exceptSeparated` |
| la **LOI** de séparation | `activitySeparation`, `commentActivitySeparation`, `separationAroundActor`, `NOTHING_TO_SILENCE` |

`SocialEventsHandler` (**522 lignes**) garde ses quarante `broadcast*`, ses deux
`handleFeed*`, et compose le socle. Il reste **474 lignes de marge** pour #20430.

## Ce qui PROUVE qu'aucun comportement n'a changé

Un refactor se livre sur des mesures, pas sur une intention — et les témoins
seuls ne suffisent pas, puisqu'un refactor peut déplacer un défaut avec son
témoin. Quatre mesures, chacune indépendante :

1. **La surface de membres publics du handler est IDENTIQUE** — 35 avant, 35
   après, relevées mécaniquement et comparées en ensembles : **aucun ajout,
   aucun retrait**. Les quatre appelants externes de la loi
   (`PostReactionHandler`, `routes/posts/interactions`, `routes/posts/comments`,
   `routes/social/events`) ne changent pas d'une ligne, et le diff le montre :
   aucun fichier appelant n'est touché.
2. **ZÉRO ligne de commentaire perdue ou modifiée.** Les 437 lignes de
   commentaire de l'original ont été comparées EN ENSEMBLE à l'union des deux
   fichiers : l'intersection est totale. Les seules lignes neuves sont l'en-tête
   du module et six pointeurs `@see`. Ce n'est pas du zèle : ces doc-comments
   portent les décisions MESURÉES de #20236, #20337, #20338 et #20429 — « `keep`
   nomme l'acteur, et lui seul », « ce cache sert une AUDIENCE, jamais une
   AUTORISATION », « `cached: false` », « on ne diffuse pas en excluant ». **Leur
   texte EST la preuve** ; les reformuler en les déplaçant aurait effacé la
   trace de quatre cycles d'audit.
3. **Les quatre suites de séparation passent INTACTES** — aucune des quatre
   n'est modifiée (vérifié fichier par fichier). C'était le critère de fin de
   l'issue, et c'est la seule mesure qui distingue un déplacement d'une
   réécriture.
4. **274 suites / 4541 témoins** verts, `tsc --noEmit` à **0**, et les cliquets
   de taille, de porte d'émission et de promesse détachée verts.

## L'accesseur qu'il a fallu RETIRER, et pourquoi c'est la bonne réponse

Le premier jet posait sur le handler un accesseur public :

```ts
get friendsCache(): Map<string, { ids: string[]; expiresAt: number }> {
  return this.core.friendsCache;
}
```

Il n'était pas gratuit : un témoin existant atteint ce cache par
`(handler as any).friendsCache` pour observer l'éviction au plafond de 500
entrées, et `noUnusedLocals: true` refuse un membre privé que le fichier ne lit
jamais — d'où le `public`.

**Mesuré : son SEUL lecteur dans tout le dépôt était ce témoin.** C'était donc
du code mort en PRODUCTION, dont l'unique raison d'exister était un test qui
atteint des internes. Le dépôt a déjà tranché ce cas exact, et dans l'autre
sens que l'intuition : `users/profile.ts|permissions|200` a été **RETIRÉ plutôt
que déclaré**, au motif que « son gestionnaire posait `permissions: undefined`
délibérément, le champ n'avait aucun producteur ».

L'accesseur est retiré ; le témoin atteint le socle à travers `core`, **son
assertion inchangée**, et `core` reste **privé**. La surface de production ne
s'élargit de rien.

> **Un refactor qui élargit l'API de production pour qu'un test continue de
> passer a déplacé le coût au mauvais endroit.** La question n'est pas « comment
> garder ce test vert ? » mais **« ce membre a-t-il un lecteur en
> production ? »** — s'il n'en a pas, c'est le test qui doit suivre le code,
> jamais l'inverse. Et le signal est repérable : un membre qu'on rend `public`
> sans qu'aucun appelant ne le demande.

## Ce que ce lot NE fait pas

- Il ne touche aucune famille de diffusion, aucune charge, aucune room, aucun
  ordre d'opération, aucune option (`cached`, `keep`, TTL, plafonds).
- Il ne corrige **aucune** lacune de séparation : #20430 reste entièrement
  ouvert, et c'est lui que ce lot débloque.
- Il ne découpe pas les familles entre elles. Si le handler réatteint son
  plafond, la coupe suivante est par famille (post / story / statut /
  commentaire / traductions), et elle sera du même genre : mécanique, prouvée
  par des suites intactes.
