## Leçon 444 — Un GUARD qui reprend le NOM de sa fonction vieillit avec lui, et sa branche neuve meurt en silence

**Le fait (2026-09-02, #4879).** Une photo posée par le rail de la scène
n'atteignait jamais une story. Cause, une ligne :

```swift
func syncPostMediaIntoSlides() {
    guard selectedFormat == .post else { return }
```

Le guard était JUSTE au jour de son écriture (#4038, « en Post, chaque média
ingéré devient SA slide ») : la seule porte média était alors la rangée du
document, qui n'existe qu'en Post. La porte du RAIL est arrivée après (#4724),
avec sa branche `.sceneRail` DANS cette fonction — et le rail vit sur la SCÈNE,
c'est-à-dire sur les stories et les réels. **La branche neuve était du code mort
exactement là où sa porte existe.**

> **Un guard qui reprend le nom de sa fonction ne se relit pas.** « Post » dans
> `syncPostMediaIntoSlides` a l'air d'une tautologie, pas d'une décision ; on le
> lit comme une redite du nom et on passe. C'est le même angle mort que le
> commentaire qui justifie ce qu'il décrit (§ 442) — le texte et le code
> s'accordent, donc rien n'appelle la question.

**La question qui l'attrape**, et elle se pose au moment où l'on AJOUTE : *ma
branche neuve vit-elle dans une fonction dont l'entrée l'exclut ?* Le grep utile
n'est pas « qui appelle cette fonction » mais **« que refuse sa première
ligne »**.

**Corollaire de correctif** : la condition s'ÉLARGIT, elle ne se retire pas. La
retirer ferait poser des slides à des médias arrivés autrement sur une story —
un changement que rien ne mesurait. `guard selectedFormat == .post || <il reste
un média du rail à placer>` dit exactement ce qu'on a établi, et rien de plus
(§ 441).
