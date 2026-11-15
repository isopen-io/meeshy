## Leçon 314 — un `catch` par lecture est juste ; un agrégateur qui n'agrège que des `void` transforme cette justesse en mensonge une couche plus haut (2026-08-28, cycle 135)

Le cycle 134 a livré le déclencheur PÉRENNE du double des préférences, et sa
clause « aucune passe d'hydratation n'a eu lieu » lit `lastSyncedAt === null`. En
RELISANT le correctif — pas en l'écrivant — la question « ce champ dit-il
vraiment ce que je lui fais dire ? » a rendu non.

```ts
await get().syncAll();
set({ isInitialized: true, lastSyncedAt: new Date().toISOString() });
```

`syncAll()` **ne peut pas échouer** : chacun de ses quatre `GET` porte son PROPRE
`try/catch`, absorbe la panne et résout `void`. Et chacun de ces `catch` est
JUSTE, pour une raison écrite à côté de lui : « le dernier statut connu reste
affiché — une panne réseau n'est pas la preuve que l'utilisateur a perdu ses
clés ». Quatre décisions correctes, prises localement, dont l'agrégat ne dit
plus rien.

> **Absorber un échec en LOCAL et le REMONTER sont deux gestes distincts.** Un
> `catch` qui protège l'affichage ne dispense pas de rendre le verdict : sans
> retour, l'appelant ne peut construire qu'un « la passe s'est terminée », qu'il
> nommera fatalement « les données sont fraîches ». La question à poser à tout
> agrégateur n'est pas « gère-t-il les erreurs ? » mais **« que rendent ceux
> qu'il agrège, et que peut-il en DIRE ? »** — un `Promise<void>[]` ne permet
> aucune phrase vraie.

Et la seconde moitié du défaut ne se corrigeait par aucun retour de fonction :

> **La PORTÉE d'un champ change la QUESTION à laquelle il répond.** Une valeur de
> session dit « cet onglet a-t-il lu ? » ; la même valeur PERSISTÉE dit « quand
> a-t-on lu la dernière fois ? ». Son unique lecteur posait la première.
> Persister n'est jamais neutre : c'est élargir en silence la portée d'un champ
> sans renommer ce qu'il mesure — et un champ qui répond à deux questions ment
> aux deux.

Deux corollaires mesurés dans le même lot :

- **Le commentaire du site de câblage disait déjà le contraire du code.**
  `StoreInitializer` documentait « sa clause lit `lastSyncedAt`, que seule une
  hydratation RÉUSSIE renseigne — un onglet ouvert hors ligne se rattrape donc à
  sa première connexion ». L'intention était écrite, juste, à la bonne place, et
  rien ne l'appliquait (famille des leçons 124 et 307). **Un commentaire qui
  décrit une garantie est un endroit où CHERCHER un défaut, pas une preuve qu'il
  n'y en a pas.**
- **Réparer un mensonge de fraîcheur avec un `every` en aurait installé un
  autre, pire.** Exiger les quatre lectures ferait dépendre l'horodatage du point
  de terminaison le plus fragile — `/me/preferences/privacy` a été absent une
  période entière — et l'aurait supprimé à VIE : le rattrapage serait devenu dû
  à CHAQUE connexion. **Un correctif de justesse qui installe une requête
  perpétuelle n'en est pas un** (une lenteur est un bug, § roadmap).

Enfin, la forme qui a failli passer, attrapée par la relecture adversariale :
passer d'une sortie anticipée (`if (version >= COURANTE) return`) à des étapes de
migration gardées (`if (from < 1) …`) **INVERSE** le traitement d'une version
ABSENTE, que `persist` transmet en `undefined`. `undefined >= 1` est `false`
(l'ancien code migrait) et `undefined < 1` est `false` AUSSI (le nouveau aurait
tout sauté) : les deux comparaisons rendent la même valeur, et c'est exactement
ce qui rend l'inversion invisible. **Une version absente est la plus ANCIENNE,
jamais la plus récente** — et toute comparaison numérique sur une valeur qui peut
manquer se normalise AVANT le test, jamais dans le test.
