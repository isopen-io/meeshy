/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { doitRattraper, SEUIL_DE_RATTRAPAGE_MS } from '@/lib/realtime/reconnect-policy';
import { CHAMPS_DU_RATTRAPAGE, miseAJourDe } from '@/lib/realtime/liste-etat';
import { demandeLeDelta } from '@/lib/realtime/sync/delta-client';

/**
 * LE RATTRAPAGE PAR `GET /sync` — les deux moitiés qu'aucun témoin ne tenait.
 *
 * La revue croisée a trouvé ici trois trous, tous du même genre : une règle de
 * PROTOCOLE écrite dans un module de navigateur, donc invisible à toute suite
 * qui ne monte pas de navigateur — et invisible AUSSI au navigateur, parce que
 * le comportement qu'elle gouverne ne se voit qu'à l'octet près.
 *
 *   1. le **304** (« assertion CDP 304 quasi-vide au retour de focus », critère
 *      de fin de #4753) : `rattrape()` le court-circuitait, et rien nulle part
 *      ne le prouvait — ni e2e (le spec ne lisait que `.chemin`, jamais
 *      `.statut`), ni unitaire (aucun test n'importait cette fonction) ;
 *   2. le **`seq`** : la liste ne l'annonçait pas, donc la passerelle ne
 *      pouvait JAMAIS lui rendre `hasGap` (`routes/sync/index.ts:360` :
 *      `seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD`) et le
 *      bandeau « des messages manquent » était une branche morte ;
 *   3. le **seuil d'absence** : le fil rattrapait après une chute de socket, la
 *      liste non — la même règle, tenue par un seul des deux modules.
 *
 * Les trois vivent désormais à UN site chacun, et ce site se teste sans
 * navigateur : `demandeLeDelta` (l'appel et ses trois issues) et
 * `doitRattraper` (le seuil). La couture est `recuperer` — la même que
 * `lib/api/compte.ts` : un témoin oppose un serveur au client sans en lancer un.
 */

const BASE = 'https://gate.meeshy.me';
const DEPUIS = '2026-09-01T12:00:00.000Z';

const corpsDeDelta = (extra: Readonly<Record<string, unknown>> = {}): unknown => ({
  success: true,
  data: {
    checkpoint: '2026-09-01T12:05:00.000Z',
    checkpointSeq: 42,
    collections: {
      conversations: { added: [{ id: 'c1', lastMessageAt: '2026-09-01T12:04:00.000Z' }], modified: [], deleted: [] },
    },
    hasMore: false,
    hasGap: false,
    ...extra,
  },
});

type Appel = { readonly url: string; readonly entetes: Readonly<Record<string, string>> };

const passerelle = (reponse: () => Response) => {
  const appels: Appel[] = [];
  const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
    appels.push({ url, entetes: (options.headers ?? {}) as Readonly<Record<string, string>> });
    return reponse();
  };
  return { appels, recuperer };
};

describe('les champs demandés — rien ne part qui n’ait été demandé (#5088)', () => {
  /**
   * LA REQUÊTE DE FOND LA PLUS FRÉQUENTE DE LA V3 recevait ~12 colonnes par
   * conversation (`syncConversationSelect` : description, avatar, banner…)
   * pour n'en lire que DEUX. La loi `?fields=` de #4173 est vivante côté
   * passerelle (`SYNC_FIELD_VOCABULARY`) ; ces témoins tiennent le côté
   * client : l'URL les porte, la constante suffit au réducteur, et la liste
   * la passe.
   */
  it('porte `fields=` sur l’URL quand l’appelant nomme ses champs', async () => {
    const { appels, recuperer } = passerelle(
      () => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }),
    );

    await demandeLeDelta({
      base: BASE,
      depuis: DEPUIS,
      collections: ['conversations'],
      fields: CHAMPS_DU_RATTRAPAGE,
      entetes: {},
      recuperer,
    });

    const url = new URL(appels[0]!.url);
    expect(url.searchParams.get('fields')).toBe('conversations.id,conversations.lastMessageAt');
  });

  it('n’en porte AUCUN quand l’appelant n’en nomme pas — le défaut serveur reste le sien', async () => {
    const { appels, recuperer } = passerelle(
      () => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }),
    );

    await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, recuperer });

    expect(new URL(appels[0]!.url).searchParams.has('fields')).toBe(false);
  });

  /**
   * LA BORNE, DANS LES DEUX SENS. Une ligne réduite aux champs DEMANDÉS doit
   * suffire au réducteur — sinon la frugalité casse le rang — et la constante
   * ne doit pas demander plus que ce que le réducteur lit — sinon la
   * frugalité n'en est pas une. Les deux moitiés se mesurent sur la même
   * ligne fabriquée.
   */
  it('les champs demandés suffisent au réducteur du rang — et il ne lit rien de plus', () => {
    const ligneFrugale = Object.fromEntries(
      CHAMPS_DU_RATTRAPAGE.map((champ) => [champ.replace('conversations.', ''), champ.endsWith('.id') ? 'c1' : '2026-09-01T12:04:00.000Z']),
    );

    expect(miseAJourDe({ conversationId: ligneFrugale.id, lastMessageAt: ligneFrugale.lastMessageAt })).toMatchObject({
      id: 'c1',
      quand: '2026-09-01T12:04:00.000Z',
    });
    expect(CHAMPS_DU_RATTRAPAGE).toHaveLength(2);
  });

  it('la liste PASSE la constante — un rattrapage qui l’oublierait repaierait la ligne entière', () => {
    const texte = readFileSync(join(process.cwd(), 'lib', 'realtime', 'liste.ts'), 'utf8');

    expect(texte).toContain('fields: CHAMPS_DU_RATTRAPAGE');
  });
});

describe('l’appel de /sync', () => {
  /**
   * LE 304 EST UNE ISSUE À PART, pas un `!reponse.ok` fondu dans les pannes.
   * Il dit « ta fenêtre n'a pas bougé » : rien à repeindre, et surtout AUCUN
   * checkpoint à avancer — un client qui avancerait son watermark sur une
   * réponse sans corps sauterait la fenêtre qu'il vient de ne pas lire.
   */
  it('rend `inchange` sur un 304, sans corps et sans validateur neuf', async () => {
    const { recuperer } = passerelle(() => new Response(null, { status: 304, headers: { etag: 'W/"neuf"' } }));

    const issue = await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, recuperer });

    expect(issue).toEqual({ genre: 'inchange' });
  });

  it('renvoie le validateur détenu en `if-none-match` — et rien quand il n’en détient pas', async () => {
    const avec = passerelle(() => new Response(null, { status: 304 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, validateur: 'W/"12-1-0"', recuperer: avec.recuperer });

    const sans = passerelle(() => new Response(null, { status: 304 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, validateur: null, recuperer: sans.recuperer });

    expect(avec.appels[0]?.entetes['if-none-match']).toBe('W/"12-1-0"');
    expect(sans.appels[0]?.entetes['if-none-match']).toBeUndefined();
  });

  /**
   * `hasGap` N'EXISTE QUE SI LE CLIENT ANNONCE SON CURSEUR
   * (`routes/sync/index.ts:360`). Ce témoin porte sur la moitié CLIENT de cette
   * loi : sans `seq=` dans l'adresse, aucun trou ne peut être signalé, quoi que
   * fasse le serveur.
   */
  it('annonce le curseur quand il en a un, et l’omet au premier tour', async () => {
    const avec = passerelle(() => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, seq: 7, collections: ['conversations'], entetes: {}, recuperer: avec.recuperer });

    const sans = passerelle(() => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, seq: null, collections: ['conversations'], entetes: {}, recuperer: sans.recuperer });

    expect(avec.appels[0]?.url).toContain('&seq=7');
    expect(avec.appels[0]?.url).toContain('collections=conversations');
    expect(sans.appels[0]?.url).not.toContain('seq=');
  });

  /** `seq=0` est une VALEUR — le curseur d'un compte qui n'a encore rien émis —, jamais une absence. */
  it('annonce un curseur nul, qui n’est pas une absence de curseur', async () => {
    const { appels, recuperer } = passerelle(() => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }));

    await demandeLeDelta({ base: BASE, depuis: DEPUIS, seq: 0, entetes: {}, recuperer });

    expect(appels[0]?.url).toContain('&seq=0');
  });

  it('rend le delta et le validateur SERVI sur un 200', async () => {
    const { recuperer } = passerelle(
      () => new Response(JSON.stringify(corpsDeDelta({ hasGap: true })), { status: 200, headers: { etag: 'W/"12-1-0"' } }),
    );

    const issue = await demandeLeDelta({ base: BASE, depuis: DEPUIS, collections: ['conversations'], entetes: {}, recuperer });

    expect(issue.genre).toBe('delta');
    if (issue.genre !== 'delta') return;
    expect(issue.validateur).toBe('W/"12-1-0"');
    expect(issue.delta.checkpointSeq).toBe(42);
    expect(issue.delta.hasGap).toBe(true);
    expect(issue.delta.conversations).toEqual([{ id: 'c1', lastMessageAt: '2026-09-01T12:04:00.000Z' }]);
  });

  /**
   * LE VALIDATEUR ILLISIBLE N'EST PAS UNE PANNE. `reponse.headers.get('etag')`
   * peut rendre `null` — un intermédiaire qui filtre l'en-tête, une passerelle
   * qui ne l'expose pas encore (c'était la production avant #5015 : `ETag`
   * n'est pas dans la safelist CORS et `server.ts` n'appelait pas
   * `exposedHeaders`) — et le delta doit être servi quand même : c'est la
   * moitié qui porte la lenteur, et elle ne dépend pas du 304.
   */
  it('sert le delta même quand l’ETag n’est pas lisible', async () => {
    const { recuperer } = passerelle(() => new Response(JSON.stringify(corpsDeDelta()), { status: 200 }));

    const issue = await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, recuperer });

    expect(issue.genre).toBe('delta');
    if (issue.genre !== 'delta') return;
    expect(issue.validateur).toBeNull();
  });

  it('reste muet sur un refus, un réseau tombé ou un corps illisible', async () => {
    const refus = passerelle(() => new Response('{}', { status: 401 }));
    const illisible = passerelle(() => new Response('pas du json', { status: 200 }));

    expect(await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, recuperer: refus.recuperer })).toEqual({ genre: 'muet' });
    expect(await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: {}, recuperer: illisible.recuperer })).toEqual({ genre: 'muet' });
    expect(
      await demandeLeDelta({
        base: BASE,
        depuis: DEPUIS,
        entetes: {},
        recuperer: () => Promise.reject(new Error('réseau')),
      }),
    ).toEqual({ genre: 'muet' });
  });

  it('porte la créance de l’appelant, quelle qu’elle soit', async () => {
    const membre = passerelle(() => new Response(null, { status: 304 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: { authorization: 'Bearer JWT' }, recuperer: membre.recuperer });

    const invite = passerelle(() => new Response(null, { status: 304 }));
    await demandeLeDelta({ base: BASE, depuis: DEPUIS, entetes: { 'x-session-token': 'session-tolu' }, recuperer: invite.recuperer });

    expect(membre.appels[0]?.entetes.authorization).toBe('Bearer JWT');
    expect(invite.appels[0]?.entetes['x-session-token']).toBe('session-tolu');
  });
});

/**
 * LE SEUIL D'ABSENCE — la règle que le fil tenait et que la liste n'avait pas.
 *
 * Socket.IO ne rejoue rien : au-delà de ce seuil, ce qui s'est dit pendant la
 * chute est perdu, et seul un `/sync` le rattrape. En deçà, la reconnexion
 * suffit. Le témoin se pose SUR le seuil, en dessous et au-dessus — un test qui
 * ne regarderait qu'une chute de dix minutes resterait vert si la comparaison
 * partait à l'envers.
 */
describe('le rattrapage après une chute de socket', () => {
  const maintenant = Date.parse('2026-09-01T12:00:00.000Z');

  it('ne rattrape rien quand le socket n’est jamais tombé', () => {
    expect(doitRattraper({ deconnecteDepuis: null, maintenant })).toBe(false);
  });

  it('ne rattrape pas une chute plus courte que le seuil', () => {
    expect(doitRattraper({ deconnecteDepuis: maintenant - (SEUIL_DE_RATTRAPAGE_MS - 1), maintenant })).toBe(false);
  });

  it('rattrape dès le seuil atteint, et au-delà', () => {
    expect(doitRattraper({ deconnecteDepuis: maintenant - SEUIL_DE_RATTRAPAGE_MS, maintenant })).toBe(true);
    expect(doitRattraper({ deconnecteDepuis: maintenant - 5 * 60_000, maintenant })).toBe(true);
  });
});

/**
 * UNE SOURCE PAR VÉRITÉ, SUR LES DEUX SURFACES DE PARTICIPATION.
 *
 * Le défaut trouvé en revue n'était pas une ligne fausse : c'était DEUX boucles
 * de `/sync` écrites côte à côte, dont une seule annonçait son curseur et une
 * seule savait qu'un socket peut tomber. Une jumelle ne se voit pas à
 * l'exécution tant qu'elle n'a pas divergé — et c'est alors trop tard. Ces
 * témoins refusent qu'elle renaisse.
 */
const RACINE = join(__dirname, '..');
const source = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const LISTE = 'lib/realtime/liste.ts';
const FIL = 'lib/realtime/participate.ts';

describe('le rattrapage a un seul site, partagé par le fil et par la liste', () => {
  it('les deux modules passent par `demandeLeDelta`, et aucun ne réécrit la boucle', () => {
    [LISTE, FIL].forEach((chemin) => {
      const texte = source(chemin);
      expect(texte).toContain('demandeLeDelta');
      // Ni l'appel nu, ni la lecture du corps, ni le montage de l'adresse : les
      // trois vivaient en double, et c'est là que le `seq` s'est perdu.
      expect(texte).not.toContain('urlDeSync(');
      expect(texte).not.toContain('litLeDelta(');
      expect(texte).not.toContain("'if-none-match'");
    });
  });

  it('les deux modules décident l’absence par `doitRattraper`, jamais par une soustraction à eux', () => {
    [LISTE, FIL].forEach((chemin) => {
      const texte = source(chemin);
      expect(texte).toContain('doitRattraper(');
      expect(texte).not.toContain('SEUIL_DE_RATTRAPAGE_MS');
    });
  });

  /**
   * LA LISTE ÉCOUTE LA CHUTE. C'est le témoin de STRUCTURE qui accompagne le
   * témoin de RÈGLE ci-dessus : `doitRattraper` peut être juste et n'être
   * appelé par personne — c'était précisément l'état de la liste, dont le seul
   * déclencheur était le retour de VISIBILITÉ.
   */
  it('la liste note la chute du socket et reprend sur `authenticated`', () => {
    const texte = source(LISTE);

    expect(texte).toContain("socket.on('disconnect'");
    expect(texte).toContain("socket.on('authenticated'");
    expect(texte).toContain('ctx.deconnecteDepuis = Date.now()');
  });
});
