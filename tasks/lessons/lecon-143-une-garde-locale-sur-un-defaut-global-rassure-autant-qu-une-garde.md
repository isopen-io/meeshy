## Leçon 143 — Une garde LOCALE sur un défaut GLOBAL rassure autant qu'une garde globale

**Contexte** : cycle 106. `ShareExtensionSourceGuardTests.test_extension_doesNotOpenTheHostAppWithAnUnparsedDeepLink`
interdit à l'extension de partage d'émettre un deep link `contactId=`, et énonce la raison en clair :
« DeepLinkParser ne comprend que text=/url= ; l'extension poste elle-même ». Cette garde est juste,
verte, et documentée. Pendant qu'elle veillait, `MeeshyAppIntents.swift` émettait deux `contactId=`
et `MeeshyWidgets/` cinq autres formes d'URL inconnues du routeur — sept hosts émis, trois routés.

**La leçon** : quand une garde nomme une limite d'un composant **partagé** (« le parseur ne comprend
que X », « ce service n'accepte que Y »), la limite ne concerne PAS la cible gardée — elle concerne
**toute cible qui parle à ce composant**. Une garde posée à un seul endroit donne le sentiment que la
classe de défaut est traitée, alors qu'elle n'en couvre qu'un émetteur. Et elle rend le trou plus
difficile à voir qu'une absence totale de garde : un audit qui tombe sur elle conclut « déjà traité ».

**Le réflexe** : devant une garde dont le message cite le contrat d'un composant partagé, chercher
les AUTRES appelants de ce composant AVANT de passer. Ce n'est pas une enquête, c'est un grep.

**Corollaire de forme (payé comptant)** : le découpeur de commentaires recopié de garde en garde dans
ce dépôt traite `//` comme un début de commentaire de ligne — il EFFACE donc `meeshy://` avant toute
recherche. Une garde bâtie dessus balaie zéro occurrence et passe au **vert** sans rien avoir
vérifié. Toute garde qui COMPTE des occurrences doit refuser explicitement un balayage vide
(`XCTAssertFalse(emitted.isEmpty, …)`) : sans cette assertion, son silence est indiscernable d'un
succès. Le bug a été trouvé en portant l'algorithme de la garde hors de Swift pour le faire tourner —
contrôle applicable dès qu'une garde ne peut pas être exécutée localement.

**Corollaire de nommage** : le host d'un deep link décrit ce que la surface MONTRE, pas ce qu'elle
PORTE. `meeshy://contact/{id}` transporte un identifiant de **conversation** (`publishFavoriteContacts`
écrit `conv.id` dans `FavoriteContact.id`). Lire le nom au lieu de suivre l'écrivain aurait produit
une route vers `.userProfile`, c'est-à-dire un 404 à la place d'un no-op.

---
