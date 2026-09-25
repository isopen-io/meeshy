## Leçon 393 — Une clé de catalogue survit à la surface qui l'affichait, et devient un mot que personne ne rend

**Lot #4669.** Retirer la pastille du socle a laissé `composer.socle.sound.add`
— « Ajouter un son » — traduite en sept langues, référencée par rien.

`LocalizationConsistencyTests.test_everyAppCatalogIdentifierKeyIsReferencedInCode`
l'a dit immédiatement, et c'est la bonne réponse : une clé morte n'est pas
inoffensive. Elle se traduit à chaque passe de localisation, elle apparaît aux
outils de comptage, et surtout elle donne à croire qu'un mot EXISTE quelque part
dans l'app.

Corollaire du même gate : **le `defaultValue` inline et l'entrée `fr` du
catalogue sont la MÊME chaîne rendue par deux chemins**, donc l'apostrophe
compte. J'avais écrit `’` (typographique) au catalogue et `'` (droite) dans le
code ; le dépôt tient 266 chaînes françaises à apostrophe droite contre 7
typographiques — la convention se LIT, elle ne se choisit pas au coup par coup.
