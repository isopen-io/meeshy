# Iteration-265i — L'onboarding démontrait le Prisme en traduisant l'allemand vers l'allemand

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surface** : carte « Comment ça marche » de l'onboarding · littéraux `LocalizedStringKey`
**Base** : `main` HEAD `66f6dfc3` · **Issue** : #4313
**Précédent direct** : 264i (le cliquet des tailles de police figées)

---

## 1. Le défaut

La carte `OnboardingStepViews.conversationExampleCard` vend la feature centrale
du produit. Elle tient en deux lignes :

| ligne | d'où vient le texte |
|---|---|
| le message ORIGINAL de « Jean-Pierre » | `Text("Hello! How are you doing today?")` — un littéral nu, donc un `LocalizedStringKey` |
| la TRADUCTION, sous l'icône `translate` | `translatedExample` — un `switch` Swift sur `viewModel.systemLanguage` |

Le second n'est pas localisable : c'est du code. **Le premier l'est devenu sans
que personne ne le décide.** `Text(_:)` prend un `LocalizedStringKey` ; Xcode
extrait tout littéral qu'on lui passe comme clé de catalogue ; une passe de
traduction l'a rempli.

| locale | « original » servi | |
|---|---|---|
| fr (source) · en · ar · it | `Hello! How are you doing today?` | ✅ resté étranger |
| **de** | `Hallo! Wie geht es Ihnen heute?` | ❌ traduit |
| **es** | `¡Hola! ¿Cómo estás hoy?` | ❌ traduit |
| **pt-BR** | `Olá! Como você está hoje?` | ❌ traduit |

En face, `translatedExample` rend `Hallo! Wie geht es dir heute?` /
`Hola! Como estas hoy?` / `Ola! Como voce esta hoje?`.

> Un utilisateur en locale allemande qui choisit l'allemand — **le chemin
> nominal** — voyait deux phrases allemandes, l'une présentée comme l'original,
> l'autre sous l'icône de traduction. En espagnol et en portugais, les deux ne
> diffèrent que par les accents et la ponctuation : **pire qu'une traduction
> absente, ça a l'air d'une traduction ratée.**

Trois locales sur sept, sur l'écran qui vend le produit. Le message original
DOIT rester étranger : c'est la prémisse de la démonstration. Le traduire ne la
localise pas, il la détruit.

---

## 2. Pourquoi aucune garde ne l'a vu

Toutes les gardes i18n du dépôt s'accrochent à `String(localized:` — le marqueur
de `LocalizationConsistencyTests`, le cliquet `fullyLocalizedScreens` (#4309), le
ratchet `defaultValue`. **Un littéral nu n'est vu par aucune**, alors qu'il est
tout aussi localisé — davantage même, puisque personne n'a choisi qu'il le soit.

`OnboardingStepViews.swift` est **épinglé** parmi les 43 écrans « fully
localized » du 263i. La garantie annoncée — *« this screen can never silently
regress to French-only »* — ne couvre pas ce vecteur : la régression n'est pas
vers le français, c'est une traduction de TROP.

### Le mécanisme avait déjà été rencontré — et excusé

`FrenchDefaultValueRatchetTests` portait :

```swift
/// `Jean-Pierre` est un NOM employé comme clé d'exemple : la clé fait la
/// valeur, en français comme ailleurs.
private static let notAnInterfaceString: Set<String> = ["Jean-Pierre"]
```

Le commentaire décrit le phénomène **exactement**. Il ne le remonte pas à sa
source. Trois lignes plus bas dans le même fichier de production, le même
mécanisme cassait la démonstration du produit.

> **Une entrée d'allowlist qui explique pourquoi une clé est inoffensive est un
> endroit où quelqu'un a VU le mécanisme et ne l'a pas suivi jusqu'à sa cause.**
> Ce sont des sondes à relire : elles pointent une anomalie structurelle que
> l'exception a rendue confortable.

---

## 3. Mesure — 21 littéraux, cinq familles

Balayage des sept initialiseurs porteurs de `LocalizedStringKey` (`Text`,
`Label`, `Button`, `Toggle`, `TextField`, `SecureField`, `.navigationTitle`),
source masquée commentaires + chaînes, **interpolations exclues** :

| famille | sites | verdict |
|---|---|---|
| clés identifiants (`composer.socle.*`, `notifications.story.expired.*`) | 10 | **légitimes** — complètes dans les 7 langues |
| emoji / ponctuation / chiffres | 40 | **légitimes** — rien à traduire |
| exemple d'hôte (`gate.example.com`) | 1 | légitime, allowlisté avec sa raison |
| noms de marque (`Meeshy` ×2, `Meeshy Feed`, `Meeshy Chats`) | 4 | à figer |
| **données de démonstration** (`JP`, `Jean-Pierre`, `Hello! …`) | 3 | dont **le défaut** |

**Les interpolations sont hors périmètre, et c'est une décision.** `Text("@\(user.username)")`
est un `LocalizedStringKey` interpolé dont la clé est `"@%@"` : une expression de
MISE EN FORME, pas un texte qu'on traduit. Les inclure ferait passer la
population de 51 à 187 sites et noierait la règle sous 134 « violations » dont
aucune n'est le défaut visé.

Deux détails de mesure qui changent le résultat :

- **`Meeshy Feed` et `Meeshy Chats` étaient au catalogue SANS aucune des six
  locales requises** — des entrées françaises seules, qui rendaient donc la clé
  elle-même. Inoffensif à l'affichage, mais elles auraient été invisibles au
  cliquet si leur écran avait été épinglé.
- **Un comptage naïf de lettres classe `"\u{1F4AD}"` comme de la prose** : dans
  le texte source, l'échappement porte les lettres `u`, `F`, `A`, `D`. Les
  échappements se retirent AVANT de compter.

---

## 4. Le remède

### 4.1 Production — 7 sites, tous en remplacement de ligne

`Text(verbatim:)` prend une `String` et **ne consulte aucune table**. C'est le
remède précis, d'un mot, pour tout littéral qui ne doit pas voyager : le message
d'exemple étranger, le nom de la personne, ses initiales, le nom de marque.

Trois des cinq fichiers touchés sont dans la dette héritée de #4302
(`MeeshyApp` 1311, `OnboardingStepViews` 1386, `ConversationListView+Overlays`
1418) : **aucune ligne ajoutée**, uniquement des remplacements.

### 4.2 Catalogue — 6 clés retirées, 168 lignes, 0 insertion

Les clés que ces littéraux créaient silencieusement n'ont plus de producteur.
Première tentative : re-sérialiser le JSON — **27 016 lignes de diff pour six
clés supprimées**, et un réordonnancement complet. Annulée. La suppression est
faite au niveau des LIGNES, en équilibrant les accolades de chaque entrée : 168
suppressions, aucune insertion, le reste du fichier octet pour octet identique.

> **Un correctif de six clés qui produit un diff de 27 000 lignes n'est pas un
> correctif de six clés.** Reformater un fichier de données en passant est une
> modification à part entière, qu'aucune relecture ne peut plus séparer du fond.

### 4.3 L'exception qui n'a plus rien à excuser

`notAnInterfaceString` est vidée — **en supprimant la cause, pas l'exception**.
Vérifié avant : **0** autre clé symbolique du catalogue manque son français, donc
la vider ne peut pas rougir.

### 4.4 La garde

`LocalizedStringKeyLiteralGuardTests` : un littéral nu doit être **soit une clé**
(identifiant à segments, complète dans les langues livrées), **soit pas de la
prose**. De la prose n'a que deux issues, et la garde force à choisir :

| l'intention | l'écriture |
|---|---|
| c'est de l'interface, ça doit voyager | `String(localized:defaultValue:bundle:)` |
| c'est une donnée, ça ne doit PAS voyager | `Text(verbatim:)` |

Un troisième cas n'existe pas — et c'est son existence SILENCIEUSE qui a produit
le défaut. La règle 2 vérifie en plus que toute clé servie nue est **complète** :
c'est exactement le trou de `fullyLocalizedScreens`.

---

## 5. RED → GREEN, prouvé

Balayage des cinq fichiers touchés, avant et après :

```
AVANT (HEAD) : 7 violations de prose
   OnboardingStepViews.swift:999   "JP"
   OnboardingStepViews.swift:1002  "Jean-Pierre"
   OnboardingStepViews.swift:1004  "Hello! How are you doing today?"
   LoginView.swift:105             "Meeshy"
   MeeshyApp.swift:1233            "Meeshy"
   RootViewComponents.swift:401    "Meeshy Feed"
   ConversationListView+Overlays.swift:1045  "Meeshy Chats"
APRÈS        : 0
```

---

## 6. Bornes

| borne | exigence | mesure |
|---|---|---|
| le balayage voit le dépôt | > 400 fichiers | 604 |
| la population reste peuplée | > 30 sites | 51 |
| famille « clés » non vide | > 5 | 10 |
| famille « non-prose » non vide | > 20 | 40 |
| témoin — prose détectée | `Text("Bonjour tout le monde")` → site | ✓ |
| témoin — **le remède cesse d'être un site** | `Text(verbatim: …)` → 0 | ✓ |
| témoin — l'autre remède aussi | `Text(String(localized: …))` → 0 | ✓ |
| témoin — interpolation ignorée | `Text("@\(u)")` → 0 | ✓ |
| témoin — site en commentaire | → 0 | ✓ |
| témoin — `Jean-Pierre` n'est PAS une clé | le tiret seul ne fait pas un identifiant | ✓ |
| clés symboliques sans `fr` après retrait | 0 | 0 |
| accolades / parenthèses / crochets de la garde | équilibrés | 42/42 · 114/114 · 23/23 |
| lignes de la garde (budget 1100) | — | 304 |

**Le témoin qui compte est celui du REMÈDE.** Une garde qui interdit une écriture
sans reconnaître sa correction est une garde qu'on ne peut pas satisfaire.

**Note d'outillage** : `DeclarationBodyScanner.mask` ne comprend pas les chaînes
BRUTES Swift (`#"…"#`), dont la garde est pleine. Vérifié avant de s'en
inquiéter : **la production n'en contient aucune** (les trois occurrences de `#"`
sous `Meeshy/` sont des `#` adjacents à un guillemet, pas des délimiteurs). Le
masqueur est donc sûr sur les fichiers qu'il balaie — mais l'équilibre de la
garde elle-même a dû être vérifié par un contrôleur qui, lui, les comprend.

**Gate réel = CI `iOS Tests`.** Pas de chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 7. Ce qui change à l'écran

**Rien en français, en anglais, en arabe ni en italien** — ces locales servaient
déjà l'original en anglais. En **allemand, espagnol et portugais** : le message
d'exemple redevient anglais, donc DIFFÉRENT de la traduction affichée dessous. La
carte démontre à nouveau ce qu'elle prétend démontrer.

Les noms de marque et le nom de la personne ne changent nulle part : ils étaient
déjà traduits en eux-mêmes. Ce qui change, c'est qu'ils ne peuvent plus dériver.

---

## 8. Dimensions

| dimension | état |
|---|---|
| 8 · Expérience utilisateur | **mûre** — la démonstration redevient une démonstration |
| 9 · Compatibilité (7 langues) | **mûre** sur cette carte |
| 10 · Utilité | mûre — l'écran qui vend la feature la montre correctement |
| 11 · Maintenabilité | mûre — le vecteur invisible a un instrument |
| 13 · Complétude | **partielle** — les interpolations restent hors périmètre (assumé, § 3) |

---

## 9. Suites

1. **Les `LocalizedStringKey` interpolés** (134 sites) : décider s'ils relèvent
   d'une règle, et laquelle. Hors périmètre ici, sciemment.
2. **`translatedExample`** est un `switch` Swift à neuf branches, dont `zh` et
   `ja` que l'app ne propose pas en interface — donnée de démonstration en code,
   défendable, à trancher séparément (question ouverte dans #4313).
3. **#4308** — les 648 `defaultValue` divergents.
4. **92 fichiers** propres non encore épinglés à `fullyLocalizedScreens`.
5. **#4298** — le cube des stories et le swipe de bulle, au simulateur en arabe.
