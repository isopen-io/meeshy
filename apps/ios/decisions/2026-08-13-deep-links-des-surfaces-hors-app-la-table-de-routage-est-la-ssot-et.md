## 2026-08-13 : Deep links des surfaces hors-app — la table de routage est la SSOT, et une garde la confronte aux émetteurs

**Statut**: Accepté

**Contexte**: Les widgets (`MeeshyWidgets/`) et les App Shortcuts (`MeeshyAppIntents.swift`) composent leurs `meeshy://` par interpolation de chaîne, dans du code qui n'importe pas `DeepLinkParser`. Rien ne confronte ces URL à la table de routage : le compilateur valide la chaîne, les tests du widget ne l'atteignent pas, ceux du routeur ne la connaissent pas. Résultat mesuré au cycle 106 : **7 hosts émis, 3 routés**. Les quatre boutons du widget « Réponse rapide » et le raccourci Siri « Message X on Meeshy » n'ont jamais rien fait.

**Décision**:
1. `DeepLinkParser` / `DeepLinkRouter` restent la **seule** table de routage. Une surface hors-app n'invente pas un schéma d'URL : elle émet une forme qui y figure.
2. Toute forme émise doit être **classée** dans `DeepLinkSurfaceRoutingGuardTests` — routée (avec une URL témoin qui doit résoudre) ou délibérément non routée (avec sa raison). La garde extrait les hosts réellement présents dans les sources émettrices et exige l'égalité des deux ensembles : un host nouveau fait rougir, un host classé qui a disparu aussi.
3. Un texte transporté par un deep link (réponse rapide, dictée Siri) est **déposé en brouillon** (`DraftStore`), jamais envoyé. Un tap depuis l'écran d'accueil ou une transcription Siri approximative ne peut pas produire un message irrattrapable. Un brouillon qui porte déjà du texte n'est jamais écrasé.
4. Le **host décrit ce que la surface montre, pas ce qu'elle porte** : `meeshy://contact/{id}` et `meeshy://send?contactId=` transportent des identifiants de **conversation** (`WidgetDataManager.publishFavoriteContacts` écrit `conv.id`). Suivre l'écrivain, jamais le nom.

**Alternatives rejetées**:
- *Router les 7 hosts d'un coup* : `conversations/*`, `call` et `translate` demandent des destinations produit qui n'existent pas (élire « la conversation la plus récente », amorcer un appel depuis une URL, un écran de traduction hors conversation). Les brancher sur une destination approximative serait pire que le no-op actuel — et le silence resterait, la garde le rend explicite.
- *Faire émettre au widget des formes canoniques (`meeshy://c/{id}`)* : corrige les émetteurs d'aujourd'hui sans empêcher le prochain d'inventer un host. La contrainte doit vivre dans un test qui LIT les émetteurs, pas dans leur bonne volonté.

**Conséquences**: toute nouvelle surface hors-app qui émet un `meeshy://` doit être ajoutée à la liste balayée par la garde, sans quoi ses URL restent invisibles à cette vérification. Le balayage couvre aujourd'hui `MeeshyWidgets/` et `MeeshyAppIntents.swift`.
