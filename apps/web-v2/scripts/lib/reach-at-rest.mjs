/**
 * L'ATTEIGNABILITÉ AU REPOS, ÉCRITE UNE FOIS — ET QUI NE PERD PLUS CE QU'ELLE
 * NE SAIT PAS MESURER (#7040).
 *
 * Sept gates de peau portaient une copie de ce relevé : « chaque contrôle et
 * chaque texte VISIBLE retombe sur lui-même à son centre (`elementFromPoint`)
 * et fait au moins 44 px de haut ». Six mot pour mot, la septième
 * (`check-notifications.mjs`) par deux prédicats en ligne. Toutes ouvraient sur
 * la même ligne :
 *
 *     const visible = (r) => r.width > 0 && r.height > 0
 *       && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
 *     const measure = (el) => { if (!visible(el.getBoundingClientRect())) return []; … };
 *
 * **`visible()` est un FILTRE, pas une assertion.** Un contrôle dont le centre
 * tombe à `x = −326` rend un tableau VIDE : il ne casse rien, il n'apparaît
 * dans aucun relevé, et le gate reste **vert avec un contrôle de moins**. Les
 * assertions en aval (`controls.length >= N && blocked.length === 0`) ne
 * peuvent pas le voir — le plancher `>= N` est le seul rempart, et il est posé
 * bien en dessous du nombre réel.
 *
 * C'est exactement le défaut qu'il fallait attraper. #7037 (iOS) rapporte un
 * bouton « Fermer » à `x = −326,3` pour un viewport de 402 pt — et le gate qui
 * devrait le dire l'excluait par construction.
 *
 * ── LE CŒUR DU LOT EST LE TRI, PAS LE SIGNALEMENT ───────────────────────────
 *
 * Un prédicat qui crie dès qu'une boîte sort du cadre est aussi inutile qu'un
 * prédicat aveugle. Trois familles sont LÉGITIMEMENT hors cadre :
 *
 *  · la page VOISINE d'un carrousel, à `translateX(±100%)`, montée pour la
 *    fenêtre de rendu et écrêtée par la piste ;
 *  · la rangée sous la ligne de flottaison d'un scroller — mesurée ailleurs,
 *    amenée au milieu de l'écran (`reachScrolled`, `reachRows`, `reachCards`) ;
 *  · ce que l'auteur DÉCLARE hors scène : `inert`, `aria-hidden`, `hidden`,
 *    `visibility:hidden`.
 *
 * Elles s'écartent donc par une raison ÉCRITE et COMPTÉE (`exclus`), jamais par
 * un tableau vide — qui ne distingue pas « écarté à bon droit » de « perdu ».
 * `resumeExclusions()` remet ce décompte aux gates pour qu'il figure dans leur
 * journal : **c'est le silence, pas le filtre, qui a coûté le défaut.**
 *
 * ── POURQUOI LA DÉCISION EST ICI ET NON DANS LA PAGE ────────────────────────
 *
 * La page ne remonte que des FAITS — la boîte, les cadres qui l'écrêtent, ce
 * que `elementFromPoint` a touché, ce que l'auteur a déclaré. Le VERDICT est
 * pur, en node, donc jouable sans navigateur : `reach-at-rest.test.ts` le
 * rougit sur l'arithmétique exacte de #7037. Une règle recopiée dans sept
 * `page.evaluate` n'aurait, elle, aucun témoin possible — c'est la forme même
 * du défaut qu'on corrige.
 *
 * Même raison d'être que `browser.mjs` et `gate-server.mjs` dans ce dossier :
 * une chose écrite à plusieurs endroits finit par être écrite de plusieurs
 * façons, et c'est l'endroit qu'on ne teste pas qui porte la mauvaise.
 */

/** Ce que l'auteur peut DÉCLARER pour sortir un élément de la scène. */
const DECLARATIONS = [
  ['[inert]', 'inert'],
  ['[aria-hidden="true"]', 'aria-hidden'],
  ['[hidden]', 'hidden'],
];

const nombre = (v) => v.toFixed(1).replace('.', ',');

/**
 * UN ÉCRÊTEUR N'EXCUSE QUE CE QU'UN GESTE RAMÈNE.
 *
 * C'est la borne que ce lot a dû poser après avoir vu sa propre mutation
 * BLANCHIE : un contrôle d'en-tête poussé à `translateX(-1000px)` — le fait
 * exact de #7037 — sortait du `DIV.flex` qui le contient, et cet écrêteur
 * l'écartait poliment du relevé. Le gate rougissait quand même, mais par le
 * PLANCHER de comptage (1 mesuré au lieu de 2) : le vieux rempart, pas la
 * mesure. **Un conteneur qui écrête aurait suffi à blanchir n'importe quel
 * défaut.**
 *
 * La question n'est donc pas « est-il hors du cadre de son conteneur ? » mais
 * « un GESTE l'y ramène-t-il ? » — et cela se MESURE : le conteneur défile-t-il
 * sur l'axe par lequel l'élément sort ? Une rangée sous la ligne de flottaison
 * de `#contenu` (qui défile en y) est ramenée par un défilement — c'est
 * d'ailleurs ce que font `reachScrolled`, `reachRows` et `reachCards`. Une
 * capsule au-delà du bord droit d'un rail horizontal l'est aussi. Un contrôle
 * poussé hors d'une boîte de troncature, non : il est PERDU, et il se juge
 * comme n'importe quel élément posé — par le cadre de l'écran.
 *
 * Corollaire assumé : un carrousel qui déplace ses pages par `transform` ne
 * crée AUCUN défilement, donc ses pages voisines ne sont pas excusées par cette
 * voie. Elles doivent se DÉCLARER (`aria-hidden="true"`, `inert`) — ce qui est
 * la bonne chose à faire pour un lecteur d'écran de toute façon, et ce que « les
 * exclure explicitement, jamais par accident » veut dire.
 */
const ecarte = (e, x, y) => {
  const sortEnX = !(x > e.left && x < e.right);
  const sortEnY = !(y > e.top && y < e.bottom);
  if (!sortEnX && !sortEnY) return false;
  return (!sortEnX || e.defileX) && (!sortEnY || e.defileY);
};

/**
 * LE VERDICT D'UN FAIT — pur, sans DOM.
 *
 * L'ordre compte : ce qui est DÉCLARÉ prime (c'est une intention, pas un
 * accident), puis une boîte sans surface (dont le centre ne veut rien dire),
 * puis l'écrêtage par un conteneur QUI DÉFILE, et seulement alors le cadre de
 * l'écran.
 */
export const classerAtteinte = (fait) => {
  const { nom, left, top, width, height, toucher, par, declare, ecrans, cadre } = fait;

  if (declare !== null && declare !== undefined) return { exclu: true, nom, raison: declare };
  if (width <= 0 || height <= 0) return { exclu: true, nom, raison: 'boîte vide' };

  const x = left + width / 2;
  const y = top + height / 2;

  const ecran = ecrans.find((e) => ecarte(e, x, y));
  if (ecran !== undefined) return { exclu: true, nom, raison: `écrêté par ${ecran.nom}` };

  if (!(x > 0 && x < cadre.largeur && y > 0 && y < cadre.hauteur)) {
    return { exclu: false, nom, ok: false, par: `hors du cadre (${nombre(x)} ; ${nombre(y)})`, hauteur: height, raison: 'hors viewport' };
  }

  const ok = toucher === 'lui-même';
  return { exclu: false, nom, ok, par, hauteur: height, raison: ok ? 'atteint' : 'volé' };
};

/** Le décompte des écartés, groupé par raison — destiné au JOURNAL du gate. */
export const resumeExclusions = ({ exclus }) => {
  if (exclus.length === 0) return '0 écarté';
  const parRaison = new Map();
  for (const e of exclus) parRaison.set(e.raison, (parRaison.get(e.raison) ?? 0) + 1);
  const detail = [...parRaison.entries()].map(([raison, n]) => `${n} ${raison}`).join(', ');
  return `${exclus.length} écartés : ${detail}`;
};

/**
 * LE RELEVÉ DES FAITS, DANS LA PAGE.
 *
 * `porteeTextes` (optionnelle) élargit la cible du toucher des TEXTES, et
 * d'eux seuls : `check-notifications` juge qu'un texte de rangée est atteint
 * dès que le point retombe sur SA RANGÉE (`[data-notification]`), pas sur le
 * `<span>` exact — une question différente de celle des autres gates, donc un
 * paramètre et non une copie. Un CONTRÔLE, lui, se juge toujours sur lui-même :
 * une portée qui vaudrait pour les deux familles prendrait en silence un
 * contrôle hors de toute rangée pour un contrôle volé.
 */
const relever = (page, { controls, texts, porteeTextes }) =>
  page.evaluate(
    ([controlsSel, textsSel, porteeSel, declarations]) => {
      const nomDe = (el) => {
        const id = el.id === '' ? '' : `#${el.id}`;
        const classe = el.classList.length === 0 ? '' : `.${el.classList[0]}`;
        return `${el.tagName}${id}${classe}`;
      };

      /* Les cadres qui ÉCRÊTENT réellement l'élément, et sur quel axe un GESTE
         y ramène ce qui en sort. La remontée s'arrête à `body` : `html`/`body`
         en `overflow:hidden` est la règle de l'app, et les compter ici
         ré-avalerait précisément le hors-viewport qu'on cherche — le cadre de
         l'écran est jugé à part, et c'est sa seule juridiction. */
      const ecransDe = (el) => {
        const out = [];
        for (let p = el.parentElement; p !== null && p !== document.body; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
          const r = p.getBoundingClientRect();
          out.push({
            nom: nomDe(p),
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            defileX: p.scrollWidth > p.clientWidth + 1,
            defileY: p.scrollHeight > p.clientHeight + 1,
          });
        }
        return out;
      };

      const declareDe = (el) => {
        for (const [selecteur, raison] of declarations) if (el.closest(selecteur) !== null) return raison;
        const visibilite = getComputedStyle(el).visibility;
        return visibilite === 'hidden' || visibilite === 'collapse' ? `visibility:${visibilite}` : null;
      };

      const fait = (el, porteeDuToucher) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        /* `elementFromPoint` rend `null` hors du viewport : le toucher n'est
           relevé que là où la question a un sens. Le verdict, lui, est rendu en
           node — c'est lui qui dira « hors viewport » plutôt que « rien ». */
        const dedans = x > 0 && x < innerWidth && y > 0 && y < innerHeight;
        const hit = dedans ? document.elementFromPoint(x, y) : null;
        const cible = porteeDuToucher === null ? el : el.closest(porteeDuToucher);
        return {
          nom: el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 40),
          left: r.left,
          top: r.top,
          width: r.width,
          height: r.height,
          toucher: hit === null ? 'rien' : cible !== null && (hit === cible || cible.contains(hit)) ? 'lui-même' : 'un autre',
          par: hit === null ? 'rien' : hit.closest('.floating-menus') !== null ? 'un disque flottant' : hit.tagName,
          declare: declareDe(el),
          ecrans: ecransDe(el),
          cadre: { largeur: innerWidth, hauteur: innerHeight },
        };
      };

      return {
        controls: [...document.querySelectorAll(controlsSel)].map((el) => fait(el, null)),
        texts: textsSel === null ? [] : [...document.querySelectorAll(textsSel)].map((el) => fait(el, porteeSel)),
      };
    },
    [controls, texts ?? null, porteeTextes ?? null, DECLARATIONS],
  );

/**
 * AU REPOS : chaque contrôle et chaque texte, à son centre.
 *
 * Rend `{ controls, texts, exclus }`. `controls`/`texts` portent la forme que
 * les gates lisaient déjà (`{ nom, ok, par, hauteur }`) — augmentée de
 * `raison` — et contiennent DÉSORMAIS les éléments hors viewport, `ok: false`.
 * `exclus` porte ce qui a été écarté, et POURQUOI.
 */
export const reachAtRest = async (page, { controls, texts, porteeTextes } = {}) => {
  const faits = await relever(page, { controls, texts, porteeTextes });
  const out = { controls: [], texts: [], exclus: [] };
  for (const [quoi, cle] of [
    ['contrôle', 'controls'],
    ['texte', 'texts'],
  ]) {
    for (const f of faits[cle]) {
      const verdict = classerAtteinte(f);
      if (verdict.exclu) out.exclus.push({ quoi, nom: verdict.nom, raison: verdict.raison });
      else out[cle].push({ nom: verdict.nom, ok: verdict.ok, par: verdict.par, hauteur: verdict.hauteur, raison: verdict.raison });
    }
  }
  return out;
};
