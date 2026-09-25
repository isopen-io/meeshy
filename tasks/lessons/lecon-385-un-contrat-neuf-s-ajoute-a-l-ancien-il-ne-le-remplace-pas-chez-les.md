## Leçon 385 — Un contrat NEUF s'ajoute à l'ancien, il ne le remplace pas chez les clients déployés

**Cycle #4557 (2026-09-01).** `POST …/participants` gagne un mode LOT rendant un
verdict par identifiant plutôt qu'un échec en bloc. Premier jet : « déjà
membre » et « banni » cessent d'être des 400/403 pour devenir des verdicts dans
un 200. **Deux témoins existants sont devenus rouges — et ils avaient raison.**

Les trois clients installés appellent avec la forme historique et lisent le CODE
HTTP pour dire « déjà membre ». Un 200 dont le refus vit dans un champ qu'ils ne
lisent pas transforme un refus en **succès à l'écran**, partout, sans qu'aucune
erreur ne soit levée nulle part.

> La forme historique garde son contrat d'erreur ; la forme NEUVE porte le
> contrat neuf ; l'ancienne reçoit le champ neuf **en plus**, jamais à la place.
> Deux témoins jumeaux épinglent la différence sur la MÊME situation
> (`userId: dejaMembre` ⇒ 400 · `userIds: [dejaMembre]` ⇒ 200 + verdict), ce qui
> rend la règle lisible d'un coup d'œil.

**Le signe qui l'attrape** : un test existant qui rougit sur un changement qu'on
croyait purement additif. Un rouge de ce genre n'est pas un témoin périmé par
défaut — c'est d'abord un client qu'on vient de casser.

**Corollaire de mesure** : avant de retirer une porte « en double », COMPTER ses
appelants PAR CLIENT. Le catalogue d'endpoints généré DÉCLARE des routes
qu'aucun service n'appelle (`ConversationsEndpoint.byIdInvite`, zéro appelant),
et un homonyme — `byIdInvite` des COMMUNAUTÉS, une autre route — fait croire à
un appelant qui n'en est pas un. C'est la forme du cycle 118 vue par l'autre
bout.
