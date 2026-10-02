import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { ADMIN_LANGUAGES, loadAdminInterfaceCatalog, translateAdmin } from '@/lib/i18n-admin-catalog';
import { expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { createActMounter } from '@/test-support/act-mount';
import { servedPagination } from '@/test-support/served-pagination';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminAgentPanel } from './admin-agent-parts';

/**
 * **LA SECTION AGENT DE L'ADMINISTRATION** (#6733) — les cinq témoins que le
 * porteur a nommés, et un sixième qui garde l'honnêteté du libellé.
 *
 * ## LE LIBELLÉ QUI NE DOIT PAS MENTIR
 *
 * `POST /admin/agent/configs/:id/trigger` ne « relance pas l'analyse » : il
 * rejoue le cycle COMPLET du graphe LangGraph — `observer` → `strategist` →
 * `generator` → `qualityGate` — et peut donc faire **PUBLIER un message par
 * l'agent dans la vraie conversation**. L'appeler « relancer l'analyse »
 * serait un contrôle dont le nom cache l'effet : la loi 4 interdit un contrôle
 * qui n'a pas d'effet, et celle-ci en est la face inverse — un contrôle dont
 * l'effet dépasse ce que son nom annonce.
 *
 * ## CE QUE LA REFONTE SUR LE KIT (#8876) A CHANGÉ DANS CES TÉMOINS
 *
 * - la relance passe par une confirmation (`AdminConfirmSheet`) : un message
 *   publié a été lu, le geste ne part plus au premier clic ;
 * - l'étape du graphe se dit en mots (« rédige un message »), jamais par son
 *   nom de nœud ;
 * - les deux listes sont deux sections toujours dépliées du kit, plus des
 *   sections repliables.
 *
 * Le témoin des QUATRE langues est le seul qui puisse l'attraper : une seule
 * langue vérifiée laisserait trois libellés dire autre chose, et c'est
 * exactement la forme qu'un catalogue fait prendre à ce défaut.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const STATS = { totalConfigs: 4, activeConfigs: 2, totalControlledUsers: 9, totalMessagesSent: 120, avgConfidence: 0.66 };

const ligneSuivie = (extra: Readonly<Record<string, unknown>>) => ({
  id: 'cfg1',
  conversationId: 'c-atelier',
  conversation: { id: 'c-atelier', title: 'Atelier', type: 'group' },
  enabled: true,
  isScanning: false,
  currentNode: null,
  controlledUserIds: ['u1'],
  analytics: { messagesSent: 3, totalWordsSent: 40, avgConfidence: 0.7, lastResponseAt: '2026-09-17T08:00:00.000Z' },
  ...extra,
});

const JOURNAL = {
  data: [
    {
      id: 'log-1',
      conversationId: 'c-atelier',
      conversation: { id: 'c-atelier', title: 'Atelier', type: 'group' },
      trigger: 'manual',
      startedAt: '2026-09-17T09:00:00.000Z',
      durationMs: 4200,
      outcome: 'messages_sent',
      messagesSent: 2,
      reactionsSent: 1,
      messagesRejected: 0,
      estimatedCostUsd: 0.0123,
    },
  ],
  pagination: servedPagination({ total: 1, page: 1, limit: 20, hasMore: false }),
};

const DETAIL = {
  ...JOURNAL.data[0],
  totalInputTokens: 900,
  totalOutputTokens: 120,
  userIdsUsed: ['u1', 'u2', 'u3'],
};

type Espion = { readonly transport: HttpTransport; readonly vues: HttpRequest[] };

function transportAgent(
  options: { readonly scanEnCours?: boolean; readonly relanceEchoue?: boolean; readonly arretEchoue?: boolean } = {},
): Espion {
  const vues: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (requete: HttpRequest): Promise<ApiResult<unknown>> => {
    vues.push(requete);
    const { path, method } = requete;

    if (method === 'POST' && path.endsWith('/trigger')) {
      return options.relanceEchoue === true
        ? { ok: false, status: 404, error: 'Config non trouvée' }
        : { ok: true, data: { conversationId: 'c-atelier', triggered: true, triggeredAt: 1758100000000 } };
    }
    if (method === 'POST' && path.endsWith('/stop')) {
      return options.arretEchoue === true
        ? { ok: false, status: 500, error: 'Erreur serveur' }
        : { ok: true, data: { conversationId: 'c-atelier', stopped: true } };
    }
    if (path.includes('/scan-logs/')) return { ok: true, data: DETAIL };
    if (path.includes('/scan-logs')) return { ok: true, data: JOURNAL.data, pagination: JOURNAL.pagination };
    if (path.includes('/stats')) return { ok: true, data: STATS };
    if (path.includes('/configs')) {
      return {
        ok: true,
        data: [ligneSuivie(options.scanEnCours === true ? { isScanning: true, currentNode: 'generator' } : {})],
        pagination: servedPagination({ total: 1, page: 1, limit: 20, hasMore: false }),
      };
    }
    return { ok: false, status: 404, error: `non prévu : ${method} ${path}` };
  }) as HttpTransport['request'];
  return { transport, vues };
}

async function monter(espion: Espion): Promise<HTMLDivElement> {
  return mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminAgentPanel language="fr" deps={{ source: 'gateway', transport: espion.transport }} />
    </QueryClientProvider>,
  );
}


const confirmation = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="confirm"]');

/** Relancer, c'est ouvrir la confirmation PUIS la valider : les deux gestes d'un envoi qui peut publier. */
async function relancer(host: HTMLElement): Promise<void> {
  await mounter.click(host.querySelector('[data-agent-relaunch="c-atelier"]') as HTMLElement | null);
  await mounter.click(confirmation());
}

describe('LA RELANCE appelle la bonne adresse et rend son feedback', () => {
  test('elle frappe /trigger de la conversation, en POST', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    await relancer(host);

    const relance = espion.vues.find((vue) => vue.path.endsWith('/trigger'));
    expect(relance?.method).toBe('POST');
    expect(relance?.path).toBe('/api/v1/admin/agent/configs/c-atelier/trigger');
  });

  test('le premier clic ne publie RIEN : il ouvre la confirmation, qui redit l’effet', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    await mounter.click(host.querySelector('[data-agent-relaunch="c-atelier"]') as HTMLElement | null);

    expect(espion.vues.some((vue) => vue.path.endsWith('/trigger'))).toBe(false);
    expect(document.querySelector('[data-admin-confirm]')?.textContent).toContain(translateAdmin('fr', 'admin.agent.effect'));
  });

  test('annuler la confirmation n’envoie rien', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    await mounter.click(host.querySelector('[data-agent-relaunch="c-atelier"]') as HTMLElement | null);
    await mounter.click(document.querySelector<HTMLElement>('[data-admin-confirm] [data-admin-action="cancel"]'));

    expect(espion.vues.some((vue) => vue.path.endsWith('/trigger'))).toBe(false);
    expect(document.querySelector('[data-admin-confirm]')).toBeNull();
  });

  test('le geste est ANNONCÉ — un lecteur d’écran apprend qu’il a eu lieu', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    await relancer(host);

    const annonce = host.querySelector('[data-admin-announcement]');
    expect(annonce?.textContent).toBe(translateAdmin('fr', 'admin.agent.done'));
    expect(annonce?.getAttribute('aria-live')).toBe('polite');
  });

  test('un refus le DIT, au lieu d’annoncer une relance qui n’a pas eu lieu', async () => {
    const espion = transportAgent({ relanceEchoue: true });
    const host = await monter(espion);

    await relancer(host);

    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe(
      translateAdmin('fr', 'admin.agent.failed'),
    );
  });

  test('le bouton se DÉSARME pendant l’envoi — jamais deux cycles pour un geste', async () => {
    const espion = transportAgent();
    const host = await monter(espion);
    const bouton = host.querySelector('[data-agent-relaunch="c-atelier"]');

    expect(bouton instanceof HTMLButtonElement && bouton.disabled).toBe(false);
    await mounter.click(bouton as HTMLElement | null);
    // Après retour, il se réarme : un contrôle définitivement éteint serait un
    // contrôle perdu.
    expect(host.querySelector('[data-agent-relaunch="c-atelier"]')).not.toBe(null);
  });
});

describe('UNE ANCRE PAR BOUTON, SUR L’EXEMPLAIRE VISIBLE', () => {
  /** Le tableau ET les cartes sont dans le DOM : seul l'exemplaire que la largeur montre porte l'ancre. */
  const avecLargeur = async (large: boolean): Promise<HTMLDivElement> => {
    const déjà = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: () => ({ matches: large, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    try {
      return await monter(transportAgent({ scanEnCours: true }));
    } finally {
      if (déjà === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
      else Object.defineProperty(globalThis, 'matchMedia', déjà);
    }
  };

  test('large : la relance et l’arrêt sont ancrés dans le tableau, une seule fois', async () => {
    const host = await avecLargeur(true);

    const relances = host.querySelectorAll('[data-agent-relaunch="c-atelier"]');
    expect(relances).toHaveLength(1);
    expect(relances[0]?.closest('table')).not.toBe(null);
    expect(host.querySelectorAll('[data-agent-stop="c-atelier"]')).toHaveLength(1);
  });

  test('étroit : l’ancre passe à la carte — c’est elle qui se voit', async () => {
    const host = await avecLargeur(false);

    const relances = host.querySelectorAll('[data-agent-relaunch="c-atelier"]');
    expect(relances).toHaveLength(1);
    expect(relances[0]?.closest('[data-admin-card]')).not.toBe(null);
    expect(host.querySelectorAll('[data-agent-stop="c-atelier"]')).toHaveLength(1);
  });
});

describe('UN SCAN EN COURS AFFICHE L’ARRÊT', () => {
  test('au repos, aucun bouton d’arrêt — un contrôle sans objet ne se peint pas', async () => {
    const host = await monter(transportAgent());

    expect(host.querySelector('[data-agent-stop="c-atelier"]')).toBe(null);
  });

  test('scan en cours : l’arrêt apparaît, et il dit l’étape EN MOTS — jamais le nom du nœud', async () => {
    const host = await monter(transportAgent({ scanEnCours: true }));

    expect(host.querySelector('[data-agent-stop="c-atelier"]')).not.toBe(null);
    const scan = host.querySelector('[data-agent-scanning="c-atelier"]')?.textContent ?? '';
    expect(scan).toContain(translateAdmin('fr', 'admin.agentPanel.node.generator'));
    expect(scan).not.toContain('generator');
  });

  test('l’arrêt frappe /stop, en POST', async () => {
    const espion = transportAgent({ scanEnCours: true });
    const host = await monter(espion);

    await mounter.click(host.querySelector('[data-agent-stop="c-atelier"]') as HTMLElement | null);

    const arret = espion.vues.find((vue) => vue.path.endsWith('/stop'));
    expect(arret?.method).toBe('POST');
    expect(arret?.path).toBe('/api/v1/admin/agent/configs/c-atelier/stop');
  });
});

describe('CHAQUE LIGNE DU JOURNAL OUVRE SON DÉTAIL — aucune ligne inerte', () => {
  test('la ligne est un BOUTON : le clavier y arrive, pas seulement la souris', async () => {
    const host = await monter(transportAgent());
    const ligne = host.querySelector('[data-agent-log-open="log-1"]');

    expect(ligne).not.toBe(null);
    expect(ligne instanceof HTMLButtonElement).toBe(true);
  });

  test('la toucher ouvre un détail qui n’existait pas avant le geste', async () => {
    const host = await monter(transportAgent());
    expect(document.querySelector('[data-agent-log-detail]')).toBe(null);

    await mounter.click(host.querySelector('[data-agent-log-open="log-1"]') as HTMLElement | null);

    expect(document.querySelector('[data-agent-log-detail="log-1"]')).not.toBe(null);
    // Le détail sert ce que la LISTE ne porte pas : sinon l'ouvrir n'apprend
    // rien, et le geste est un contrôle sans effet (loi 4).
    expect(document.querySelector('[data-agent-log-detail="log-1"]')?.textContent).toContain('3');
  });

  test('ouvrir le détail frappe l’adresse du log', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    await mounter.click(host.querySelector('[data-agent-log-open="log-1"]') as HTMLElement | null);

    expect(espion.vues.some((vue) => vue.path === '/api/v1/admin/agent/scan-logs/log-1')).toBe(true);
  });
});

describe('L’ÉCRAN EST COMPOSÉ DU KIT — deux sections nommées, des chiffres, des listes', () => {
  test('les conversations suivies et le journal sont deux sections titrées, toujours dépliées', async () => {
    const host = await monter(transportAgent());

    expect(host.querySelector('[data-admin-fiche-section="tracked"] h2')?.textContent).toBe(translateAdmin('fr', 'admin.agent.tracked'));
    expect(host.querySelector('[data-admin-fiche-section="logs"] h2')?.textContent).toBe(translateAdmin('fr', 'admin.agent.logs'));
    expect(host.querySelector('[data-agent-log-open="log-1"]')).not.toBe(null);
  });

  test('les trois chiffres de la vue d’ensemble sont des cartes, formatés', async () => {
    const host = await monter(transportAgent());

    const carte = (ancre: string) => host.querySelector(`[data-admin-stat="${ancre}"]`)?.textContent ?? '';
    expect(carte('tracked')).toContain('2');
    expect(carte('tracked')).toContain(translateAdmin('fr', 'admin.agentPanel.stat.trackedCaption', { total: '4' }));
    expect(carte('users')).toContain('9');
    expect(carte('messages')).toContain('120');
  });

  test('la conversation suivie porte son NOM, l’issue et le déclencheur se disent en mots', async () => {
    const host = await monter(transportAgent());

    const suivie = host.querySelector('[data-admin-list="agent"]')?.textContent ?? '';
    expect(suivie).toContain('Atelier');
    expect(host.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.outcome.messages_sent'));
    expect(host.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.trigger.manual'));
  });

  test('aucun identifiant, aucun horodatage brut, aucun code d’issue peint', async () => {
    const host = await monter(transportAgent());

    expectNoRawIdentifiers(host);
    expect(host.textContent).not.toContain('messages_sent');
  });

  test('le détail d’un scan ne peint que des mots : issue, déclencheur, durée, coût', async () => {
    const host = await monter(transportAgent());

    await mounter.click(host.querySelector('[data-agent-log-open="log-1"]') as HTMLElement | null);

    const detail = document.querySelector<HTMLElement>('[data-agent-log-detail="log-1"]');
    expect(detail).not.toBe(null);
    if (detail !== null) expectNoRawIdentifiers(detail);
    expect(detail?.textContent).toContain(translateAdmin('fr', 'admin.agentPanel.outcome.messages_sent'));
    expect(detail?.querySelector('[data-admin-technical-id]')).not.toBe(null);
  });

  test('la remise à zéro et le modèle ne sont PAS offerts : aucun de leurs appels ne part, aucun contrôle n’est peint', async () => {
    const espion = transportAgent();
    const host = await monter(espion);

    expect(host.querySelector('[data-agent-reset], [data-agent-llm]')).toBe(null);
    expect(espion.vues.filter((vue) => vue.method !== 'GET')).toEqual([]);
    expect(espion.vues.every((vue) => !/\/(reset|llm)/.test(vue.path))).toBe(true);
  });
});

describe('LE LIBELLÉ DE RELANCE MENTIONNE LA PUBLICATION — dans les QUATRE langues de l’administration', () => {
  /**
   * Un mot par langue, choisi dans la FAMILLE de « publier » : c'est le seul
   * fait que le libellé doit porter. Vérifier une seule langue laisserait trois
   * libellés promettre une simple analyse — et c'est précisément la forme que
   * prend ce défaut dans un catalogue, où chaque langue est traduite à part.
   */
  const PUBLIE: Readonly<Record<string, string>> = {
    fr: 'publier',
    en: 'publish',
    es: 'publicar',
    pt: 'publicar',
  };

  test('les quatre catalogues disent que la relance peut PUBLIER', async () => {
    for (const langue of ADMIN_LANGUAGES) {
      await loadAdminInterfaceCatalog(langue);
      const effet = translateAdmin(langue, 'admin.agent.effect').toLowerCase();

      expect({ langue, dit: effet.includes(PUBLIE[langue] ?? ' ') }).toEqual({ langue, dit: true });
    }
  });

  test('le bouton ne s’appelle jamais « relancer l’analyse » — un nom qui cacherait l’effet', async () => {
    for (const langue of ADMIN_LANGUAGES) {
      await loadAdminInterfaceCatalog(langue);
      const libelle = translateAdmin(langue, 'admin.agent.relaunch').toLowerCase();

      for (const analyse of ['analyse', 'analysis', 'análisis', 'análise', 'analyse', 'analisi']) {
        expect({ langue, libelle, cache: libelle.includes(analyse) }).toEqual({ langue, libelle, cache: false });
      }
    }
  });

  test('l’effet est SERVI à côté du bouton, pas seulement présent au catalogue', async () => {
    const host = await monter(transportAgent());

    // Une clé traduite que personne ne rend n'avertit personne : c'est la
    // jumelle de « qui AFFICHE ce que tu résous ? ».
    expect(host.textContent).toContain(translateAdmin('fr', 'admin.agent.effect'));
  });
});

/**
 * **UN ÉCHEC NOMME L'ÉCHEC, JAMAIS UNE AUTRE ACTION** (#6733,
 * revue-correction) — le libellé d'échec disait « Échec de la relance », et il
 * était servi AUSSI quand c'est l'ARRÊT qui avait échoué.
 *
 * L'administrateur lisait donc, après avoir demandé un arrêt : « la relance a
 * échoué ». Deux lectures fausses d'un coup — une action qu'il n'a pas
 * demandée, et rien sur celle qu'il a demandée. Le scan, lui, continue.
 *
 * Le libellé est devenu NEUTRE plutôt que dédoublé : le catalogue
 * d'administration tient sous un plafond de poids (11 Ko gzip), et une clé est
 * payée SEPT fois. Une phrase qui ne nomme aucune des deux actions dit le vrai
 * dans les deux cas — c'est la seule forme qui tienne dans le budget sans
 * mentir.
 */
describe('le libellé d’échec ne nomme aucune des deux actions — dans les SEPT langues', () => {
  /**
   * LE RADICAL, JAMAIS LE MOT ENTIER — et c'est une leçon payée dans cette
   * revue même : écrit sur des mots complets, ce témoin laissait passer
   * « Échec de la relance » face à « Relancer l'agent » (relance ≠ relancer).
   * Un témoin qui ne tombe pas sur le défaut qu'il est né pour attraper ne
   * mesure rien. Trois lettres couvrent aussi l'arabe, dont les mots utiles
   * sont plus courts que le seuil qu'une langue latine suggère.
   */
  const RADICAL = 3;

  const radicauxDe = (phrase: string): readonly string[] =>
    phrase
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .split(/[^\p{L}]+/u)
      .filter((mot) => mot.length >= RADICAL)
      .map((mot) => mot.slice(0, RADICAL));

  test('aucun radical partagé avec « relancer » ni avec « arrêter »', async () => {
    for (const langue of ADMIN_LANGUAGES) {
      await loadAdminInterfaceCatalog(langue);
      const echec = radicauxDe(translateAdmin(langue, 'admin.agent.failed'));
      const actions = [
        ...radicauxDe(translateAdmin(langue, 'admin.agent.relaunch')),
        ...radicauxDe(translateAdmin(langue, 'admin.agent.stop')),
      ];

      const partages = echec.filter((mot) => actions.includes(mot));
      expect({ langue, partages }).toEqual({ langue, partages: [] });
    }
  });

  test('un ARRÊT refusé est annoncé — et par ce libellé-là', async () => {
    const espion = transportAgent({ scanEnCours: true, arretEchoue: true });
    const host = await monter(espion);

    await mounter.click(host.querySelector('[data-agent-stop="c-atelier"]') as HTMLElement | null);

    expect(host.querySelector('[data-admin-announcement]')?.textContent).toBe(
      translateAdmin('fr', 'admin.agent.failed'),
    );
  });
});
