# Itération 277 — Le contrat de Prisme atteste enfin l'APPLICATION de la réduction de langue (3 miroirs)

## État actuel

La résolution du Prisme sur l'aperçu de dernier message est gardée par un
**contrat de vecteurs cross-plateforme** — `prism-preview.vectors.json`, rejoué
à l'identique par les trois miroirs que `CLAUDE.md` nomme source de vérité :

| plateforme | résolveur |
|---|---|
| TypeScript (SSOT) | `resolveLastMessagePreview` (`packages/shared/utils/conversation-helpers.ts`) |
| Swift (iOS/SDK) | `MeeshyConversation.resolvedLastMessagePreview` (`CoreModels.swift`) |
| Kotlin (Android) | `resolveLastMessagePreview` (`LastMessagePreviewResolver.kt`) |

Les trois comparent TROIS jeux de jetons de langue — les langues du lecteur, la
langue d'origine, et les clés de la carte de traductions — après les avoir
canonicalisés par le même SSOT : `normalizeLanguageForDedup` (TS),
`MeeshyUser.normalizeLanguageCode` (Swift), `LanguageCodeNormalizer.normalizeForDedup`
(Kotlin). Cette canonicalisation **replie la casse, strippe la région ET réduit
les codes ISO 639-3 / 639-2 et les alias ISO 639-1 dépréciés** vers leur code
canonique (`fra`→`fr`, `deu`→`de`, `iw`→`he`, `in`→`id`).

## Problèmes identifiés

Le contrat de vecteurs (22 cas) couvrait le repliage de CASSE (`FR`, clé `FR`,
origine `FR`) et le strip de RÉGION (`en-US`, `pt-BR`, `fr-FR`), mais **aucun cas
n'exerçait la RÉDUCTION DE TABLE au point de comparaison** : pas un seul vecteur
ne présentait une clé, une langue de lecteur ou une langue d'origine sous sa
forme ISO 639-3 (`fra`) ou son alias déprécié (`iw`).

Or les TABLES de réduction sont bien gardées équivalentes sur les trois
plateformes (`language-normalize-mirror-parity.test.ts`, itération 266) — mais
la parité des tables n'atteste que les DONNÉES, jamais leur APPLICATION. Le
contrat qui vérifie que chaque miroir APPELLE réellement la réduction, sur les
trois jeux de jetons, avant de matcher les clés, n'exerçait aucune entrée
réductible. C'est la distinction fine que le plan de l'itération 276 avait
explicitement laissée en « amélioration future » :

> « la CANONICALISATION au point de comparaison — les trois normalisent avant de
> matcher les clés de traduction ; leur ÉQUIVALENCE (mêmes règles de
> casse/région) n'est pas attestée bout à bout. »

## Causes racines

Un résolveur de miroir pourrait plier la casse et stripper la région
(idiome `code.lowercased().split("-")[0]`) sans jamais consulter la table de
réduction — une dérive plausible, puisque casse et région se traitent « à la
main » alors que la réduction exige un appel au SSOT. Sous ce défaut, un lecteur
`fr` ne matcherait pas une clé `fra`, ou un lecteur Android sur locale hébraïque
(qui émet `iw`, cf. `LEGACY_ISO_639_1`) ne matcherait pas une traduction `he` —
retombant sur l'original non traduit. C'est la violation exacte du Prisme (règle
#1) que la classe de bug du cycle 118 (Android jetant `lastMessageTranslations`)
a déjà infligée en production, et qu'aucun témoin ne rejouait ici.

## Impact métier

L'égalité de la ligne de liste entre les trois apps est une garantie produit :
un même compte doit lire le MÊME texte quel que soit le client. Une divergence
d'application de la réduction ferait servir, pour un message dont la clé de
traduction est stockée sous une forme 639-3 ou dont la langue du lecteur/origine
arrive sous un alias déprécié, une traduction sur un client et l'original brut
sur un autre — sans qu'aucune CI ne rougisse.

## Impact technique

Aucun sur la production : ajout de vecteurs de test uniquement, zéro ligne de
code de production modifiée. Les trois plateformes CHARGENT déjà ces vecteurs ;
la conformité de chacune est désormais exigée en CI.

## Évaluation du risque

- Correctif : **NUL** — 8 entrées ajoutées à un fichier de vecteurs JSON, aucune
  production touchée.
- Contrat : **FAIBLE** — les 8 vecteurs ont été confirmés produire un résultat
  IDENTIQUE sur les trois miroirs par lecture de source : chaque entrée choisie
  atteint le chemin DÉFINI de `normalizeLanguageCode` (repli jamais pris), et le
  chemin défini est algorithmiquement identique sur TS/Swift/Kotlin (mêmes
  gardes de longueur, mêmes tables déjà gardées équivalentes). Aucun vecteur
  n'approche le repli, où Swift (`$0.lowercased()` verbatim) et TS/Kotlin
  (sous-tag primaire) divergent sur les codes IRRÉDUCTIBLES tagués région — cette
  divergence-là est un suivi distinct (voir plan), pas encodée ici.

## Améliorations proposées

Ajouter 8 vecteurs à `prism-preview.vectors.json` couvrant l'application de la
réduction sur les trois jeux de jetons :

1. clé ISO 639-3 (`fra`) réduite au rang lecteur (`fr`) ;
2. langue LECTEUR ISO 639-3 (`fra`) réduite contre une clé (`fr`) ;
3. langue LECTEUR ISO 639-3 (`spa`) réduite contre une clé (`es`) ;
4. langue d'ORIGINE ISO 639-3 (`deu`) concourant à son rang réduit (`de`) ;
5. alias déprécié en CLÉ (`iw`) réduit au rang lecteur (`he`) ;
6. alias déprécié en LANGUE LECTEUR (`iw`) réduit contre une clé (`he`) ;
7. clé à séparateur underscore (`fr_FR`) réduite au rang normalisé (`fr`) ;
8. clé à tag de script (`zh-Hant-HK`) réduite au rang lecteur (`zh`).

## Bénéfices attendus

- Le trou d'itération 276 est fermé : l'APPLICATION de la réduction de langue —
  et pas seulement l'égalité des tables — est désormais rejouée sur les trois
  miroirs par un contrat machine.
- Une future dérive d'un client (repliage sans réduction, réduction appliquée à
  un jeu de jetons mais pas aux deux autres) fait rougir SA suite en CI.

## Complexité d'implémentation

Faible : 8 entrées dans un fichier de vecteurs existant, consommé sans
modification par les trois harnais.

## Critères de validation

- Les 30 vecteurs passent au VERT côté TS (`prism-preview.vectors.test.ts`).
- Suite `packages/shared` complète verte (113 fichiers / 2699 tests).
- Contre-épreuve (PROUVÉE) : sous une mutation TS de `normalizeLanguageForDedup`
  en repliage-casse-et-région SANS réduction de table, 6 des 8 nouveaux vecteurs
  tombent (les 2 à séparateur/script, `fr_FR` et `zh-Hant-HK`, restent verts sous
  cette mutation précise — ils gardent le strip de séparateur, un sous-invariant
  distinct). La contre-épreuve nomme donc exactement le défaut que chaque vecteur
  attrape.
- Chaque valeur attendue confirmée empiriquement contre le SSOT TS avant encodage.
