## Leçon 250i bis — copier un banc éprouvé sans lire ce qu'il DIT

Deux runs rouges consécutifs sur le même lot, deux fois la même cause de fond :
j'ai copié la FORME d'un fichier de test éprouvé sans lire ses doc-comments.

- **Copier le squelette d'une garde, c'est hériter de ses IMPORTS — donc de son
  périmètre.** `MediaLabelSourceGuardTests` n'importe que `XCTest` parce qu'il ne
  fait que LIRE du texte. La garde neuve fait les deux — elle balaie les sources
  ET interroge deux types de l'app pour fixer la valeur de leur cible — et il lui
  manquait `@testable import Meeshy`. Dès qu'une garde de forme ajoute une
  assertion sur une VALEUR, elle change de nature et son en-tête doit suivre.
- **Épingler une intention, jamais une graphie** (déjà leçon 272, et le banc de
  242i la répète dans le doc-comment de la fonction voisine de celle que je
  copiais). `XCTAssertFalse(arabic.contains("3"))` pour dire « aucun chiffre
  latin » a rougi pendant que les deux assertions positives du même test
  passaient. La forme juste DÉRIVE l'attendu de la source unique
  (`LocalizedNumber.exact`) au lieu de recopier un glyphe, et ne garde en négatif
  que ce qui épingle un défaut réel — « aucun spécificateur brut ne survit »
  (`%@`, `%lld`, `%1$`, `%2$`), qui attrape un placeholder mal apparié.
- **Une assertion dont le message ne porte pas la valeur obtenue est
  indiagnosticable à distance.** Les deux assertions voisines interpolaient
  `\(arabic)` ; celle qui a rougi, non. Sur un gate de vingt minutes, ce détail
  coûte un cycle entier rien que pour apprendre une chaîne de caractères. **Tout
  message d'assertion porte la valeur obtenue** — c'est la leçon 265 (« écrire
  les messages d'échec pour le lecteur distant ») appliquée à XCTest.
- **Un run rouge n'est pas un run muet.** Il tranche tout ce qui a compilé ou
  tourné AVANT lui : le premier rouge a prouvé que la cible app compilait (donc
  qu'un `let` en tête d'un `ViewBuilder` passe), le second que `@MainActor` sur
  une seule méthode d'une classe de test non isolée est correct. Lire un échec
  seulement comme « ça a échoué » perd la moitié de ce qu'on vient de payer.
