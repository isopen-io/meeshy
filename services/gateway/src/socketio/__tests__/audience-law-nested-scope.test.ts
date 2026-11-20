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
import * as fs from 'fs';
import * as path from 'path';
import {
  sweepConversationAudiences,
  sweepUnjudgeableParticipantReads,
  audienceKey,
  DELIBERATELY_WIDE,
  MEASURED_NOT_INSTRUCTED,
} from './conversation-audience-living-participation';

describe('#20100 — le balayage voit les audiences IMBRIQUÉES', () => {
  const sites = sweepConversationAudiences();
  const keyed = new Map(sites.map((site) => [audienceKey(sites, site), site]));
  /** La forme imbriquée se reconnaît à ce qu'aucun autre relevé ne voyait : une portée NON écrite. */
  const implicit = sites.filter((site) => !site.where.includes('conversationId'));

  /**
   * L'éventail de notifications push — « l'audience la plus porteuse de contenu
   * de la passerelle », et le site que l'audit de #20091 nommait en premier.
   * Il est resserré DANS SON `where`, donc le cliquet le voit passer au VERT.
   */
  it("relève l'éventail de notifications push, et le voit ÉPELER la loi", () => {
    const site = keyed.get('services/messaging/messageNotificationFanOut.ts#0');

    expect(site).toBeDefined();
    expect(site?.usesLaw).toBe(true);
  });

  /**
   * L'annonce d'un groupe démarré est resserrée AUSSI, mais un cran plus bas —
   * en code, sur `invitees` seuls — parce que la même lecture sert à trouver le
   * CRÉATEUR, que rien d'autre ne nomme (`Conversation` n'a pas de colonne
   * d'auteur). Le cliquet ne peut pas voir une loi appliquée après lecture :
   * ce témoin garde donc la COHÉRENCE de la paire — le site reste nu ET sa
   * décision est écrite. Son comportement est gardé ailleurs
   * (`bannedButActiveMemberIsNoAudience.test.ts`), le seul endroit où il peut
   * tomber.
   */
  it("range l'annonce d'un groupe démarré en décision écrite, puisque sa loi est en code", () => {
    const site = keyed.get('services/conversations/announceStartedGroup.ts#0');

    expect(site?.usesLaw).toBe(false);
    expect(DELIBERATELY_WIDE['services/conversations/announceStartedGroup.ts#0']).toContain('participationEstVivante');
  });

  /**
   * LA DISTRIBUTION MESURÉE de la forme imbriquée, gelée — un compte est une
   * AFFIRMATION (cycle 93), il vit dans un témoin ou il dérive. Bornes en
   * `<=` / `>=` pour qu'une DÉGRADATION rougisse sans qu'une amélioration ait à
   * venir les rééditer.
   */
  it('gèle ce que la forme imbriquée apporte au relevé', () => {
    expect(implicit.length).toBeGreaterThanOrEqual(24);
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
    const unranked = implicit
      .filter((site) => !site.usesLaw)
      .map((site) => audienceKey(sites, site))
      .filter((key) => !(key in DELIBERATELY_WIDE) && !(key in MEASURED_NOT_INSTRUCTED));

    expect(unranked).toEqual([]);
  });
});

/**
 * LE MODÈLE — ce sur quoi repose le droit du balayage de juger une clause
 * imbriquée, et la seule affirmation de ce lot qui vive hors du code TypeScript.
 *
 * La forme APPELÉE nomme sa table (`participant.findMany`). La forme IMBRIQUÉE
 * ne nomme qu'une RELATION, et deux modèles la partagent : le discriminant ne
 * tient que parce que `CallParticipant` n'a **ni `isActive` ni `bannedAt`**.
 * Mesuré ici, dans `schema.prisma`, pour que l'ajout d'une colonne ou d'une
 * troisième relation `participants` fasse ROUGIR le cliquet au lieu de lui
 * faire ranger des participants d'APPEL parmi les audiences d'une conversation
 * — ce que le premier jet de ce lot faisait (`CallCleanupService`).
 */
describe('#20100 — la preuve de modèle du discriminant imbriqué', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'packages', 'shared', 'prisma', 'schema.prisma'),
    'utf8'
  );
  const modelBody = (name: string): string => {
    const at = schema.indexOf(`model ${name} {`);
    expect(at).toBeGreaterThan(-1);
    return schema.slice(at, schema.indexOf('\n}', at));
  };

  it('le schéma ne porte que DEUX relations nommées `participants`', () => {
    const relations = schema.match(/^\s+participants\s+\S+/gm) ?? [];

    expect(relations.map((line) => line.trim().split(/\s+/)[1])).toEqual(['Participant[]', 'CallParticipant[]']);
  });

  it('`Participant` porte les deux colonnes de la loi, `CallParticipant` aucune', () => {
    const participant = modelBody('Participant');
    const callParticipant = modelBody('CallParticipant');

    expect(/\bisActive\b/.test(participant)).toBe(true);
    expect(/\bbannedAt\b/.test(participant)).toBe(true);
    expect(/\bisActive\b/.test(callParticipant)).toBe(false);
    expect(/\bbannedAt\b/.test(callParticipant)).toBe(false);
  });

  /**
   * La conséquence, côté relevé : une clause imbriquée qui ne parle NI
   * d'activité NI de bannissement se PUBLIE comme indécidable au lieu d'être
   * jugée. « Zéro trouvé » et « zéro existe » ne sont pas la même affirmation —
   * et un faux NU envoie réparer une clause qui n'a rien à voir avec le
   * bannissement.
   */
  it('publie la clause des participants d’APPEL au lieu de la juger nue', () => {
    const published = sweepUnjudgeableParticipantReads().filter((read) => read.form === 'modèle-indécidable');

    expect(published.map((read) => read.file)).toEqual(['services/CallCleanupService.ts', 'services/CallCleanupService.ts']);
  });
});
