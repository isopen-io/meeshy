/**
 * LA PORTE DE SORTIE D'UN PLEIN ÉCRAN TIENT DANS LE CADRE (#7040, #7037).
 *
 * Le patron existait déjà, appliqué à UNE surface : `check-thread-chrome.mjs`
 * assert `paintedLeft >= 0 && paintedRight <= viewportWidth` pour la capsule de
 * synchronisation du composeur. Aucun plein écran ne l'avait — et c'est
 * précisément là qu'il manquait. #7037 rapporte une croix à `x = −326,3` pour
 * un viewport de 402 pt : **entièrement hors de l'écran**, sur le plein écran
 * d'une pièce jointe. On ne pouvait fermer que par un geste, jamais par le
 * contrôle qui l'annonce.
 *
 * ── LE CADRE N'EST PAS LE VIEWPORT, C'EST LA ZONE SÛRE ──────────────────────
 *
 * Un bouton à `top: 12` tient dans le viewport et passe quand même SOUS la
 * barre d'état d'une coque à encoche — c'est le second défaut de ce lot
 * (`story.tsx`, la croix des états d'attente, posée à `top-3` sec pendant que
 * le chrome du chemin chargé lit `--safe-top` douze lignes plus bas). Une
 * SEULE mesure les couvre tous les deux, et elle retombe EXACTEMENT sur la
 * règle du viewport quand les encarts valent zéro — ce qui est le cas d'un
 * Chromium de bureau, donc des gates au repos.
 *
 * ── LE CADRE SE MESURE SUR LA BOÎTE VUE, LE PLANCHER SUR LA CIBLE TOUCHÉE ───
 *
 * Deux questions, deux boîtes. **Où l'utilisateur VOIT-il le contrôle ?** —
 * c'est la boîte de bordure, celle qu'il vise, et c'est elle qui doit tenir
 * dans la zone sûre. **Qu'est-ce que son doigt ATTEINT ?** — c'est la cible,
 * plus large : `tap-target-34` (`app.css`) dessine 34 px et pose un `::after`
 * à `inset: -5px` qui porte la prise à 44. Mesurer le plancher sur la boîte de
 * bordure ferait rougir la croix des visionneuses, qui est CORRECTE — c'est
 * exactement le « gate qui crie » qu'on ne veut pas fabriquer en corrigeant un
 * gate aveugle. `check-thread-chrome.mjs` fait déjà cette distinction pour sa
 * capsule (sa boîte pour la taille, sa CAPSULE PEINTE pour le cadre).
 *
 * ── UN CONTRÔLE ABSENT EST UN MANQUEMENT ────────────────────────────────────
 *
 * `rect: null` rend un manquement, jamais un silence. C'est exactement le motif
 * que le lot corrige dans `reach-at-rest.mjs` : ce qu'une mesure ne sait pas
 * juger, elle le SIGNALE — elle ne le laisse pas tomber du relevé.
 */

const chiffre = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');

/** Les manquements de confinement — `[]` vaut « confiné ». Pur, sans DOM. */
export const confinement = ({ rect, cible, cadre, sur, plancher = 44 }) => {
  if (rect === null || rect === undefined) return ['absent du document'];

  const droite = cadre.largeur - sur.droite;
  const bas = cadre.hauteur - sur.bas;
  const manquements = [];

  if (rect.left < sur.gauche) manquements.push(`son bord gauche ${chiffre(rect.left)} sort du cadre (min ${chiffre(sur.gauche)})`);
  if (rect.top < sur.haut) manquements.push(`son haut ${chiffre(rect.top)} passe sous la zone sûre (min ${chiffre(sur.haut)})`);
  if (rect.right > droite) manquements.push(`son bord droit ${chiffre(rect.right)} dépasse ${chiffre(droite)}`);
  if (rect.bottom > bas) manquements.push(`son bas ${chiffre(rect.bottom)} dépasse ${chiffre(bas)}`);
  const hauteurCible = cible?.height ?? rect.height;
  if (hauteurCible < plancher) manquements.push(`sa cible fait ${chiffre(hauteurCible)} de haut (< ${plancher})`);

  return manquements;
};

/**
 * LES FAITS, DANS LA PAGE : le rectangle du contrôle, le cadre et les encarts
 * sûrs tels que l'application les DÉCLARE (`--safe-top` / `--safe-bottom`,
 * posées sur `:root` par `app.css`) — jamais `env()` lu en direct, qui vaut
 * zéro partout ailleurs que sur une coque.
 */
export const mesurerConfinement = (page, selecteur) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const style = getComputedStyle(document.documentElement);
    const encart = (nom) => Number.parseFloat(style.getPropertyValue(nom)) || 0;
    const r = el === null ? null : el.getBoundingClientRect();
    /* La CIBLE : la boîte de bordure élargie du débord d'un `::after` de prise
       (`tap-target-*`). Aucune API ne rend le rectangle d'un pseudo-élément ;
       ses encarts UTILISÉS, eux, se lisent. `Math.max` garantit qu'une lecture
       qui échoue (`auto`, pas de `content`) retombe sur la boîte de bordure et
       ne fabrique jamais une cible plus grande qu'elle ne l'est. */
    const cibleDe = (node, boite) => {
      const apres = getComputedStyle(node, '::after');
      if (apres.content === 'none' || apres.position !== 'absolute') return boite.height;
      const debord = (Number.parseFloat(apres.top) || 0) + (Number.parseFloat(apres.bottom) || 0);
      return Math.max(boite.height, boite.height - debord);
    };
    return {
      rect: r === null ? null : { top: r.top, left: r.left, right: r.right, bottom: r.bottom, height: r.height, width: r.width },
      cible: r === null ? null : { height: cibleDe(el, r) },
      cadre: { largeur: innerWidth, hauteur: innerHeight },
      sur: { haut: encart('--safe-top'), bas: encart('--safe-bottom'), gauche: 0, droite: 0 },
    };
  }, selecteur);

/**
 * LA MESURE ET SON VERDICT, en une phrase lisible au journal d'un gate.
 * Rend `{ ok, message }` — le gate n'a qu'à le remettre à son `check`/`expect`.
 */
export const confinementDe = async (page, selecteur, { nom, plancher } = {}) => {
  const faits = await mesurerConfinement(page, selecteur);
  const manquements = confinement({ ...faits, ...(plancher === undefined ? {} : { plancher }) });
  const quoi = nom ?? selecteur;
  return {
    ok: manquements.length === 0,
    message:
      manquements.length === 0
        ? `${quoi} tient dans le cadre (${chiffre(faits.rect?.left ?? 0)} → ${chiffre(faits.rect?.right ?? 0)} sur ${faits.cadre.largeur}, haut ${chiffre(faits.rect?.top ?? 0)})`
        : `${quoi} ne tient pas dans le cadre : ${manquements.join(' ; ')}`,
  };
};
