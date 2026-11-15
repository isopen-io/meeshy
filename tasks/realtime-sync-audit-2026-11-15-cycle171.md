# Cycle 171 — ce qui est GRAVÉ était juste, ce qui est SERVI mentait encore

*2026-11-15. Branche `claude/exciting-planck-x33cmv`. Livré : #18701 — le repli
du statut de livraison cesse d'être une horloge murale.*

---

## Le choix du lot, et la vérification que le cycle 170 a léguée

La commande du cycle précédent (`gh api search/issues … is:pr <numéro>`) a servi
avant d'écrire une ligne : #18707 et #18701 apparaissaient dans des PR ouvertes,
#18681 et #18680 nulle part. Lu de près, #18701 n'est pas PRIS — il est CITÉ par
la PR #18704, qui l'a ouvert en retirant son propre `Closes`. C'est la moitié que
cette PR ne ferme pas, et son auteur l'écrit : « rétrécir le gel ne change rien
pour aucun utilisateur tant que #18701 n'est pas traitée ».

**Un numéro qui apparaît dans une PR n'est pas forcément un lot pris.** Il peut y
être nommé comme la dette que la PR assume de laisser. Les deux se distinguent en
ouvrant la PR, pas en lisant le résultat du balayage — et le second cas est
précisément celui où le travail est le plus utile, puisque quelqu'un vient de
prouver qu'il manque.

#18681 (la silhouette d'un message sous plancher) a été écarté : son « Preuve
attendue » commence par « un verdict de produit écrit ». Sans porteur à la barre,
ce lot-là se bâcle ou s'arrête.

## Le défaut

```ts
cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
```

`lastDeliveredAt` est posé à `now` par `_advanceCursor` : l'heure à laquelle un
accusé a été TRAITÉ. `createdAt` est une POSITION dans un fil. Même type, natures
différentes, et la comparaison est vraie par construction pour tout message
antérieur au traitement.

Scénario qui n'exige **aucune panne** : M1 (10:00) évincé par le `LTRIM` à 500 de
`RedisDeliveryQueue`, M2 (10:05) livré, drain à 11:00. Curseur à 11:00 ⇒
`11:00 >= 10:00` ⇒ **l'auteur de M1 voit ✓✓ pour un message que personne n'a
reçu**. Et `_emitDeliveryForDrainedMessages` pousse `getLatestMessageSummary`
dans `READ_STATUS_UPDATED` douze lignes après avoir refusé d'écrire la ligne : le
drain refuse la livraison, puis annonce la remise, dans le même tour de boucle.

## Ce que l'issue n'avait pas, et qui a décidé la forme

L'issue proposait trois pistes d'ÉCRITURE (préfixe contigu, borne de position,
entrée négative). Aucune n'est le correctif minimal, parce que le défaut n'est pas
dans ce qu'on écrit : **la discipline manquante existait déjà, à côté, sur l'autre
colonne.** `resolveReadAt` a sa bascule depuis le 2026-07-24 — passé
`EXACT_READ_TRACKING_SINCE`, l'absence de gel VEUT DIRE l'absence de lecture. La
livraison ne l'avait pas. Le lot est donc la symétrie, pas une invention :
`resolveCursorDeliveredAt`, un site, la même bascule.

Et la borne de POSITION que l'issue proposait en premier ne suffisait pas : dans
SON propre scénario, le trou est ANTÉRIEUR au dernier message livré, donc sous la
borne. L'issue le dit, en note ; la piste reste ouverte, elle porte sur
l'ÉCRITURE, et elle est consignée.

## La prémisse qui est devenue fausse

Quatre témoins verts tenaient le contraire, et leur bloc l'écrivait :

> « `deliveredAt` conserve son repli curseur : un message récupéré est livré. »

Vrai à sa date — parce que le gel était SUR-INCLUSIF : toute la fenêtre recevait
une entrée, livrée ou non, et le repli ne servait jamais sur un message récent.
**#18614 a rendu le gel juste et, du même geste, a mis le repli en première ligne
sur exactement les messages qu'il venait d'écarter.** La phrase est devenue
fausse le jour où sa voisine est devenue vraie.

Les quatre témoins ont été lus avant d'être changés, et leur raison écrite dans
l'amendement DATÉ de la spécification. Détail et règle :
`tasks/lessons/2026-11-15-une-garantie-rendue-exacte-fait-mentir-ce-qui-se-reposait-sur-son-inexactitude.md`.

## Ce qui voyageait À CÔTÉ

Trois des quatre sites alimentaient l'arbitre partagé. Le quatrième recopiait la
dérivation pour servir **`deliveredAt`** — un champ rendu tel quel par
`getMessageStatusDetails` et qui gouverne son filtre `?filter=delivered`. Fermer
l'arbitre par un type marqué ne l'aurait pas touché : le panneau « Qui a vu »
aurait annoncé une date de remise que le compteur venait de retirer.

D'où **deux gardes de natures différentes**, et les deux sont nécessaires :

| garde | ferme |
|---|---|
| `CursorDeliveredAt`, type marqué | la PORTE — `cursor.lastDeliveredAt` brut ne compile plus (`TS2322`, mesuré sur sonde) |
| `delivery-cursor-fallback-sweep.test.ts` | le CONTOURNEMENT — un site qui dérive le repli pour un autre champ |

Le balayage prouve d'abord qu'il VOIT : il lit la forme exacte d'avant le
correctif et doit la rendre. Une garde négative dont le balayage ne rend rien
reste verte.

## Mutation, une garde à la fois

| mutation | témoins tombés |
|---|---|
| la borne de BASCULE retirée (le défaut d'avant) | 7 |
| la borne au MESSAGE retirée | 1 |
| le repli TOUJOURS nul (correctif trop large) | 4 |
| un seul site relit le curseur brut (`deliveredAt`) | 1 |

## Ce que le lot COÛTE, dit à voix haute

Les deux sites qui avancent le curseur de livraison figent dans le même
mouvement, **hors transaction**. Un processus qui meurt entre les deux laisse un
curseur en avance sans entrées, et ces messages-là seront désormais servis « non
remis » sans rattrapage possible (`freezeMessageStatus` part de
`since: prevDeliveredAt`).

C'est assumé, et le sens de l'erreur est le bon : **une coche manquante se
rattrape, une coche qui ment ne se rattrape pas.**

## Preuve

- `tsc --noEmit` gateway : **EXIT=0**, lu hors pipe ;
- `src/__tests__/unit/{services,utils,config}` + `src/__tests__/routes` +
  `src/socketio` + `src/__tests__/unit/socketio` : **1 035 suites / 18 009
  témoins**, un seul rouge — `UploadProcessor.heif-conversion`, **pré-existant
  sur `dev`** (mesuré par `git stash` : 2 rouges sur `dev` sans ce lot ; `sharp`
  du conteneur ne lit pas le HEIC) ;
- le cliquet de type prouvé par sonde, puis la sonde retirée.

## Suivi

- **Le curseur de livraison n'est pas encore le préfixe CONTIGU de la remise.**
  Un trou ANTÉRIEUR au dernier message livré reste sous la borne pour un message
  pré-bascule. Lot d'ÉCRITURE, consigné en **#18731**.
