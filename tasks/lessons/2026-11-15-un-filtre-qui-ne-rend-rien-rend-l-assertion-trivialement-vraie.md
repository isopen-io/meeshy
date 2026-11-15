## Un filtre qui ne rend RIEN rend l'assertion trivialement vraie

*2026-11-15, cycle 166 — #18623.*

**Le fait.** Le témoin devait prouver qu'un canal audio n'atteint pas un lecteur
sous plancher :

```ts
const touched = world.sent.filter((s) => s.event.startsWith('audio-translation') && !s.excepts.includes(ROOM_LATE));
expect(touched).toEqual([]);
```

L'événement s'appelle **`audio:translation-ready`**. Le préfixe deviné
(`audio-translation`) ne matchait rien, `touched` valait `[]` quoi qu'il arrive,
et l'assertion passait sur un dépôt où la garde n'existait pas. Mesuré : garde
retirée de la production ⇒ **4/4 au VERT**.

**Pourquoi ça échappe à la relecture.** L'assertion `toEqual([])` est la forme
JUSTE pour « rien ne doit atteindre ce lecteur ». Le défaut n'est pas dans ce
qu'on affirme, il est dans le FILTRE qui compose le sujet de l'affirmation — et
un filtre se lit comme de la plomberie, pas comme une affirmation. Les deux
conditions du `&&` se relisent ensemble, alors qu'une seule décide du résultat.

C'est le jumeau exact de la leçon « un `toEqual` sur une liste entière affirme
autant sur ce qu'il GARDE que sur ce qu'il ADMET », avec un cran de plus :
**ici il n'affirme rien du tout, parce que son ensemble de départ est vide.**

**La règle.** Un témoin qui assert la VACUITÉ d'un ensemble doit d'abord prouver
que cet ensemble peut être NON VIDE. Deux façons, et la seconde est gratuite :

- un témoin JUMEAU, sur la même fixture, qui affirme l'inverse pour le lecteur
  AUTORISÉ (`…atteint toujours le lecteur autorisé`) — s'il tombe, le filtre
  est mort ;
- la mutation **une par une** de la garde visée : si le témoin ne tombe pas, le
  filtre ne mesure rien.

**Le corollaire, outillé.** Un nom d'événement se lit sur sa CONSTANTE
(`SERVER_EVENTS.AUDIO_TRANSLATION_READY`), jamais sur un préfixe deviné : la
constante est confrontée au compilateur, le littéral ne l'est par rien. C'est la
leçon du cycle 104 (« une ADRESSE juste ne dit rien de ce qui y arrive »)
retournée — **ici l'adresse était fausse, et c'est le filtre qui l'a tue.**

**Et ce que ça dit du cycle précédent.** Le cycle 165 avait livré une garde
prouvée par rien pour une raison DIFFÉRENTE (une clé d'environnement absente
rendait la branche inatteignable). Deux cycles de suite, deux mécanismes, un
seul symptôme : **le ROUGE en bloc ne distingue pas les gardes.** La mutation
une par une n'est pas une vérification de fin de lot, c'est la seule mesure qui
dit quelle garde est portante.
