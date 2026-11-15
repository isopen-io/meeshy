## Leçon 572 — Un spécificateur de format qui ment sur le TYPE ne traduit pas mal : il CRASHE

2026-09-11, iOS (#6073). #6039 a introduit `streak.reminder.body` et
`reveal.badge.tier` dans le catalogue, avec `%@` dans les sept langues. Les deux
sites d'appel interpolent un `Int` :

```swift
String(localized: "streak.reminder.body",
       defaultValue: "\(joursTenus) jours tenus…")   // joursTenus: Int → %lld
```

`%@` appliqué à un entier 64 bits fait lire la valeur comme un POINTEUR d'objet
et la déréférencer : **SIGSEGV**. Sept tests de `StreakReminderPlanTests`
mouraient — le processus redémarrant à chaque fois —, et l'APP aurait crashé
chez tout utilisateur tenant une série, au moment précis où elle planifie ses
rappels.

> **Une erreur de catalogue n'est pas toujours cosmétique.** L'intuition dit
> « au pire, un texte faux » ; pour un désaccord de TYPE entre le spécificateur
> et l'argument, la conséquence est un crash. Un catalogue est du CODE — c'est
> lui qui porte la chaîne de format que le runtime exécute.

Deux détails qui font la différence entre trouver et ne pas trouver :

- **les tests qui passaient le cachaient.** Seuls ceux qui PRODUISENT un rappel
  formatent le corps ; ceux qui vérifient les listes vides passaient très bien.
  Une classe à moitié verte sur un crash ressemble à un test fragile ;
- **la clé n'existait pas avant.** Tant qu'elle manque au catalogue,
  `String(localized:defaultValue:)` sert la `defaultValue` et son format est
  celui que Swift a généré — donc juste. **Ajouter une traduction est ce qui
  arme le défaut.** Un lot de localisation peut donc casser du code qu'il ne
  touche pas, et aucune garde de source ne le voit.

Témoin : `CatalogFormatSpecifierGuardTests` — il lit la déclaration du symbole
interpolé dans le même fichier, et n'exige rien des symboles qu'il ne sait pas
typer (une garde qui devine un type produit des rouges illisibles, et finit
désarmée). Falsifiabilité mesurée : vert sur le catalogue corrigé, ROUGE dès
qu'on remet `%@` sur UNE seule des sept langues, vert de nouveau après
restauration.
