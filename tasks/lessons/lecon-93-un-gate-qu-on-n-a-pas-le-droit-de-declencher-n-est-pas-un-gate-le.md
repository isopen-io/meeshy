## Leçon 93 — Un gate qu'on n'a pas le DROIT de déclencher n'est pas un gate : le vérifier fait partie de l'instruction (2026-08-11, routine messaging, cycle 70)

Le cycle 69 a refusé d'écrire du Swift invérifiable et a laissé une tête instruite très précise, en
nommant son gate : « `ios-tests.yml` ne se déclenche pas sur les PR — lancer le workflow à la main
sur la branche (Actions → Run workflow) avant de merger, sinon la vérification n'existe pas ».
Instruction juste, et impossible à exécuter : l'intégration GitHub de la routine n'a pas
`actions: write`. `POST /actions/workflows/ios-tests.yml/dispatches` répond `403 Resource not
accessible by integration`. Le cycle 70 ne l'a découvert **qu'après avoir écrit le correctif et les
témoins**.

Le coût n'est pas d'avoir perdu du travail — le correctif est bon et le prochain cycle le fera
tourner. Le coût est que le cycle 69 a **cru** avoir sécurisé la suite en nommant un gate, et que
le cycle 70 a **cru** hériter d'un plan exécutable. Deux cycles ont raisonné sur une vérification
qui n'a jamais existé.

**Règle** : instruire un gate, c'est aussi prouver qu'on peut le déclencher. Un cycle qui reporte
du travail « avec son gate » doit avoir TENTÉ le déclenchement (ou l'avoir tenté à vide sur un
commit sans effet) avant de l'écrire dans la tête instruite. Le résultat de cette tentative se note
au même titre que le défaut : « gate vérifié, dispatch OK » ou « gate INACCESSIBLE, il faut
`actions: write` ».

Corollaire, qui est celui de la leçon 85 appliqué à l'outillage : quand le gate manque et que le
correctif est déjà écrit, le choix n'est pas entre « livrer » et « jeter » mais entre « livrer en
ÉCRIVANT que ce n'est pas gaté » et « livrer en le taisant ». Ce cycle a livré, a retiré du Swift
toute inférence de type évitable, a relu chaque API dans son fichier source — et a écrit en tête du
relevé que rien de tout cela ne remplace une compilation. C'est la forme honnête. Elle ne devient
acceptable que parce que la dette est datée, nommée, et posée en PREMIER geste du cycle suivant.
