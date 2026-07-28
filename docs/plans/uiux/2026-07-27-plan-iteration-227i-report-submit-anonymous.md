# Plan — iOS UI/UX Iteration 227i

**Objet** : rendre aux deux boutons de signalement le nom qu'ils perdaient
pendant l'envoi.

**Analyse** : `docs/analyses/uiux/2026-07-27-iteration-227i-report-submit-anonymous.md`
**Base** : `main` HEAD `913d8cc9` · **Branche** : `claude/quirky-curie-6kr79r`
**Numérotation** : 227i (226i mergée #2407 ; un autre agent occupe aussi « 226i »)

## Sélection de la cible

La piste 227i-a héritée de 226i (hint de désactivation) est **bloquée par le
catalogue** : #2411 réécrit `Localizable.xcstrings` (+2639 lignes) et #2369
corrige le cliquet de couverture. Toute clé neuve collisionnerait et déplacerait
le compteur de dette. → itération **sans aucune clé i18n**.

Balayage de la même famille de défaut que 226i, mais dans sa forme **aiguë** :
les boutons dont le label se réduit à un `ProgressView` **nu**, donc sans aucun
nom accessible pendant le travail. 19 boutons de cette forme, **12 déjà nommés**,
**7 lacunes**. Les 2 boutons de signalement sont les pires (action destructrice,
et l'un est un `ToolbarItem`).

## Étapes

- [x] Resync depuis `origin/main` (226i mergée #2407)
- [x] Constater le blocage catalogue (#2411 / #2369) → 0 clé neuve
- [x] Inventorier la famille de défaut sur les 3 cibles app
- [x] **Rectifier l'inventaire** : 1ʳᵉ mesure = 19 lacunes (fenêtre de 400 car. trop courte, manquait les labels posés plus bas) → 2ᵉ mesure bornée = **12 nommés / 7 lacunes**
- [x] Chercher une clé de valeur réutilisable → **écartée** (`…publish.uploading` dit « Uploading »/« Wird hochgeladen » = téléversement de fichier)
- [x] `.accessibilityLabel` sur les 2 boutons, avec leur clé visible
- [x] Test neuf 4 tests / 8 assertions, dont gardes négatives et garde de prémisse
- [x] RED 4/8 prouvé contre `main` ; tokenizer 0/0
- [x] Analyse + plan + tracking
- [ ] Commit, push, PR — gate = CI `iOS Tests`

## Décisions

**Réutiliser la clé visible plutôt qu'en forger une.** Le nom vocal d'un bouton
doit être ce que le bouton affiche. Ici c'est aussi la seule option sûre : le
catalogue est en cours de réécriture par une autre PR.

**Écarter la clé « en cours » qui semblait convenir.** `a11y.feed.compose.publish.uploading`
est traduite partout, mais `en`/`de` parlent de **téléversement de fichier**.
L'économie d'une clé ne justifie pas d'envoyer un mot faux à deux locales.
Vérifié locale par locale dans le catalogue, pas supposé depuis le nom de la clé.

**Corriger l'inventaire avant de le publier.** La première mesure surestimait
les lacunes de 19 à 7 : publier le chiffre brut aurait envoyé les itérations
suivantes chasser des défauts déjà corrigés.

**Compter la RED honnêtement : 4/8.** Les gardes négatives et la garde de
prémisse sont vertes des deux côtés par construction ; elles protègent l'avenir
mais ne prouvent rien du correctif.

## Non fait (et pourquoi)

- `.accessibilityValue` d'état occupé : chaîne neuve à traduire, catalogue gelé.
- Les 5 autres lacunes de l'inventaire : une ou deux par itération, pas un
  balayage de masse sur 5 écrans non liés.

## Suite (228i+)

1. Les 5 lacunes restantes (`ConversationEncryptionDetailSheet:197`,
   `EditPostSheet:163`, `AudioFullscreenView:843`, `ChangePasswordView:226`,
   `FeedView+Attachments:637`).
2. Valeurs d'état occupé, quand le catalogue est de nouveau ouvert.
3. Reliquat 226i : hint de désactivation ; factorisation du champ des 2 écrans
   « créer un lien » **après arbitrage du style**.
