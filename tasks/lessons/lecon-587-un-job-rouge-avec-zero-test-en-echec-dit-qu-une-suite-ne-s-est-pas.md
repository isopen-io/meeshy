## Leçon 587 — Un job ROUGE avec ZÉRO test en échec dit qu'une suite ne s'est pas CHARGÉE — et le typecheck ne pouvait pas le voir

2026-09-12, #6157. « Test gateway » rouge sur `dev`, avec ce verdict :

```
Test Suites: 1 failed, 1249 passed, 1250 total
Tests:       24043 passed, 24043 total
```

**Aucun test en échec, et pourtant rouge.** La signature est celle-là, et elle se
lit en une seconde une fois qu'on la connaît : une suite qui ne se CHARGE pas ne
contribue aucun test au décompte. Ici un `import` vers une API disparue (la
jumelle d'une résolution add/add), donc `TS2305` au chargement.

> **Une suite qui ne se charge pas ne mesure RIEN, et c'est PIRE qu'un test
> rouge.** Un test rouge nomme ce qui casse ; une suite muette laisse croire que
> sa garde veille. Celle-ci était le témoin de confidentialité du FIL — un
> dernier message à vue unique ne doit pas partir en clair dans le corps
> SÉRIALISÉ. Le rouge était visible, la garde était morte.
