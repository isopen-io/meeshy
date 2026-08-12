# iOS UI/UX — Iteration 223i

**Date** : 2026-07-26
**Surface** : `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift`,
`VoiceProfileWizardView.swift`, `Meeshy/Localizable.xcstrings`
**Axes** : localisation / typographie française · intégration plateforme (HIG)
**Base** : `main` HEAD `ccb4ad974` · Branche `claude/quirky-curie-2pvzn1`

## Contexte

Piste (b) du pointeur 221i : « `VoiceProfileManageView.addSamplesSheet` — titre
rendu comme un `Text` du corps alors qu'il vit dans un `NavigationStack` sans
`navigationTitle` (change le visuel → itération dédiée) ». En auditant la
surface pour ce correctif, un **défaut plus lourd** est apparu.

Numéro **223i** : `list_pull_requests` (open) montre 8 PR dont une **222i** en vol
(#2362, formulaire de parrainage) → 223i est strictement supérieur au plus haut
observé. `VoiceProfileManageView` **absent de toute PR ouverte**
(`search_pull_requests` → 0 résultat) → 0 collision.

## Défaut A — toute la surface « profil vocal » est écrite SANS ACCENTS

`Localizable.xcstrings` déclare **`"sourceLanguage": "fr"`** : le français n'est
pas une traduction en attente, c'est **la langue source**, donc du texte
**expédié et lu**. Or les 17 chaînes françaises de cette surface sont écrites
sans accents :

| clé | avant | après |
|---|---|---|
| `voice.profile.quality` | Qualite | **Qualité** |
| `voice.profile.totalDuration` | Duree totale | **Durée totale** |
| `voice.profile.samples` | Echantillons | **Échantillons** |
| `voice.profile.createdAt` | Cree le | **Créé le** |
| `voice.profile.lastUsed` | Derniere utilisation | **Dernière utilisation** |
| `voice.profile.status.failed.label` | Echec | **Échec** |
| `voice.profile.status.expired.label` | Expire | **Expiré** |
| `voice.profile.status.ready.description` | …est pret a l'emploi | …est **prêt à** l'emploi |
| `voice.profile.status.failed.description` | L'analyse a echoue, veuillez reessayer | L'analyse a **échoué**, veuillez **réessayer** |
| `voice.profile.deleteAlert.message` | …irreversible… donnees… supprimees… conformement… | …**irréversible**… **données**… **supprimées**… **conformément**… |
| … | (17 clés au total) | |

Ce n'est pas cosmétique à la marge : `voice.profile.status.*` alimente les
**badges d'état** du profil (« Échec », « Expiré »), et
`voice.profile.deleteAlert.message` est le texte d'une **alerte de suppression
RGPD** — l'endroit de l'app où la langue doit inspirer le plus de confiance.

### Correctif

Les 17 valeurs **`fr`** du catalogue corrigées, **et** les `defaultValue` des
sources alignés dessus. Les deux, parce qu'un `defaultValue` désaccordé est une
**seconde copie silencieuse** de la chaîne : c'est elle qui s'affiche si l'entrée
de catalogue disparaît, et c'est elle que le prochain développeur recopie vers un
nouveau site d'appel. `VoiceProfileWizardView` partage 3 de ces clés → mis à jour
aussi.

**0 clé touchée** (seules les valeurs changent), **0 autre locale touchée**, **0
réordonnancement** : le diff du catalogue ne contient **que** des lignes
`"value"` (vérifié : `grep -cv '"value"'` sur le diff = **0**).

## Défaut B — le titre de la feuille « Ajouter des échantillons » ignore sa barre

`addSamplesSheet` vit dans un `NavigationStack` **dont la barre est déjà
visible** (elle porte le bouton « Fermer » en `navigationBarTrailing`), mais son
**emplacement de titre restait vide** pendant qu'un `Text` du corps jouait le rôle
du titre, à `MeeshyFont.relative(20, weight: .bold, design: .rounded)` + un
`.padding(.top, 16)` fait main.

Conséquences : le titre **n'a pas le trait `header`** que VoiceOver attend d'un
titre d'écran (le rotor « en-têtes » ne le trouve pas) ; aux grandes tailles
Dynamic Type il **pousse l'enregistreur vers le bas** au lieu de se tronquer comme
le ferait un titre de barre ; et la feuille ne ressemble à aucune autre feuille de
l'app.

### Correctif

`.navigationTitle(…)` + `.navigationBarTitleDisplayMode(.inline)` sur le
conteneur, `Text` du corps supprimé. **Même clé** (`voice.profile.addSamples`) →
**0 clé neuve**. Aucune chrome nouvelle n'apparaît : la barre était déjà là.

## Tests

`VoiceProfileFrenchTypographyTests` (neuf, 3 tests) :
1. le catalogue expédie les 17 chaînes **accentuées** (lecture JSON réelle) ;
2. les `defaultValue` des 2 sources **concordent** avec le catalogue — c'est ce
   test qui empêche la seconde copie de re-diverger ;
3. la feuille titre **sa barre** et n'a **plus** de `Text` titre (deux titres
   seraient annoncés deux fois par VoiceOver).

## Vérification

Pas de toolchain Swift (Linux) → assertions rejouées déterministiquement hors
Xcode : 17/17 valeurs de catalogue, 0 divergence de `defaultValue` sur les 2
sources, `navigationTitle` présent / `Text` absent, tokenizer 0/0/0, catalogue
JSON valide (1 375 clés, inchangé). Gate réel = CI `iOS Tests`.

## Portée

**2 fichiers de production** (+11/−5 dont 7 lignes de commentaire), **34 lignes de
catalogue** (17 valeurs `fr`), 1 fichier de test neuf. **0 clé i18n neuve / 0 clé
renommée / 0 logique / 0 réseau / 0 autre locale.** Seul changement visuel : le
titre de la feuille passe du corps à la barre de navigation.

## Piste 224i+

1. **Balayage « français sans accents » hors profil vocal** : le défaut n'a
   aucune raison d'être limité à cette surface. Un balayage du catalogue sur les
   valeurs `fr` (mots contenant `e` là où `é/è/ê` est attendu) donnerait la liste
   exacte — à traiter **par surface**, pas d'un bloc, pour rester relisible.
2. **Arriéré de catalogue** : 1 724 des 2 586 clés absentes (mesuré 220i).
3. Pistes 219i–221i toujours ouvertes : audit Dark Mode généralisé,
   `sensoryFeedback` (iOS 17+), `.contentShape` de `ContactRow`, nom HIG de
   l'extension de partage (**choix produit** — ne pas trancher seul).
