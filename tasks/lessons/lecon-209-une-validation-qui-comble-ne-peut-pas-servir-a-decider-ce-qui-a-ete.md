## Leçon 209 — une validation qui COMBLE ne peut pas servir à décider ce qui a été demandé (2026-08-16, routine temps réel, cycle 49)

### 1. Le fait

`ZodObject.partial()` enveloppe chaque champ dans `optional()` mais ne lui retire
pas son `default()`. Parser un corps partiel contre un schéma défaillé rend le
schéma ENTIER :

```ts
const S = z.object({ a: z.boolean().default(true), b: z.boolean().default(true) });
S.partial().parse({ b: false });   // → { a: true, b: false }, PAS { b: false }
```

Toute fusion `{ ...existant, ...validé }` est alors inerte : le second terme
couvre le premier de bout en bout. `PATCH /me/preferences/:catégorie` écrivait
13 à 33 clés par défaut pour un corps VIDE, sur les sept catégories.

### 2. Pourquoi c'est invisible

Le symptôme ne ressemble pas à sa cause. L'appelant envoie un champ, le serveur
en écrit trente — mais chaque valeur écrite est **légitime** prise isolément :
c'est le défaut du schéma, pas une valeur inventée. Une revue de code lit
`{ ...existant, ...validé }` et voit une fusion ; rien à cet endroit ne dit que
`validé` est complet.

Et le test qui aurait dû l'attraper ne le pouvait pas : le schéma du double
(`NotifSchema`) n'avait **aucun** `default()`, donc `partial()` s'y comportait
comme on l'imagine. Le double était plus simple que le réel exactement là où le
réel était piégeux.

### 3. La règle

**Une couche qui COMBLE ne peut pas, ensuite, servir à décider ce qui a été
demandé.** Défauts, coercions, valeurs de repli : chacun rend indiscernables
« l'appelant a dit ceci » et « nous avons supposé cela ». Après coup, `{ a: true }`
a la même forme dans les deux cas.

L'intention se lit donc à la SOURCE — ici le corps de la requête — et jamais dans
la sortie d'un validateur qui a le droit d'inventer. Garder la validation
(types, énumérations, bornes, clés inconnues écartées) ; ne lui demander que
ce qu'elle sait : la conformité, pas la provenance.

Test à s'appliquer : « si je retire cette couche, la valeur change-t-elle ? »
Si oui, sa sortie ne peut pas répondre à « qu'est-ce qui a été envoyé ? ».

### 4. Le corollaire — un double plus simple que le réel

Cinquième cycle consécutif où un double ne modélise qu'un état du rangement.
Ici, quatre suites n'avaient pas de `userPreference` du tout, et le schéma de
test n'avait pas de `default()`.

Un double qui SIMPLIFIE le collaborateur ne teste pas moins : il teste **autre
chose**, et le fait en vert. Quand le comportement sous test dépend d'une
propriété du collaborateur (« ce schéma a des défauts », « cette ligne peut ne
pas exister », « cette table a deux rangements »), le double doit porter cette
propriété — sinon le témoin atteste d'un monde qui n'existe pas.

### 5. La contre-épreuve à écrire

Le correctif « ne garder que les clés du corps » a une variante fausse et
tentante : « ignorer les valeurs égales au défaut ». Elle passe tous les témoins
naïfs et casse le cas où l'utilisateur RÉTABLIT explicitement un réglage à sa
valeur par défaut.

Le témoin qui les sépare — « une valeur envoyée qui COÏNCIDE avec le défaut est
bien appliquée » — a été écrit pour cette raison. Quand deux correctifs
plausibles ne se distinguent que sur un cas, ce cas EST le témoin.
