## Leçon 243 — un script de résolution qui ÉCHOUE avant d'écrire, suivi d'un `&&` filtré par `grep`, committe les marqueurs de conflit (2026-08-22, lot de 22 PR)

Pendant le merge de #3243, ma chaîne enchaînait « script Python de résolution →
`git add` → tests | `grep` → `git commit --no-edit` ». Le script est tombé à la
COMPILATION (guillemet mal fermé) — donc rien d'écrit — mais `git add` a pris les
fichiers TELS QUELS (marqueurs compris), le `grep -E '^(Tests|...)'` de l'étape
de tests a rendu 0 parce qu'il a TROUVÉ la ligne `FAIL …`, et le commit est parti.
Résultat : un merge `bce89832a` avec `<<<<<<<` dans `messages-schemas.ts`, sur
lequel j'avais déjà empilé le merge suivant avant de le voir.

> **Un `&&` ne garde que le code de sortie du DERNIER maillon d'un pipe** —
> `cmd | grep motif` rend 0 dès que le motif est trouvé, y compris quand le
> motif est `FAIL`. Et `git add` accepte un fichier à marqueurs sans un mot.

Règles, appliquées sur le reste du lot :
1. **Jamais de `git commit` dans la même chaîne qu'une résolution ou qu'un test.**
   Résoudre, puis VOIR (diff de la région, `git grep '^<<<<<<<'`, tests avec leur
   compte), puis committer dans un appel séparé.
2. Un script de résolution se termine par un `print('RÉSOLU')` + des `assert`
   sur l'état final (`'<<<<<<<' not in s`) — et la chaîne n'avance que si ce mot
   est apparu.
3. Réparer = revenir AVANT le commit fautif (`git merge --abort` du merge en
   cours, `git reset --hard <merge précédent>` dans son worktree PRIVÉ — jamais
   dans l'arbre partagé), rejouer proprement ; pas de `--amend`.
