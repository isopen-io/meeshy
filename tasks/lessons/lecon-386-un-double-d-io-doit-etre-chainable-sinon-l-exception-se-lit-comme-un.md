## Leçon 386 — Un double d'`io` doit être CHAÎNABLE, sinon l'exception se lit comme un défaut de la route

**Cycle #4557 (2026-09-01).** Cinq témoins neufs rendaient
`{"success":false,"error":"Erreur lors de l'ajout du participant"}` — le message
du `catch` de la route. Diagnostic apparent : le handler est faux.

Cause réelle : `emitToConversationParticipants` enchaîne
`io.to(room).to(room)…​.except(room)` avant d'émettre. Le double rendait
`{ emit }` au premier `to`, donc **le deuxième maillon levait**
`emitter.to is not a function` — et le `catch` de la route l'avalait en un
message générique.

> **Un `catch` qui rend un message d'erreur MÉTIER masque une exception de
> DOUBLE.** Le message dit « erreur lors de l'ajout », ce qui oriente vers la
> logique d'ajout ; la pile, elle, nommait `socketio/`. La seule façon de le
> voir a été de faire ÉCRIRE au logger factice — un mock de logger qui avale
> tout rend indébogable ce qu'il est censé enregistrer.

Poser `chainable.to = () => chainable` et `chainable.except = () => chainable`
coûte deux lignes et rend le double fidèle à l'API qu'il imite.
