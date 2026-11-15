## Leçon 36 — une entrée de backlog "FIXED" n'est une preuve de rien sans grep contre `HEAD` (2026-07-06, routine calling-feature)

`tasks/calls-fonctionnel-todo.md` documentait (Vagues 13-16) plusieurs fixes calling comme "CONFIRMÉ +
CORRIGÉ", tests inclus — mais ces sections du fichier avaient elles-mêmes été effacées de `main` par la
régression `8ebd497b` (même commit qui avait aussi silencieusement supprimé le code qu'elles décrivaient),
et ne survivaient que dans deux PR ouvertes non mergées (#1558, #1563). Une session qui aurait fait
confiance au fichier tel qu'il existait sur sa propre branche (avant divergence) sans re-vérifier `HEAD`
aurait pu croire ces fixes présents alors qu'ils ne l'étaient pas. Pire : la PR #1558 elle-même a bâti un
nouveau fix (web, `call-store.ts` + `CallManager.tsx` initiator-timeout) sur l'hypothèse que le P0 du jour
(`682c35279`, "l'initiateur voit sa propre UI d'appel") était déjà sur `main` — il ne l'était pas (supprimé
par la même régression) — donnant une **couverture de test illusoire** : les tests de #1558 passent
(ils posent l'état directement via un helper de test) mais le vrai chemin de production qu'ils sont censés
protéger était cassé d'une façon différente et plus grave, jamais exercée par ces tests.
**Règle** : avant de s'appuyer sur une entrée de backlog pour décider qu'une zone du code est "déjà
traitée", `grep` la primitive technique citée (nom de fonction/champ/constante) directement dans le
fichier source sur `HEAD` — jamais seulement dans les docs. Avant de construire un nouveau fix par-dessus
un fix antérieur documenté, vérifier par lecture du code réel (pas de la doc, pas du diff de la PR qui le
cite) que ce fix antérieur est bien présent sur la base de travail actuelle.
