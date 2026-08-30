/**
 * Ce qu'une page COUTE VRAIMENT : les octets transferes et le moment du premier
 * pixel, lus dans CDP (§ 8.2 mesure n° 2).
 *
 * Deux etages, separes expres :
 *   - `collecter()` parle a Chromium et rend un JOURNAL — des faits bruts,
 *     serialisables, commitables ;
 *   - `agregerReseau()` et `evaluerReseau()` ne parlent a personne : ils
 *     transforment un journal en chiffres et confrontent ces chiffres aux
 *     plafonds.
 *
 * La separation n'est pas cosmetique : elle permet de REAGREGER une collecte
 * faite ailleurs — sur une machine qui, elle, atteint la production — sans
 * refaire la mesure, et elle rend la regle testable sans navigateur.
 *
 * La loi qui gouverne l'agregation : ce qui n'a pas ete mesure vaut `null`,
 * jamais zero. Sans premier pixel mesure, « requetes avant le premier pixel »
 * n'a pas de valeur — et une mesure sans valeur ne prononce aucun verdict.
 *
 * Quatre questions se posent a CHAQUE mesure, dans cet ordre, et le fichier les
 * pose dans cet ordre :
 *   1. la page a-t-elle le droit d'etre pesee ? (`statut_http` — une 404 pese
 *      des octets, mais ce ne sont pas les octets de l'ecran) ;
 *   2. un plafond la gouverne-t-il, et un seul ? (`sans-plafond`, `budget-ambigu`) ;
 *   3. les grandeurs confrontees ont-elles TOUTES une valeur ? (`incomplet_sur`) ;
 *   4. ont-elles ete pesees a la BALANCE que le plafond declare ? (`reseau`,
 *      `tirages` — un FCP sur loopback non bride ne se compare pas a un
 *      plafond ecrit « 3G Fast simule, p75 »).
 * Une mesure qui echoue a l'une des quatre ne prononce pas « vert ».
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { budgetDeChemin } from './routes.mjs';

/**
 * Les balances. Les valeurs sont celles des prereglages de bridage de Chrome
 * DevTools, posees ICI et nulle part ailleurs : une mesure porte le NOM de son
 * profil dans son journal, et une comparaison qui ne retrouve pas ce nom sait
 * qu'elle compare deux grandeurs differentes.
 *
 * `aucun` est un profil A PART ENTIERE, pas l'absence de profil : il DIT que
 * la mesure a ete faite sans bridage, et les plafonds de temps du § 8.3 —
 * ecrits pour « 3G Fast simule, p75 » — ne se prononcent pas dessus.
 */
export const PROFILS_RESEAU = {
  'aucun': { nom: 'aucun', bride: false },
  '3g-fast': {
    nom: '3g-fast',
    bride: true,
    latenceMs: 562.5,
    descenteOctetsParSeconde: Math.round((1.6 * 1024 * 1024) / 8) * 0.9,
    monteeOctetsParSeconde: Math.round((750 * 1024) / 8) * 0.9,
  },
  '3g-slow': {
    nom: '3g-slow',
    bride: true,
    latenceMs: 2000,
    descenteOctetsParSeconde: Math.round((500 * 1024) / 8) * 0.8,
    monteeOctetsParSeconde: Math.round((500 * 1024) / 8) * 0.8,
  },
};

/**
 * Le Chromium de la machine. Il y en a de trois formes dans nos images — un
 * binaire pose a plat, un repertoire versionne (`chromium-1194/`), une coque
 * sans interface — et un site unique evite que chaque script en connaisse une
 * seule et echoue sur les deux autres.
 */
export function cheminChromium() {
  const dossier = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const versionnes = existsSync(dossier)
    ? readdirSync(dossier)
        .filter((n) => n.startsWith('chromium'))
        .flatMap((n) => [
          join(dossier, n, 'chrome-linux/chrome'),
          join(dossier, n, 'chrome-linux/headless_shell'),
        ])
    : [];

  const candidats = [process.env.CHROMIUM_PATH, join(dossier, 'chromium'), ...versionnes];
  return (
    candidats.find((c) => {
      try {
        return c && statSync(c).isFile();
      } catch {
        return false;
      }
    }) ?? null
  );
}

/**
 * Rend un navigateur, ou une erreur qui DIT ou l'on a cherche.
 *
 * Playwright est resolu depuis la devDependency de la RACINE du depot
 * (`@playwright/test@1.62.1`, resolution unique dans les deux lockfiles depuis
 * #4397). La zone ne le redeclare pas : un second declarant rouvrirait
 * exactement l'ecart de lockfile que ce lot-la vient de fermer, pour un outil
 * qui ne part dans aucun bundle. L'import est donc DYNAMIQUE et son echec est
 * une « mesure impossible » (rc=2), jamais un plantage.
 */
export async function ouvrirNavigateur() {
  const executablePath = cheminChromium();
  if (!executablePath) {
    throw new Error(
      `aucun Chromium sous ${process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'} — poser PLAYWRIGHT_BROWSERS_PATH ou CHROMIUM_PATH`,
    );
  }
  const { chromium } = await import('@playwright/test');
  return chromium.launch({ executablePath, args: ['--no-sandbox'] });
}

/**
 * Une requete ACHEVEE : celle dont CDP a vu la fin. Une requete encore pendante
 * — ou echouee — n'a pas de `fin_ms`, et lui en fabriquer un (son instant de
 * DEPART, par exemple) la ferait compter parmi les requetes « achevees avant le
 * premier pixel » alors qu'elle ne s'est jamais achevee. Sur reseau lent — le
 * cas meme que le role premier vise — ce sont exactement les requetes qui
 * n'aboutissent pas a temps qui seraient comptees a tort.
 */
const estAchevee = (e) => typeof e.fin_ms === 'number';

export function agregerReseau({
  url,
  evenements,
  premierPixelMs,
  lcpMs = null,
  cls = null,
  statutHttp = null,
  reseau = null,
  tirages = 1,
}) {
  const octetsParType = {};
  let octetsTotal = 0;
  let sansPoids = 0;
  let enEchec = 0;
  let enCours = 0;
  let polices = 0;

  for (const e of evenements) {
    if (e.echec) enEchec += 1;
    else if (!estAchevee(e)) enCours += 1;
    if (e.type === 'font' || e.type === 'Font') polices += 1;

    if (typeof e.octets !== 'number') {
      sansPoids += 1;
      continue;
    }
    octetsTotal += e.octets;
    octetsParType[e.type] = (octetsParType[e.type] ?? 0) + e.octets;
  }

  /**
   * Une somme d'octets dont N termes manquent n'est pas une somme : c'est un
   * sous-comptage qui s'affiche comme une mesure ferme. « 0.0 Ko » sur une page
   * dont aucune requete n'a ete pesee est le pire chiffre du rapport.
   */
  const toutPese = sansPoids === 0;

  return {
    url: url ?? null,
    statut_http: statutHttp,
    reseau,
    tirages,
    octets_total: toutPese ? octetsTotal : null,
    octets_pesables: octetsTotal,
    octets_par_type: octetsParType,
    requetes_total: evenements.length,
    requetes_sans_poids: sansPoids,
    requetes_en_cours: enCours,
    requetes_en_echec: enEchec,
    requetes_de_police: polices,
    requetes_avant_premier_pixel:
      premierPixelMs === null || premierPixelMs === undefined
        ? null
        : evenements.filter((e) => estAchevee(e) && e.fin_ms <= premierPixelMs).length,
    premier_pixel_ms: premierPixelMs ?? null,
    lcp_ms: lcpMs,
    cls,
    incomplet_sur: toutPese ? [] : [`octets_total (${sansPoids} requete(s) non pesee(s) par CDP)`],
  };
}

/** Rang le plus proche, comme le budget de bundle : la p75 d'un tirage est ce tirage. */
export const p75 = (valeurs) => {
  const nombres = valeurs.filter((v) => typeof v === 'number');
  if (!nombres.length) return null;
  const triees = [...nombres].sort((a, b) => a - b);
  return triees[Math.max(0, Math.ceil(0.75 * triees.length) - 1)];
};

/**
 * N tirages d'une meme page, rendus en UNE mesure au rang p75 — la grandeur que
 * le § 8.3 ecrit. Un tirage unique n'a pas de p75 : la fonction rend alors ce
 * tirage, et `tirages: 1` le DIT, pour qu'une comparaison sache ce qu'elle lit.
 */
export function p75DeMesures(mesures) {
  const [premiere] = mesures;
  if (premiere === undefined) throw new Error('aucun tirage a agreger');
  if (mesures.length === 1) return premiere;

  const auRang = (cle) => p75(mesures.map((m) => m[cle]));
  return {
    ...premiere,
    tirages: mesures.length,
    octets_total: mesures.some((m) => m.octets_total === null) ? null : auRang('octets_total'),
    octets_pesables: auRang('octets_pesables'),
    requetes_total: auRang('requetes_total'),
    requetes_sans_poids: Math.max(...mesures.map((m) => m.requetes_sans_poids)),
    requetes_en_cours: Math.max(...mesures.map((m) => m.requetes_en_cours)),
    requetes_en_echec: Math.max(...mesures.map((m) => m.requetes_en_echec)),
    requetes_de_police: Math.max(...mesures.map((m) => m.requetes_de_police)),
    requetes_avant_premier_pixel: mesures.some((m) => m.requetes_avant_premier_pixel === null)
      ? null
      : auRang('requetes_avant_premier_pixel'),
    premier_pixel_ms: auRang('premier_pixel_ms'),
    lcp_ms: auRang('lcp_ms'),
    cls: auRang('cls'),
    incomplet_sur: [...new Set(mesures.flatMap((m) => m.incomplet_sur))],
    tirages_detail: mesures.map((m) => ({
      octets_total: m.octets_total,
      premier_pixel_ms: m.premier_pixel_ms,
      lcp_ms: m.lcp_ms,
      cls: m.cls,
      requetes_avant_premier_pixel: m.requetes_avant_premier_pixel,
    })),
  };
}

const cheminDe = (url) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url ?? '/';
  }
};

/** Une reponse qui n'est pas une page : 4xx, 5xx, ou un code qu'on ne sait pas lire. */
const estPageServie = (code) => typeof code !== 'number' || (code >= 200 && code < 400);

const arrondi = (v) => (typeof v === 'number' ? Math.round(v) : null);

const sansVerdict = ({ mesure, chemin, ligne, statut, raison }) => ({
  ...mesure,
  chemin,
  motif_de_budget: ligne?.motif ?? null,
  statut,
  raison,
  depassements: [],
  ecarts_de_cible: [],
  sans_conditions: [],
});

/**
 * Confronte une mesure a la ligne de budget de son chemin. Une mesure
 * incomplete ne prononce RIEN : refuser sur une valeur absente serait aussi
 * faux que passer.
 *
 * Les quatre refus, dans l'ordre du doc-comment de tete. Aucun d'eux ne rend
 * « vert » — et c'est tout l'objet : une page d'erreur, une page sans plafond,
 * une page dont une grandeur manque et une page pesee a une autre balance ont
 * chacune leur mot, distinct de la reussite comme de l'echec.
 */
export function evaluerReseau({ mesure, budgets }) {
  const chemin = cheminDe(mesure.url);
  const ligne = budgetDeChemin({ budgets, chemin });

  if (!estPageServie(mesure.statut_http)) {
    return sansVerdict({
      mesure,
      chemin,
      ligne,
      statut: 'incomplete',
      raison: `page en erreur (HTTP ${mesure.statut_http}) — ses octets sont ceux d'une page d'erreur, pas ceux de l'ecran`,
    });
  }

  if (ligne?.ambigu) {
    return sansVerdict({
      mesure,
      chemin,
      ligne,
      statut: 'budget-ambigu',
      raison: `${trouvees(ligne)} attrapent le meme chemin — seul l'ordre des cles JSON dirait lequel s'applique ; budgets.json doit n'en garder qu'une`,
    });
  }

  if (ligne === null) {
    return sansVerdict({
      mesure,
      chemin,
      ligne,
      statut: 'sans-plafond',
      raison: `aucune ligne de budgets.json ne couvre ${chemin} — cet ecran n'est gouverne par aucun plafond, et un ecran sans plafond n'est pas un ecran vert`,
    });
  }

  if (mesure.requetes_avant_premier_pixel === null) {
    return sansVerdict({
      mesure,
      chemin,
      ligne,
      statut: 'incomplete',
      raison:
        "le premier pixel (FCP) n'a pas ete mesure — le nombre de requetes qui le precedent est indeterminable",
    });
  }

  const depassements = [];
  const ecartsDeCible = [];
  const sansConditions = [];
  const bride = mesure.reseau !== null && mesure.reseau !== 'aucun';

  /**
   * GATE et CIBLE ne se sanctionnent pas pareil (§ 8.3) : un GATE casse la CI,
   * une CIBLE est une valeur « a confirmer par la premiere mesure », donc elle
   * se RAPPORTE — la faire casser aujourd'hui reviendrait a bloquer la zone sur
   * un chiffre que personne n'a encore mesure.
   *
   * `conditions: 'bride'` marque les plafonds ecrits pour une BALANCE : les
   * confronter a un chargement sur loopback non bride comparerait deux
   * grandeurs differentes, ce qui est pire que ne pas les confronter.
   */
  const confronter = ({ mesuree, plafond, statut, libelle, conditions }) => {
    if (typeof plafond !== 'number') return;
    if (conditions === 'bride' && !bride) {
      sansConditions.push(
        `${ligne.motif} — ${libelle} : plafond ${plafond} ecrit pour « 3G Fast simule, p75 » (§ 8.3), mesure faite sans bridage (reseau: ${mesure.reseau ?? 'non declare'}) — non confronte`,
      );
      return;
    }
    if (mesuree === null || mesuree <= plafond) return;
    const phrase = `${ligne.motif} — ${libelle} : ${mesuree} > ${plafond} (${statut})`;
    (statut === 'GATE' ? depassements : ecartsDeCible).push(phrase);
  };

  const budget = ligne.budget ?? {};
  confronter({
    mesuree: mesure.requetes_avant_premier_pixel,
    plafond: budget.requetes_avant_premier_pixel,
    statut: budget.statut_requetes ?? 'CIBLE',
    libelle: 'requetes avant le premier pixel',
  });
  confronter({
    mesuree: arrondi(mesure.premier_pixel_ms),
    plafond: budget.premier_pixel_ms,
    statut: budget.statut_premier_pixel ?? 'CIBLE',
    libelle: 'premier pixel (ms)',
    conditions: 'bride',
  });
  confronter({
    mesuree: arrondi(mesure.lcp_ms),
    plafond: budget.lcp_ms,
    statut: budget.statut_lcp ?? 'CIBLE',
    libelle: 'LCP (ms)',
    conditions: 'bride',
  });
  confronter({
    mesuree: mesure.octets_par_type?.document ?? null,
    plafond: budget.html_octets,
    statut: budget.statut_html ?? 'CIBLE',
    libelle: 'HTML transfere (o, hors sprite)',
  });

  for (const gate of gatesTransverses({ mesure, ligne, budgets })) confronter(gate);

  const statut = depassements.length
    ? 'depassement'
    : mesure.incomplet_sur.length
      ? 'incomplete'
      : sansConditions.length
        ? 'sans-conditions'
        : 'vert';

  return {
    ...mesure,
    chemin,
    motif_de_budget: ligne.motif,
    groupe_de_budget: budget.groupe ?? null,
    statut,
    ...(statut === 'incomplete' && mesure.incomplet_sur.length
      ? { raison: `grandeur non mesuree : ${mesure.incomplet_sur.join(', ')}` }
      : {}),
    depassements,
    ecarts_de_cible: ecartsDeCible,
    sans_conditions: sansConditions,
  };
}

const trouvees = (ligne) => `les lignes ${ligne.ambigu.map((m) => `« ${m} »`).join(' et ')}`;

/**
 * Les gates TRANSVERSES du § 8.5, ceux que ce fichier peut porter : ils
 * s'appliquent au GROUPE de la route, pas a la route. Le groupe est declare par
 * la ligne de budget elle-meme (`groupe`) — le journal reseau ne sait pas dans
 * quel groupe de routes Next range une URL, et le deviner depuis le chemin
 * serait une seconde source de verite.
 *
 * Ce que ce fichier NE porte PAS et qui vit ailleurs (§ 8.5) : `axe`
 * serious/critical (`v3-a11y.spec.ts`), « 0 requete pendant que l'onglet est
 * hidden » et le battement unique (`v3-lifecycle.spec.ts`), l'existence du
 * sprite et la completude de ses symboles (gate du lot L0). `budgets.json` le
 * DIT dans son `_source` : un fichier qui annonce une couverture qu'il n'a pas
 * fabrique la meme illusion qu'un chiffre invente.
 */
function gatesTransverses({ mesure, ligne, budgets }) {
  const groupe = ligne.budget?.groupe;
  const t = budgets.transverses?.[groupe];
  if (!t) return [];

  return [
    {
      mesuree: mesure.cls === null ? null : Number(mesure.cls.toFixed(3)),
      plafond: t.cls,
      statut: t.statut_cls ?? 'CIBLE',
      libelle: `CLS sur ${groupe}`,
    },
    {
      mesuree: mesure.octets_par_type?.stylesheet ?? 0,
      plafond: t.css_octets,
      statut: t.statut_css ?? 'CIBLE',
      libelle: `CSS transfere (o) sur ${groupe}`,
    },
    {
      mesuree: mesure.requetes_de_police ?? 0,
      plafond: t.polices_web,
      statut: t.statut_polices ?? 'CIBLE',
      libelle: `requetes de police web sur ${groupe}`,
    },
    {
      mesuree: mesure.requetes_en_cours,
      plafond: t.connexions_tenues_apres_premier_pixel,
      statut: t.statut_connexions ?? 'CIBLE',
      libelle: `connexions serveur tenues apres le premier pixel sur ${groupe}`,
    },
  ];
}

/**
 * Le verdict d'un lot de mesures. La hierarchie porte tout : un echec ne se
 * masque jamais derriere une indetermination, et une indetermination ne se
 * masque jamais derriere du vert.
 */
const RANG_DE_STATUT = [
  'depassement',
  'budget-ambigu',
  'sans-plafond',
  'incomplete',
  'sans-conditions',
];
const VERDICT_DE_STATUT = { incomplete: 'incomplet' };

export function verdictReseau(mesures) {
  const pire = RANG_DE_STATUT.find((s) => mesures.some((m) => m.statut === s));
  if (pire === undefined) return 'vert';
  return VERDICT_DE_STATUT[pire] ?? pire;
}

export const CODE_PAR_VERDICT = {
  vert: 0,
  depassement: 1,
  'budget-ambigu': 2,
  'sans-plafond': 3,
  incomplet: 3,
  'sans-conditions': 3,
};

/**
 * Le journal d'une page : chaque requete achevee avec son poids ENCODE (ce qui
 * traverse le reseau, pas ce que la page decompresse), et les trois metriques
 * de peinture. L'axe des temps est celui de la page (`performance.timeOrigin`),
 * pour que « avant le premier pixel » compare deux instants comparables.
 */
export async function collecter({ page, url, attenteMs = 2000, reseau = '3g-fast' }) {
  const profil = PROFILS_RESEAU[reseau];
  if (profil === undefined) {
    throw new Error(
      `profil reseau inconnu : « ${reseau} » — connus : ${Object.keys(PROFILS_RESEAU).join(', ')}`,
    );
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');

  /**
   * La BALANCE. Les plafonds de temps du § 8.3 sont ecrits « 3G Fast simule » ;
   * mesurer sur loopback non bride puis les confronter comparerait deux
   * grandeurs. Le nom du profil part dans le journal : une mesure qui ne dit
   * pas a quelle balance elle a ete pesee ne se compare a rien.
   */
  if (profil.bride) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profil.latenceMs,
      downloadThroughput: profil.descenteOctetsParSeconde,
      uploadThroughput: profil.monteeOctetsParSeconde,
    });
  }

  const requetes = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    requetes.set(e.requestId, {
      url: e.request.url,
      type: e.type ?? 'other',
      wallTime: e.wallTime,
      debut: e.timestamp,
      fin: null,
      octets: null,
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = requetes.get(e.requestId);
    if (r && e.type) r.type = e.type;
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requetes.get(e.requestId);
    if (!r) return;
    r.fin = e.timestamp;
    r.octets = typeof e.encodedDataLength === 'number' ? e.encodedDataLength : null;
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = requetes.get(e.requestId);
    if (r) r.echec = e.errorText ?? 'echec';
  });

  const reponse = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  await page.waitForTimeout(attenteMs);

  /**
   * LCP et CLS ne sont PAS lisibles par `getEntriesByType` : leurs entrees
   * n'existent que pour un observateur, et seul `buffered: true` rend celles
   * d'avant l'abonnement. Les lire autrement rendrait `null` sur une page qui
   * a pourtant peint — un trou pris pour une absence.
   */
  const metriques = await page.evaluate(
    () =>
      new Promise((resoudre) => {
        const lu = { lcp: null, cls: 0 };
        const observer = (type, sur) => {
          try {
            new PerformanceObserver((liste) => liste.getEntries().forEach(sur)).observe({
              type,
              buffered: true,
            });
          } catch {
            /* metrique non supportee par ce navigateur */
          }
        };
        observer('largest-contentful-paint', (e) => {
          lu.lcp = e.startTime;
        });
        observer('layout-shift', (e) => {
          if (!e.hadRecentInput) lu.cls += e.value;
        });

        setTimeout(
          () =>
            resoudre({
              timeOrigin: performance.timeOrigin,
              fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
              lcp: lu.lcp,
              cls: lu.cls,
            }),
          300,
        );
      }),
  );

  /**
   * `fin_ms: null` quand CDP n'a pas vu la fin — requete encore PENDANTE, ou
   * echouee. Lui donner son instant de DEPART la ferait passer pour « achevee
   * avant le premier pixel » ; et c'est justement sur reseau lent, le cas du
   * role premier, que ces requetes-la sont les plus nombreuses. Une requete
   * pendante est en outre exactement ce que le § 8.3 appelle « une connexion
   * serveur tenue apres le premier pixel ».
   */
  const evenements = [...requetes.values()].map((r) => {
    const debutMs = r.wallTime * 1000 - metriques.timeOrigin;
    return {
      url: r.url,
      type: r.type,
      octets: r.octets,
      debut_ms: Math.max(0, debutMs),
      fin_ms: r.fin === null ? null : Math.max(0, debutMs + (r.fin - r.debut) * 1000),
      ...(r.echec ? { echec: r.echec } : {}),
    };
  });

  await cdp.detach().catch(() => undefined);

  return {
    url,
    collecte_le: new Date().toISOString(),
    statut_http: reponse ? reponse.status() : null,
    reseau: profil.nom,
    premier_pixel_ms: metriques.fcp,
    lcp_ms: metriques.lcp,
    cls: metriques.cls,
    evenements,
  };
}

export function mesureDuJournal({ journal, budgets }) {
  return evaluerReseau({ mesure: mesureBruteDuJournal(journal), budgets });
}

/**
 * Un journal → une mesure, sans plafond. C'est ce que la ligne de base
 * consomme : elle pese, elle ne juge pas.
 */
export function mesureBruteDuJournal(journal) {
  return agregerReseau({
    url: journal.url,
    evenements: journal.evenements ?? [],
    premierPixelMs: journal.premier_pixel_ms ?? null,
    lcpMs: journal.lcp_ms ?? null,
    cls: journal.cls ?? null,
    statutHttp: journal.statut_http ?? null,
    reseau: journal.reseau ?? null,
  });
}
