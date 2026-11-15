## 2026-08-08 (9) — Un remède dicté par le cycle précédent peut corriger le défaut nommé ET pétrifier ses voisins

**Contexte** — Cycle 21. Le cycle 20 laissait une consigne précise : le chemin d'édition écrit
`validatedMentions` avec `extractMentions` (handles bruts) là où la création utilise
`extractMentionsWithParticipants`, donc éditer un message efface ses mentions par nom
d'affichage. Le remède était dicté dans la foulée : « lui faire appeler `resolveMessageMentions`
avec une variante *remplacement* (purge des lignes existantes + écriture même vide) ».

**Ce qui s'est passé** — Écrite telle quelle, la variante corrigeait le défaut nommé et laissait
passer deux défauts qui vivaient dans la MÊME quinzaine de lignes, parce que la purge est
précisément ce qui les cause :

1. `Mention.mentionedAt` est l'axe de tri de l'inbox. Purger pour recréer donne un horodatage
   neuf aux mentionnés QUI N'ONT PAS BOUGÉ : une mention de trois jours remonte en tête parce
   que l'auteur a corrigé une faute de frappe.
2. Après une purge, « qui est nouveau ? » n'a plus de réponse — l'ensemble précédent est
   détruit. Le code notifiait donc l'ensemble complet à chaque édition : dix corrections, dix
   pushes à quelqu'un déjà nommé au premier envoi.

Les deux tombent ensemble dès qu'on RÉCONCILIE au lieu de re-créer : lire l'ensemble précédent
(une requête sur un chemin qui en fait déjà cinq), ne supprimer que les partants, ne créer que
les entrants — qui sont alors exactement le lot à notifier.

**Confirmation par l'expérience** — une seconde session a traité ce même cycle en parallèle
(PR #2640) en suivant la prescription à la lettre : purge en bloc puis recréation. Elle a corrigé
D1 et laissé D2 et D3 intacts — et son commentaire de route affirmait même « seul un nouveau
mentionné apprend quelque chose » au-dessus d'un appel qui passait l'ensemble complet. La
prescription ne s'est pas contentée d'omettre les deux voisins : elle a produit une intention
écrite que le code ne tenait pas.

**Règle** — Un « reste ouvert » qui prescrit son propre remède l'a écrit en connaissant le
symptôme, pas le code. Traiter la prescription comme une hypothèse à vérifier contre le bloc
réel : relire les lignes qu'elle remplace et se demander ce que l'opération prescrite (ici : la
purge) cause d'autre. Les leçons 5 et 8 disaient de ne pas s'arrêter à la ligne principale d'un
« reste ouvert » ; celle-ci ajoute que la SOLUTION qu'il propose mérite la même défiance que le
diagnostic.

**Corollaire d'intégration** — quand deux sessions livrent le même cycle en parallèle, la fusion
ne se tranche pas par « qui est arrivé en premier » ni par « qui en a fait plus ». Comparer
défaut par défaut : ici l'API de la PR arrivée première (deux exports nommés, cœur commun sans
écriture) était la meilleure, et les correctifs de la seconde (réconciliation, abstention sur
panne, `reconciled`) étaient les bons. Prendre la structure de l'une et les corrections de
l'autre — jamais écraser l'une par l'autre.

**Corollaire — un correctif de persistance n'est fini qu'une fois le PAYLOAD vérifié.** L'unité
apprend à s'abstenir (service absent, panne) au lieu de détruire ; l'appelant qui recopie
mécaniquement son résultat vide dans sa réponse HTTP et sa diffusion socket rejoue l'effacement
un étage plus haut, et le client le cache (`staleTime: Infinity` côté web). Une valeur vide
« parce qu'établie vide » et une valeur vide « parce qu'on n'a rien pu établir » doivent être
DISTINGUABLES dans le type de retour, sans quoi aucun appelant ne peut faire la différence.
