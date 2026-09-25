## Leçon 295 — Un artifact n'est pas un tableau de bord, et « ça marche » n'est pas « livré » (2026-08-26)

**Contexte.** En une journée, trois sessions ont ouvert des pages publiées pour
SUIVRE l'avancement : une page « composer-v2-progress » à côté de la planche, une
« Roadmap Meeshy 2026-2027 » présentée comme dashboard produit, un instantané
« Reliquats de branches » — pendant qu'un projet GitHub « Meeshy — pilotage »
(milestones, 200+ issues, champs Status/Priorité/Horizon) venait d'être créé pour
exactement cela. Le porteur a tranché : *gérer exclusivement le développement de
Meeshy par GitHub Project ; les artifacts sont faits pour des brouillons, du design
et des comptes rendus de communication.*

> **L'état d'une tâche vit à UN endroit, et cet endroit est l'issue.** Une page
> publiée qui affiche un état en fabrique une COPIE, datée du jour où on l'a
> republiée ; deux sessions plus tard la copie ment, et elle ment avec l'autorité
> d'une belle mise en page. Un artifact est légitime pour ce qui n'a PAS d'état à
> tenir : un brouillon qu'on fait valider, un design qu'on regarde, un compte rendu
> qu'on lit une fois. Dès qu'on veut y cocher quelque chose, c'est une issue.

La seconde moitié de la directive fixe ce que « livré » veut dire : *un produit
très optimisé sans lenteur, hyper fluide, aéré, agréable visuellement et
fonctionnellement, avec une maturité sur plusieurs dimensions pour toutes ses
features* — treize, nommées : sécurité, performance, mémoire, fluidité, facilité
d'accès, cohérence de positionnement, facilité d'usage, UX, compatibilité, utilité,
maintenabilité, simplicité d'usage, complétude.

> **« Ça marche » est le rang 1 d'une échelle à treize barreaux.** Une feature qui
> rend le bon résultat en 2 s là où le cache l'avait, qui saccade au scroll, qu'un
> lecteur d'écran ne voit pas ou que personne n'ose modifier n'est pas livrée — elle
> est *partielle*, et « partiel » est un Status d'issue, pas un livrable. Et **la
> complexité se paie dans le code, jamais chez l'utilisateur** : on complexifie
> volontiers l'implémentation (résolution automatique, pré-calcul, cache, inférence)
> pour que l'usage n'exige rien.

Corollaires :

- **Fermer une issue, c'est dire quelles dimensions sont mûres** — et ouvrir une
  issue par dimension qui ne l'est pas. Le commentaire de clôture est le seul
  compte rendu d'avancement qui ne périme pas, parce qu'il vit avec l'état.
- **Une lenteur est un bug, pas une dette** : elle a au moins la priorité de la
  feature qu'elle dégrade. Cache-First, Optimistic Updates, Zero Unnecessary
  Re-render ne sont pas des principes d'architecture — ce sont les mécanismes par
  lesquels les dimensions 2, 4, 7, 8 et 12 se réalisent.
- **La règle est inscrite dans les 9 `CLAUDE.md`** (racine : § « Pilotage du
  développement » et § « Roadmap — treize dimensions » ; chaque sous-répertoire :
  § « Pilotage & maturité » avec ses témoins propres). `tasks/todo*.md` ne se
  crée plus ; `tasks/lessons.md` reste le seul tracker de fichier maintenu.
