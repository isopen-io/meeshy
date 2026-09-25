## Leçon 40 — deux garde-fous « corrects isolément » sur le même champ partagé peuvent s'annuler mutuellement : `endCurrentAndAnswerPending()` ne répondait JAMAIS à l'appel en attente (2026-07-07, routine calling-feature, Vague 26)

`CallManager.endCurrentAndAnswerPending()` (iOS, "End & Answer" sur la bannière de mise en attente) appelle
`endCall()` puis, après 0.5s, revalide `pendingIncomingCall?.callId == pending.callId` avant de router vers
`handleIncomingCallNotification`. Ce garde a été ajouté (audit 2026-07-02, "bug 3 follow-up") spécifiquement
pour éviter de répondre à un appel déjà raccroché/répondu ailleurs pendant le sleep — correct en isolation,
et testé par une assertion string-search qui vérifie juste la PRÉSENCE de la condition dans le corps de la
fonction. Mais `endCall()` (appelé 3 lignes plus haut, dans la MÊME fonction) déclenche synchronement
`endCallInternal()`, qui neutralise inconditionnellement `pendingIncomingCall = nil` — pour une raison sans
rapport (audit P2-iOS-1 : effacer une bannière "busy" pointant vers une room fantôme quand l'appel ACTIF se
termine pour SES propres raisons). Résultat : le garde de revalidation comparait toujours `nil ==
pending.callId`, donc toujours faux — "End & Answer" ne répondait JAMAIS à l'appelant en attente, à chaque
invocation, silencieusement (pas de crash, pas de log d'erreur, l'appelant en attente restait à sonner
jusqu'au timeout gateway ~60s). Aucun test ne l'a détecté car toute la suite `CallManagerTests.swift` est
faite d'assertions par recherche de sous-chaîne dans le source (le manager est un singleton trop lourd à
instancier avec de vraies dépendances) — chaque garde individuel testait sa PROPRE présence, jamais
l'interaction entre `endCall()` et le guard qui s'exécute après. Fix : un token dédié
(`answeringPendingCallId`), armé AVANT `endCall()`, qui survit à son effet de bord et sert seul de source de
vérité pour la revalidation — `pendingIncomingCall` reste réservé à son rôle originel (état de la bannière).

**Règle réutilisable** : quand deux correctifs distincts (souvent d'audits différents, à des dates
différentes) touchent le MÊME champ mutable partagé pour des raisons différentes dans le même fichier —
l'un l'annule pour raison A, l'autre le relit pour raison B quelques lignes plus loin — leur composition
n'est PAS garantie même si chacun est correct isolément et même si chacun a son propre test. Tracer l'ordre
d'exécution RÉEL (pas juste la présence syntaxique) de toute fonction qui (a) appelle une autre fonction
connue pour muter un champ partagé, PUIS (b) relit ce même champ quelques lignes/un `Task.sleep` plus tard
pour une décision différente. Quand une suite de tests ne peut instancier le système réel (singleton lourd,
dépendances réseau) et se rabat sur des assertions string-search par fonction, chaque garde testé
individuellement donne un FAUX sentiment de couverture — la seule protection réelle contre ce genre de
collision inter-correctifs est un champ de revalidation DÉDIÉ (jamais réutiliser un champ que d'autres
chemins de code ont le droit de muter pour leur propre compte) plutôt qu'un test qui vérifierait
l'interaction (impossible à écrire dans ce style de test sans instancier le vrai objet).
