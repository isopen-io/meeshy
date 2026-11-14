# Un `catch` ATTRAPE une levée ; il ne la CONFINE pas

*2026-11-14, cycle 159. Mesuré sur #18380 — le fan-out de `conversation:updated`.*

## Le fait

Quatre émetteurs de `conversation:updated` composaient une charge PAR
destinataire et la poussaient dans une boucle. Les quatre boucles étaient
écrites à la main, et les quatre portaient la même propriété non voulue : **une
levée sur un lecteur emportait tous les suivants**, plus tout ce que l'appelant
faisait APRÈS la boucle.

Deux d'entre eux avaient pourtant un `catch`. Le producteur REST/ZMQ en avait
même un NOMMÉ :

```ts
} catch (syncError) {
  logger.warn('⚠️ [CONV_SYNC] Erreur sync liste conversations (non-bloquant):', syncError);
}
```

Il attrapait bien la levée. Il ne la confinait pas : la pastille de non-lus vit
**dans la même unité gardée**, douze lignes plus bas, et partait avec elle. Sur
le producteur WS — le transport PRIMAIRE de `message:send` — la boucle vivait
dans le `try` de fin de méthode, donc la levée coûtait aussi l'accusé de remise
automatique : l'expéditeur restait bloqué sur un seul ✓.

## Pourquoi ça ne se voit pas

Parce qu'on relit l'ÉTIQUETTE, jamais le BLOC. « Non-bloquant » était vrai des
deux premières instructions du `try` et faux de la troisième. Le dépôt avait
déjà écrit cette phrase au cycle 116 — *« une étiquette de `catch` ne qualifie
que ce que son auteur avait en tête, et une portée grandit toute seule à chaque
instruction ajoutée au bloc »* — et elle n'avait pas traversé jusqu'ici, parce
qu'elle y était écrite sur un problème de PLACEMENT (où mettre l'enfilage
durable) et pas sur un problème de PORTÉE (jusqu'où s'étend ce qu'on perd).

Les quatre témoins existants mesuraient d'ailleurs la bonne chose au mauvais
endroit : ils font lever `emit` PAR NOM d'événement et vérifient que la file
hors ligne enfile quand même. Ils prouvent que la PLACE de l'enfilage le
protège — il est premier. Ils ne pouvaient rien dire de ce qui vient APRÈS la
levée, et c'est là que tout se perdait.

## La question à poser

Devant tout `try` qui enveloppe plus d'une instruction :

> **qu'est-ce qui est DANS ce bloc et que je ne veux pas perdre quand la
> première instruction lève ?**

Et son corollaire, qui est ce qui rend la réponse facile : **la granularité
juste d'une garde est celle de l'unité de travail qui peut échouer seule.**
Ici c'est le LECTEUR : un lecteur dont la charge ne s'encode pas est un
lecteur, pas un éventail. Une garde par lecteur fait que l'échec d'un lecteur
coûte un lecteur.

## Les deux corollaires de lot

**La composition va DANS la portée gardée.** `compose(participant)` lit la ligne
de CE participant, donc elle lève pour les mêmes raisons que l'émission. La
laisser dehors aurait laissé la moitié du risque hors de la garde — et c'est la
moitié la plus spécifique au lecteur.

**Un site unique, plus un balayage.** Un type ne peut pas garder ce résultat :
rien n'oblige un cinquième émetteur à importer le site unique, et sa boucle
compilerait parfaitement. Une porte se ferme, une porte se CONTOURNE — seule la
seconde a besoin d'un balayage (`conversation-updated-door-sweep.test.ts`,
inventaire VIDE, même forme que `server-emit-door-sweep`).

## Détail de méthode

L'audit qui a trouvé ce défaut l'avait attribué au seul producteur WS, sur la
foi que son jumeau REST « garde ce bloc séparément ». C'était exact et
insuffisant : le témoin écrit pour le confirmer est tombé sur les DEUX. **Une
hypothèse héritée d'un relevé se mesure avant d'être crue, même quand le relevé
cite les bons numéros de ligne** — le relevé disait vrai sur la présence du
`catch`, et rien sur ce qu'il contient.
