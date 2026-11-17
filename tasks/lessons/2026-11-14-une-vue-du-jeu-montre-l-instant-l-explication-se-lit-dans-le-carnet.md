## 2026-11-14 — Une vue du Jeu montre l'instant ; l'explication se lit dans une feuille ou dans le carnet des règles, à sa section (#18422)

Directive du porteur.

### Ce qui s'est passé

La fiche d'un concept ouvrait sur « C'est quoi ? » : trois paragraphes
d'explication, AVANT « Où j'en suis » et avant le geste du jour. Le carnet des
règles (« Comment ça marche ») existait sur les trois clients, mais il ne se
parcourait pas : pas de sommaire, une seule section adressable (les médailles),
et aucune vue n'y menait à son entrée.

Le porteur : « Dans les vues des jeux les informations du moment viennent,
ensuite les explications qu'il faut afficher, et de préférence dans une feuille
ou dans la page de règles du jeu en allant à la section concernée ! Ainsi on a
une vue de règles de jeu qui permet la navigation dedans. »

### La règle

1. **L'instant d'abord.** Une vue du Jeu ouvre sur ce qui est vrai maintenant :
   la valeur, l'état, le geste à faire. Dans l'ordre d'une fiche : héros,
   « Où j'en suis », gestes, puis seulement l'explication.
2. **L'explication sort de la vue quand elle le peut.** Sa place de préférence
   est une feuille, ou le carnet des règles ouvert à la section concernée.
3. **Le carnet se parcourt.** Il a un sommaire, et chaque section, chaque règle,
   chaque concept a une adresse. Une vue qui explique porte le lien vers SA
   section.

### Avant de livrer une vue du Jeu

- Lister ce qu'elle rend, et ranger chaque bloc : « instant » ou « explication ».
  Un bloc d'explication placé avant un bloc d'instant est un défaut.
- Pour chaque explication, se demander où elle vit dans le carnet. Si elle n'y
  a pas d'entrée adressable, l'adresse se crée d'abord.
- L'adresse d'une section est une loi par client, avec un témoin qui relit ce
  qu'il écrit : web `lib/game/rules-address.ts` (`?section=concept-flame`),
  iOS `Router.progressionRules(rule:section:)`, Android `GameRulesFocus`.
- Une ancienne adresse ne se retire pas (`?regle=N`, `?section=badges`) :
  la production est rétrocompatible.
