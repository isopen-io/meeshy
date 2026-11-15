# Iteration-257i — les boucles qu'on n'a pas coupées sont celles qui disaient quelque chose

**Date** : 2026-08-29 · **Piste** : iOS (suffixe `i`)
**Surfaces** : écran de démarrage, connexion, indicateur de frappe, bulle d'appel,
badge « sauvegarde », deux formes d'onde d'enregistrement
**Base** : `main` HEAD `1fbd1f4d` · **Issue** : #4286
**Précédent direct** : 256i (sonde close par la négative)

---

## 1. Le défaut

L'app honore Reduce Motion sur ses animations **d'ambiance**, et bien :
`OnboardingAnimations.ambient()` fait passer ses dix-neuf boucles par un seul
point ; `ConversationAnimatedBackground.startAnimations()` sort tôt, ce qui rend
inertes ses treize `.animation(…, value: animate)` en aval.

**Sept boucles perpétuelles n'avaient aucun portillon** — et pas n'importe
lesquelles. Toutes disent un **STATUT** : « quelqu'un écrit », « ça enregistre »,
« ça sauvegarde », « l'appel est en cours ».

> C'est ce qui les a sauvées de l'audit : elles ressemblent à de l'information,
> pas à de la décoration, et **on ne coupe pas une information**. La règle qui
> les rattrape n'est donc pas « coupe le mouvement » mais « retire le VOYAGE,
> garde le SENS ».

| | |
|---|---|
| occurrences réelles de `repeatForever` (commentaires exclus) | 68 |
| gardées (portillon structurel, ou par le plan d'effets) | 61 |
| **non gardées** | **7** |

---

## 2. Le remède évident dégrade deux sites sur sept

Le portillon d'ambiance de l'onboarding se pose sur la valeur **cible** de
l'animation (`settleWithoutMotion`). Copié tel quel, il aurait rendu le produit
**pire** à deux endroits :

| site | cible de l'animation | ce que « se poser sur la cible » aurait donné |
|---|---|---|
| `BubbleCallNoticeView` | `opacity 0.3` | un point d'appel en cours **presque invisible** |
| les deux formes d'onde | hauteur **tirée au hasard** | figées à `minHeight` ⇒ un **trait plat**, qui se lit « cassé » |

D'où la valeur de repos choisie **par site**, et pas une fois pour toutes :

| site | bascule | repos | pourquoi |
|---|---|---|---|
| `SplashScreen`, `LoginView` | halo | ne démarre pas | décoratif : rien à préserver |
| `BubbleCallNoticeView` | `livePulse` | `false` ⇒ **opacité 1** | l'INVERSE de la cible |
| `TypingIndicatorBubble` | `animating` | `true` ⇒ pleine taille | ici le repos EST la cible |
| `BubbleEditedIndicator` | rotation | 0° | 360° ≡ 0° : rien à choisir |
| les deux formes d'onde | hauteur | `RestingWaveform` | ni la cible, ni le minimum |

Et chacun des quatre indicateurs de statut garde un porteur de sens **sans
mouvement**, vérifié un par un : `Text("Saving…")`, `Text(subtitle)`, le chrono
`recordingDuration`, et — en tenue plate, où aucun libellé n'existe — la
**présence** des trois points.

---

## 3. Ce que la garde peut et ne peut pas

La règle générale raisonne par **fichier**. Il le faut :
`ConversationAnimatedBackground` garde treize boucles par un seul `guard` en
amont, et une règle par déclaration les condamnerait toutes à tort.

Le prix de ce choix a été **mesuré, pas supposé**. Rejouée sur `origin/main`, la
règle par fichier attrape **5 des 7** défauts :

| manqué | pourquoi |
|---|---|
| `MeeshyApp` (`SplashScreen`) | le fichier injecte `meeshyForceReduceMotion` à la racine — une ligne qui n'apprend rien à `SplashScreen` |
| `MessageListViewController` (points de frappe) | le fichier appelle `MeeshyMotion.shouldReduce` **2 500 lignes plus haut**, pour un tout autre sujet |

> **Un proxy par fichier rend « gardé » dès qu'une AUTRE partie du fichier
> décide.** Ce n'est pas une faiblesse théorique : elle s'est produite dans
> l'itération même qui écrit la garde, et n'a été vue qu'en demandant à la
> mesure de rougir sur `main` — pas en la regardant verdir sur la branche.

D'où une **seconde** règle, qui épingle nommément les deux déclarations que la
première ne peut pas voir, par corps à accolades équilibrées
(`DeclarationBodyScanner`) et jamais par fenêtre devinée. Les deux règles
ensemble couvrent les sept sites.

---

## 4. Le zéro qui voulait dire « je n'ai pas regardé »

Le balayage par site a d'abord rendu **« 0 occurrence réelle »** sur tout le
dépôt. Cause : un `cd apps/ios/Meeshy` d'un appel d'outil précédent, encore
actif — le script cherchait `apps/ios/Meeshy` **sous** `apps/ios/Meeshy`, donc
nulle part.

C'est exactement le défaut consigné en 256i (le répertoire courant persiste), et
il est revenu **dans l'itération suivante**, sous une forme plus dangereuse : là
il produisait un chemin d'écriture faux (visible), ici un ensemble vide
(invisible). Le zéro était plausible — l'app venait de passer quatre sondes
d'accessibilité sans rien à corriger.

> **Ce qui l'a attrapé n'est pas la relecture du script, c'est la borne** :
> « combien de fichiers `.swift` cette racine voit-elle ? ». Toute mesure de
> cette itération porte désormais sa borne, et la garde en a deux
> (`> 10 fichiers bouclent`, `OnboardingAnimations.swift` doit être vu).

---

## 5. Ce qui a été écrit puis RETIRÉ avant le push

Un `@propertyWrapper` `DynamicProperty` disait les deux moitiés en une ligne
sans changer un seul site d'appel — la bonne abstraction, et elle était écrite.

Elle a été retirée pour une raison de **vérifiabilité**, pas de design : le
dépôt ne contient aucun `DynamicProperty`, la cible app compile sous
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (SE-0466), et ce plan de travail ne
peut pas type-checker du SwiftUI. Une CI iOS rouge bloque **toutes** les PR iOS.

Livré à la place : l'idiome déjà prouvé à neuf sites du dépôt. L'abstraction
part en #4289, à valider avec un compilateur.

> Deviner une isolation « par sécurité » est précisément l'erreur de 252i —
> huit erreurs de compilation pour un `nonisolated` de confort. La discipline
> qui en sort : **entre l'élégance non vérifiable et l'idiome prouvé, livrer
> l'idiome et ouvrir l'issue.**

Le même raisonnement a tranché un détail de vue : `BubbleEditedIndicator` est
`Equatable` par **synthèse**, et une propriété stockée `@Environment` (non
`Equatable`) l'aurait cassée. Ce site passe par `.meeshyAnimation` du SDK, qui
lit l'environnement lui-même — pendant que `BubbleCallNoticeView`, dont le `==`
est **manuel**, peut déclarer les deux propriétés sans risque. Deux vues
voisines, deux formes, une seule raison.

---

## 6. Preuve

Chaque règle rejouée en Python contre `origin/main` **et** contre la branche,
chaque mesure accompagnée d'une borne dont la réponse est connue :

| mesure | `origin/main` | branche |
|---|---|---|
| fichiers bouclant sans vocabulaire du mouvement | **5** | **0** |
| `struct SplashScreen` décide du mouvement | **non** | **oui** |
| `struct TypingIndicatorBubble` décide du mouvement | **non** | **oui** |
| producteurs de `RestingWaveform` | `[]` | `['ReduceMotion.swift']` |
| borne — fichiers `.swift` vus | 601 | 602 |
| borne — fichiers bouclant (règle exige `> 10`) | 21 | 21 |
| borne — `OnboardingAnimations.swift` vu | oui | oui |
| total de boucles (inchangé : rien n'a été supprimé) | 68 | 68 |

Équilibre des accolades comparé à `HEAD` sur les sept fichiers modifiés :
identique partout. Valeurs de `RestingWaveform` vérifiées hors Swift (7 hauteurs
distinctes, bornes tenues sur 64 index, stable, robuste aux index aberrants).

**Gate réel = CI `iOS Tests`.** Aucune chaîne d'outils Apple ici : la compile
n'est pas prouvée localement, et c'est dit plutôt que supposé.

---

## 7. Ce qui change à l'écran

**Rien**, pour qui n'a pas activé Reduce Motion — aucun pixel ne bouge, aucune
chaîne n'est ajoutée, le catalogue est intact.

Pour qui l'a activé :

| surface | avant | après |
|---|---|---|
| écran de démarrage | trois orbes pulsent sans fin | immobiles |
| connexion | halo pulsé | immobile |
| « X écrit… » | trois points qui rebondissent sans fin | trois points pleins, immobiles |
| appel en cours (bulle) | point clignotant | point **plein**, immobile |
| « Saving… » | glyphe en rotation perpétuelle | glyphe immobile sous son libellé |
| enregistrement (×2) | barres qui battent au hasard | forme d'onde figée, au relief conservé |

---

## 8. Dimensions

| dimension | état |
|---|---|
| 5 · Accessibilité | mûre — 0 boucle perpétuelle non gardée ; les 4 indicateurs de statut restent lisibles à l'arrêt |
| 8 · Expérience utilisateur | mûre — le repos choisi par site, jamais copié d'un voisin |
| 11 · Maintenabilité | **partielle** — la valeur de repos a un site unique, mais le PRÉDICAT reste écrit en quatre lignes à neuf endroits (#4289) |
| 13 · Complétude | **partielle** — la garde couvre les 7 sites par deux règles, mais ne peut pas exiger qu'un site FUTUR décide localement (§ 3) |

---

## 9. Suites

1. **#4288** — la préférence in-app est persistée, injectée, lue… et écrite par
   aucun écran. Les 24 fichiers qui ne lisent que la moitié système sont donc
   corrects **par accident**, et deviendront faux le jour où l'écran existera.
2. **#4289** — le `@propertyWrapper` retiré, à valider avec un compilateur.
3. Reste de 253i : la garde ne sait toujours pas exiger l'APPLICATION d'un
   vocabulaire, seulement interdire sa réécriture.
4. Carry-over : rangée méta du fil en Dynamic Type XXL (demande un simulateur) ;
   `AudioPostComposerView:46` et son commentaire factuellement faux ;
   `FeedView` sur `likePost`/`bookmarkPost`.
