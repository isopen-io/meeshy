## Un re-dispatch de CI tue le run précédent du même ref — et le rouge qui en sort n'est pas un défaut (2026-11-21)

`.github/workflows/ci.yml` porte :

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/dev' && github.ref != 'refs/heads/main' }}
```

Sur une branche de travail, **chaque nouveau run tue le précédent du même ref**. Et le job final, « Verdict CI », rend `failure` sur un run ANNULÉ — il ne mesure alors rien du code. Trois conséquences, toutes payées dans la même session :

1. **Mes annulations manuelles étaient inutiles.** J'ai annulé à la main quatre runs devenus périmés « pour libérer un coureur sous famine » : le groupe de concurrence le faisait déjà, au dispatch suivant. Le geste n'a rien libéré que le dispatch n'aurait libéré, et il a produit les mêmes rouges.
2. **Chaque re-dispatch a semé un `Verdict CI` rouge sur la PR**, sur une tête périmée. J'ai dû l'expliquer trois fois, et un lecteur humain qui ouvre la PR voit d'abord un échec. Le coût n'est pas le mien : il est pour qui relit.
3. **Le plus cher : une PR a été fusionnée sans qu'aucun run n'ait mesuré sa tête finale.** Le run vert portait sur l'avant-dernière tête ; celui de la tête fusionnée a été tué par mon dispatch suivant, lancé pour une raison sans rapport. La preuve existait pour un arbre, et l'arbre fusionné n'en avait aucune.

> **Un dispatch n'est pas gratuit : il est destructif pour le run en vol du même ref.** Avant d'en lancer un, demander *quel run suis-je en train de tuer, et sa preuve m'était-elle nécessaire ?* Et ne pas re-dispatcher pour une raison cosmétique — un commit de documentation, une tête qui a bougé d'un fichier de journal — tant qu'un run dont on a besoin est en file.

Corollaire de lecture, pour ne pas enquêter trois fois sur le même rien : **devant un `Verdict CI` rouge, lire d'abord le `conclusion` du run PARENT.** `cancelled` ⇒ il n'y a rien à chercher. `failure` ⇒ il y a un défaut. Les deux arrivent par le même événement et se ressemblent exactement.

Et un corollaire de géographie du dépôt : `dev` et `main` sont **exemptés** (`cancel-in-progress: false`), ce qui est le bon arbitrage — on ne tue pas la mesure d'une branche d'intégration — mais il signifie que l'intuition acquise sur `dev` (« mes runs ne s'annulent pas ») est fausse partout ailleurs.
