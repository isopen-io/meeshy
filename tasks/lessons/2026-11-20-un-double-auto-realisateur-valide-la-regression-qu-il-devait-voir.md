## Un double AUTO-RÉALISATEUR valide la régression qu'il devait voir — et une garde tenue par accident tombe avec l'accident

**#20113, 2026-11-20.** J'ai unifié l'espace de clés de
`MessageAttachment.uploadedBy` : deux écrivains de copie y posaient un
`Participant.id` là où les quatre écrivains de téléversement posaient l'identité
de compte. Toute la suite passait au vert. L'audit adversarial a montré que le
lot **réouvrait une garde de sécurité fermée par #16811** : une photo reçue en
privé pouvait devenir l'avatar public de qui la transfère.

### Deux leçons distinctes, et la seconde explique la première

**1. Une garde tenue par accident tombe avec l'accident.** Le doc de
`identityImageOwnership` exige « une ligne de type image, **TÉLÉVERSÉE par
l'appelant** ». Le mot « téléversée » n'était tenu par aucune colonne : il
l'était parce qu'une copie portait un `Participant.id` et que la garde compare
un `User.id`. Les deux ne s'appariaient jamais — pour une raison que personne
n'avait écrite, et que personne ne pouvait donc préserver.

> Quand on unifie un espace de clés, la question n'est pas seulement « qui
> comparait mal ? » mais **« qui refusait, et refusait-il pour la raison qu'il
> dit ? »** Apparier plus de lignes est une amélioration pour un lecteur qui
> cherche, et une perte pour un lecteur qui garde. Un inventaire par espace de
> clés ne voit pas cette différence : son étiquette dit *quel espace* un site
> suppose, jamais *si apparier plus élargit une autorité*.

**2. Aucun témoin ne pouvait tomber, et c'est pourquoi je n'ai rien vu.** Le
témoin existant double Prisma ainsi :

```ts
findFirst: ({ where }) => (where.uploadedBy === USER_ID && … ? { id: 'att-own' } : null)
```

Ce double **affirme** la condition au lieu de l'APPLIQUER à une ligne. Il ne
peut donc rendre que ce que l'appelant lui demande : le cas « la copie
transférée porte maintenant USER_ID » lui fait rendre une ligne, et le test
*valide* la régression. **Un double auto-réalisateur est incapable de mesurer un
changement d'espace de clés** — il n'a pas de lignes, il n'a qu'un prédicat.

Le témoin qui attrape le défaut donne au double de vraies LIGNES et lui fait
appliquer le `where` (`matchesMongoWhere` dans ce dépôt) :

```ts
const prisma = { messageAttachment: { findFirst: findFirstIn([originale, copieTransferee]) } };
await expect(identityImageIsCallers(prisma, { userId: TRANSFERANT, reference: CHEMIN })).resolves.toBe(false);
```

### La règle
- Un double de base de données qui **réécrit la condition** de la requête ne
  garde rien : il garde sa propre copie de la condition. Lui donner des lignes et
  un moteur de `where`, même rudimentaire, est ce qui sépare un témoin d'une
  tautologie.
- Avant de changer la valeur d'un champ qu'un `where` apparie, **lister les
  lecteurs qui REFUSENT grâce à lui**, pas seulement ceux qui autorisent. Et pour
  chacun : sa condition est-elle écrite dans le code, ou seulement dans sa prose ?
- Un lot qui touche un prédicat de contrôle d'accès passe par
  l'`auditeur-adversarial` avant fusion. Ici, il a trouvé ce que trois suites
  vertes, un typecheck vert et un cliquet neuf avaient laissé passer.
