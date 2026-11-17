## Une ÉNUMÉRATION de témoin rend comparables des familles qui ne le sont pas — « la case, une fenêtre ancrée ET la cloche ne sont pas touchées » gelait la cloche sous deux assertions justes, et un CONTRÔLE est l'endroit le plus discret où geler un défaut (2026-11-14, #18573)

Trois témoins, dans trois fichiers, affirmaient que la PREMIÈRE authentification
du socket web ne touche pas la cloche ni les demandes d'amitié. Le plus pur :

```ts
test('la case d’une conversation, une fenêtre ancrée et la cloche ne sont pas touchées', …)
  expect(isInvalidated(queryClient, conversationQueryKey('c-a'))).toBe(false);   // JUSTE
  expect(isInvalidated(queryClient, anchored)).toBe(false);                      // JUSTE
  expect(isInvalidated(queryClient, NOTIFICATION_COUNTS_QUERY_KEY)).toBe(false); // GELAIT LA LACUNE
```

Les deux premières appartiennent à une classe — *ce que `message:new` ne nourrit
pas*. La troisième appartient à une autre — *une famille PERSONNELLE que
l'intervalle de connexion emporte en entier*. La pastille de la cloche mentait
après chaque démarrage à froid, et trois témoins l'attestaient, verts.

> Le cycle 114 dit qu'« un témoin qui nomme correctement la moitié qu'il garde
> GÈLE l'autre ». La variante est plus coûteuse : **ce n'est pas une assertion
> voisine qui est gelée, c'est une FAMILLE voisine** — et c'est l'ÉNUMÉRATION de
> l'intitulé qui les a rendues comparables. « A, B et C ne sont pas touchés » se
> relit comme UNE affirmation ; elle en porte trois, dont une d'une autre classe.
> Devant un intitulé qui énumère, demander de chaque terme : **appartient-il à la
> classe que les autres décrivent, ou seulement à la phrase ?**

Deux corollaires, mesurés dans le même lot :

- **Un CONTRÔLE est l'endroit le plus discret où geler un défaut.** Les deux
  autres exemplaires étaient de la forme « fire, assert `false`, fire, assert
  `true` » : le contrôle n'affirme rien du SUJET du témoin, donc personne ne
  l'instruit en lisant le témoin, et son nom (« une RE-authentification invalide
  aussi X ») dirige l'attention sur la seconde ligne. Un témoin dont le nom
  annonce la seconde moitié rend la première invisible.

- **Une liste épelée à chaque site est en retard d'une branche.** Le défaut vient
  de quatre `invalidateQueries` écrites dans UNE des deux branches qui les
  doivent ; #6288, #6321 et #7378 y ont chacun ajouté la leur sans voir l'autre.
  La question à poser à tout lot qui ajoute une famille à un rattrapage, une
  invalidation ou un éventail : **combien de branches doivent cette liste, et où
  est-elle écrite ?** Si la réponse à la seconde est « à chaque site », la réponse
  à la première est « une de moins que vous ne croyez » — même forme que les huit
  copies de la porte d'émission (cycle 104) et que les dix-sept sites qui lisaient
  `user.systemLanguage` à cru (cycle 124).
