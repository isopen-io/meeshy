## Leçon 384 — Au démontage, React a déjà détaché le `ref` quand un nettoyage PASSIF s'exécute

**Cycle #3911 (2026-09-01).** Le rapport de clôture d'une lecture audio/vidéo
part du nettoyage d'un `useEffect`. Il lisait la position par
`mediaRef.current.currentTime` — et rendait **0 à chaque démontage** : React
détache le `ref` de l'élément hôte AVANT d'exécuter les nettoyages passifs. La
garde « rien à dire » absorbait alors le rapport entier, si bien que le défaut
survivait sous une correction qui *a l'air* juste, **sans qu'aucune requête ne
parte**.

Le remède : **capturer l'ÉLÉMENT au montage**, dans le corps de l'effet, et le
passer au nettoyage. Le nœud reste lisible tant que le nettoyage du lecteur
(`removeAttribute('src')` + `load()`) n'a pas eu lieu — d'où la seconde règle du
même cycle : **le hook de rapport est déclaré EN PREMIER**, React exécutant les
nettoyages dans l'ordre de déclaration.

Le témoin qui l'attrape porte les DEUX assertions :

```
expect(corps.playPositionMs).toBe(7500);
expect(corps.playPositionMs).not.toBe(0);   // ← 0 est ce que rendait la « correction »
```

La seconde n'est pas redondante : elle nomme la valeur du défaut.
