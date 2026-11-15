## Leçon 375 — Une capacité déclarée à la mauvaise GRANULARITÉ produit un contrôle offert et inerte

**Contexte (2026-08-31, #4074).** Le menu d'appui long du canvas décide d'offrir
« Modifier » avec :

```swift
hasEditor: onItemDoubleTapped != nil
```

C'est une question de **CANVAS** — « l'hôte a-t-il câblé un éditeur ? » — posée
à la place d'une question par **OBJET** — « CET objet a-t-il un éditeur ? ».

L'atelier câble bien le rappel, puis fait :

```swift
case .sticker, .location: break
```

Donc le menu offrait « Modifier » sur un sticker, et le toucher ne produisait
**rien**. La loi 4 (« un contrôle sans effet est absent ») était correctement
écrite, correctement appliquée — sur la mauvaise unité.

> **La donnée manquante ne manquait pas.** `contextMenu(for: id, kind: kind)`
> reçoit la `kind` en paramètre. Ce qui manquait n'était pas une information,
> c'était de la CONSULTER.

### La divergence qui l'accompagnait

Les actions VoiceOver appliquaient DÉJÀ la restriction, mais en local :

```swift
if offered.contains(.edit), kind == .text || kind == .media {
```

pendant que le doc-comment de ce même site affirmait :

> « La MÊME règle que le menu long-press — annoncer à VoiceOver une action que
> le menu visuel ne sert pas rouvrirait le cul-de-sac par l'autre porte. »

Le raisonnement est juste et l'implémentation le contredit : VoiceOver taisait
« Modifier » sur un sticker, l'œil le voyait. **Une règle déclarée partagée et
écrite deux fois diverge sans que rien ne le voie** — chaque copie reste
cohérente avec elle-même, et le témoin qui les compare n'existe pas.

### La règle

1. Devant une capacité booléenne, demander **de quelle UNITÉ elle parle** :
   le canvas, l'objet, le kind, la slide ? Un `!= nil` sur un rappel parle
   toujours de l'HÔTE, jamais de l'objet.
2. Quand deux surfaces rendent le même geste (menu visuel / VoiceOver, iOS /
   Android, éditeur / lecteur), le témoin utile n'assertionne pas chacune
   séparément : **il les compare, cas par cas.** C'est le seul qui tombe sur une
   divergence.
3. Un hôte qui n'édite qu'une partie des kinds le **déclare**
   (`editableKinds`) plutôt que d'offrir une action qu'il ignore — le SDK ne
   peut pas le deviner (SDK Purity), et le deviner à sa place produit
   exactement le contrôle inerte qu'on ferme.

Voir leçon 369 (les cinq natures d'un contrôle qui ne fait pas ce qu'il
annonce), leçon 374 (le diagnostic écrit au-dessus d'une ligne encore fautive).
