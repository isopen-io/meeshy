## Leçon 581 — Un témoin qui lit le SOURCE rougit sur le commentaire qui l'explique

2026-09-11, iOS. Le correctif de la leçon 580 s'accompagne d'un témoin
d'inspection de source (le gestionnaire est une fermeture en ligne dans le bloc
`.task` de `MeeshyApp` : aucun test ne peut l'invoquer). Il asserte que le corps
ne contient plus `APIResponse<MeeshyUser>`.

Il est tombé ROUGE sur le correctif juste — parce que le commentaire que je
venais d'écrire pour EXPLIQUER le correctif nomme la forme fautive :

```swift
// Ce site exigeait `APIResponse<MeeshyUser>` ; PATCH /users/me sert …
let _: SimpleAPIResponse = try await APIClient.shared.replayPersistedRequest(
```

> **Un témoin de source ne distingue pas le code de ce qui le documente.** Et
> la documentation d'un correctif NOMME, par construction, ce qu'il retire —
> les deux se contredisent donc mécaniquement. Le réflexe « je reformule le
> commentaire » est le mauvais : il fait payer à l'explication le prix de
> l'outil de mesure.

Parade : retirer les lignes de commentaire AVANT de mesurer. Trois lignes de
`filter`, et le commentaire peut dire la vérité entière.
