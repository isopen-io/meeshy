# Plan Iteration-183i — CommunityLinksView : action VoiceOver « Copier le lien »

**Branche de travail** : `claude/laughing-thompson-uxy2f5`
**Base** : `main` HEAD `0b4875b`
**Piste** : iOS (`i`)

## Objectif

Rendre l'action « Copier le lien » de chaque rangée de `CommunityLinksView`
atteignable par VoiceOver. Le `Button` de copie est imbriqué dans le
`NavigationLink` de la rangée → absorbé comme un seul élément lien → jamais
exposé à VoiceOver (le lien d'invitation d'une communauté est incopiable en
VoiceOver).

## Étapes

1. [x] Sync `main` (resync branche depuis `origin/main`, suppression du commit
   Android stale déjà mergé #2128).
2. [x] Vérifier collision essaim : 178i `PeopleDiscoveryView` (#2114/#2115/#2129),
   `CrashReportSheet` (#2105/#2108/#2110/#2120/#2127), `VideoFullscreenPlayer`
   (#2106/#2109/#2116) déjà en vol → écartés. `CommunityLinksView` **vierge**.
   Numéro **183i** > plus haut en vol (182i `ReplyCell` #2133).
3. [x] Extraire `copyJoinLink(_:)` (SSOT copie + haptique).
4. [x] `Button` copie masqué VoiceOver ; rangée `.accessibilityElement(children:
   .combine)` + `.accessibilityHint` (destination) + `.accessibilityAction(named:
   "Copier le lien")` ré-exposant la copie.
5. [x] Réutiliser `common.copyLink` ; 1 clé neuve inline
   `community.links.row.open.a11y`.
6. [x] Analyse + plan + tracking.
7. [ ] Commit + push + PR ; gate CI `iOS Tests`.

## Contraintes

- 0 changement visuel, 0 logique produit, 0 test neuf, 1 fichier source.
- API iOS 14+/16+ sous plancher app → pas de garde de disponibilité.
- Auteur en conteneur Linux → build/VoiceOver validés en CI.
