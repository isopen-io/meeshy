## Leçon 604 — Avant d'écrire une « loi pure » dans `shared`, chercher la CAPACITÉ, jamais le NOM : la jumelle qu'on s'apprête à créer existe souvent déjà, en mieux (2026-09-14)

**Cas.** #6424 demandait de dériver un pseudo et un nom affiché de la partie
locale d'une adresse. J'ai écrit `packages/shared/utils/username-from-email.ts`
— trois fonctions pures, seize témoins verts, un commit poussé. Puis, en
branchant la passerelle, `services/gateway/src/services/auth/registration-identity.ts`
(#5216) : `pseudoRacine` tirait DÉJÀ le pseudo de la partie locale de l'adresse,
et `generateUsername` réglait en plus l'unicité — sept candidats en UNE requête,
repli aléatoire, bornes du schéma respectées. La jumelle que je venais d'écrire
était la moins bonne des deux : elle ne connaissait pas la base.

1. **La recherche qui aurait suffi n'était pas sur le nom.** `git grep
   username-from-email` ne rend rien ; `git grep -n "split('@')"` rend le site
   existant en une seconde. Un module se cherche par ce qu'il FAIT — la
   primitive qu'il emploie forcément — pas par le nom qu'on lui aurait donné.
2. **« Une loi pure appartient à `shared` » est un raisonnement, pas une
   mesure.** Il est juste dans l'absolu et faux ici : l'unicité d'un pseudo
   n'est pas décidable sans la base, donc la loi complète ne PEUT pas vivre
   dans `shared`. L'architecture qu'on déduit du principe doit céder devant
   celle qu'on mesure dans le dépôt.
3. **Ce qui reste après le retrait est le vrai lot.** Sur trois fonctions
   écrites, une seule manquait — le NOM AFFICHÉ. Les deux autres étaient des
   redites. Le lot utile s'est révélé plus petit que le lot imaginé, et deux
   défauts du site existant (le `+` du sous-adressage, le point d'une adresse)
   n'auraient jamais été vus depuis la jumelle.
4. **Le retrait se commit, il ne se force-push pas.** La branche garde le
   commit qui crée la jumelle et celui qui la retire : l'historique porte la
   mesure, et le prochain qui aura l'idée la retrouvera.
