## Leçon 575 — Un jeton GÉNÉRÉ que personne ne consomme ne protège rien : la dérive se produit à côté de lui

*(Les numéros 573 et 574 sont réservés par des lots iOS non encore fusionnés —
un identifiant qui ne s'alloue pas ne collisionne pas, #5102 : on saute plutôt
que de risquer deux leçons portant le même numéro dans un fichier partagé.)*

`packages/design-tokens/ios.css` porte `--ios-header-circle: 28px`, **généré
depuis la source Swift** (`ConversationView+Header.swift`, « cercle visuel des
actions (cible 44) »), et `apps/web-v2/src/styles/ios.css` le republie en
`--size-header-circle`. Le gate `check:tokens` était vert depuis le premier
jour : il vérifie que le jeton CORRESPOND à sa source Swift.

Mesuré au moment d'aligner les vues (#6080) : **aucune surface ne lisait ce
jeton.** Les trois familles de boutons ronds du chrome l'avaient chacune
réécrit à la main — `size-7` (28, juste par accident) dans l'en-tête du fil,
`size-8` (32) dans l'en-tête de la liste, un disque plein de 44 dans le rail
des stories. Trois dessins pour un seul rôle, sur trois écrans que
l'utilisateur enchaîne.

> **Un gate de génération mesure la FIDÉLITÉ du jeton, jamais son ADOPTION.**
> Tant que rien ne le consomme, il se régénère parfaitement pendant que les
> surfaces dérivent à côté de lui — et la dérive est invisible au gate, par
> construction : elle n'est pas dans le jeton, elle est dans son absence.

C'est la forme, sur un jeton de design, de la leçon « une vue sans
CONSOMMATEUR ne rougit nulle part ». La question à poser à toute table générée
n'est donc pas « est-elle juste ? » mais **« qui la LIT ? »** — et la réponse
se cherche par `grep` du nom du jeton dans `src/`, pas dans le gate.

Correctif : `components/chrome-action.tsx`, consommateur UNIQUE, qui lit
`var(--size-header-circle)` et dérive sa teinte de `currentColor` — donc juste
dans un fil (accent de conversation) comme dans la liste (marque), sans que
l'appelant ait à le dire, donc sans qu'il puisse se tromper.
