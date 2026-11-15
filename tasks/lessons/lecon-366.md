## Leçon 366

**`git apply --check` vérifie qu'un patch S'APPLIQUE, pas qu'il s'applique au
fichier qu'on croit.**

Un sous-agent m'a remis un diff de câblage pour `.github/workflows/ci.yml`.
J'ai fait ce que je crois être la vérification :

```
git apply --check <diff>   ->  OK
git apply <diff>           ->  .github/workflows/ci.yml SUPPRIMÉ (1456 lignes)
```

L'en-tête du diff disait :

```
--- a/.github/workflows/ci.yml
+++ b/tmp/claude-0/…/scratchpad/ci.yml.proposed
```

L'agent avait produit son diff **contre une copie de brouillon**, et le chemin
du brouillon a fui dans l'en-tête. Git a donc exécuté exactement ce que le
patch décrivait : supprimer le workflow, créer un fichier ailleurs. **Et
`--check` a dit OK, parce que cette opération-là est parfaitement applicable.**

> `--check` répond à « ce patch peut-il s'appliquer ? », jamais à « ce patch
> fait-il ce que je crois ? ». Les deux questions se ressemblent au point que
> la première a l'air de couvrir la seconde — et le succès de `--check` a
> exactement la forme d'une validation.

Réparé par `git show HEAD:<chemin> > <chemin>`, diff vérifié VIDE ensuite ;
les douze lignes ont été posées à la main. Un répertoire `tmp/` parasite était
né à la racine du dépôt — supprimé avant tout `git add`.

**Parade, en une ligne : lire l'en-tête `+++` avant tout `git apply`.** Elle
tient en un `head -3` et distingue exactement ce que `--check` confond.

Corollaire pour les sous-agents : **un diff remis par un tiers porte SON
contexte de production, pas le mien.** Quand un agent travaille sur une copie
— ce qui est la bonne pratique, puisqu'il n'a pas le droit d'écrire hors de son
territoire — le chemin de cette copie voyage avec le patch. Lui demander le
diff n'est pas lui demander une instruction sûre : c'est lui demander une
DESCRIPTION, qu'il me revient de traduire en geste.

Rapprochement avec la leçon 365, écrite deux heures plus tôt : les deux fois,
j'avais bel et bien exécuté une vérification, et les deux fois elle portait sur
autre chose que ce que je croyais. **Un contrôle passé n'est une preuve que de
ce qu'il mesure** — et la question à lui poser n'est pas « a-t-il réussi ? »
mais « qu'a-t-il regardé ? ».
