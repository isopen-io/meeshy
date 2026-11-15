## Leçon 172 — Un event à PLUSIEURS émetteurs : vérifier qu'ils émettent la MÊME forme (2026-08-15, routine temps réel, cycle 22)

Deux matrices mécaniques (events serveur × écouteurs clients, events client ×
handlers serveur) répondent à « qui écoute quoi » et ne trouvent RIEN quand le
défaut est ailleurs : un event dont **deux** émetteurs construisent la charge
utile **séparément**. La matrice le voit émis, elle le voit écouté, et elle est
verte — alors qu'une des deux formes est illisible pour le client.

`message:translation` : le retour ZMQ émettait un `TranslationEvent`, la branche
CACHE de `translation:request` émettait `{ messageId, translatedText, … }`. Le
web sort par un `return` nu, iOS échoue son `decode`. Résultat : traduire à la
demande ne marchait QUE sur cache MISS.

**Règle.** Quand un `SERVER_EVENTS.X` a plus d'un site d'émission, la charge
utile appartient à un constructeur unique, pas à chaque site. C'est la même
conclusion que le cycle 8 (corps REST des liens de partage, payload construit
deux fois par route) — la troisième récidive de la même famille.

**Corollaire de détection.** Un client qui IGNORE une charge utile qu'il ne sait
pas lire a raison de l'ignorer, et tort de le faire sans un mot. Le `return` nu
est ce qui rend ce défaut invisible : ni erreur, ni log, ni métrique. Journaliser
le rejet (avec les clés reçues) ne change pas le comportement et transforme un
défaut muet en défaut diagnosticable.

**Corollaire de test.** Le test qui couvrait la branche cassée assertait la forme
cassée (`expect.objectContaining({ translatedText })`). Un test écrit APRÈS
l'implémentation fige ce que le code fait ; il faut qu'il énonce ce que le
CLIENT lit. Récidive exacte du D4 du cycle 7.
