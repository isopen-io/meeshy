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
- [x] Déploiement : push main (42d81e54f) → Docker CI vert → recréation
      meeshy-frontend (rollback tag isopen/meeshy-web:rollback-20260820) →
      vérif prod e2e Playwright sur le lien mshy_6a869d…

## Revue (2026-08-20, vérifié en production sur meeshy.me)
- Visiteur : aperçu avec header accent + Lentille + « Rejoindre pour répondre » figé.
- Jonction anonyme (FocalCheck) : formulaire 3 champs, arrivée directe dans le fil.
- Fil participant : StreamThreadHeader « 19 participants · En direct », composer figé
  (884/900 desktop, 828/844 mobile), 11 rangées focales — première (ancienne, haut)
  à 0.18, dernière (récente, bas) à 1.0, carte focale élue présente : la perspective
  est enfin à l'endroit.
- Envoi : « Test de la nouvelle vue /chat — tout fonctionne ✅ » atterrit en dernière
  rangée, en bas, net.
- Lentille : Focal / Script / Bulles basculés en live, choix collant.
- Les 403 console pré-jonction sont le chemin nominal d'un lien allowViewHistory=false
  (repli métadonnées publiques du service), pas un défaut.
