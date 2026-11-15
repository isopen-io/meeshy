## 1. Après une fusion résolue à la main, l'index et le disque divergent en silence

En résolvant la fusion, le module concurrent a été retiré par `git rm --cached` **et** `rm`, mais
son test unitaire seulement par `rm`. Résultat : un fichier **toujours suivi par git** qui importait
un module supprimé.

Rien ne le signalait. La suite complète passait (633/633) — le fichier n'était plus sur le disque,
donc jest ne le voyait pas. `tsc --noEmit` passait pour la même raison. La CI, elle, part de
**l'arbre versionné** et aurait échoué.

**Un `git status` avant de pousser n'est pas une formalité de comptable** : c'est la seule vue qui
distingue « supprimé du disque » de « supprimé du dépôt ». Après toute résolution manuelle mêlant
`git rm`, `git checkout --theirs` et `rm`, lire `git status --short` ET
`git ls-tree -r HEAD --name-only | grep <ce-qu-on-a-supprimé>`.

**Corollaire, plus général** : quand le bug EST une divergence entre le disque et le versionné, on
ne peut pas le vérifier depuis le disque. Vérifier l'artefact réellement expédié —
`git archive <sha> | tar -x` dans un répertoire neuf, puis inspecter là. C'est ce qui a confirmé le
correctif ici.
