## Leçon 577 — Un témoin qui FABRIQUE sa donnée ne mesure qu'une moitié de la chaîne, et affirme l'autre

2026-09-11, passerelle (audit de cohérence iOS ↔ passerelle).
`conversation-wire-fields.test.ts` est un bon témoin : il sérialise une ligne de
liste et regarde ce qui survit à `fast-json-stringify`, qui retire en silence
toute propriété non déclarée. Il est né d'un vrai défaut de production, il est
bien écrit, et il est **vert depuis des mois sur quatre champs que la base ne
chargeait pas**.

L'objet qu'il sérialise est un littéral, sous un commentaire qui dit « ce que le
handler de liste pose réellement ». Le commentaire affirme ; le test, lui, ne
mesure que ce qui se passe APRÈS que le handler a posé. `description`,
`defaultWriteRole`, `slowModeSeconds` et `autoTranslateEnabled` étaient déclarés
au schéma, présents dans le littéral — et absents du `select` Prisma. Servis
`undefined` sur chaque ligne, pour toujours.

Les deux pièges sont symétriques, et un seul des deux se voit :

| | déclaré au schéma | chargé par la requête | ce qui part |
|---|---|---|---|
| piège 2026-08-24 | ✗ | ✓ | rien (strippé) |
| piège 2026-09-11 | ✓ | ✗ | rien (jamais lu) |

> **Une donnée fabriquée dans un test est une HYPOTHÈSE, pas une mesure.** Le
> test prouve « si le handler pose ceci, alors le fil rend cela » — jamais que
> le handler le pose. Devant un témoin qui construit son entrée, demander :
> *quelle moitié de la chaîne reste non mesurée, et qui la mesure ?*

Parade : un témoin qui lit les DEUX SOURCES DE VÉRITÉ et les confronte, plutôt
qu'une donnée écrite à la main. Ici : les colonnes de `model Conversation` lues
dans `schema.prisma` à l'exécution, ∩ les propriétés de `conversationMinimalSchema`,
⊆ les clefs du `select` — avec une liste d'exceptions qui coûte une phrase
chacune. La loi attrape le prochain champ ; un littéral n'attrape que celui
qu'on a pensé à y écrire.

Corollaire d'outillage : une sélection Prisma **inline dans un `findMany` est
illisible pour tout témoin**. L'extraire en constante exportée n'est pas
cosmétique — c'est ce qui rend la moitié amont mesurable.
