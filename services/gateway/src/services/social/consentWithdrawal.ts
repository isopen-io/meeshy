/**
 * Le RETRAIT du consentement d'analyse (#10499, revue de conformité O4 —
 * RGPD art. 7(3)) détache le compte de son comportement DÉJÀ rangé.
 *
 *  - `ContentEvent` : `actorKind` repasse à `none`, `userId` et tout ce qui
 *    relie des événements entre eux disparaissent (session d'application,
 *    page de fil, session de listing, recherche) ou à une AUTRE ligne qui
 *    garde le compte (clé de l'impression comptée, identifiant de la mutation
 *    REST) ; l'OS retombe à sa version
 *    majeure et le réseau à son type — la forme d'une ligne jamais consentie ;
 *  - `PostImpression` : la ligne garde son compte (elle est du COMPTAGE, et
 *    la suppression du compte l'efface), et retombe à ce qu'un compte qui
 *    refuse l'analyse laisse : ni session, ni page, ni rang, ni visibilité,
 *    ni plateforme ;
 *  - `PostEngagement` : la session garde son compte et sa mesure de comptage,
 *    et perd sa trace (actions, échantillons de lecture) et le consentement
 *    qu'elle déclarait (#10772).
 *
 * Idempotent (rejoué, il ne trouve plus rien à détacher) : trois commandes,
 * quel que soit le volume.
 */
type RawCommandRunner = { $runCommandRaw(command: Record<string, unknown>): Promise<unknown> };

const firstPart = (field: string, separator: string) => ({
  $cond: [
    { $eq: [{ $type: `$${field}` }, 'string'] },
    { $arrayElemAt: [{ $split: [`$${field}`, separator] }, 0] },
    '$$REMOVE',
  ],
});

/** Ce qu'une impression d'un compte qui REFUSE l'analyse ne range jamais (`impressionRowOf`). */
const DENIED_IMPRESSION_UNSET = {
  appSessionId: '', feedRequestId: '', position: '', rankingSource: '',
  viewable: '', visibleFraction: '', visibleMs: '', platform: '',
} as const;

export async function detachBehaviourOf(prisma: RawCommandRunner, userId: string): Promise<void> {
  await prisma.$runCommandRaw({
    update: 'ContentEvent',
    updates: [{
      q: { userId: { $oid: userId } },
      u: [
        { $set: { actorKind: 'none', osVersion: firstPart('osVersion', '.'), network: firstPart('network', '/') } },
        {
          $unset: [
            'userId', 'appSessionId', 'deviceClass',
            'listing.feedRequestId', 'listing.listingSessionId',
            'props.searchNonce', 'props.queryFingerprint',
            'props.impressionEventKey', 'props.mutationId',
          ],
        },
      ],
      multi: true,
    }],
  });
  await prisma.$runCommandRaw({
    update: 'PostImpression',
    updates: [{ q: { userId: { $oid: userId } }, u: { $unset: DENIED_IMPRESSION_UNSET }, multi: true }],
  });
  await prisma.$runCommandRaw({
    update: 'PostEngagement',
    updates: [{ q: { userId: { $oid: userId } }, u: { $set: { actions: [], watchSamples: [] }, $unset: { consent: '' } }, multi: true }],
  });
}

/** Les retraits qui coupent l'analyse : la sienne, et celle de son parent. */
export const WITHDRAWALS_THAT_DETACH: ReadonlySet<string> = new Set(['analytics', 'data-processing']);
