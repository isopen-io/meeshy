## 2026-07-26 — 216i : vérifier ses propres assertions avant de pousser

- Deux tests source-introspection écrits en 216i étaient **faux** et l'auraient prouvé
  seulement après ~28 min de CI iOS. Trouvés en rejouant les assertions en Python
  avant le commit :
  1. `XCTAssertFalse(source.contains("presentSheet"))` lisait la source **brute** —
     et le doc-comment que je venais d'écrire *nomme* le helper supprimé pour
     expliquer son défaut. Une assertion **négative** doit toujours lire la source
     **commentaires retirés**.
  2. `XCTAssertTrue(source.contains(".accessibilityHidden(true)"))` était verte
     **des deux côtés** : ce modificateur existe déjà ailleurs dans les deux
     fichiers. Une assertion sur un modificateur courant ne prouve rien tant
     qu'elle n'est pas **ancrée** après une ancre unique.
  3. La fenêtre d'ancrage choisie « au feeling » (600 caractères) tombait **3
     caractères trop court** (repli réel à 603/633). **Mesurer** la distance, ne
     pas la deviner.
- Leçon : « RED prouvé » n'a de valeur que si on vérifie AUSSI que chaque assertion
  est verte pour la bonne raison. Rejouer les assertions contre `origin/main` ET
  contre le working tree, assertion par assertion, coûte une minute et évite un
  cycle CI.
- Corollaire outillage : le compteur d'accolades doit retirer les **chaînes avant
  les commentaires**, sinon le `//` de `"https://…"` tronque la ligne et emporte son
  `{` (faux déséquilibre signalé en 215i).
- Housekeeping : `git push --delete <branch>` est **bloqué par le proxy git** de cet
  environnement (« Everything up-to-date » + disconnect). Ne pas boucler avec backoff
  dessus : la branche assignée est de toute façon recyclée par un reset sur `main`.
