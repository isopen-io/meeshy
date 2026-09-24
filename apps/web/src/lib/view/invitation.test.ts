import { describe, expect, test } from 'bun:test';

import {
  memoriserLienParLecteur,
  partagerInvitation,
  partagerInvitationParrainee,
  portailDe,
  retourInvitationParrainee,
  TEXTE_INVITATION,
  type PortailPartage,
} from './invitation';

const LIEN = 'https://meeshy.me';

describe('partagerInvitation', () => {
  test('passe par la feuille du système quand elle existe', async () => {
    const vues: Array<{ title: string; text: string; url: string }> = [];
    const portail: PortailPartage = { share: async (d) => void vues.push(d) };

    expect(await partagerInvitation(LIEN, portail)).toBe('partage');
    expect(vues).toEqual([{ title: 'Meeshy', text: TEXTE_INVITATION, url: LIEN }]);
  });

  test('retombe sur le presse-papier quand le partage natif manque', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = { copier: async (t) => void copies.push(t) };

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
  });

  /**
   * Le cas qui distingue une décision d'une panne. Sans lui, fermer la feuille
   * de partage copierait quand même le lien : un effet que personne n'a
   * demandé, au moment précis où l'utilisateur venait de dire non.
   */
  test('une annulation ne copie RIEN', async () => {
    const copies: string[] = [];
    const abandon = new Error('annulé');
    abandon.name = 'AbortError';
    const portail: PortailPartage = {
      share: async () => { throw abandon; },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerInvitation(LIEN, portail)).toBe('annule');
    expect(copies).toEqual([]);
  });

  test('un partage EN PANNE retombe bien sur le presse-papier', async () => {
    const copies: string[] = [];
    const portail: PortailPartage = {
      share: async () => { throw new Error('NotAllowedError'); },
      copier: async (t) => void copies.push(t),
    };

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
  });

  test('sans aucun portail, le résultat le DIT — il ne se tait pas', async () => {
    expect(await partagerInvitation(LIEN, {})).toBe('indisponible');
  });
});

describe('RETOUR_INVITATION', () => {
  test('ne parle QUE des issues muettes', async () => {
    const { RETOUR_INVITATION } = await import('./invitation');
    // La feuille du système a déjà parlé : redoubler serait du bruit.
    expect(RETOUR_INVITATION.partage).toBeNull();
    expect(RETOUR_INVITATION.annule).toBeNull();
    // Rien n'a bougé à l'écran : sans un mot, « c'est fait » et « rien ne
    // s'est passé » sont indiscernables.
    expect(RETOUR_INVITATION.copie).toBeTruthy();
    expect(RETOUR_INVITATION.indisponible).toBeTruthy();
  });
});

const LIEN_PARRAIN = 'https://meeshy.me/signup/affiliate/aff_zoe';

/** Un portail qui NOTE tout ce qu'on lui fait faire. */
const portailTemoin = (share?: PortailPartage['share']) => {
  const partages: Array<{ title: string; text: string; url: string }> = [];
  const copies: string[] = [];
  const portail: PortailPartage = {
    share: share ?? (async (d) => void partages.push(d)),
    copier: async (t) => void copies.push(t),
  };
  return { portail, partages, copies };
};

describe('partagerInvitationParrainee — inviter avec SON code (#6707)', () => {
  test('le lien de parrainage part par la feuille, avec le texte d’invitation', async () => {
    const { portail, partages } = portailTemoin();

    const issue = await partagerInvitationParrainee({ chargerLien: async () => LIEN_PARRAIN, portail });

    expect(issue).toEqual({ resultat: 'partage', lien: LIEN_PARRAIN });
    expect(partages).toEqual([{ title: 'Meeshy', text: TEXTE_INVITATION, url: LIEN_PARRAIN }]);
  });

  /**
   * Le cas que l'issue interdit : partager le site nu en le laissant croire
   * parrainé. Sans lien, RIEN ne part — ni feuille, ni presse-papier.
   */
  test('sans lien, rien ne part : ni feuille ni presse-papier', async () => {
    const { portail, partages, copies } = portailTemoin();

    const issue = await partagerInvitationParrainee({ chargerLien: async () => null, portail });

    expect(issue).toEqual({ resultat: 'lien-indisponible' });
    expect(partages).toEqual([]);
    expect(copies).toEqual([]);
  });

  test('un chargement qui LÈVE est un lien indisponible, jamais une exception', async () => {
    const { portail, partages } = portailTemoin();

    const issue = await partagerInvitationParrainee({
      chargerLien: async () => {
        throw new Error('hors ligne');
      },
      portail,
    });

    expect(issue).toEqual({ resultat: 'lien-indisponible' });
    expect(partages).toEqual([]);
  });

  test('une annulation reste une annulation : aucune copie', async () => {
    const { portail, copies } = portailTemoin(async () => {
      throw Object.assign(new Error('annulé'), { name: 'AbortError' });
    });

    const issue = await partagerInvitationParrainee({ chargerLien: async () => LIEN_PARRAIN, portail });

    expect(issue).toEqual({ resultat: 'annule', lien: LIEN_PARRAIN });
    expect(copies).toEqual([]);
  });
});

describe('retourInvitationParrainee — ce que l’utilisateur doit s’entendre dire', () => {
  test('un lien indisponible SE VOIT, et n’invite pas à partager la page nue', () => {
    const message = retourInvitationParrainee({ resultat: 'lien-indisponible' });

    expect(message).toBeTruthy();
    expect(message ?? '').not.toContain('adresse de cette page');
  });

  /**
   * Après l'attente du réseau, Safari refuse la feuille ET le presse-papier
   * (`decisions.md`, D-48). « Copiez l'adresse de cette page » ferait partager
   * une adresse SANS code : le message porte donc le lien lui-même.
   */
  test('partage impossible : le message porte le lien de parrainage, à copier à la main', () => {
    const message = retourInvitationParrainee({ resultat: 'indisponible', lien: LIEN_PARRAIN });

    expect(message ?? '').toContain(LIEN_PARRAIN);
    expect(message ?? '').not.toContain('adresse de cette page');
  });

  test('la feuille a déjà parlé : partage et annulation se taisent, la copie s’annonce', () => {
    expect(retourInvitationParrainee({ resultat: 'partage', lien: LIEN_PARRAIN })).toBeNull();
    expect(retourInvitationParrainee({ resultat: 'annule', lien: LIEN_PARRAIN })).toBeNull();
    expect(retourInvitationParrainee({ resultat: 'copie', lien: LIEN_PARRAIN })).toBeTruthy();
  });
});

/** Un chargeur qui compte ses appels et rend, dans l'ordre, les valeurs données. */
const chargeurTemoin = (reponses: ReadonlyArray<string | null>) => {
  const appels = { n: 0 };
  const chargerLien = async (): Promise<string | null> => {
    const reponse = reponses[Math.min(appels.n, reponses.length - 1)] ?? null;
    appels.n += 1;
    return reponse;
  };
  return { chargerLien, appels };
};

describe('memoriserLienParLecteur — le second geste part SANS attendre le réseau', () => {
  test('le même lecteur ne recharge pas son lien', async () => {
    const { chargerLien, appels } = chargeurTemoin([LIEN_PARRAIN]);
    const lienDe = memoriserLienParLecteur(chargerLien);

    expect(await lienDe('u1')).toBe(LIEN_PARRAIN);
    expect(await lienDe('u1')).toBe(LIEN_PARRAIN);
    expect(appels.n).toBe(1);
  });

  /** Se déconnecter puis se connecter sous un AUTRE compte dans le même
   * onglet ne doit jamais partager le code du compte précédent. */
  test('un autre lecteur recharge le sien', async () => {
    const { chargerLien, appels } = chargeurTemoin(['https://meeshy.me/signup/affiliate/aff_u1', 'https://meeshy.me/signup/affiliate/aff_u2']);
    const lienDe = memoriserLienParLecteur(chargerLien);

    expect(await lienDe('u1')).toBe('https://meeshy.me/signup/affiliate/aff_u1');
    expect(await lienDe('u2')).toBe('https://meeshy.me/signup/affiliate/aff_u2');
    expect(appels.n).toBe(2);
  });

  test('un échec n’est pas mémorisé : le geste suivant réessaie', async () => {
    const { chargerLien, appels } = chargeurTemoin([null, LIEN_PARRAIN]);
    const lienDe = memoriserLienParLecteur(chargerLien);

    expect(await lienDe('u1')).toBeNull();
    expect(await lienDe('u1')).toBe(LIEN_PARRAIN);
    expect(appels.n).toBe(2);
  });

  /** Un double tap ne crée pas deux jetons : les deux gestes attendent le
   * MÊME chargement. */
  test('deux gestes simultanés partagent UN seul chargement', async () => {
    const { chargerLien, appels } = chargeurTemoin([LIEN_PARRAIN]);
    const lienDe = memoriserLienParLecteur(chargerLien);

    const [a, b] = await Promise.all([lienDe('u1'), lienDe('u1')]);

    expect([a, b]).toEqual([LIEN_PARRAIN, LIEN_PARRAIN]);
    expect(appels.n).toBe(1);
  });

  test('sans lecteur identifié, rien n’est mémorisé', async () => {
    const { chargerLien, appels } = chargeurTemoin([LIEN_PARRAIN]);
    const lienDe = memoriserLienParLecteur(chargerLien);

    await lienDe(null);
    await lienDe(null);
    expect(appels.n).toBe(2);
  });
});

/**
 * LA COQUE ANDROID (#7710) — la WebView Android n'implémente pas l'API Web
 * Share : `navigator.share` y est ABSENT, et le portail ne voyait qu'un
 * presse-papier. Chaque « Partager » copiait donc le lien au lieu d'ouvrir la
 * feuille du système que le même geste ouvre sur le web mobile et sur iOS.
 * La coque déclare son pont `MeeshyShare` dans `Capacitor.PluginHeaders` ; le
 * portail l'emprunte, sans importer `@capacitor/core`.
 */
describe('portailDe — la feuille de partage dans la coque Android (#7710)', () => {
  const copieur = { clipboard: { writeText: async () => {} } };

  function coqueAvec(plugins: ReadonlyArray<string>) {
    const appels: Array<{ plugin: string; methode: string; options: unknown }> = [];
    const coque = {
      PluginHeaders: plugins.map((name) => ({ name })),
      nativePromise: async (plugin: string, methode: string, options: unknown) => {
        appels.push({ plugin, methode, options });
        return {};
      },
    };
    return { coque, appels };
  }

  test('navigator.share présent : c’est lui qui ouvre la feuille, jamais le pont', async () => {
    const vues: unknown[] = [];
    const { coque, appels } = coqueAvec(['MeeshyShare']);
    const portail = portailDe({ nav: { ...copieur, share: async (d: unknown) => void vues.push(d) }, coque });

    expect(await partagerInvitation(LIEN, portail)).toBe('partage');
    expect(vues).toHaveLength(1);
    expect(appels).toEqual([]);
  });

  test('navigator.share absent, pont déclaré : la feuille Android s’ouvre au lieu de copier', async () => {
    const { coque, appels } = coqueAvec(['SystemBars', 'MeeshyShare']);
    const portail = portailDe({ nav: copieur, coque });

    expect(await partagerInvitation(LIEN, portail)).toBe('partage');
    expect(appels).toEqual([
      { plugin: 'MeeshyShare', methode: 'share', options: { title: 'Meeshy', text: TEXTE_INVITATION, url: LIEN } },
    ]);
  });

  test('coque SANS le pont (build antérieur) : le presse-papier reste le repli', async () => {
    const { coque, appels } = coqueAvec(['SystemBars']);
    const copies: string[] = [];
    const portail = portailDe({ nav: { clipboard: { writeText: async (t: string) => void copies.push(t) } }, coque });

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
    expect(appels).toEqual([]);
  });

  test('le pont refuse (aucune application pour partager) : le lien est copié', async () => {
    const copies: string[] = [];
    const coque = {
      PluginHeaders: [{ name: 'MeeshyShare' }],
      nativePromise: async () => {
        throw new Error('Aucune application ne sait partager ce lien');
      },
    };
    const portail = portailDe({ nav: { clipboard: { writeText: async (t: string) => void copies.push(t) } }, coque });

    expect(await partagerInvitation(LIEN, portail)).toBe('copie');
    expect(copies).toEqual([LIEN]);
  });

  test('hors coque (navigateur sans Web Share) : rien ne change', async () => {
    expect(portailDe({ nav: copieur, coque: undefined }).share).toBeUndefined();
  });
});
