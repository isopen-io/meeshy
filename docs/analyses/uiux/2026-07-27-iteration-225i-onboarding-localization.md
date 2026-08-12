# iOS UI/UX — Iteration 225i

**Date** : 2026-07-27
**Surface** : `apps/ios/Meeshy/Features/Auth/Onboarding/OnboardingStepViews.swift`
(le parcours d'inscription complet : pseudo, téléphone, email, identité, mot de
passe, langues, profil, récapitulatif)
**Axes** : Localisation (i18n) · Accessibilité (VoiceOver, Dynamic Type, WCAG 2.5.3)
· Design system (déduplication)
**Base** : `main` HEAD `ea368e36`

## Pourquoi cette surface

La piste 223i+ héritée proposait `MemberManagementSection.emptyState`. En
mesurant d'abord, une classe de défaut bien plus grave est apparue au même
endroit que le pointeur 219i la laissait : **le parcours d'inscription est le
plus gros trou de localisation de l'app — 64 clés — et c'est le tout premier
écran qu'un compte neuf rencontre.**

Le catalogue traduit 1391 clés en 7 locales (`ar/de/en/es/fr/it/pt-BR`,
`sourceLanguage: fr`). Les 64 clés de ce fichier n'en faisaient pas partie :
elles retombaient toutes sur leur `defaultValue` inline. **Un utilisateur
allemand, espagnol, italien, brésilien, arabophone ou anglophone créait donc son
compte en français.** Aucun autre fichier n'approche ce volume (2ᵉ :
`CreateShareLinkView`, 55).

`MemberManagementSection.emptyState` reste ouvert : c'est une consolidation
cosmétique d'un état vide déjà correct (glyphe masqué VoiceOver, élément
combiné, chaîne localisée), très loin derrière en valeur.

## Écarts constatés

### A. 64 clés absentes du catalogue → français rendu dans les 6 autres locales
Classe identifiée en 218i, jamais appliquée à l'onboarding. Le
`defaultValue:` inline n'est **pas** une traduction : c'est la chaîne de la
langue source, servie à tout le monde quand la clé n'est pas au catalogue.

### B. 13 de ces clés contenaient de l'ANGLAIS dans un `defaultValue` de source `fr`
Le défaut est donc bidirectionnel — et celui-ci frappe la locale **majoritaire** :

| clé | rendu pour un francophone |
|---|---|
| `onboarding.step.pseudo.placeholder` | « Your cool username » |
| `onboarding.step.pseudo.tips.title` | « Meeshy Tips » |
| `onboarding.step.pseudo.tips.length` | « 2 to 16 characters, no spaces » |
| `onboarding.step.pseudo.tips.original` | « Be original, it's your identity! » |
| `onboarding.step.pseudo.tips.privacy` | « No personal data in your username » |
| `onboarding.step.pseudo.suggestions` | « Available suggestions » |
| `onboarding.step.password.strength.{weak,fair,good,strong}` | « Weak / Fair / Good / Strong » |
| `onboarding.password.toggleVisibility` | « Toggle password visibility » (VoiceOver) |
| `onboarding.search.clear` | « Clear search » (VoiceOver) |
| `onboarding.step.skip` | « Skip step » (VoiceOver) |

L'écran de choix du pseudo — 2ᵉ étape de l'inscription — était **intégralement
en anglais pour un francophone**.

### C. ~20 `defaultValue` français sans accents
Même classe que les deux fautes corrigées en 218i, mais systémique ici :
« Passer cette etape », « Ton identite sur Meeshy », « Criteres de securite »,
« Detectee », « Comment ca marche », « Apercu de ton profil »,
« Recapitulatif », « Tu recois », « Ton prenom », « reconnaitre »,
« Aide a la verification », « Repete », « beton », « caracteres », « protege »,
« recuperer », « Langue regionale », « confidentialite », « Creation … ». Le
bloc des conditions d'utilisation en cumulait 7 de plus (« illegal », « DONNEES »,
« protege », « prives », « etre parfaite », « traite », « communaute »).
Typographie française également absente : `!` et `?` sans espace insécable,
`...` au lieu de `…`.

### D. Le bouton « Passer » annonçait autre chose que ce qu'il affichait
```swift
Button(…) { … Text("Passer cette étape") … }
    .accessibilityLabel(String(localized: "onboarding.step.skip",
                               defaultValue: "Skip step", …))
```
Le `.accessibilityLabel` **remplace** le libellé visible : VoiceOver annonçait
« Skip step » sur un bouton affichant « Passer cette étape ». Le nom accessible
ne contenait pas le nom visible — et n'était même pas dans la même langue :
**WCAG 2.5.3 Label in Name**. Un utilisateur de commande vocale disant « appuie
sur Passer cette étape » ne pouvait pas activer le bouton.

### E. `tipRow` dupliqué 4 fois, glyphe décoratif lu comme du contenu
Les quatre vues d'étape (pseudo, téléphone, email, identité) portaient chacune un
`private func tipRow(icon:text:)` **identique au caractère près**, sauf la teinte
du glyphe. 17 sites d'appel. Aucune ne masquait le glyphe : VoiceOver annonçait
« Checkmark Circle », « Key Horizontal », « Hand Raised », « Person Badge Shield
Checkmark »… **avant chaque astuce** — 17 arrêts de bruit pur sur les premiers
écrans de l'app.

## Correctifs (225i)

1. **A** → 62 entrées ajoutées au catalogue, **traduites dans les 6 locales**
   avec le vocabulaire déjà en place (registre informel `du`/`tú`/`tu`/`você`,
   conforme aux entrées `onboarding.page*` existantes ; libellés cités repris de
   `auth.login.forgot_password` dans chaque locale plutôt que retraduits).
   Splice **textuel** dans le style dominant du fichier, JSON re-parsé après
   écriture, entrées existantes vérifiées inchangées → **+2852 / −0**.
2. **B** → les 13 `defaultValue` anglais réécrits en français ; l'anglais rejoint
   sa place, la localisation `en` du catalogue.
3. **C** → accents, espaces insécables et `…` rétablis dans les `defaultValue`,
   y compris le bloc des conditions (réparation typographique pure, sens
   inchangé).
4. **D** → le `.accessibilityLabel` divergent est **supprimé**. Le libellé
   visible localisé devient le nom accessible, ce qui satisfait 2.5.3 et retire
   au passage une clé (`onboarding.step.skip`) dont le seul rôle était de
   contredire l'écran.
5. **E** → un seul `OnboardingTipRow(icon:text:tint:)`. Les 4 helpers deviennent
   des enveloppes d'une ligne qui ne fournissent plus que leur teinte — la seule
   différence que les copies aient jamais eue — donc **les 17 sites d'appel ne
   changent pas**. Le glyphe est `.accessibilityHidden(true)` : une seule
   annonce par rangée.

### Le détail du chenal de glyphes
Le `.frame(width: 16)` d'origine alignait les légendes d'une carte sur un bord
commun, mais le glyphe est en `.font(.caption)` : aux tailles d'accessibilité il
débordait de sa colonne figée et écrasait le texte. Passer en `minWidth` corrige
le débordement **et casse l'alignement** (les symboles composés comme
`person.badge.shield.checkmark` sont bien plus larges que 16 pt, les légendes
d'une même carte ne démarreraient plus au même x).
`@ScaledMetric(relativeTo: .caption) private var glyphColumn: CGFloat = 16` garde
les deux : 16 pt exactement à la taille par défaut (**0 changement visuel**),
chenal qui grandit avec la légende ensuite.

## Périmètre volontairement exclu

**`onboarding.step.recap.terms.body`** — les conditions d'utilisation affichées
dans l'app. Ce n'est pas un libellé d'interface qu'une itération UI/UX traduit de
sa propre autorité, et une traduction automatique de conditions qu'on demande à
l'utilisateur d'**accepter** vaut moins qu'une version honnête en langue source.
La clé est donc exemptée explicitement, avec sa raison, dans
`untranslatableKeys` — et ses accents français sont corrigés, ce qui ne touche
pas au sens. **Reste à faire** : traduction relue, hors piste UI/UX.

Non traité non plus, et assumé : le **registre** diverge entre le carrousel
d'introduction (vouvoiement : « Rencontrez », « vos amis ») et le parcours
d'étapes (tutoiement : « Ton prénom », « tu peux passer »). Uniformiser est une
décision de copie produit sur ~70 chaînes, pas une passe de localisation. Les 6
locales cibles étant **déjà** au registre informel, les traductions livrées
s'alignent sur le tutoiement du fichier.

## Vérification

Aucune toolchain Swift dans l'environnement → le gate est la CI `iOS Tests`.
Toutes les assertions ont été **évaluées déterministiquement hors Xcode** avant
commit, contre `origin/main` (RED) puis contre l'arbre de travail (GREEN).

| test | RED (base) | GREEN (après) |
|---|---|---|
| `test_fullyLocalizedScreensStayTranslatedInEveryShippedLocale` | 63 violations | 0 |
| `test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` *(neuf)* | 67 violations | 0 |
| `test_untranslatedKeyBacklogDoesNotGrow` | 1669 | **1606** (plafond abaissé) |
| `OnboardingTipRowConsistencyTests` *(neuf, 4 tests / 9 assertions)* | 9/9 RED | 9/9 |
| `check_localization.py` (directions 1 & 2) | ✓ | ✓ |

### Le test de parité, et pourquoi il existe
Épingler l'écran crée un risque neuf : chaque chaîne existe désormais **deux
fois**, comme `defaultValue` inline et comme entrée `fr` du catalogue. Rien ne
les force à s'accorder, donc une édition ultérieure de l'une seule scinde
silencieusement l'écran — les francophones lisent le littéral du code, les six
autres locales sont générées depuis le catalogue.
`test_fullyLocalizedScreenDefaultValuesMatchTheCatalogSourceLanguage` verrouille
l'égalité. Il **exclut les défauts interpolés** : Xcode réécrit `"… \(x)"` en
`"… %@"` à l'extraction, donc `status.composer.repost.via` (écran `StatusComposerView`
déjà épinglé) diverge légitimement. Le piège s'est réellement déclenché — la
première rédaction du test rendait `StatusComposerView` rouge — et c'est la
raison d'être de l'exclusion, déjà documentée dans l'en-tête du fichier pour les
clés de texte naturel.

Deux gardes anti-faux-positif reprises des itérations précédentes :
`declaration`/`code(_:)` retire les commentaires `//` avant d'assertionner
(sans quoi le commentaire de production qui **nomme** `tipRow` et
`accessibilityHidden` suffit à faire passer les tests — piège 221i), et le
comptage `helpers == délégations` échoue si l'un des quatre wrappers
réintroduit un corps local.

## Statut

Écarts A–E **résolus**. `OnboardingStepViews.swift` est épinglé dans
`fullyLocalizedScreens` : il ne peut plus régresser vers du français-seul, et sa
langue source ne peut plus dériver de son catalogue.

**⚠️ NE PLUS re-flagger** : (a) les chaînes du parcours d'inscription pour la
traduction ou la typographie française — soldées et verrouillées par deux tests ;
(b) `tipRow` / le nommage VoiceOver des rangées d'astuces ; (c) le libellé
accessible du bouton « Passer ».

## Reste à faire (226i+)

1. **Poursuivre la classe A par écran, en épinglant à chaque fois.** Le backlog
   est à 1606 clés : c'est le plus gros gisement de valeur utilisateur restant sur
   iOS. Par volume décroissant : `CreateShareLinkView` (55),
   `NotificationSettingsView` (52), `MessageDetailSheet` (47),
   `ConversationInfoSheet` (43), `SecurityView` (41). Préférer les écrans qu'un
   compte neuf traverse tôt.
2. **Traduction relue de `onboarding.step.recap.terms.body`** (hors piste UI/UX).
3. `MemberManagementSection.emptyState` (l.306-322) → `EmptyStateView(compact:)`,
   en vérifiant le risque layout `maxHeight: .infinity`.
4. Registre vouvoiement/tutoiement de l'onboarding — décision de copie produit.
5. Hérités et toujours ouverts : `UnifiedPostComposer` (`MeeshyUI/Story/`) encore
   en `NavigationView` — **côté SDK, hors périmètre de cette routine** ;
   `StoryViewerView+Content.shareStory()` code mort 0 caller.
