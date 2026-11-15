## Leçon 539 — Un `test-without-building` exécute le dernier bundle QUI EXISTE, pas celui du build qu'on vient de lancer

**Mesuré le 2026-09-06** (lot #5326, arbre partagé à trois sessions). J'enchaîne
`build-for-testing ; test-without-building` avec un **point-virgule**. Le build
échoue (`unable to attach DB: … database is locked`), le test tourne quand même,
et le journal rend :

```
BUILD_EXIT=65
** TEST BUILD FAILED **
TEST_EXIT=0
	 Executed 31 tests, with 0 failures (0 unexpected)
```

**Trente-et-un tests verts sur du code qui n'a pas compilé.** Le bundle du build
PRÉCÉDENT était encore là ; `test-without-building` l'a trouvé et exécuté.
