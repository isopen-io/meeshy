# Meeshy Android - CLAUDE.md

> ## ⛔ Aucune feature sans issue — règle de démarrage (directive 2026-08-26)
> **Avant d'écrire la première ligne d'une feature, d'une amélioration ou d'un correctif non trivial**, ouvrir (ou retrouver) son **issue** dans `isopen-io/meeshy`, la placer dans un **milestone précis** (nommé par le résultat attendu, avec échéance) et l'inscrire au projet « Meeshy — pilotage » (https://github.com/orgs/isopen-io/projects/1) avec `Status = In Progress`. Le commit qui livre la ferme (`Closes #n`) avec sa preuve (gate, mesure, PR). **Une tâche sans issue n'existe pas ; un travail sans milestone n'est pas planifié.** Ce qu'on découvre en chemin (dette, dimension non mûre, suivi) devient une issue à son tour — jamais une ligne dans un fichier ou une page. Détail : § « Pilotage du développement » du `CLAUDE.md` racine.

> ## 🟢 CE CHANTIER EST DÉGELÉ — objectif : l'ISO de l'application iOS (directive porteur 2026-10-22, #11570)
> **Le gel du 2026-09-16 est levé.** Lire le § « LE KOTLIN NATIF EST DÉGELÉ » du `CLAUDE.md` racine, qui fait foi. En résumé :
> - **La référence est `apps/ios` + `packages/MeeshySDK`**, pour la disposition, la hiérarchie, les états, les gestes et la sémantique. Une feature iOS absente ici est un écart à combler, par une issue.
> - **Les lois à miroirs se lisent de nouveau « touche les TROIS ».** Les miroirs Kotlin de `core/model/` suivent `packages/shared/` et le SDK Swift.
> - **Le seul gate est la CI `android.yml`** (`assembleDebug` + `testDebugUnitTest`). Les conteneurs n'atteignent pas `dl.google.com`, donc aucun lot ne se déclare vert sans run vert sur sa PR.
> - La coque Capacitor `apps/web/android` est une autre application, sous une autre directive. Ne pas confondre.
>
> *(Historique : le bandeau « CE CHANTIER EST GELÉ » a couvert la période du 2026-09-16 au 2026-10-22.)*

Application Android (Kotlin, `apps/android`). Les conventions générales, le Prisme Linguistique, la présence, la roadmap sur treize dimensions et le pilotage par GitHub sont dans le `CLAUDE.md` racine ; les sources de vérité partagées (types, événements socket, résolveurs de langue) vivent dans `packages/shared/` et leurs miroirs Kotlin dans `apps/android/core/model/`.
