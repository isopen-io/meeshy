## 2026-10-12 : les polices des cadres s'enregistrent à la demande, telles que distribuées, et ne servent que le latin (#10158, D10)

**Statut**: Accepté (#10158 ; décision technique D10 du `PROMPT-developpement.md` § 6.1).

**Contexte**: Les cadres de gloire emploient cinq familles d'apparat (Cinzel, Cinzel Decorative, Cormorant Garamond, Fraunces, Manrope). Elles ne doivent ni ralentir le démarrage ni voyager dans un pack, et elles ne couvrent que le latin.

**Décision**:

- **Fichiers d'origine.** Les TTF de Google Fonts sont embarqués tels que distribués (`Meeshy/Resources/Fonts/GloryFrames/`, NOTICE avec empreintes) : ni conversion, ni sous-ensemble. Cinzel Decorative réserve le nom « Cinzel » (OFL) ; un fichier modifié ne pourrait plus le porter. Le texte de l'OFL et les mentions de copyright voyagent dans le bundle (`GloryFrameFonts-OFL.txt`).
- **À la demande.** `GloryFrameFonts.register(_:)` enregistre une famille pour le processus (`CTFontManagerRegisterFontsForURL(.process)`) au premier cadre qui l'emploie. Rien au démarrage, pas de `UIAppFonts` (témoin source).
- **Graisse par l'axe `wght`** pour les familles variables, par le fichier le plus proche pour Cinzel Decorative (700 / 900). Une police obtenue qui ne porte pas la famille demandée est remplacée par la pile système, jamais par un repli choisi au hasard.
- **D10 : écritures non latines et emoji ⇒ pile système**, choisie d'après les PLAGES UNICODE du texte (`GloryFrameScript`), jamais d'après la langue de l'interface. L'arabe suit cette règle (précédent : les polices de story), sans capitales forcées ni interlettrage.
- **Liste fermée.** Une famille neuve demande une version d'app.

**Coût**: environ 2,7 Mo de polices dans le bundle (Cormorant Garamond en pèse 1,9 Mo, à cause de sa couverture cyrillique et vietnamienne). Le réduire passerait par un sous-ensemble, donc par un avis `conformite-juridique` d'abord.
