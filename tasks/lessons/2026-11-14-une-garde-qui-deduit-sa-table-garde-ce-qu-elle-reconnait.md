# Une garde qui DÉDUIT sa table garde ce qu'elle RECONNAÎT, jamais ce qui existe

*2026-11-14, cycle 156. Trouvé par l'audit adversarial, sur la garde que ce cycle venait d'écrire.*

## Ce qui s'est passé

Le cycle 155 avait laissé une leçon : *un gate indexé sur une RELATION déclarée
ne balaie pas les sites qui n'ont pas de relation déclarée.* La garde de forme
des charges socket (#18070) a été écrite pour l'appliquer — **aucune table tenue
à la main** : le couple (événement, classe Kotlin) se déduit des sites de
routage, donc rien à oublier d'y inscrire.

Elle couvre **110 des 176** événements du contrat.

La table n'est pas tenue à la main ; la **liste des IDIOMES qui la produisent**
l'est. Trois sont reconnus, le dépôt en a cinq — et les deux manquants emportent
toute la famille `call:*` (~35 événements), les quatre `viewing:*` et
`user:preferences-updated`.

> **La leçon précédente a été appliquée, et le même défaut est revenu d'un cran
> plus bas.** Supprimer une table ne supprime pas la liste tenue à la main : elle
> remonte d'un niveau d'abstraction, où elle ressemble beaucoup moins à une liste.

## Pourquoi les invariants ne pouvaient pas le voir

La garde portait QUATRE invariants, posés exprès contre le mode de panne
silencieux d'une table déduite — minimum de routes balayées, résolution de chaque
constante, résolution de chaque classe, appartenance au contrat. **Aucun ne
pouvait voir ce trou**, et la raison est structurelle :

| ce qu'ils vérifient | ce qu'ils ne vérifient pas |
|---|---|
| que **ce qui est balayé** se résout bien | que **le balayage atteint** ce qu'il devrait |

Un `MINIMUM_ROUTES` compte les routes RECONNUES. Un idiome ignoré ne fait pas
baisser ce compte — il n'y est jamais entré. **Un invariant de qualité ne
substitue jamais un invariant de couverture.**

## Le remède, et pourquoi la prose n'en est pas un

Le réflexe est d'écrire la limite dans le doc-comment. Le dépôt sait déjà que ça
ne suffit pas (« une règle en prose ne couvre que ce que son outil exprime ») —
et surtout, une limite en prose **vieillit sans rougir** : le jour où quelqu'un
étend l'extracteur, la phrase reste et devient fausse dans l'autre sens.

Le remède est un **cliquet CHIFFRÉ**, qui rougit dans les deux sens :

```ts
const SWEPT_EVENTS_AT_LAST_MEASURE = 110;
```

- **en baisse** ⇒ un idiome a changé de forme, la couverture fond en silence ;
- **en hausse** ⇒ l'extension doit venir relever le nombre ici, au lieu de
  laisser la prose vieillir.

C'est le seul endroit du fichier où le manque est **mesuré** plutôt que raconté.

## La règle

**Toute garde qui déduit son périmètre doit mesurer ce périmètre, et le chiffre
doit être un `expect`.** Les deux questions sont disjointes et il en faut une
garde chacune :

1. *ce que je balaie, est-ce que je le juge bien ?* (invariants de qualité)
2. *ce que je balaie, est-ce tout ?* (cliquet de couverture)

Et la seconde se répond en confrontant le périmètre balayé à une **énumération
indépendante** — ici les propriétés de `ServerToClientEvents`, que l'extracteur
Kotlin ne produit pas.

## Le fait le plus inconfortable

Une garde qui réclame plus qu'elle ne tient est **exactement le défaut que ce
cycle corrigeait ailleurs** — un miroir qui exige ce que le contrat ne garantit
pas, une prose qui raconte une panne non mesurée. Écrite par la même main, dans
le même lot, en connaissant la règle.

> **Appliquer une leçon ne protège pas de la rejouer.** Elle se vérifie sur
> l'outil qu'on vient d'écrire, pas seulement sur celui qu'on corrige — et c'est
> un audit ADVERSARIAL qui l'a vue, pas la relecture de l'auteur.
