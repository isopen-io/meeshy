## Leçon 516 — Remonter une loi sans remonter ses témoins la rend orpheline

**Ce qui s'est passé.** La loi de la bannière a été remontée du web existant
vers `packages/shared` pour cesser d'être écrite trois fois (#4454). Le lot
était soigneux : l'API du client ne changeait pas d'un caractère, et ses seize
témoins passaient **sans qu'une ligne du fichier de tests ne bouge** — la preuve
même qu'un déplacement de code doit produire.

Puis la v3 a été liée à la même loi, avec ses propres témoins. Deux paquets
l'exerçaient donc, et abondamment. En CI, `notification-banner.ts` s'est affiché
à **7,14 % de lignes** dans la couverture de `packages/shared`, sous les seuils
du paquet (98 / 98 / 94), et le gate a rougi.

Le code était exercé — **par les suites de deux AUTRES paquets, qui ne comptent
pas là où il vit.**

**La règle.** *Un déplacement de code déplace ses obligations de preuve avec
lui.* « Les témoins existants passent inchangés » est le bon critère pour
prouver qu'on n'a rien cassé ; ce n'est PAS le critère pour prouver que le code
est couvert **à sa nouvelle adresse**. Les deux questions se ressemblent au
point qu'on ne pose que la première.

**Pourquoi ce n'est pas une exigence de chiffre.** Un paquet partagé dont la
règle n'est prouvée que par ses consommateurs ne peut plus être modifié en
confiance depuis lui-même : le jour où un client cesse de l'appeler, ou change
de forme, la règle n'a plus aucun témoin **et rien ne rougit**. La couverture ne
faisait ici que rendre visible une dépendance de preuve inversée.

**Le corollaire sur ce qu'on écrit.** Les témoins de la loi, chez elle, jugent
le **cadrage** et la **composition** avec des conventions COUSUES — jamais le
vocabulaire d'un client. Les suites clientes gardent leur objet propre : que la
LIAISON apporte les bonnes conventions. Écrire chez la loi des phrases
françaises d'un client y gèlerait ce que la remontée venait justement d'en
sortir.

Sites : `packages/shared/__tests__/utils/notification-banner.test.ts` (54
témoins, la loi jugée chez elle) ; les suites clientes
(`apps/web/__tests__/utils/notification-banner.test.ts`,
`apps/web-v3/__tests__/banniere-notification.test.ts`) restent en place et
gardent leur liaison. Issue #4454.
