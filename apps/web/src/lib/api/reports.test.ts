import { describe, expect, test } from 'bun:test';

import { REPORT_REASONS, reportUser, type ReportOutcome } from './reports';

/**
 * **SIGNALER — LE PORT QUI EXISTAIT SANS APPELANT** (#7187).
 *
 * `POST /api/v1/reports` vit côté passerelle avec ses huit motifs et ses trois
 * limiteurs. Mesuré avant ce lot : pas une occurrence de `v1/reports`,
 * `reportedEntityId` ni `reportType` dans `apps/web/src`.
 *
 * C'est la forme d'absence la plus trompeuse du dépôt : **un port sans appelant
 * ressemble à une feature livrée dans tous les relevés qui comptent les
 * endpoints**.
 *
 * ## CE QUE CES TÉMOINS GARDENT VRAIMENT
 *
 * Moins la mécanique de la requête que la LECTURE DE SES ISSUES. Un signalement
 * dont l'issue est mal lue est pire qu'un bouton absent : il dit « envoyé »
 * quand rien n'est parti, ou « échoué » quand il faut seulement attendre — et
 * la personne qui signale un harcèlement n'a aucun moyen de faire la
 * différence.
 */

type Appel = { readonly method?: string; readonly path?: string; readonly body?: unknown };

const transportQui = (
  repondre: () => unknown,
): { readonly transport: { request: (a: Appel) => Promise<unknown> }; readonly appels: Appel[] } => {
  const appels: Appel[] = [];
  return {
    appels,
    transport: {
      request: async (a: Appel) => {
        appels.push(a);
        const r = repondre();
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
};

const signaler = (repondre: () => unknown, details?: string): Promise<ReportOutcome> => {
  const { transport } = transportQui(repondre);
  return reportUser({
    userId: 'u-cible',
    reason: 'harassment',
    ...(details === undefined ? {} : { details }),
    deps: { source: 'gateway', transport: transport as never },
  });
};

describe('la charge est celle que le serveur DÉCLARE', () => {
  test('elle nomme le type, la cible et le motif', async () => {
    const { transport, appels } = transportQui(() => ({ ok: true, data: {} }));

    await reportUser({
      userId: 'u-cible',
      reason: 'hate_speech',
      deps: { source: 'gateway', transport: transport as never },
    });

    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe('/api/v1/reports');
    expect(appels[0]?.body).toEqual({
      reportedType: 'user',
      reportedEntityId: 'u-cible',
      reportType: 'hate_speech',
    });
  });

  /**
   * LES HUIT MOTIFS SONT CEUX DU SERVEUR. Une neuvième valeur inventée ici
   * serait refusée en 400 ; une valeur MANQUANTE retirerait silencieusement un
   * motif que la modération attend. Le témoin les énumère pour que retirer l'un
   * d'eux ne passe pas inaperçu.
   */
  test('les huit motifs, ni plus ni moins', () => {
    expect([...REPORT_REASONS]).toEqual([
      'spam',
      'inappropriate',
      'harassment',
      'violence',
      'hate_speech',
      'fake_profile',
      'impersonation',
      'other',
    ]);
  });

  /** Le texte libre est FACULTATIF, et une chaîne vide ne voyage pas : le
      serveur la refuserait pas, mais elle encombrerait la modération d'un champ
      qui ne dit rien. */
  test('un détail vide ne part pas ; un détail rempli part élagué', async () => {
    const vide = transportQui(() => ({ ok: true, data: {} }));
    await reportUser({
      userId: 'u1',
      reason: 'spam',
      details: '   ',
      deps: { source: 'gateway', transport: vide.transport as never },
    });
    expect(Object.keys(vide.appels[0]?.body as object)).not.toContain('reason');

    const plein = transportQui(() => ({ ok: true, data: {} }));
    await reportUser({
      userId: 'u1',
      reason: 'spam',
      details: '  il insiste  ',
      deps: { source: 'gateway', transport: plein.transport as never },
    });
    expect((plein.appels[0]?.body as { reason?: string }).reason).toBe('il insiste');
  });
});

describe('et chaque issue se lit pour ce qu’elle est', () => {
  test('un succès dit « envoyé »', async () => {
    expect(await signaler(() => ({ ok: true, data: {} }))).toBe('done');
  });

  /**
   * LE DÉBIT N'EST PAS UN ÉCHEC, et c'est le témoin qui porte l'issue. La
   * passerelle pose TROIS limiteurs sur cette route ; dire « échoué » à
   * quelqu'un qui vient de signaler un harcèlement, alors qu'il a seulement été
   * trop rapide, l'enverrait recommencer — et le limiteur le refuserait encore.
   */
  test('un 429 dit « pas maintenant », jamais « échoué »', async () => {
    expect(await signaler(() => ({ ok: false, status: 429, error: 'too many' }))).toBe('throttled');
  });

  /**
   * UNE PANNE DE RÉSEAU N'EST PAS UN REFUS : le geste n'est pas parti. Le dire
   * « échoué » enverrait la personne recommencer alors que c'est sa connexion
   * qu'il faut attendre.
   */
  test('un réseau coupé dit « hors ligne »', async () => {
    expect(await signaler(() => new Error('offline'))).toBe('offline');
  });

  test('un refus DÉFINITIF dit « échoué »', async () => {
    expect(await signaler(() => ({ ok: false, status: 404, error: 'gone' }))).toBe('failed');
  });

  /** Un 5xx est PASSAGER : il se retente, il ne se déclare pas perdu. */
  test('une panne serveur passagère ne se déclare pas échouée', async () => {
    expect(await signaler(() => ({ ok: false, status: 503, error: 'unavailable' }))).toBe('offline');
  });
});
