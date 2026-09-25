## Leçon 490 — Un conteneur de simulateur pollué fait rougir ET verdir, et la seconde moitié ne se voit pas

Après avoir vérifié une feature à la main sur `Meeshy-UXBatch`, j'y ai joué le
gate complet. Deux échecs sans rapport avec mon lot :

| témoin | symptôme |
|---|---|
| `ExplicitPluralLabelTests.test_sendAttemptCountLabel_pluralForZero` | « 0 attempt » au lieu de « 0 attempts » — règle de pluriel FRANÇAISE sur une chaîne anglaise |
| `VideoPosterResolverBehaviorTests.test_persistedPoster_…` | `XCTAssertNotNil` échoue sur un poster PERSISTÉ |

Cause commune : **l'hôte de test EST l'app**, donc mon lancement manuel avait
écrit dans le conteneur du simulateur — `AppleLanguages` pour le premier, le
magasin de posters pour le second. Le contrôle est
`xcrun simctl uninstall <udid> me.meeshy.app` AVANT le run.

Le discriminant qui prouve qu'il s'agit d'environnement et non de régression est
venu d'une session voisine : **les deux témoins étaient VERTS dans son run
complet six minutes plus tôt, sur le même simulateur, sans qu'une ligne de leur
code change.** Deux verdicts opposés sur un code identique ⇒ flake prouvé.

### La nuance qui joue contre nous, et que je n'avais pas vue

J'ai d'abord formulé la règle « la pollution fait rougir ». C'est le cas
dominant, pas le seul — correction due à la même session voisine :

> **Un témoin qui exige un état PRÉSENT peut passer au VERT grâce à la
> pollution.** `XCTAssertNotNil` sur quelque chose de persisté rougit quand le
> conteneur est vide et verdit quand il porte, par accident, ce que le test
> attendait.

D'où la règle utile, qui n'est pas symétrique :

- un run **rouge** après navigation manuelle se re-mesure sur un conteneur
  propre avant d'accuser le code ;
- un run **vert** après navigation manuelle n'est pas suspect en bloc — il l'est
  pour les suites qui LISENT le conteneur, et pour elles seulement. Un lot fait
  de règles pures et de gardes de source garde son verdict.

Le second cas est le dangereux, parce qu'il ne produit aucun symptôme : personne
ne rejoue un test qui vient de passer.
