# Meeshy Android - CLAUDE.md

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

> ## 🧊 CE CHANTIER EST GELÉ — NE PAS Y DÉVELOPPER (directive porteur 2026-09-16)
> **L'application native Kotlin ne reçoit plus de développement.** Avant d'ouvrir un fichier de ce répertoire, lire le § « LE DÉVELOPPEMENT ANDROID KOTLIN EST GELÉ » du `CLAUDE.md` racine — il fait foi. En résumé : aucune feature, aucun portage, aucune mise à parité, **même si une issue ouverte avant le 2026-09-16 le demande** ; seule exception, un incident de production, une faille de sécurité ou une régression bloquante sur l'application déjà publiée.
>
> **Android continue d'exister dans le produit** — par la coque Capacitor de `apps/web-v2` (0 Kotlin écrit à la main), qui sert « le web ET Android en une fois » (directive 2026-09-07). Une demande « faire X sur Android » se réalise DONC dans `apps/web-v2`, pas ici.
>
> **Les règles « toute évolution touche les TROIS » se lisent « les DEUX » (web et iOS) tant que ce gel tient**, et la divergence des miroirs Kotlin de `apps/android/core/model/` n'est pas un défaut à corriger. Tout le reste de ce fichier décrit un chantier à l'ARRÊT : ses conventions restent vraies pour lire le code, jamais pour en écrire.

Application Android (Kotlin, `apps/android`). Les conventions générales, le Prisme Linguistique, la présence, la roadmap sur treize dimensions et le pilotage par GitHub sont dans le `CLAUDE.md` racine ; les sources de vérité partagées (types, événements socket, résolveurs de langue) vivent dans `packages/shared/` et leurs miroirs Kotlin dans `apps/android/core/model/`.
