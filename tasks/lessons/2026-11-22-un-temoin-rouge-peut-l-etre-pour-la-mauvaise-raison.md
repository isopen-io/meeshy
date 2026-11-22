## Un témoin ROUGE peut l'être pour la MAUVAISE raison (2026-11-22, #20303, cycle 213)

**Le fait.** Le premier jet du témoin appelait l'unité sous test avec un champ
qui n'existe pas dans son contrat :

```ts
applyMessageDeleted(client, { id: 'm-1', conversationId: 'c-a' });   // le contrat dit `messageId`
```

Il est passé au ROUGE. **Deux échecs, exactement les deux assertions attendues,
avec exactement le diff attendu** (`["m-1","m-2"]` au lieu de `["m-2"]`). Le
correctif a été écrit, posé — et le témoin est resté ROUGE au même endroit. La
cause de sa chute n'avait jamais été l'absence du correctif : `data.messageId`
valait `undefined`, donc rien ne matchait, ni avant ni après.

**La règle.** Le ROUGE prouve qu'une assertion TOMBE, jamais POURQUOI elle
tombe. Un harnais mal adressé — mauvais nom de champ, mauvaise clé de cache,
mauvais id — rend le même rouge qu'un défaut réel, avec la même forme et le
même nombre d'échecs. Les deux sont indiscernables tant qu'on n'a pas vu le
correctif rendre le témoin VERT.

Le cycle de preuve complet a donc **trois** temps, pas deux :

1. **ROUGE** — le témoin tombe.
2. **VERT** — le correctif le relève. *C'est l'étape qui QUALIFIE le rouge.* Un
   rouge qui ne devient pas vert sous le correctif n'était pas le bon rouge, et
   il faut corriger le TÉMOIN, pas la production.
3. **ROUGE à nouveau** — le correctif retiré, le témoin CORRIGÉ retombe. C'est
   le seul temps qui prouve que le témoin garde bien ce qu'il prétend garder,
   et c'est celui qu'on saute.

Ici l'étape 2 a attrapé l'erreur, et l'étape 3 a prouvé le lot : correctif
retiré, 2 rouges / 30 verts ; remis, 32 verts.

**Pourquoi il est tentant de s'arrêter à l'étape 1.** Parce que le rouge
RESSEMBLE à la preuve. Il a le bon nombre d'échecs, il nomme les bonnes
assertions, son diff montre exactement la valeur qu'on voulait voir disparaître.
Rien dans sa forme ne distingue « le défaut existe » de « mon témoin ne touche
pas le code ». Et quand le correctif est écrit juste après, on lit le vert —
s'il vient — comme la confirmation des deux à la fois.

C'est la forme, portée au HARNAIS, de la règle que le dépôt tient déjà de la
production : *un témoin qui ne peut pas tomber n'est pas un témoin.* Son jumeau
est : **un témoin qui ne peut pas se RELEVER n'en est pas un non plus.**

**Le geste.** Quand un témoin rouge ne passe pas au vert sous le correctif, la
première hypothèse n'est pas « le correctif est incomplet » — c'est **« le
témoin n'exerce pas ce que je crois »**. Ouvrir le contrat de l'unité appelée
et le comparer, champ par champ, avec ce que le témoin lui passe.
