# Un correctif de BORNE se mesure sur ce que la borne DÉCLENCHE, pas sur ce qu'elle compte

**Date** : 2026-11-20. **Lot** : #20105 (cycle 196). **Famille** : la question du
cycle 125 (« qu'est-ce qui part À CÔTÉ de ce que je viens de corriger ? »),
portée d'une garde de confidentialité à un correctif de périmètre.

## Le constat

L'issue #20105 énumérait deux coûts à une cascade « lu ⇒ remis » non bornée :
des coches ✓✓ fausses chez l'auteur, et leur irréversibilité sous
`EXACT_READ_TRACKING_SINCE`. Les deux sont justes, et les deux sont des coûts de
MESURE — un nombre faux, un indicateur menteur.

Le troisième ne l'est pas, et il n'était dans aucun constat :

```ts
// freezeMessageStatus, dernier bloc
if (field === 'deliveredAt') {
  const received = [...toCreate, ...toUpdate];
  if (received.length > 0) await startEphemeralCountdowns(prisma, { … });
}
```

**Le gel de livraison DÉMARRE les décomptes éphémères de tout ce qu'il grave**
(#7451), et les ANNONCE aux deux rooms. Une cascade qui gravait `deliveredAt` sur
tout le fil mettait donc à brûler un éphémère resté trente-sept messages plus
bas, que personne n'avait reçu. C'est le seul des trois effets qui **détruise du
contenu** ; les deux autres se rattrapent par un rechargement.

## La règle

> Devant un correctif qui RESSERRE un périmètre d'écriture, ne pas s'arrêter à
> « quel nombre cette écriture fausse-t-elle ? ». Demander **« que DÉCLENCHE
> cette écriture ? »** — et y répondre en lisant l'unité qu'on borne LIGNE À
> LIGNE, jamais sa signature.

`freezeMessageStatus({ participantId, conversationId, since, at, field })` a la
forme d'un setter de date. Son nom, ses paramètres et son `@returns` (« nombre
d'entrées RÉELLEMENT figées ») disent tous « j'écris des horodatages ». Le
déclenchement vit dans son dernier bloc, sous un `if` sur le champ, et son
doc-comment de tête le dit — mais quarante lignes plus haut qu'un appelant ne
regarde.

## Pourquoi la signature trompe ici précisément

C'est le niveau d'abstraction du correctif qui rend l'effet invisible, comme au
cycle 125 : on raisonne « quels messages entrent dans l'ensemble gravé ? », et
un effet de BORD de cette gravure n'apparaît dans aucune phrase de ce
raisonnement. L'écriture d'une date est le genre d'opération qu'on tient pour
inerte.

Le discriminant utile : **une unité write-once qui marque une PREMIÈRE fois est
un point de départ naturel pour des effets de cycle de vie.** « Première
réception », « première lecture », « première ouverture » sont exactement les
instants auxquels on accroche une rétention, un décompte, une purge — et
`freezeMessageStatus` le dit de lui-même (« "première" réception est une
propriété que SEULE l'écriture write-once connaît »). Devant une telle unité,
l'effet de bord est à PRÉSUMER, pas à chercher.

## Corollaire sur les constats

Un constat d'audit énumère les coûts qu'il a vus. Les recopier dans le lot qui
corrige, c'est hériter de son périmètre de lecture. **Un lot qui corrige un
constat relit l'unité qu'il touche, et ajoute au constat ce qu'elle lui apprend**
— ici, le coût le plus grave des trois, et le seul que personne n'avait nommé.
