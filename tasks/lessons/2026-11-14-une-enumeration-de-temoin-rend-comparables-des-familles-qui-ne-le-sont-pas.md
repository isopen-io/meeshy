# Une énumération de témoin rend comparables des familles qui ne le sont pas

*2026-11-14, cycle 163, #18573.*

## Le fait

Trois témoins, dans trois fichiers, affirmaient que la PREMIÈRE authentification
du socket web ne touche pas la cloche / les demandes d'amitié. Le plus pur :

```ts
test('la case d’une conversation, une fenêtre ancrée et la cloche ne sont pas touchées', …)
  expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);  // JUSTE
  expect(isInvalidated(queryClient, anchored)).toBe(false);                     // JUSTE
  expect(isInvalidated(queryClient, NOTIFICATION_COUNTS_QUERY_KEY)).toBe(false); // GELAIT LA LACUNE
```

Les deux premières appartiennent à une classe — *ce que `message:new` ne nourrit
pas*. La troisième appartient à une autre — *une famille personnelle que
l'intervalle de connexion emporte en entier*. La pastille de la cloche mentait
après chaque démarrage à froid, et trois témoins l'attestaient, verts.

## La leçon

Le cycle 114 dit qu'« un témoin qui nomme correctement la moitié qu'il garde GÈLE
l'autre ». La variante de ce cycle est plus coûteuse : **ce n'est pas une
assertion voisine qui est gelée, c'est une FAMILLE voisine** — et c'est
l'ÉNUMÉRATION de l'intitulé qui les a rendues comparables. « A, B et C ne sont
pas touchés » se relit comme une seule affirmation ; elle en porte trois, dont
une d'une autre classe.

> Devant un intitulé de témoin qui ÉNUMÈRE, demander de chaque terme :
> **appartient-il à la classe que les autres décrivent, ou seulement à la phrase ?**

## Le corollaire, sur les CONTRÔLES

Les deux autres exemplaires étaient de la forme :

```ts
socket.fire(AUTHENTICATED); expect(…isInvalidated).toBe(false);  // le contrôle
socket.fire(AUTHENTICATED); expect(…isInvalidated).toBe(true);   // le sujet
```

**Un contrôle est l'endroit le plus discret où geler un défaut** : il n'affirme
rien du sujet du témoin, donc personne ne l'instruit en lisant le témoin. Le nom
du test (« une RE-authentification invalide aussi X ») dirige l'attention sur la
seconde ligne et rend la première invisible.

## Ce qui aurait attrapé la classe plus tôt

Le défaut vient d'une liste qui n'existait nulle part : quatre
`invalidateQueries` épelées dans UNE des deux branches qui les doivent, trois
lots y ayant ajouté la leur sans voir l'autre. La question à poser à tout lot qui
ajoute une famille à un rattrapage, une invalidation ou un éventail :

> **Combien de branches doivent cette liste, et où est-elle écrite ?** Si la
> réponse à la seconde est « à chaque site », la réponse à la première est « une
> de moins que vous ne croyez ».
