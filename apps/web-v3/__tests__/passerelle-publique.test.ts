/**
 * @jest-environment node
 */

/**
 * L'ORIGINE PUBLIQUE DE LA PASSERELLE — ce que le DOCUMENT remet au navigateur.
 *
 * Défaut d'origine (staging, 2026-09-05) : `/chats/:id`, servie en HTTPS, portait
 * `data-passerelle="http://gateway-staging:3000"` — le nom INTERNE du conteneur
 * de la passerelle. Le navigateur bloquait le socket (`ws://`) comme la
 * relecture des messages (`http://`) en CONTENU MIXTE, et le fil restait un
 * formulaire. La cause : `baseDeLaPasserellePublique()` retombait sur
 * `MEESHY_GATEWAY_URL` dès que `NEXT_PUBLIC_API_URL` manquait à l'environnement
 * du conteneur. Un repli qui remet au navigateur une adresse qu'il ne peut pas
 * résoudre n'est pas un repli : c'est une panne SILENCIEUSE, que rien ne
 * signalait — ni le document, ni `/healthz`.
 *
 * La règle gardée ici : une adresse interne ne part JAMAIS vers un navigateur.
 * Quand l'origine publique manque, le document REFUSE (il lève), et `/healthz`
 * le dit (503) — un conteneur mal configuré ne devient pas sain, donc Traefik
 * ne lui envoie personne.
 */
import { baseDeLaPasserelle, baseDeLaPasserellePublique } from '@/lib/api/passerelle';
import { GET as sante } from '@/app/healthz/route';

const VARIABLES = ['MEESHY_GATEWAY_URL', 'NEXT_PUBLIC_API_URL'] as const;
type Variable = (typeof VARIABLES)[number];

const INTERNE = 'http://gateway-staging:3000';
const PUBLIQUE = 'https://gate.staging.meeshy.me';

const sauvegarde: Readonly<Record<Variable, string | undefined>> = {
  MEESHY_GATEWAY_URL: process.env.MEESHY_GATEWAY_URL,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
};

const pose = (nom: Variable, valeur: string | undefined): void => {
  if (valeur === undefined) {
    delete process.env[nom];
    return;
  }
  process.env[nom] = valeur;
};

const environnement = (valeurs: Partial<Record<Variable, string>>): void => {
  VARIABLES.forEach((nom) => pose(nom, valeurs[nom]));
};

afterEach(() => {
  VARIABLES.forEach((nom) => pose(nom, sauvegarde[nom]));
});

describe("l'origine publique de la passerelle — celle que le navigateur reçoit", () => {
  it('est NEXT_PUBLIC_API_URL quand elle est posée, sans barre finale', () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE, NEXT_PUBLIC_API_URL: `${PUBLIQUE}/` });
    expect(baseDeLaPasserellePublique()).toBe(PUBLIQUE);
  });

  it("REFUSE de remettre l'adresse interne des conteneurs au navigateur quand la publique manque", () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE });
    expect(() => baseDeLaPasserellePublique()).toThrow(/gateway-staging:3000/);
    expect(() => baseDeLaPasserellePublique()).toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it('traite une NEXT_PUBLIC_API_URL vide comme absente', () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE, NEXT_PUBLIC_API_URL: '' });
    expect(() => baseDeLaPasserellePublique()).toThrow(/gateway-staging:3000/);
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:4010', 'http://[::1]:3000'])(
    'sur un poste de développement, la boucle locale %s suffit : le navigateur y est aussi',
    (boucle) => {
      environnement({ MEESHY_GATEWAY_URL: boucle });
      expect(baseDeLaPasserellePublique()).toBe(boucle);
    },
  );

  it("sans aucune variable, c'est la passerelle locale du poste", () => {
    environnement({});
    expect(baseDeLaPasserellePublique()).toBe('http://localhost:3000');
  });

  it("le SERVEUR, lui, joint toujours l'adresse interne d'abord", () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE, NEXT_PUBLIC_API_URL: PUBLIQUE });
    expect(baseDeLaPasserelle()).toBe(INTERNE);
  });
});

describe('/healthz dit si le document peut nommer la passerelle au navigateur', () => {
  it("est sain quand l'origine publique est configurée", async () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE, NEXT_PUBLIC_API_URL: PUBLIQUE });
    const reponse = sante();
    expect(reponse.status).toBe(200);
    await expect(reponse.json()).resolves.toEqual({ ok: true, passerellePublique: PUBLIQUE });
  });

  it("refuse d'être sain (503) quand le document remettrait une adresse interne", async () => {
    environnement({ MEESHY_GATEWAY_URL: INTERNE });
    const reponse = sante();
    expect(reponse.status).toBe(503);
    const corps = (await reponse.json()) as { readonly ok: boolean; readonly cause: string };
    expect(corps.ok).toBe(false);
    expect(corps.cause).toContain('gateway-staging:3000');
  });
});
