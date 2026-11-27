## 2026-11-27 — une garde FERMÉE sur l'échec annule la doctrine « un délégué manquant LÈVE »

**Issue** : #20717 · **Cycle** : 225 · routine messagerie temps réel

### Le motif

Plusieurs doubles Prisma du dépôt portent une doctrine explicite, et
`postThreadAccess.test.ts` l'écrit mieux que les autres :

> Le double n'expose que les délégués réellement touchés. Un délégué manquant
> fait échouer le test par `TypeError` plutôt que de rendre un verdict par
> défaut — c'est voulu : une garde qui interroge silencieusement la mauvaise
> table doit se voir.

La doctrine est juste, et elle est **excellente** : elle fait du double un
instrument de mesure du graphe d'appels, pas seulement un fournisseur de
valeurs.

**#20717 l'a rendue fausse pour une lecture précise**, et c'est structurel, pas
accidentel. La lecture de séparation par blocage est **FERMÉE sur l'échec**
(`isBlockedWithAny` rend `true` quand la lecture lève). Donc, pour cette
lecture-là :

| doctrine attendue | ce qui se passe réellement |
|---|---|
| délégué absent ⇒ `TypeError` ⇒ test rouge BRUYANT | délégué absent ⇒ promesse rejetée ⇒ attrapée ⇒ **« bloqué »** |

Le double rend donc exactement **le verdict par défaut que la doctrine voulait
rendre visible**. Et le symptôme n'est pas une erreur de harnais : c'est un
`404`, une audience vide, un `recorded: 0` — un refus d'accès plausible, qui se
lit comme une règle produit.

### Le coût mesuré

**30 suites rouges**, sur quatre familles, chacune manquant une combinaison
DIFFÉRENTE des trois méthodes que la lecture emploie (`findFirst` pour le
verdict unitaire, `findMany` + `findUnique` pour le chemin de lot). Aucune ne
nommait le blocage dans son échec.

### La question à poser

Avant de compter sur « un délégué manquant lèvera », demander :
**la lecture que ce délégué sert est-elle fermée sur l'échec ?**

- lecture qui PROPAGE son erreur ⇒ la doctrine tient, le double est un
  instrument ;
- lecture **fail-closed** ⇒ la doctrine est inversée : l'absence du délégué
  produit silencieusement le verdict le plus restrictif, et le test échoue sur
  une assertion de MÉTIER, loin de sa cause.

### Et le corollaire pour le lot qui AJOUTE la lecture

Un lot qui ajoute une lecture fail-closed dans une fonction largement appelée
**ne peut pas être prouvé par les suites de son périmètre** : par construction,
les suites qui cassent sont celles qui ne parlent pas de son sujet. La seule
preuve est la suite COMPLÈTE, et c'est ce que #20717 n'avait pas fait — il a
annoncé « 204/204 vertes » sur un périmètre qu'il avait choisi lui-même.

> **Un périmètre de preuve choisi par le lot mesure le lot, pas le dépôt.**

### Un dernier piège, du même lot

Les commentaires posés en réparant ces doubles ont fait rougir le cliquet de
TAILLE sur deux fichiers. **Un lot qui n'ajoute « que des commentaires » peut
casser un cliquet de lignes** : le budget ne distingue pas ce qui documente de
ce qui exécute, et c'est volontaire.
