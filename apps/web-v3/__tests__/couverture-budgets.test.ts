/**
 * @jest-environment node
 *
 * Ce que ce temoin gage : `budgets.json` et la MATRICE des ecrans parlent des
 * memes routes. Le § 9.2 impose ce croisement entre la matrice et la planche ;
 * il vaut exactement autant entre la matrice et la table des plafonds, et il
 * n'existait pas — aucun test ne lisait `matrice.json`.
 *
 * Ce que son absence avait laisse passer, mesure : `budgets.json` declarait
 * `/posts/:id` la ou la matrice et `ordre.md` declarent `/post/:id` (ecran
 * `comments`, P0 role premier). L'ecran de lecture d'un post — un des quatre
 * contenus nommes par le role PREMIER — n'avait donc, en pratique, AUCUN
 * plafond reseau : un journal de 4,4 Mo, 5 requetes avant le premier pixel et
 * un CLS de 0,9 sur `/post/abc` sortait `vert`, rc=0. Et l'ecran `media`
 * (`/chats/:id/medias`, P0) n'avait aucune ligne du tout.
 *
 * Trois affirmations, pas une : chaque route de la matrice a un plafond ; chaque
 * ligne de plafond sert une route de la matrice ; aucune route n'est attrapee
 * par DEUX lignes (auquel cas seul l'ordre des cles JSON deciderait laquelle
 * s'applique).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const zoneRoot = join(__dirname, '..');
const depot = join(zoneRoot, '..', '..');
const matriceJson = join(depot, 'docs', 'product', 'MeeshyWebV3Design', 'matrice.json');
const budgetsJson = join(zoneRoot, 'budgets.json');
const routesMjs = join(zoneRoot, 'scripts', 'lib', 'routes.mjs');

type LigneDeMatrice = {
  readonly vue_id: string;
  readonly route: string;
  readonly priorite: string;
  readonly audience: string;
};

type Budgets = {
  readonly routes: Record<string, { readonly groupe?: string; readonly role_premier?: boolean; readonly hors_matrice?: string }>;
  readonly heritage_de_groupe: Record<string, readonly string[]>;
  readonly transverses: Record<string, unknown>;
};

const matrice = (JSON.parse(readFileSync(matriceJson, 'utf8')) as { readonly ecrans: readonly LigneDeMatrice[] })
  .ecrans;
const budgets = JSON.parse(readFileSync(budgetsJson, 'utf8')) as Budgets;

/**
 * Les surimpressions (`sheet:lang`, `sheet:link`…) ne sont pas des URLs : elles
 * se posent PAR-DESSUS un ecran, et leur cout est celui de l'ecran qui les
 * porte. Les exiger dans une table de plafonds de ROUTE inventerait une ligne
 * pour quelque chose qui ne se charge jamais seul.
 */
const routesDeLaMatrice = matrice.filter((l) => l.route !== '(surimpression)');

/**
 * Un chemin OUVRABLE a partir d'un motif : `/chats/:lien/medias` ⇒
 * `/chats/echantillon/medias`. C'est ce chemin qu'on presente au resolveur —
 * la meme entree qu'une URL servie, donc la meme reponse.
 */
const cheminOuvrable = (route: string): string =>
  (route.split('?')[0] ?? route)
    .split('/')
    .map((s) => (s.startsWith(':') ? 'echantillon' : s))
    .join('/');

type Resolution = {
  readonly chemin: string;
  /** La forme canonique (sans nom de parametre) — celle dans laquelle les deux tables se croisent. */
  readonly motif: string | null;
  /** La cle EXACTE de budgets.json, pour nommer la ligne fautive dans un echec. */
  readonly motif_brut: string | null;
  readonly groupe: string | null;
  readonly herite: boolean;
  readonly ambigu: readonly string[] | null;
};

/**
 * Le croisement passe par le resolveur REEL (`budgetDeChemin`), pas par une
 * reimplementation : un test qui refait la regle a cote d'elle ne gage plus la
 * regle, il gage sa copie.
 */
const resoudre = (chemins: readonly string[]): readonly Resolution[] => {
  const programme = `
    import { readFileSync } from 'node:fs';
    import { budgetDeChemin, normaliserMotif } from ${JSON.stringify(routesMjs)};
    const budgets = JSON.parse(readFileSync(${JSON.stringify(budgetsJson)}, 'utf8'));
    const chemins = JSON.parse(process.argv[1]);
    process.stdout.write(JSON.stringify(chemins.map((chemin) => {
      const ligne = budgetDeChemin({ budgets, chemin });
      return {
        chemin,
        motif: ligne ? normaliserMotif(ligne.motif) : null,
        motif_brut: ligne ? ligne.motif : null,
        groupe: ligne?.budget?.groupe ?? null,
        herite: ligne?.herite === true,
        ambigu: ligne?.ambigu ?? null,
      };
    })));
  `;
  return JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '-e', programme, JSON.stringify(chemins)], {
      encoding: 'utf8',
    }),
  ) as readonly Resolution[];
};

const resolutions = resoudre(routesDeLaMatrice.map((l) => cheminOuvrable(l.route)));
const parVue = new Map(routesDeLaMatrice.map((l, i) => [l.vue_id, resolutions[i]!]));

describe('chaque ecran de la matrice est gouverne par un plafond', () => {
  it("aucune route de la matrice ne sort « sans plafond »", () => {
    const orphelines = routesDeLaMatrice
      .filter((l) => parVue.get(l.vue_id)?.motif == null)
      .map((l) => `${l.vue_id} (${l.route})`);

    expect(orphelines).toEqual([]);
  });

  it("les dix ecrans du role PREMIER ont chacun une ligne NOMMEE, pas un heritage de groupe", () => {
    const p0 = routesDeLaMatrice.filter((l) => l.priorite === 'P0-role-premier');
    const sansLignePropre = p0
      .filter((l) => parVue.get(l.vue_id)?.herite !== false)
      .map((l) => `${l.vue_id} (${l.route})`);

    expect(p0.length).toBeGreaterThanOrEqual(10);
    expect(sansLignePropre).toEqual([]);
  });

  it('et leur ligne se declare `role_premier` — c est ce champ qui interdit le vert quand elle n a pas ete ouverte', () => {
    const p0 = routesDeLaMatrice.filter((l) => l.priorite === 'P0-role-premier');
    const nonDeclarees = p0
      .map((l) => parVue.get(l.vue_id))
      .filter((r) => r?.motif_brut != null && budgets.routes[r.motif_brut]?.role_premier !== true)
      .map((r) => r?.motif_brut);

    expect(nonDeclarees).toEqual([]);
  });

  it("aucune route de la matrice n'est attrapee par DEUX lignes de budget", () => {
    const ambigues = routesDeLaMatrice
      .filter((l) => parVue.get(l.vue_id)?.ambigu != null)
      .map((l) => `${l.vue_id} : ${parVue.get(l.vue_id)?.ambigu?.join(' + ')}`);

    expect(ambigues).toEqual([]);
  });

  it('le groupe declare par la ligne suit l audience de la matrice — connecte ⇒ (connected), sinon (public)', () => {
    const discordantes = routesDeLaMatrice
      .filter((l) => {
        const attendu = l.audience === 'connecte' ? '(connected)' : '(public)';
        return parVue.get(l.vue_id)?.groupe !== attendu;
      })
      .map((l) => `${l.vue_id} (${l.route}) : ${parVue.get(l.vue_id)?.groupe} au lieu de ${l.audience}`);

    expect(discordantes).toEqual([]);
  });
});

describe('reciproquement : aucune ligne de budget ne gouverne un ecran qui n existe pas', () => {
  const normalisees = new Set(resolutions.map((r) => r.motif_brut));

  it('chaque cle de `routes` sert une route de la matrice, ou dit pourquoi elle n en sert aucune', () => {
    const orphelines = Object.entries(budgets.routes)
      .filter(([motif, ligne]) => !normalisees.has(motif) && ligne.hors_matrice === undefined)
      .map(([motif]) => motif);

    expect(orphelines).toEqual([]);
  });

  it('chaque route declaree en heritage de groupe est une route de la matrice', () => {
    const declarees = Object.entries(budgets.heritage_de_groupe)
      .filter(([groupe]) => !groupe.startsWith('_'))
      .flatMap(([, motifs]) => motifs);
    const orphelines = declarees.filter((m) => !normalisees.has(m));

    expect(orphelines).toEqual([]);
  });

  it('chaque groupe cite par une ligne a bien un bloc de gates transverses', () => {
    const groupes = [
      ...new Set(Object.values(budgets.routes).map((l) => l.groupe)),
      ...Object.keys(budgets.heritage_de_groupe).filter((g) => !g.startsWith('_')),
    ];
    const sansTransverses = groupes.filter((g) => g !== undefined && !(g in budgets.transverses));

    expect(sansTransverses).toEqual([]);
  });
});

describe("l'espace de noms est celui de la matrice, tranche une fois", () => {
  it('`/post/:id` et non `/posts/:id` — c est l URL que le legacy sert deja, donc celle des liens en circulation', () => {
    expect(Object.keys(budgets.routes)).toContain('/post/:id');
    expect(Object.keys(budgets.routes)).not.toContain('/posts/:id');
  });

  it("les quatre vues de `/chats/<segment>` tombent sur UNE seule ligne", () => {
    const vues = ['join', 'rights', 'thread', 'rich'];
    const motifs = new Set(vues.map((v) => parVue.get(v)?.motif_brut));

    expect([...motifs]).toEqual(['/chats/:lien']);
  });
});
