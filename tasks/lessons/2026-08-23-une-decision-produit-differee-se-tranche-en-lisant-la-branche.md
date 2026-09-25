## 2026-08-23 — Une « décision produit » différée se tranche en lisant la branche voisine (238i)

237i a laissé six copies de l'abrégé compact non traitées, avec ce motif :
« le tableau de bord bascule à `>= 10_000` là où le feed bascule à `>= 1_000` —
consolider demande de trancher si ce seuil est **intentionnel**, ce qui est une
décision produit ». Le motif était bon, la conclusion trop large : le doute
portait sur DEUX sites, pas sur six, et les deux se sont tranchés à la lecture
sans avoir à consulter qui que ce soit.

- `ConversationDashboardView.formatNumber` : le seuil de 10 000 est réel, et sa
  preuve est la branche EN DESSOUS — la bande 1 000–9 999 rendait le nombre
  entier et groupé (`n.formatted()`). La règle produit n'est pas « abrège à
  10 000 », c'est « ne dégrade pas un compte de mots tant qu'il reste lisible ».
- `StatRing.displayValue` : le même seuil de 10 000 y était **mort** — la
  branche suivante (`>= 1_000`) lui était identique au caractère près, même
  division, même format. Trois relectures l'avaient laissé passer précisément
  parce qu'il ne changeait rien.

Corollaires :

- **Un seuil ne se lit pas seul : il se lit contre la branche qui le suit.**
  Deux branches consécutives qui rendent la même chose ne portent aucune
  décision — c'est un artefact de copie, et le traiter comme un arbitrage
  produit gèle du code mort en règle métier.
- **Différer un arbitrage, c'est différer tout ce qui voyage avec lui.** Le
  doute sur 2 sites a reporté la correction des 4 autres, byte-identiques et
  sans aucune ambiguïté. Découper le lot par NIVEAU DE DOUTE, pas par famille.
- **Une famille qui repousse à chaque itération se ferme par une garde, pas par
  un correctif.** Sept copies, trois itérations de consolidation (234i, 236i,
  237i) : chacune a corrigé ce qu'elle voyait, aucune n'a empêché la suivante.
  Le geste qui termine n'est pas le septième correctif, c'est la garde de source
  qui interdit le huitième.

---
