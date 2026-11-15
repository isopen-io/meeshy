## Leçon 276 — au rang 1, un court-circuit et la règle juste rendent le MÊME verdict : c'est ce qui rend un résolveur faux indétectable (2026-08-24, cycle 125)

Le cycle 121 a posé la règle : **un témoin de RANG s'écrit sur un rang AUTRE que
le premier**, parce qu'au rang 1 la règle juste et le raccourci fautif
s'accordent. Elle était écrite pour le Prisme du CONTENU. Le cycle 124 l'a
retrouvée sur le Prisme du **CADRAGE** — la langue dans laquelle on ADRESSE un
lecteur — et cette fois avec la preuve que la règle protège aussi ceux qui la
connaissent : `AuthHandler.test.ts` portait un témoin dont le commentaire
AFFIRME que le site appelle `resolveUserLanguage`. Il ne l'appelait pas.

```ts
// systemLanguage is the highest-priority source in resolveUserLanguage, so
// the resolved language is 'en' (the user's systemLanguage) …
expect(connectedUsers.get('user-123')?.language).toBe('en');   // fixture: systemLanguage: 'en'
```

La fixture posait le rang 1. Le site lisait `user.systemLanguage || 'en'`. Les
deux lectures coïncident exactement là où le témoin regardait, et **son auteur a
écrit dans le commentaire le code qu'il croyait tester**. Quatre témoins de
`resolved-languages-refresh.test.ts` avaient le même défaut, sur le jumeau de ce
site.

### La conséquence de méthode

> **Un commentaire de témoin qui NOMME la fonction censée être appelée est une
> affirmation, pas une description** — même famille que « un commentaire qui
> ÉNONCE une contrainte de schéma est une AFFIRMATION » (cycle 94). Il se vérifie
> en cherchant l'appel, pas en le relisant.

Et le corollaire opérationnel : **devant une suite dont toutes les fixtures
posent le rang 1, la question n'est pas « ces témoins passent-ils ? » mais
« pourraient-ils tomber ? »**. Ici, aucun ne le pouvait.
