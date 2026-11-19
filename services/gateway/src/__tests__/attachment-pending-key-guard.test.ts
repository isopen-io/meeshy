/**
 * LE CLIQUET : **tout créateur de `MessageAttachment` pose la clé `messageId`**
 * (#19801). Inventaire d'infractions VIDE — il n'y a pas de créateur légitime
 * qui omette la clé, donc rien à geler : quand ce cliquet tombe, la réparation
 * est de poser la clé au site, jamais d'ajouter une ligne ici.
 *
 * Le raisonnement, les trois verdicts et la raison de garder un site non résolu
 * vivent dans `helpers/attachment-pending-key-sweep.ts`.
 */

import { describe, it, expect } from '@jest/globals';
import { join } from 'path';
import { attachmentCreationsIn, sweepAttachmentPendingKey } from './helpers/attachment-pending-key-sweep';

const SRC = join(__dirname, '..');

describe('tout créateur de MessageAttachment pose la clé `messageId` (#19801)', () => {
  /**
   * LA BORNE, avant les règles. Un balayage qui ne verrait aucun créateur
   * passerait la règle au vert pour la pire des raisons — c'est la forme que le
   * cliquet du budget de taille a payée (#4531), et elle se dit d'abord.
   */
  it('voit bien les créateurs de pièces jointes', () => {
    const { sites } = sweepAttachmentPendingKey(SRC);

    expect(sites.length).toBeGreaterThanOrEqual(5);
    expect(sites.map((site) => site.file)).toContain('routes/uploads/tus-handler.ts');
  });

  it('aucun créateur n’omet la clé, et aucun ne la laisse indécidable', () => {
    const { offenders } = sweepAttachmentPendingKey(SRC);

    expect(offenders.map((site) => `${site.file} (${site.method}) : ${site.verdict} — ${site.why}`)).toEqual([]);
  });

  /**
   * LA FIXTURE NÉGATIVE. Un cliquet dont le balayage rend `[]` reste vert quoi
   * qu'on lui donne ; celui-ci doit tomber sur la forme EXACTE que
   * `tus-handler` portait avant ce lot — un `data` littéral, bien formé, riche,
   * et sans la clé.
   */
  it('tombe sur la forme que tus-handler portait : un `data` complet SANS la clé', () => {
    const avant = `
      const attachment = await prisma.messageAttachment.create({
        data: {
          originalName: filename,
          uploadedBy: userId,
          isAnonymous,
          ...description,
        },
      });
    `;

    expect(attachmentCreationsIn('fixture.ts', avant)).toEqual([
      { file: 'fixture.ts', method: 'create', verdict: 'unresolved', why: 'un spread de premier niveau peut porter `messageId`' },
    ]);
  });

  it('tombe sur un `data` sans spread et sans la clé, et se tait quand la clé est là', () => {
    const sans = 'prisma.messageAttachment.create({ data: { originalName: f, uploadedBy: u } });';
    const avec = 'prisma.messageAttachment.create({ data: { messageId: null, originalName: f } });';

    expect(attachmentCreationsIn('f.ts', sans).map((site) => site.verdict)).toEqual(['missing']);
    expect(attachmentCreationsIn('f.ts', avec).map((site) => site.verdict)).toEqual(['poses']);
  });

  /**
   * Le balayage part des CRÉATEURS, pas d'un idiome : les trois méthodes qui
   * fabriquent une ligne comptent. Aucun `createMany` ni `upsert` ne vit
   * aujourd'hui sur ce modèle — c'est exactement pourquoi il faut le vérifier
   * sur fixture : un balayage qui n'en chercherait qu'une mesurerait la
   * popularité d'une méthode (règle du cycle 107).
   */
  it('voit `createMany` et `upsert`, qu’aucun site vivant n’emploie encore', () => {
    const many = 'prisma.messageAttachment.createMany({ data: [{ originalName: f }] });';
    const upsert = 'prisma.messageAttachment.upsert({ where: { id }, create: { originalName: f }, update: {} });';

    expect(attachmentCreationsIn('f.ts', many)[0]).toMatchObject({ method: 'createMany', verdict: 'unresolved' });
    expect(attachmentCreationsIn('f.ts', upsert)[0]).toMatchObject({ method: 'upsert', verdict: 'missing' });
  });

  /**
   * Les commentaires sont blanchis parce qu'ils CITENT la forme fautive pour
   * l'expliquer — celui que ce lot pose dans `tus-handler` cite `messageId` et
   * `{ messageId: null }` sur douze lignes. Sans ce blanchiment, un créateur
   * fautif se ferait absoudre par le commentaire qui le dénonce.
   */
  it('ne lit pas une clé citée dans un commentaire ou dans une chaîne', () => {
    const cite = `
      prisma.messageAttachment.create({
        data: {
          // messageId: null — la clé d'attente, cf. #19801
          originalName: 'messageId: null',
        },
      });
    `;

    expect(attachmentCreationsIn('f.ts', cite).map((site) => site.verdict)).toEqual(['missing']);
  });
});
