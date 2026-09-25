## Leçon 246 — Un cliquet de TYPES se prouve sous mutation, comme un témoin (2026-08-22, cycle 101)

Le cycle 101 a fermé un défaut de contrat (`message:edited` omettait trois des
sept champs requis par `SocketIOMessage`, et le décodeur iOS les lit en
`try c.decode`) et a voulu le retenir par une garde à la COMPILATION plutôt que
par un seul témoin runtime. La première formulation était celle qui vient
d'abord à l'esprit :

```ts
type RequiredKeys = {
  [K in keyof SocketIOMessage]-?: undefined extends SocketIOMessage[K] ? never : K;
}[keyof SocketIOMessage];
```

Elle compilait, elle se lisait juste, et **elle ne gardait rien** : la passerelle
compile sous `strictNullChecks: false`, où `undefined extends T` est VRAI pour
tout `T`. Le jeu de clés valait donc `never`, et la garde passait au vert sous
n'importe quelle mutation. Mesuré : retirer `createdAt` du noyau ne la faisait
pas tomber d'un cran.

> **Une garde de types est une AFFIRMATION, exactement comme un tri (cycle 86
> bis), un compte (cycle 93) ou un commentaire de contrainte (cycle 94) : elle
> se vérifie en la faisant TOMBER.** Écrire la mutation qu'elle nomme et
> constater l'erreur de compilation est le seul geste qui distingue un cliquet
> d'une décoration — et il coûte trois minutes.

La forme juste teste le MODIFICATEUR `?`, que le drapeau n'efface pas :

```ts
[K in keyof T]-?: Record<string, never> extends Pick<T, K> ? never : K
```

Corollaire, et c'est ce qui rend l'erreur facile à commettre : **les idiomes de
types publiés supposent presque tous `strict: true`.** Recopier un idiome de
type dans un projet non strict, c'est recopier une garde dont la moitié des
prémisses est fausse. Avant d'employer `undefined extends …`, `NonNullable`,
`Exclude<…, undefined>` comme DISCRIMINANT, lire `tsconfig.json` — puis prouver
le rouge.

Et corollaire de portée : un témoin runtime et un cliquet de types ne se
remplacent pas. Ici le témoin prouve ce que le producteur MET SUR LE FIL, le
cliquet prouve que le noyau ne peut plus rétrécir sans qu'on le voie ; le lot
livre les deux, chacun prouvé rouge séparément.
