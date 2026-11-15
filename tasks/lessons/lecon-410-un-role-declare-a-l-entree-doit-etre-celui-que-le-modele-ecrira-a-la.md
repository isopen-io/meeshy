## Leçon 410 — Un rôle déclaré à l'ENTRÉE doit être celui que le modèle écrira à la SORTIE, sinon ce n'est pas un rôle, c'est un vœu

**Le lot.** Même issue. La règle se résume naturellement à « la porte du rail
pose en premier plan, la rangée du document ouvre une page ». Écrite comme ça,
elle est fausse d'une moitié.

`addMediaObject` décide `isBackground` depuis TRENTE lignes plus bas, et depuis
toujours : `resolvedBackgroundMedia == nil && !hasSlideLevelBgImage`. Sur une
slide VIERGE, le premier média posé par le rail devient donc le fond — quoi que
la porte ait déclaré. Une règle qui aurait dit « premier plan » là aurait produit
un objet que le modèle marque `isBackground: true` : la rangée haute n'aurait pas
montré de tuile pour un média que la scène affiche PLEIN CADRE. Les deux se
seraient contredits sur le même objet, ce qui est pire que le défaut d'origine —
il est cohérent, lui.

> **Une règle de placement écrite en amont doit lire le MÊME prédicat que le
> site qui écrit réellement le champ, ses deux moitiés comprises.** Ici la
> seconde moitié — l'image de fond posée au niveau de la SLIDE (`slideImages`),
> pas un `mediaObject` — est celle qu'on oublie, parce qu'elle vit dans un autre
> tableau et ne s'appelle pas « fond ».

**Le témoin qui l'attrape** ne vérifie pas le rôle rendu : il vérifie que le
prédicat de l'appelant contient les DEUX moitiés de celui du modèle. C'est une
garde de source, et c'est le bon outil ici — la divergence est entre deux
écritures d'une même question, pas dans un résultat observable.
