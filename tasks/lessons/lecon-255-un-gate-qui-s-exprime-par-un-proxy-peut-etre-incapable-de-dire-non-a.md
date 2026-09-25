## Leçon 255 — un gate qui s'exprime par un PROXY peut être incapable de dire NON à l'un de ses membres

Le drain de la file hors ligne ne demande pas à une entrée « quelle est ta
forme ? ». Il lui demande **« sais-tu te diffuser ? »**, et lit la réponse dans
la longueur d'une liste :

```ts
const emissions = _drainedEmissions(entry);
if (emissions.length === 0) { dropEntry(entry, 'unresolvable-event-type'); continue; }
```

Le contrat est écrit dans la fonction elle-même : « une liste VIDE dit *je ne
sais pas diffuser ceci*. C'est la seule réponse honnête. » Onze `eventType` sur
douze passent par une table qui peut rendre `undefined`, donc `[]`. Le douzième —
`'link-message'`, le seul dont la charge se **DÉPLIE** — passait par
`linkMessageEmissions`, qui poussait l'enveloppe INCONDITIONNELLEMENT avant de
regarder ce qu'elle contenait. **Il ne pouvait pas rendre `[]`.**

Le refus du message dérivé était pourtant là, ancien et juste. Il ne servait à
rien : il retirait la seule émission qui compte et laissait la liste à 1.

Ce que l'enveloppe seule livre : rien (son unique auditeur, le web, lit
`data.message` ; iOS et Android n'écoutent que le `message:new` refusé). Ce que
la liste non vide AFFIRMAIT, en revanche, coûtait trois signaux — `count`
comptait la remise, `conversationIds` ne nommait pas la conversation (donc rien
n'envoyait le client rechercher un message toujours en base), et l'accusé de
remise partait, avançant un curseur **MONOTONE** : la coche de l'auteur passait
à « remis » pour un message qu'aucun destinataire n'a reçu. Sur le seul
transport d'envoi dont dispose un participant anonyme.

> La question à poser à tout gate qui s'exprime par un proxy (une longueur, un
> `null`, un booléen dérivé) n'est pas « est-il correct ? » mais **« chaque
> membre de ce qu'il arbitre peut-il le faire répondre NON ? »**. Le proxy avait
> l'air uniforme parce qu'il est écrit UNE FOIS, au-dessus de la boucle — c'est
> exactement ce qui cache l'exception.

- Corollaire de journal : quand un refus a plusieurs causes, la `reason` les
  SÉPARE. `'unresolvable-event-type'` accuse la file,
  `'link-envelope-without-message'` accuse le producteur de l'enveloppe.
