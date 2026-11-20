## Cycle 195 — le retrait d'un post cité ne lit plus à ciel ouvert, et sa troncature se mesure sur ce qu'elle borne (#20109)

**Date** : 2026-11-20. **Base** : `dev` à `19dae26b45`. **Issue** : #20109.

### Ce qui n'était pas majoré

`announceCitedPostWithdrawal` — appelée par `DELETE /posts/:postId`,
`DELETE /admin/posts/:postId` et le relais de modération — portait deux coûts
croissant avec la popularité du post :

1. `prisma.message.findMany({ where: { storyReplyToId }, select: { conversationId }, distinct })`, **sans `take`** ;
2. une `loadLiveAudience` **par conversation citante** — bornée à 50 000 depuis #20007, mais dont le NOMBRE ne l'était pas.

### Le cadrage corrigé avant d'écrire

L'issue parlait de « la fenêtre d'une route `DELETE` que l'utilisateur attend ».
Faux : **les trois appelants lancent l'annonce détachée** (`.catch(…)`, jamais
`await`) et aucun ne lit la valeur de retour. Le coût tombe après la réponse,
sur la passerelle et la base, **sans que personne ne regarde** — ce qui est pire
pour l'observabilité : la charge n'apparaît dans le p95 d'aucune route, elle se
manifeste par la lenteur qu'elle inflige aux autres. La conclusion tient, d'un
cran déplacé : borne de charge de fond non surveillée, pas borne de latence.

### UNE borne suffit aux deux coûts, et laquelle

`CITED_WITHDRAWAL_SCAN_CAP = 200`, posé sur les LIGNES (`take: cap + 1`, la
sonde de #20007). Les conversations annoncées étant un sous-ensemble des lignes
lues, borner les lignes borne les conversations, donc aussi les lectures
d'audience : un second plafond n'aurait rien ajouté.

**Et la troncature se mesure sur les LIGNES, ce qui la rend sûre** :

| lignes lues | ce qu'on sait |
|---|---|
| ≤ plafond | on a TOUTES les lignes, donc toutes les conversations — aucune ne peut manquer, et c'est démontré |
| > plafond | une conversation a PU manquer ⇒ journal |

Le journal est donc CONSERVATEUR. Le cas qui l'exige est celui d'un post cité
`cap + 1` fois dans UNE conversation, plus une fois ailleurs : une seule
conversation est annoncée — loin du plafond — et la seconde est perdue. Un
journal indexé sur le nombre de conversations annoncées se serait TU là
précisément. C'est la leçon du jour.

### Ce qu'une conversation non annoncée perd, et où elle le retrouve

`servedPostReply.ts` (#7950) sert `postReplyTo.deletedAt` à toute lecture : la
vérité revient au prochain chargement, exactement comme pour un membre hors
ligne. C'est le verdict `reload-serves-truth` que `UNQUEUED_FAMILY_VERDICT`
déclare pour cette famille (#20045) — et c'est lui qui rend une troncature
acceptable ICI alors qu'elle ne le serait pas ailleurs.

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| `take` retiré de la requête | **2** — la forme de la requête, et « une troncature de LIGNES couvre la perte de CONVERSATIONS » (sans borne de lecture, la seconde conversation est servie, donc le cas disparaît) |
| troncature non journalisée | **2** |
| troncature mesurée sur `allIds` (les conversations) au lieu de `citing` (les lignes) | **1** — le cas « un seul fil consomme le plafond » |

Chaque mutation est attrapée, et la mutation 1 ne fait PAS tomber le témoin de
troncature principal : sans `take`, le `slice` borne encore les annonces, seule
la LECTURE reste ouverte. C'est la bonne répartition — le témoin de la lecture
est l'assertion de forme, et lui seul.

### Une affirmation fausse retirée du témoin

Le doc du double disait que déclarer `take` requis « fait échouer
`tsconfig.test.json` si la production cesse de borner ». Faux : le prisma
factice est remis en `as never`, donc aucun typage ne relie les deux. Ce qui
attrape une production qui cesserait de borner est `toHaveBeenCalledWith`, et
elle seule — c'est désormais ce qui est écrit.
