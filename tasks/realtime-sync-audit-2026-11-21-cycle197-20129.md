## Cycle 197 — l'export RGPD et la purge apparient les DEUX espaces de clés, sans migration (#20129)

**Date** : 2026-11-21. **Base** : `dev` à `feab8d070b`. **Issue** : #20129. **Allège** : #20114.

### Ce que #20114 supposait, et qui était faux

#20113 a unifié l'espace de clés de `MessageAttachment.uploadedBy` aux
ÉCRIVAINS ; les lignes déjà écrites gardent l'ancien espace, et #20114 en a
conclu qu'une **migration de données de production** était le remède — donc une
décision du porteur, donc une attente.

**Le remède était à côté du défaut.** `exportReactions`, dans le même fichier,
traite exactement ce problème et son doc-comment le nomme : « deux conventions
de propriétaire (`participantId` via `Participant.userId`, ou `userId`
direct) ». Elle reçoit `participantIds`, et la route la calcule **une fois**
(`export.ts:681`, commentaire : « réutilisée par `messages` et `reactions` »).

`exportMedia` ne la recevait pas, et la condition qui déclenche le calcul ne
mentionnait que `messages` et `reactions`. **La valeur qui répondait à la
question était calculée dix lignes plus haut, pour ses voisines.**

> Troisième occurrence de la leçon 276 : ce n'est pas l'appel manquant qui rend
> une descente impossible en aval, c'est la PROJECTION trop étroite du
> paramètre. #19971 (l'état d'avant, connu du schéma), #20113 (le `userId` lu
> deux instructions plus haut), et maintenant celle-ci.

### Livré

| site | avant | après |
|---|---|---|
| `exportMedia` | `{ uploadedBy: userId, isAnonymous: false }` — les médias TRANSFÉRÉS absents de l'export (art. 15) | `{ uploadedBy: { in: [userId, ...participantIds] } }`, la liste venant de la route, **sans lecture de plus** |
| `purgeAttachments` | idem, à la fin de la période de grâce (art. 17) | `{ in: owners }`, les clés résolues par `ownerKeysOf` — une lecture par compte purgé, bornée par `PARTICIPANT_KEY_CAP` et **repliant sur l'espace de compte** si elle lève |
| `PostMedia.uploaderId` | un seul écrivain, un seul espace | **inchangé, et c'est dit** — pour qu'on ne l'élargisse pas « par symétrie » |
| les trois COMPTEURS (`GlobalAchievements`, deux vues admin) | sous-comptent les copies héritées | **inchangés, et c'est dit** : un sous-compte d'affichage n'est pas un manquement, et les corriger changerait des succès déjà attribués |

Le cliquet `uploaded-by-key-space-sweep` passe de **5 à 3** sites
`account-blind-to-legacy` — la seule direction qu'il autorise.

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| l'export revient à `uploadedBy: userId` | **2** — la forme de la requête, et « sert la ligne HÉRITÉE » |
| la purge revient à `uploadedBy: userId` | **1** |

Les témoins APPLIQUENT le `where` à des lignes (`findManyIn`), jamais ne le
réaffirment : c'est la leçon du lot précédent, et elle est la raison pour
laquelle ces témoins peuvent tomber.

### Deux réparations de l'outillage de test

- **`findManyIn` supporte `skip`.** Il le REFUSAIT, alors que la pagination de
  l'export l'utilise : un double qui refuse un argument légitime force les
  témoins à éviter la forme réelle de l'appel, donc à ne plus la décrire.
  `skip` est appliqué AVANT `take`, l'ordre de Prisma.
- Les six appels d'`exportMedia` des témoins voisins passent `[]` : l'ancien
  comportement, explicitement, pour qu'un lecteur voie que la liste vide n'est
  pas un oubli.

### Ce que #20114 garde

Elle cesse d'être le chemin critique de la conformité et redevient ce qu'elle
est : de l'**hygiène de données**. Une colonne à deux espaces reste une dette,
même quand tous ses lecteurs savent lire les deux — mais elle peut attendre sa
mesure et son feu vert sans que rien ne manque entre-temps.
