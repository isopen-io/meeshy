## Leçon 497 — Le maillon qui manque n'est pas toujours celui qu'on garde ; parfois il est un cran avant

Ayant trouvé les six écrans injoignables, le réflexe a été d'ajouter leurs
préfixes à la règle Traefik de staging. **Un invariant existant l'a refusé** —
`leWorkerLegacySEfface` : le service worker du legacy est enregistré sur
`scope:'/'` et intercepte la navigation de tout visiteur REVENANT. Réclamer un
chemin au routeur avant que le worker DÉPLOYÉ sache s'en effacer sert la v3
aux navigateurs neufs seulement, et le retour arrière prévu y est inerte.

La bascule a donc DEUX marches, dans un seul ordre : déclarer le préfixe dans
`V3_ZONE_PREFIXES`, **déployer**, puis seulement réclamer au routeur. Le dépôt
ne peut tenir seul que la première. Le nouvel invariant s'y pose — « le worker
legacy connaît TOUT ce que la zone sert » — et laisse la seconde à la décision
de déploiement, gardée par l'invariant existant qui la prend dans l'autre sens.
Les deux tracent la route complète : servi ⇒ connu du worker ⇒ réclamé.

**Un gate qui refuse un correctif n'est pas un obstacle : c'est le seul
endroit où une connaissance de déploiement survit à la session qui l'a
acquise.** Le réflexe — passer outre, « je sais ce que je fais » — aurait
produit un défaut PIRE que celui qu'on corrige : des écrans qui marchent en
navigation privée et pas autrement, c'est-à-dire un bogue que le rapporteur ne
peut pas reproduire.

Corollaire de forme : le prédicat du worker est **exécuté**, jamais recopié
dans le gate. Une seconde implémentation prétendrait garder la divergence
qu'elle créerait.
