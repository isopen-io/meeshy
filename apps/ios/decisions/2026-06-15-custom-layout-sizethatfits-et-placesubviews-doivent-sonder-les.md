## 2026-06-15 : Custom Layout — `sizeThatFits` et `placeSubviews` DOIVENT sonder les enfants identiquement (height: nil)

**Statut**: Accepte (commit `d43307430`)

**Contexte**: Les bulles de conversation portant une carte OpenGraph (`LinkPreviewCard`, message contenant une URL) s'affichaient ~170pt trop hautes — un grand vide violet sous la carte dans lequel le message suivant venait **chevaucher** (entremêlage rapporté sur device, prioritaire mise en production). `BubbleBodyFooterLayout` (custom `Layout` qui empile body + footer) avait deux passes divergentes :
- `measuredSize()` (appele par `sizeThatFits`) sondait le body via `body.sizeThatFits(proposal)` en **transmettant la hauteur proposee**.
- `placeSubviews()` sondait via `body.sizeThatFits(ProposedViewSize(width:, height: nil))` — hauteur **nil**.

Le body d'une bulle a lien heberge un `LinkPreviewCard` dont le `.frame(minHeight: 64)` n'a **pas de maximum** : sonde avec une hauteur, il grandit pour la **remplir**. Comme la taille mesuree redevient la prochaine proposition du parent, la hauteur s'emballe en **boucle de feedback** (escalier mesure 184→218→…→383.7pt pour ~213pt de contenu reel). Prouve par instrumentation runtime sur sim : meme body, meme largeur 281.4 → `sizeThatFits` body=349.7pt vs `placeSubviews` body=179.7pt. Les bulles **texte** y echappent (`Text` retourne sa hauteur ideale quel que soit la hauteur proposee), d'ou le bug **uniquement** sur les bulles a lien.

**Decision**: Dans un custom `Layout`, mesurer la hauteur **intrinseque** d'un enfant via `child.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))`, **jamais** en transmettant la hauteur proposee. `sizeThatFits` (taille rapportee au parent) et `placeSubviews` (placement) doivent sonder les enfants de **maniere identique** — sinon la taille rapportee derive du placement reel et la cellule deborde / chevauche sa voisine. Fix applique : `measuredSize` aligne sur `placeSubviews`.

**Regle generale**: tout enfant flexible en hauteur (`.frame(minHeight:)` sans max, `Spacer`, `RoundedRectangle`/`Rectangle` sans frame fixe, `.frame(maxHeight: .infinity)`) **remplit la hauteur proposee**. Le sonder avec une hauteur non-nil dans `sizeThatFits` couple la taille rapportee a la proposition et peut creer une boucle de feedback (la taille mesuree redevient la proposition). Toujours proposer `height: nil` pour obtenir la hauteur ideale.

**Verification**: frame-a-frame (idb `ui describe-all`) sur la meme conversation, avant/apres — bulle OG 383.7→213.7pt, chevauchement 72.7pt → espacement sain +46pt, fond de bulle du message suivant restaure. Confirme visuellement (screenshots).

**Alternatives rejetees**:
- **Capper `LinkPreviewCard` avec un `maxHeight` ou `.fixedSize(vertical:)`** : masque le symptome sur un seul composant ; d'autres enfants flexibles futurs re-declencheraient le bug. Le fix au niveau du `Layout` traite la source unique de la divergence (et c'est la maniere SOTA de mesurer une hauteur intrinseque d'enfant).

**Voir aussi**: [[feedback-swiftui-layout-sizethatfits-height-nil]] (memoire). Lie au piege [[feedback-swiftui-layout-cache-recycled-cells]] (Layout.Cache perime au recyclage) — meme famille « custom Layout + cellule recyclee + mesure ».
