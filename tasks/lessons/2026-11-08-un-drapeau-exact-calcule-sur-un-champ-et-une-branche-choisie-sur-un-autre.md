# Un drapeau nommé `exact` calculé sur un champ, et la branche choisie sur un AUTRE (2026-11-08, cycle 142)

## Le fait

`POST /conversations/:id/receipts` avec `{ type: 'read', caughtUpToMessageId }` —
la **seule** forme que `apps/web` envoie sur son chemin de lecture nominal —
prenait la branche HÉRITÉE de `markMessagesAsRead`, qui ne lit pas ce champ.
Résultat : curseur sauté au dernier message EN BASE et `readAt` gravé (write-once)
sur tout l'intervalle `(prevReadAt, now]`.

Les deux lignes qui composent le défaut sont justes séparément :

```ts
// routes/conversations/receipts.ts — l'appelant DÉCIDE qu'il est précis…
const exact = args.targeted !== undefined || args.caughtUpToMessageId !== undefined || …;
return ctx.readStatusService.markMessagesAsRead(…, exact ? { messageIds: args.targeted, …, caughtUpToMessageId } : undefined);

// services/MessageReadStatusService.ts — …et le gestionnaire choisit sur un AUTRE champ
const exactMessageIds = options?.messageIds;   // undefined
if (exactMessageIds) { /* mode exact */ } else { /* mode hérité, aveugle à la frontière */ }
```

`exact` est vrai, l'objet d'options part, et `messageIds` y est `undefined` :
le gestionnaire conclut « aucune précision rapportée ».

## La règle

**Quand un appelant calcule un drapeau de MODE et que le gestionnaire choisit sa
branche sur un CHAMP, les deux peuvent diverger sans qu'aucun des deux ne soit
faux.** Le drapeau dit « je suis précis » ; le champ dit « voici ma précision ».
Un appelant peut affirmer le premier et ne pas fournir le second — et c'est le
gestionnaire qui a le dernier mot, en silence.

La question à poser devant tout `if (champ)` qui gouverne un mode :
**« qui a décidé que ce mode s'applique, et a-t-il décidé sur CE champ ? »**

Si la réponse est non, l'une des deux réparations, jamais une troisième :
- le gestionnaire choisit sur la MÊME proposition que l'appelant (ici : « un
  `messageIds` OU une frontière a été rapporté »), et traite chaque champ absent
  explicitement ;
- ou le mode est porté par un type SOMME que l'appelant construit, de sorte
  qu'« exact sans ids » ne soit pas représentable.

## Ce qui la rend invisible

Le nom. `exactMessageIds` se lit comme *« les ids du mode exact »*, donc son
absence se lit comme *« pas en mode exact »* — une inférence que rien ne
garantit. Un nom qui AGRÈGE un mode et une donnée fait passer une implication
pour une définition.

C'est la forme du cycle 103 (« un `default` dans un schéma de requête rend la
précondition du gestionnaire inatteignable ») déplacée d'une couche : là, c'était
la couche de validation AU-DESSUS qui supprimait le cas que le gestionnaire
testait ; ici, c'est l'APPELANT qui annonce une précision qu'il ne transmet pas.
Même famille que « une garde conditionnée à la présence de ce qu'elle garde est
un no-op » (cycle 96), avec l'inversion : ici la garde est conditionnée à la
présence de ce qu'elle N'A PAS reçu.

## Le corollaire de correctif, et il valait la moitié du lot

Le contrat du champ dit « sans élargir d'un seul message l'ensemble déclaré LU ».
Sa lecture LITTÉRALE conduit à ne rien figer sur ce chemin — et c'eût été un
défaut PIRE : le web n'a que deux écritures d'accusé, la seconde étant le geste
« marquer comme lu ». Un défilement cesserait de produire la moindre coche chez
l'expéditeur, soit un changement de PRODUIT au milieu d'un correctif de défaut.

> **Un correctif qui applique un contrat À LA LETTRE peut retirer une
> fonctionnalité que personne n'a demandé de retirer.** Le contrat décrit
> l'intention d'un champ, pas l'arbitrage produit de toutes ses conséquences.
> Borner ce qui déborde, puis DÉPOSER la question stricte en issue, laisse la
> décision à qui elle appartient — et le lot reste mesurable.

Le témoin qui garde cela n'est pas celui qui prouve le défaut : c'est celui qui
reste VERT des deux côtés (« marquer comme lu sans frontière »). Sans lui, rien
n'aurait signalé que la resserre venait de casser le geste voisin.

## Et le discriminant d'un témoin se trouve dans l'ÉCHEC du premier jet

La première version du témoin de borne assertait sur TOUS les appels de
`message.findMany` portant `senderId` et `createdAt`. Elle est tombée — sur le
gel « lu implique livré », qui suit dans la même méthode et garde légitimement
l'horloge murale. Les deux `where` sont indiscernables par leur champ `field`,
qui n'y figure pas ; ils se distinguent par leur borne BASSE (`since: prevReadAt`
contre `since: prevDeliveredAt`, nul ici donc aucun `gt`).

**Lire ce qu'un témoin attrape en trop est ce qui apprend à viser.** L'échec
n'était pas un bruit à contourner : il nommait un second appel dont je n'avais
pas instruit la posture, et la réponse — « un message reçu l'est vraiment » — est
devenue une ligne du correctif.
