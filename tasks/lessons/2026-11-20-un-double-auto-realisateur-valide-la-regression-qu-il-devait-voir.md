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

### Quand ce motif est BÉNIN — mesuré le 2026-11-21, pour ne pas sur-appliquer la leçon

Tenté d'en faire un cliquet, et renoncé **sur mesure**. Dans la passerelle :

- **99** fichiers de test posent un double en `mockImplementation(({ where }) => …)` ;
- **27** d'entre eux DÉCIDENT sur la forme du `where` (`where.x === …`, `where.OR.some(…)`).

Mais la plupart de ces 27 sont **légitimes**, et la différence est nette une fois
qu'on la nomme :

| forme | exemple | verdict |
|---|---|---|
| **identité** — « cette ligne existe-t-elle ? » | `where.id === ATTACHMENT_ID ? row : null` | **bénin** : c'est une table en mémoire à une ligne, pas une réaffirmation de la règle testée |
| **autorisation** — le double rejoue la CLAUSE que le test prétend garder | `where.uploadedBy === USER_ID && where.OR.some(…) ? row : null` | **tautologie** : le témoin ne peut rendre que ce que l'appelant lui demande |

`attachments-download.test.ts` est l'exemple du premier cas : ses doubles
apparient par clé primaire, et la décision d'ACCÈS vient d'un interrupteur
explicite (`participant.findFirst → granted ? … : null`). Rien à corriger.

**Pourquoi aucun cliquet n'a été écrit** : un discriminant textuel ne sépare pas
ces deux formes — il faut savoir ce que le test PRÉTEND garder. Un cliquet qui
les confondrait signalerait vingt faux positifs et rassurerait sur les vrais.
Un cliquet qui rassure à tort est pire que pas de cliquet (#20113, F3).

**La question qui tranche, à poser au témoin, pas au double** : *si la règle
sous test changeait d'espace de clés ou de forme, ce double rendrait-il encore
ce que l'assertion attend ?* Si oui, le témoin ne garde rien.
