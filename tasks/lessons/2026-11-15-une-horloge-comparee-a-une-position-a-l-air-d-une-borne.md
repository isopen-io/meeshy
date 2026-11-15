# Une HORLOGE comparée à une POSITION a l'air d'une borne

*2026-11-15 — #18701, cycle 171.*

## La forme

```ts
cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
  ? cursor.lastDeliveredAt
  : null;
```

Elle se lit comme une garde : « le curseur couvre-t-il ce message ? ». Elle n'en
est pas une. `lastDeliveredAt` est posé à `now` au moment où un accusé est
TRAITÉ ; `createdAt` est la POSITION d'un message dans un fil. Les deux sont des
`Date`, le compilateur est content, et la comparaison est **vraie par
construction** pour tout message antérieur au traitement — c'est-à-dire pour
tous, le traitement suivant toujours la création.

La colonne qui porte la position existait pourtant sur la même ligne de
curseur : `lastDeliveredMessageCreatedAt`, écrite par le même
`_advanceCursor`, et utilisée à deux champs de là comme clé d'ordre de la garde
de fraîcheur. Ce n'est pas une donnée manquante, c'est la mauvaise des deux qui
a été lue.

> **Même famille que « un nom de champ annonce l'unité de sa DESTINATION » :**
> ici les deux valeurs ont le même TYPE et des NATURES différentes. Un type
> commun suffit à rendre la comparaison crédible ; c'est le nom qui dit la
> nature, et `…At` les nomme toutes les deux.

Devant toute comparaison entre deux dates venues de deux tables différentes,
demander : **sont-elles de la même NATURE — deux instants d'horloge, ou deux
positions ?** Une horloge et une position ne se comparent jamais ; il faut
l'horloge de la position, ou la position de l'horloge.

## Et le correctif se mesure sur ce qui voyage À CÔTÉ

La dérivation était recopiée sur quatre sites. Trois alimentaient l'arbitre
partagé (`resolveReceivedAt`) ; le quatrième la recopiait pour servir un AUTRE
champ, `deliveredAt`, servi tel quel et gouvernant un filtre d'API. Fermer
l'arbitre par un type marqué ne l'aurait pas touché : **un cliquet qui garde un
RECEVEUR ne dit rien de ce qu'on dérive à côté de lui.** D'où deux gardes de
natures différentes — un type pour la porte, un balayage pour le contournement.
