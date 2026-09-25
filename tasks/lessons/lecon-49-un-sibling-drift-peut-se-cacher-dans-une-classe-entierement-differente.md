## Leçon 49 — un sibling-drift peut se cacher dans une classe entièrement différente de celle qu'on vient de corriger (routine calling-feature, Vague 31, 2026-07-09)

Les Vagues 25/27/30 ont corrigé 3 fois le même bug — `duration` persisté comme `now - startedAt`
(temps de sonnerie + conversation) au lieu de `answeredAt ? now - answeredAt : 0` (temps de conversation
réel) — à chaque fois en supposant avoir traité le dernier writer terminal restant, et à chaque fois en
cherchant les siblings **dans le même fichier/classe** (`CallCleanupService.ts`, ses 4 tiers de GC).
La Vague 31 en a trouvé 2 de plus, mais dans `CallService.ts` — une classe différente, avec une
responsabilité de terminaison d'appel qui LUI APPARTIENT AUSSI (le phantom-cleanup et le zombie-cleanup
que `initiateCall()` exécute lui-même avant de créer un nouvel appel). Rien ne les reliait
syntaxiquement aux writers déjà corrigés — même `grep -n "duration" CallCleanupService.ts` ne les
aurait jamais fait apparaître.

**Règle réutilisable** : quand un bug de type « writer terminal incohérent » (anchor de date, garde de
version, fanout de room, etc.) est trouvé et corrigé dans une classe, chercher les siblings par
**responsabilité** (grep du champ concerné — ici `duration`/`answeredAt`/`startedAt` — sur TOUT le
répertoire `services/`, pas seulement le fichier corrigé), pas par proximité de fichier. Une
responsabilité de terminaison de session peut légitimement être dupliquée entre le service métier
principal (`CallService`) et un service de nettoyage dédié (`CallCleanupService`) sans que ce soit un
défaut d'architecture en soi — mais ça veut dire qu'un correctif doit être recherché aux DEUX endroits,
systématiquement, avant de déclarer un bug family clos.

---
