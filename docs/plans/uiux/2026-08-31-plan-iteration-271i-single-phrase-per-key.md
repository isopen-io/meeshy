# Plan — Iteration-271i · Une clé de localisation porte UNE phrase

**Base** : `main` HEAD `09d94823` · **Branche** : `claude/intelligent-noether-u8iuu6`
**Issue** : #4540 · **Analyse** : `docs/analyses/uiux/2026-08-31-iteration-271i-single-phrase-per-key.md`

---

## Point de départ

Suivi de 270i (#4364) : vider le cliquet i18n, en commençant par la sous-famille
la plus grave — les `defaultValue` écrits en **anglais** dans un catalogue de
langue source française, donc servis en anglais aux **sept** locales.

## Ce que la mesure a rendu

Douze clés anglaises. La première ouverte, `feed.media.item`, portait un défaut
d'une autre nature : **cinq sites, cinq phrases, une clé** — la position de la
tuile gravée dans le littéral. Absente du catalogue, la collision est invisible ;
l'y entrer, ce que le cliquet demande, aurait fait annoncer « Média 1 sur 7 » sur
les cinq images d'une galerie.

Balayage complet des 1 337 sources iOS, replis **normalisés** (interpolations →
jeton) : **5 clés** à replis divergents, dont **une seule** est un défaut. Les
quatre autres sont soit la même phrase écrite avec deux noms de variable, soit
deux bundles avec deux catalogues, soit un repli mort face à un catalogue qui
tranche. C'est ce qui fixe la forme du témoin : comparer des **phrases**, pas des
littéraux, et le borner à la cible **app**.

## Étapes

1. **Mesurer** — miroir Python du scanner de `LocalizationConsistencyTests`,
   validé sur le point fixe du cliquet (81) avant toute modification.
2. **Extraire** — le scanner sort de `LocalizationConsistencyTests` (1203 l.,
   hors budget) vers `LocalizedCallScanner`, sans une ligne réécrite. Le fichier
   repasse à 1069 lignes ; deux témoins lisent désormais la même syntaxe.
3. **Livrer le correctif** — `FeedMediaAccessibility` (site unique),
   `feedGalleryTile` (un modificateur pour quatorze tuiles), la position en
   argument, la tuile « +N » sur `a11y.post.media.more`, le média unique nommé.
4. **Catalogue** — `feed.media.item` dans les sept locales, forme copiée de
   `story.viewer.a11y.position`, vocabulaire copié de `a11y.post.media.more`.
   Insertion textuelle derrière son entrée sœur : +47 / −0.
5. **Garder** — `LocalizedKeySinglePhraseGuardTests`, vérifié **RED sur l'état
   d'avant** (1 violation, exactement la bonne) et GREEN après, avec sa propre
   forme éprouvée sur sources synthétiques.
6. **Épingler** — `FeedPostCard+Media.swift` rejoint `fullyLocalizedScreens`
   (246 → 247) ; cliquet re-pinné 81 → 79.

## Mesures

| | avant | après |
|---|---|---|
| cliquet i18n (`backlogCeiling`) | 81 | **79** |
| écrans épinglés | 246 | **247** |
| clés à replis divergents (cible app) | **1** | **0** |
| clés du catalogue app | 3 433 | 3 434 |
| `LocalizationConsistencyTests.swift` | 1203 l. | **1069 l.** |
| `mediaPreview` | 145 l. | **91 l.** |

## Gate

CI `iOS Tests` (opt-in : le sujet du commit porte « run test »). Tout ce qui est
vérifiable hors chaîne Apple l'a été par le miroir — détail au § 5 de l'analyse.

## Suites ouvertes

#4328 (79 clés, dont dix anglaises restantes et trois qui demandent une entrée
plurielle), `contacts.phonebook.*`, l'extension du témoin de phrase unique aux
extensions et au SDK (groupé par catalogue résolu), #4319, #4298.
