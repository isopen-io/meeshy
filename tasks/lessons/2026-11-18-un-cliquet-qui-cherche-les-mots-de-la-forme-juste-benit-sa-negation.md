# Un cliquet qui cherche les MOTS de la forme juste bénit sa négation

*2026-11-18, cycle 180 (#19690). Trouvé par `auditeur-adversarial` sur un cliquet
que je venais d'écrire — constat F, le plus cher de l'audit.*

## Ce qui s'est passé

Le cliquet garde une alternative : sous MongoDB, « pas encore » se dit
`OR: [{ champ: null }, { champ: { isSet: false } }]`, parce qu'une égalité
n'apparie pas une clé ABSENTE. Mon balayage cherchait les deux chaînes **dans le
même bloc `where`**. Il validait donc :

```ts
AND: [{ champ: null }, { champ: { isSet: false } }]
```

`AND` exige les deux branches. La clé ne peut pas être à la fois nulle et
absente : **cette clause n'apparie AUCUN document.** C'est le défaut que le
cliquet existe pour interdire, en pire — zéro ligne au lieu de presque zéro —
**certifié correct par le cliquet.**

## Pourquoi ce n'était pas un hasard

Mon propre doc-comment l'invitait. Il disait :

> « se compose par `AND` quand le `where` porte déjà un `OR` »

Cette phrase est VRAIE des **prédicats complets** : `PARTICIPATION_VIVANTE` et
`unsetOrNull(champ)` rendent chacun une clé `OR`, qu'un double spread
écraserait, donc on les compose par `AND`. Appliquée aux deux **branches** d'un
même prédicat, elle produit la conjonction impossible. Un lecteur pressé n'a pas
tort de la lire ainsi : rien dans la phrase ne dit à quel NIVEAU elle s'applique.

## La règle

> **Une forme juste qui est une ALTERNATIVE ne se reconnaît pas à ses mots mais à
> sa STRUCTURE.** `null` et `isSet: false` ne disent la bonne chose que SŒURS d'un
> même `OR`. Chercher les deux chaînes « quelque part dans le bloc » valide une
> conjonction en croyant lire une disjonction — et un cliquet qui absout est pire
> que pas de cliquet, parce que personne n'ira vérifier derrière lui.

Outillage : la pile du balayage tient les cadres `{` **et** `[`, avec la clé qui
précède chacun ; l'absence n'est accordée que si le cadre objet qui porte
l'occurrence est une BRANCHE du tableau `OR` où la branche `isSet` se trouve.

## Les deux corollaires du même audit

- **La non-vacuité posée sur la PRODUCTION mesure l'état du dépôt ; sur une
  FIXTURE, elle mesure l'instrument.** Ma sonde « plus de 10 sites vus » était
  satisfaite par une seule des deux colonnes gardées (l'autre n'en avait aucun,
  donc aucune cécité n'était détectable), et elle aurait ROUGI le jour où
  quelqu'un consolide ces sites sur le prédicat partagé — c'est-à-dire **sur un
  changement correct**, en invitant à baisser le seuil. Elle mesurait la
  popularité d'un idiome (cycle 107). La capacité à voir une forme nue se prouve
  par colonne, sur fixtures, où aucune amélioration du dépôt ne peut l'éroder.
- **Une erreur commise en écrivant un cliquet est le meilleur cas de test qu'il
  aura jamais** — déjà écrit au cycle 109 bis, et vrai une fois de plus : la
  conjonction impossible est désormais une fixture, et c'est l'audit qui l'a
  trouvée, pas moi.

## Et une phrase de doctrine se relit à son NIVEAU

Le défaut de rédaction ci-dessus est le même que celui des commentaires qui
ÉNONCENT une contrainte (cycle 94) : il ne dit pas faux, il omet **sur quoi** il
porte. Quand une règle de composition s'applique à un niveau d'abstraction (les
prédicats) et pas à celui d'en dessous (les branches), l'écrire — sans quoi la
phrase juste produit la clause fausse.
