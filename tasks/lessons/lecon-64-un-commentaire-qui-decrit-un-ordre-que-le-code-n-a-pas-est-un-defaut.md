## Leçon 64 — un commentaire qui décrit un ordre que le code n'a pas est un défaut de premier ordre (même cycle)

Les deux routes REST d'édition portaient, au-dessus de la composition de leur charge utile :
« La retraduction qui précède a déjà invalidé `translations` en base, donc le payload renvoyé
reflète cet état : `[]`. » L'invalidation était en réalité placée **après** la lecture qui compose
cette charge. La réponse HTTP et l'événement `message:edited` emportaient donc le nouveau texte avec
les traductions de l'ancien — et le Prisme Linguistique fait que la plupart des lecteurs ne voient
QUE la traduction.

**Leçons :**

1. **Un commentaire affirmant un ORDRE est une assertion vérifiable, et personne ne la vérifie.**
   Trois cycles ont revu ces routes en lisant cette phrase comme un fait. Quand un commentaire dit
   « X a déjà eu lieu », le réflexe doit être de localiser X dans le fichier, pas de le croire.
2. **Un mock à valeur fixe ne peut pas tester un défaut d'ordre.** Il rend la même chose avant et
   après le correctif : le test passe au vert sans rien prouver. Il faut un fake **stateful** —
   les écritures mutent la ligne, les lectures la rendent — sinon on n'écrit pas un test, on écrit
   une tautologie. Même règle pour les transformateurs de sortie : `transformTranslationsToArray`
   mocké à `[]` masque exactement ce qu'on mesure.
3. **La règle va où le geste se produit.** Un nouveau contenu périme ses traductions à l'instant où
   il est écrit — l'invalidation appartient donc au `data` de l'écriture, pas à un second `update`
   trois `await` plus loin. C'est la même forme que le lot A du cycle 35 (la purge appartient à la
   retraduction, pas à ses appelants) : **tout ce qui est confié à un appelant sera oublié par le
   quatrième.**
