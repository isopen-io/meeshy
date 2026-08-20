# Refonte `/chat` anonyme — approche Focal (2026-08-20)

## Diagnostic
- La surface participant (`BubbleStreamPage` via `/chat/:linkId`) rend récent EN HAUT
  (`reverseOrder=false`, `scrollDirection='down'`) alors que la géométrie Focal ancre la
  ligne de focus EN BAS (`focalFocusLine`) : les messages récents sont grisés (opacité
  jusqu'à 0.18) et rétrécis — l'inverse du design.
- Aucun wrapper hauteur viewport autour de la branche participant dans
  `SharedConversationExperience` (le visiteur a `h-[100dvh]`, le participant NON) :
  `h-full` s'effondre, la page scrolle, le composer n'est pas figé en bas.
- Aucun `readingMode` passé, aucun `LensSwitcher` : impossible d'activer les modes
  Focal / Script / Bulles + densité `Aa` sur la vue anonyme.
- `StreamHeader` est `hidden md:block` : aucun en-tête d'identité de conversation sur
  mobile, pas d'accent de conversation.
- L'aperçu visiteur (`SharedConversationPreview`) est déjà dans le bon ordre (gateway
  sert ASC) mais ne scrolle pas au dernier message.
- `BubbleStreamPage` sert AUSSI le feed d'accueil authentifié (`/`, conversation
  "meeshy") → paramétrer par `variant: 'stream' | 'thread'` (défaut `stream`,
  bit-à-bit inchangé).

## Plan
- [x] Test + type : `variant`/`conversationTitle`/`conversationType` sur
      `BubbleStreamPageProps` ; loi pure de layout par variante
- [x] `StreamThreadHeader` (nouveau, bubble-stream) : avatar accent, titre, compteur
      participants, état connexion/typing, `LensSwitcher` — visible à tous les
      breakpoints + test
- [x] `BubbleStreamPage` : câblage variante (ordre, scroll, readingMode, accent,
      header, scroll bouton offset xl)
- [x] `SharedConversationExperience` : wrapper `h-[100dvh]` + props thread + tests
- [x] `SharedConversationPreview` : scroll initial vers le dernier message
- [x] `ConversationMessages` : offset du bouton flottant paramétrable (sidebar xl)
- [x] Locales (en/fr/es/pt) : clés `chat.thread.*`
- [x] Gates locaux : jest web complet vert (717/718 suites — seul rouge : flake
      fuseau pré-existant LentilleRow.live-time, vert en UTC/CI)
- [ ] Déploiement : push main → CI → vérif prod sur le lien mshy_ (Chrome)
