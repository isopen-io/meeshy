/**
 * #20100 — une audience IMBRIQUÉE n'a pas de `conversationId` à lire, et le
 * cliquet ne la voyait pas.
 *
 * Suivi I2 de #20091, que son audit adversarial a nommé « la suite la plus
 * chère » du lot. Le balayage élargi à `src/` entier cherchait
 * `prisma.participant.findMany|count|groupBy|aggregate` — une forme d'APPEL.
 * L'autre forme d'audience du dépôt est une PROJECTION :
 *
 * ```ts
 * conversation.findUnique({
 *   where: { id: conversationId },
 *   select: { participants: { where: { isActive: true }, select: { … } } },
 * })
 * ```
 *
 * Sa portée de conversation est IMPLICITE — portée par le `where` du PARENT —
 * donc le discriminant « le `where` porte-t-il `conversationId` ? » y rend
 * `false` pour une audience parfaitement réelle. Trente-trois sites vivaient
 * là, **aucun** n'épelant la loi, dont l'éventail de notifications push : la
 * bannière d'un message partait vers tout `isActive: true` — y compris un
 * membre actif-et-banni, exclu de `conversation:<id>` et du REST, pour qui
 * l'écran verrouillé est le SEUL canal qui reste.
 *
 * > **Un discriminant qui lit une PORTÉE ne voit que les portées ÉCRITES.**
 * > Celui-ci exigeait un `conversationId` textuel ; la moitié des audiences du
 * > dépôt tient la sienne d'un parent. C'est la leçon 261 une fois de plus —
 * > l'énumération portait « ces sites respectent la règle » (vrai) et « ce sont
 * > les sites où la règle s'applique » (faux), et la seconde n'avait pas la
 * > forme d'une liste : c'était une FORME D'APPEL.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import {
  sweepConversationAudiences,
  audienceKey,
  DELIBERATELY_WIDE,
  MEASURED_NOT_INSTRUCTED,
} from './conversation-audience-living-participation';

describe('#20100 — le balayage voit les audiences IMBRIQUÉES', () => {
  const sites = sweepConversationAudiences();
  const keyed = new Map(sites.map((site) => [audienceKey(sites, site), site]));

  /**
   * Les deux sites que ce lot RESSERRE, et la raison pour laquelle ils sont
   * nommés un par un plutôt que comptés : ils servent du CONTENU à un
   * destinataire NOMMÉ, ce qu'aucun autre site de la forme imbriquée ne fait.
   */
  it.each([
    ['services/messaging/messageNotificationFanOut.ts#0', 'la bannière push du message'],
    ['services/conversations/announceStartedGroup.ts#0', "l'annonce d'un groupe démarré"],
  ])('relève %s (%s) et le voit ÉPELER la loi', (key) => {
    const site = keyed.get(key);

    expect(site).toBeDefined();
    expect(site?.usesLaw).toBe(true);
  });

  /**
   * LA DISTRIBUTION MESURÉE de la forme imbriquée, gelée — un compte est une
   * AFFIRMATION (cycle 93), il vit dans un témoin ou il dérive. Bornes en
   * `<=` / `>=` pour qu'une DÉGRADATION rougisse sans qu'une amélioration ait
   * à venir les rééditer.
   *
   * La forme imbriquée se reconnaît à ce qu'aucun autre relevé ne pouvait
   * voir : un `where` sans `conversationId` textuel.
   */
  it('gèle ce que la forme imbriquée apporte au relevé', () => {
    const implicit = sites.filter((site) => !site.where.includes('conversationId'));

    expect(implicit.length).toBeGreaterThanOrEqual(20);
    expect(implicit.filter((site) => !site.usesLaw).length).toBeLessThanOrEqual(24);
  });

  /**
   * Et chacune est RANGÉE — dans un seul des deux inventaires, ou nulle part
   * parce qu'elle épelle la loi. Le témoin jumeau de
   * `conversation-audience-living-participation.test.ts` garde la règle pour
   * tout le relevé ; celui-ci la garde pour la forme que #20091 ne voyait pas,
   * afin qu'un reclassement ne la fasse pas disparaître en silence.
   */
  it('range chaque audience imbriquée nue', () => {
    const unranked = sites
      .filter((site) => !site.where.includes('conversationId') && !site.usesLaw)
      .map((site) => audienceKey(sites, site))
      .filter((key) => !(key in DELIBERATELY_WIDE) && !(key in MEASURED_NOT_INSTRUCTED));

    expect(unranked).toEqual([]);
  });
});
