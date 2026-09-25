## Leçon 512 — Avant d'écrire un module, chercher celui qu'on est en train de réécrire

**Ce qui s'est passé.** Le lot de la bannière en application (#4454) a commencé par remonter la loi
du web existant dans `packages/shared/utils/notification-banner.ts`, puis par écrire, côté v3, une
liaison, une copie, une région, une feuille — quatre fichiers, tous compilant. Au moment d'écrire
les témoins, un `ls __tests__/` a rendu `banniere-notification.test.ts` : **la v3 avait DÉJÀ sa loi
de bannière**, `lib/notifications/banniere.ts`, 258 lignes, avec 290 lignes de témoins, mergée dans
`dev` avant le début de la session. Je réécrivais, à l'octet près, ce qui existait — dans le lot
dont l'objet DÉCLARÉ était d'empêcher exactement cette troisième écriture.

**Pourquoi ça n'a pas sauté aux yeux.** Le module existant n'était importé par RIEN sauf ses
témoins : du code livré, prouvé, et sans appelant. Aucun `grep` du chemin d'exécution ne le
rencontre ; aucune erreur de compilation ne le signale ; il ne paraît dans aucun bundle. Un module
sans consommateur est INVISIBLE à toutes les recherches qui partent d'un consommateur.

**La règle.** *Avant d'écrire un fichier, chercher son SUJET — pas son chemin, ni ses appelants.*
Un `ls` du répertoire des témoins et un `grep -ril <sujet>` coûtent dix secondes ; ils auraient rendu
le fichier au premier essai. La question à poser n'est pas « où ce code sera-t-il appelé ? » mais
**« quelqu'un a-t-il déjà écrit ceci ? »**, et le meilleur endroit où la poser est le répertoire des
TÉMOINS : un module peut n'avoir aucun appelant, il a presque toujours un témoin, et le témoin porte
le sujet dans son nom.

**Le corollaire, qui a coûté davantage.** Le fichier existant PORTAIT son argument d'architecture
dans un doc-comment : « les littéraux transcrivent `NotificationTypeEnum` plutôt que d'en importer
la valeur : un import de VALEUR tirerait le module entier dans le chunk de `(connected)`, que le
§ 8.3 plafonne ». Mesuré : SEIZE fichiers de la v3 importent déjà des valeurs de `@meeshy/shared`,
dont un module de navigateur, et la v3 n'expédie aucun JavaScript de page — il n'y a pas de chunk
`(connected)`. **Un argument d'architecture écrit dans un doc-comment est une AFFIRMATION à
vérifier, jamais un fait à respecter** ; celui-ci justifiait une duplication de loi par une
contrainte qui n'existait pas.

**Et l'affirmation avait quand même raison sur le CHIFFRE.** L'import de valeur coûtait bien :
+2 944 o gzip sur `participate.js`, +3 119 o sur `liste.js` — TypeScript émet de
`NotificationTypeEnum` (~150 membres) un objet littéral entier, tiré pour nommer quatorze
constantes. La bonne réponse n'était donc ni la copie (deux lois) ni l'import (trois kilo-octets sur
la 3G rurale) mais la TROISIÈME : prouver l'appartenance à la COMPILATION —
`['new_message', …] satisfies readonly \`${NotificationTypeEnum}\`[]`, un `import type` qui n'émet
rien. Une source unique, un membre renommé qui rend rouge plus tôt qu'un témoin, et zéro octet.
**Quand un doc-comment oppose la source unique au poids, chercher la formulation qui rend les
deux** — le compilateur sait vérifier beaucoup de ce qu'on croit devoir exécuter.

Sites : `packages/shared/utils/notification-banner.ts` (`TypeDeNotification`, les trois `satisfies`),
`apps/web-v3/lib/notifications/banniere.ts` (la liaison, qui a remplacé la copie),
`apps/web-v3/__tests__/banniere-notification.test.ts` § « UNE loi, trois clients — et rien qui la
réécrive ici » (la garde de transcription, devenue une garde de NON-RÉÉCRITURE). Issue #4454.
