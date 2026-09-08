/**
 * @jest-environment node
 */

import { carnetDuLecteur, repondreALaDemande } from '@/lib/api/contacts';

/**
 * CE QUE CES TÉMOINS ÉPROUVENT — la LECTURE des deux charges, contre la forme
 * que les producteurs servent RÉELLEMENT.
 *
 * Les bouchons ci-dessous ne sont pas écrits de mémoire : chaque clé est copiée
 * du schéma qui la déclare, et fast-json-stringify garantit qu'aucune autre
 * n'arrive (il retire toute propriété absente du schéma). Les deux sources :
 *
 *   - `demandeAvecPresenceSchema` — `services/gateway/src/routes/directory/friend-requests.ts:78`,
 *     soit `friendRequestSchema` (`packages/shared/types/api-schemas/friend-request.ts:21`)
 *     dont `sender` / `receiver` sont `userMinimalSchema` élargi LOCALEMENT de
 *     `firstName`, `lastName` et `lastActiveAt` (`friend-requests.ts:43-56`) ;
 *   - `directoryEntrySchema` — `services/gateway/src/routes/users/contacts-schemas.ts:24-39`,
 *     dont `matchedUser` est `matchedUserSchema` (`:9-22`).
 *
 * Trois d'entre eux gardent des choses qu'aucune assertion de rendu
 * n'attraperait :
 *
 *   - le SENS d'une demande se lit sur `senderId`, jamais sur la clé où la
 *     personne se trouve. `?direction=any` sert les deux sens dans la même
 *     liste, et les deux parties sont TOUJOURS présentes ;
 *   - la présence n'est jamais FABRIQUÉE. La passerelle masque en servant
 *     `isOnline: false` / `lastActiveAt: null` — indiscernable d'une absence
 *     réelle, et c'est voulu : le client rend ce qui est servi ;
 *   - une panne PARTIELLE est une panne. Servir la moitié qui a répondu ferait
 *     lire « aucun contact » à qui en a.
 */

const MOI = 'u-moi';

const json = (corps: unknown, statut = 200): Response =>
  new Response(JSON.stringify(corps), { status: statut });

/** `sender` / `receiver` — `demandeAvecPresenceSchema`. */
const partie = (id: string, nom: string, extra: Record<string, unknown> = {}) => ({
  id,
  username: nom.toLowerCase(),
  displayName: nom,
  avatar: null,
  firstName: null,
  lastName: null,
  // Masquée par la loi pour une demande EN ATTENTE : l'expéditeur n'est pas
  // encore un ami (directive 2026-08-25).
  isOnline: false,
  lastActiveAt: null,
  ...extra,
});

const demandeServie = ({
  id,
  senderId,
  receiverId,
  createdAt = '2026-09-01T10:00:00.000Z',
}: {
  id: string;
  senderId: string;
  receiverId: string;
  createdAt?: string;
}) => ({
  id,
  senderId,
  receiverId,
  message: null,
  status: 'pending',
  respondedAt: null,
  createdAt,
  updatedAt: createdAt,
  sender: partie(senderId, senderId === MOI ? 'Moi' : 'Sara Kim'),
  receiver: partie(receiverId, receiverId === MOI ? 'Moi' : 'Kofi Owusu'),
});

/** Une ligne de carnet — `directoryEntrySchema`. */
const contactServi = (extra: Record<string, unknown> = {}) => ({
  id: 'c-1',
  contactKey: 'phone:+33600000000',
  displayName: 'Marta Ruiz',
  phoneNumbers: ['+33600000000'],
  emails: [],
  usernames: [],
  isOnMeeshy: true,
  matchedBy: 'phone',
  matchedAt: '2026-08-01T00:00:00.000Z',
  lastSyncedAt: '2026-09-01T00:00:00.000Z',
  matchedUser: {
    id: 'u-marta',
    username: 'marta',
    firstName: null,
    lastName: null,
    displayName: 'Marta Ruiz',
    avatar: null,
    isOnline: true,
    lastActiveAt: '2026-09-02T23:59:00.000Z',
  },
  ...extra,
});

const passerelle = (parChemin: Readonly<Record<string, () => Response>>) => {
  const vus: string[] = [];
  const recuperer = async (url: string): Promise<Response> => {
    vus.push(url);
    const trouve = Object.entries(parChemin).find(([chemin]) => url.includes(chemin));
    if (trouve === undefined) throw new Error(`chemin non bouchonné : ${url}`);
    return trouve[1]();
  };
  return { recuperer, vus };
};

const NOMINALE = (
  demandes: readonly unknown[] = [
    demandeServie({ id: 'd-recue', senderId: 'u-sara', receiverId: MOI }),
    demandeServie({ id: 'd-envoyee', senderId: MOI, receiverId: 'u-kofi' }),
  ],
  contacts: readonly unknown[] = [contactServi()],
) =>
  passerelle({
    '/directory/friend-requests': () => json({ success: true, data: demandes }),
    '/directory/contacts': () => json({ success: true, data: contacts }),
  });

describe('le carnet du lecteur', () => {
  it('demande les DEUX sens en un seul appel, sur les adresses canoniques', async () => {
    const { recuperer, vus } = NOMINALE();

    await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer });

    expect(vus).toHaveLength(2);
    const demandes = vus.find((url) => url.includes('/friend-requests'));
    expect(demandes).toContain('/api/v1/directory/friend-requests');
    expect(demandes).toContain('direction=any');
    expect(demandes).toContain('status=pending');
    // L'alias déprécié n'est jamais appelé.
    expect(vus.some((url) => url.includes('/friend-requests/received'))).toBe(false);

    const carnet = vus.find((url) => url.includes('/directory/contacts'));
    expect(carnet).toContain('filter=meeshy');
  });

  it('classe une demande par senderId, et retient l’AUTRE partie', async () => {
    const { recuperer } = NOMINALE();

    const carnet = await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.demandesRecues.map((d) => d.id)).toEqual(['d-recue']);
    expect(carnet.demandesRecues[0]?.personne.id).toBe('u-sara');

    expect(carnet.demandesEnvoyees.map((d) => d.id)).toEqual(['d-envoyee']);
    // Sur une demande ENVOYÉE, l'autre partie est le RECEVEUR — prendre
    // `sender` parce qu'on a l'habitude rendrait le lecteur à lui-même.
    expect(carnet.demandesEnvoyees[0]?.personne.id).toBe('u-kofi');
  });

  it('ne FABRIQUE aucune présence : ce qui n’est pas servi n’est pas rendu', async () => {
    const { recuperer } = NOMINALE();

    const carnet = await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    // Une demande en attente : la loi de présence a masqué, le client ne
    // reconstitue rien.
    expect(carnet.demandesRecues[0]?.personne.enLigne).toBe(false);
    expect(carnet.demandesRecues[0]?.personne.vuA).toBeNull();

    // Un contact établi : la loi a servi, le client relaie tel quel.
    expect(carnet.contacts[0]?.personne.enLigne).toBe(true);
    expect(carnet.contacts[0]?.personne.vuA).toBe('2026-09-02T23:59:00.000Z');
  });

  it('garde le nom du CARNET, et retombe sur celui du compte quand il manque', async () => {
    const { recuperer } = NOMINALE(
      [],
      [
        contactServi({ id: 'c-carnet', displayName: 'Tata Marta' }),
        contactServi({ id: 'c-sans-nom', displayName: null }),
      ],
    );

    const carnet = await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.contacts.map((c) => c.nom)).toEqual(['Tata Marta', 'Marta Ruiz']);
    expect(carnet.contacts[0]?.personne.pseudonyme).toBe('marta');
  });

  it('écarte une ligne de carnet sans compte rapproché plutôt que d’en inventer un', async () => {
    // `filter=meeshy` ne devrait pas en servir ; la lecture ne s'appuie pas sur
    // cette promesse — `isOnMeeshy` est vrai et `matchedUser` nul est ce qu'un
    // lien COUPÉ par un blocage produirait (`ContactDirectoryService:518-521`).
    const { recuperer } = NOMINALE([], [contactServi({ matchedUser: null })]);

    const carnet = await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer });
    if (carnet.genre !== 'liste') throw new Error(carnet.genre);

    expect(carnet.contacts).toEqual([]);
  });

  it('dit « session expirée » quand l’une des deux routes refuse le jeton', async () => {
    const { recuperer } = passerelle({
      '/directory/friend-requests': () => json({ success: true, data: [] }),
      '/directory/contacts': () => json({ success: false }, 401),
    });

    expect((await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer })).genre).toBe(
      'session-expiree',
    );
  });

  it('ne sert PAS la moitié qui a répondu quand l’autre tombe', async () => {
    const recuperer = async (url: string): Promise<Response> => {
      if (url.includes('/friend-requests')) return json({ success: true, data: [] });
      throw new Error('réseau coupé');
    };

    expect((await carnetDuLecteur({ jeton: 'j', moiId: MOI, recuperer })).genre).toBe('panne');
  });
});

describe('répondre à une demande', () => {
  it('poste l’action que la passerelle attend, sur l’adresse canonique', async () => {
    const vus: Array<{ url: string; corps: unknown; methode?: string }> = [];
    const recuperer = async (url: string, options: RequestInit): Promise<Response> => {
      vus.push({
        url,
        methode: options.method,
        corps: JSON.parse(String(options.body)),
      });
      return json({ success: true, data: { id: 'd-1', status: 'accepted' } });
    };

    expect(
      await repondreALaDemande({ jeton: 'j', demandeId: 'd-1', geste: 'accepter', recuperer }),
    ).toBe('faite');

    expect(vus).toHaveLength(1);
    expect(vus[0]?.methode).toBe('PATCH');
    expect(vus[0]?.url).toContain('/api/v1/directory/friend-requests/d-1');
    // Le vocabulaire de la passerelle est `accept`/`reject`
    // (`friend-requests.ts:373`, `corpsAction`) — pas le nôtre.
    expect(vus[0]?.corps).toEqual({ action: 'accept' });
  });

  it('traduit « refuser » en `reject`', async () => {
    let corps: unknown = null;
    const recuperer = async (_url: string, options: RequestInit): Promise<Response> => {
      corps = JSON.parse(String(options.body));
      return json({ success: true, data: {} });
    };

    await repondreALaDemande({ jeton: 'j', demandeId: 'd-1', geste: 'refuser', recuperer });

    expect(corps).toEqual({ action: 'reject' });
  });

  it('sépare la session expirée de la panne', async () => {
    const refus = async (statut: number) => {
      const recuperer = async (): Promise<Response> => json({ success: false }, statut);
      return repondreALaDemande({ jeton: 'j', demandeId: 'd-1', geste: 'accepter', recuperer });
    };

    expect(await refus(401)).toBe('session-expiree');
    expect(await refus(404)).toBe('panne');
  });
});
