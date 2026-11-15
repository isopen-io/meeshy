## 2026-08-03 — Continuous-improvement cycle : alias 639-1 dépréciés + identité réaction multi-device

Deux corrections issues d'un audit ciblé du cœur temps-réel TS (env Linux, pas de
Xcode — vérification bornée à shared/gateway/web).

**Leçons :**
1. **Un champ requis dans une signature révèle TOUS ses appelants ; un champ optionnel
   les masque.** En rendant `userId` REQUIS sur `createUpdateEvent`, le compilateur a
   exposé 11 sites d'émission (handler socket, 3 routes REST, messages-advanced, chemin
   agent, fallback dégradé) — dont 8 que le grep initial du sous-agent avait ratés. Un
   `userId?` optionnel aurait compilé partout en injectant silencieusement `undefined`,
   laissant le prisme multi-device cassé sur le chemin REST. Règle : pour propager un
   nouveau champ à TOUS les producteurs, le rendre requis sur la fonction de fabrique
   force la complétude ; ne relâcher en optionnel que sur le TYPE transporté (compat des
   payloads rejoués).
2. **Comparer deux IDs de collections différentes échoue toujours en silence.** Le web
   comparait `event.participantId` (Participant.id) à `currentUserId` (User.id) : jamais
   égaux, donc « ma réaction » jamais reconnue sur un 2e appareil. Un test masquait le bug
   en passant `participantId: 'user-1'` ET `currentUserId: 'user-1'` — même valeur pour
   deux identités distinctes. Règle : dans une assertion d'égalité d'IDs, utiliser des
   valeurs LEXICALEMENT distinctes pour chaque espace d'ID, sinon le test valide une
   coïncidence, pas le contrat.
3. **`iw`/`in`/`ji` : la JVM émet encore les codes ISO 639-1 dépréciés** (`he`/`id`/`yi`).
   Un client Android sur locale hébraïque envoie `iw`, qui verbatim ne matche aucune
   traduction `he` → repli sur l'original non traduit (violation Prisme). Même classe que
   la troncature `fil→fi`/`swe→sw` déjà corrigée. Réduire via table EXPLICITE re-validée
   contre les codes supportés (`ji→yi` non supporté → `undefined`), miroir Swift maintenu.
4. **Toujours re-grep les autres écrivains d'un champ/appelants d'une fonction avant de
   conclure « fait ».** (récidive de la leçon 2026-07-31 #2). Le sous-agent avait localisé
   2 sites ; il y en avait 11.
