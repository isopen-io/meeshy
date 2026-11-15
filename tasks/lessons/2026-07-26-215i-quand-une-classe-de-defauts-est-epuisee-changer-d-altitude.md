## 2026-07-26 — 215i : quand une classe de défauts est épuisée, changer d'altitude

- Contexte : la série iOS UI/UX (206i→214i) a saturé la classe « label VoiceOver manquant
  sur bouton icône-seule ». Un balayage exhaustif de `apps/ios/Meeshy` n'a plus rendu **qu'un**
  candidat — un composant réutilisable **sans call-site**. Idem pour l'i18n : 11 `Text("littéral")`
  restants, **tous des faux positifs** (`LocalizedStringKey` dont la clé existe bel et bien au
  catalogue, nom de marque, bulle de démo).
- Leçon : **mesurer l'épuisement d'une classe avant de la re-balayer**, et écrire le chiffre dans
  le tracking doc. Sans ça, chaque itération refait le même balayage pour ne rien trouver, puis
  se rabat sur un candidat marginal (« composant sans call-site ») en le maquillant en amélioration.
- Corollaire : quand la classe unitaire est vide, **monter d'un cran** — chercher les défauts
  *structurels* (intégration native, HIG, duplication, code mort) plutôt que d'insister sur des
  micro-corrections a11y. C'est ce qui a fait apparaître le popover iPad ancré sur `CGRect.zero`
  et la scène tirée d'un `Set` non ordonné : deux vrais bugs, invisibles à un grep de label.
- Anti-pattern évité de justesse : le premier réflexe fut d'extraire les 7 copies du parcours de
  hiérarchie de fenêtres dans un `ActivitySheetPresenter` partagé. Ça aurait **consolidé — donc
  pérennisé — l'anti-patron que le dépôt rejette explicitement** (doctrine écrite dans
  `CommunityLinkDetailView.swift`). Toujours chercher si le dépôt a **déjà** tranché la doctrine
  et s'il existe un patron correct en place (ici `PostDetailView`) avant d'inventer un helper.
- Vérifier « 0 appelant » avant de corriger : `ConversationListView.shareConversationLink(for:)`
  portait le défaut… et n'était appelée nulle part. Corriger du code mort = fabriquer une
  fausse amélioration. Grep le nom sur **tout** `apps/ios` + `packages/MeeshySDK` d'abord.
- Outil : un compteur d'accolades naïf a signalé un faux déséquilibre parce qu'il retirait les
  commentaires **avant** les chaînes — le `//` de `"https://…"` tronquait la ligne et emportait
  son `{`. Retirer les chaînes d'abord, puis les commentaires ; et comparer le compte à `HEAD`
  avant de conclure qu'on a cassé le fichier.
