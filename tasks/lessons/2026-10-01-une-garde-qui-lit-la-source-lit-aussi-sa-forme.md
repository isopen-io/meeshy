## Une garde qui lit la source lit aussi sa FORME (2026-10-01, #9054)

**Ce qui s'est passé.** Les tailles d'emoji seul sont passées de littéraux
(`case .single: return 90`) à des multiples (`Self.inlineSize * 4`). Témoins,
typage et build verts ; `dev` est pourtant devenu rouge sur « Quality (bun) » :
`apps/web/scripts/check-curve.mjs` lit `EmojiDetector.swift` par une regex qui
attend un NOMBRE, et ne trouvait plus rien. Le job s'arrêtait là, sautant tous
les tests de la CI de dev pour toutes les sessions.

**Pourquoi je ne l'ai pas vu.** J'ai cherché les consommateurs de la VALEUR
(`EmojiOnlyResult`, `EMOJI_ONLY_FONT_SIZES`) ; la garde ne consomme pas la
valeur, elle lit le FICHIER. Le commentaire du web le disait (« gardées par
`scripts/check-curve.mjs` ») et je l'ai réécrit sans lancer la garde.

**La règle.** Avant de changer l'ÉCRITURE d'une constante miroir (littéral →
expression, renommage, déplacement), chercher le NOM DU FICHIER dans les
scripts de garde : `git grep -l "<Fichier>.swift" -- '*.mjs' '*.sh' '*.ts'`,
et lancer chaque garde trouvée. Une garde qui parse une source dépend de sa
forme autant que de sa valeur.
