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
  it('voit les CINQ créateurs, nommément', () => {
    const { sites } = sweepAttachmentPendingKey(SRC);

    // Une borne EXACTE, pas un plancher. L'audit du cycle 183 a mesuré qu'un
    // `>= 5` laissait passer un balayage PARTIEL : un sixième créateur écrit
    // sous un littéral de regex à apostrophes impaires devenait invisible, et
    // les deux assertions restaient vertes. Une borne garde contre un balayage
    // VIDE ; seule une borne exacte garde contre un balayage AMPUTÉ.
    expect([...sites].map((site) => site.file).sort()).toEqual([
      'routes/uploads/tus-handler.ts',
      'services/attachments/UploadProcessor.ts',
      'services/attachments/UploadProcessor.ts',
      'services/messaging/MessageProcessor.ts',
      'services/messaging/copyAttachments.ts',
    ]);
  });

  it('aucun créateur n’omet la clé, et aucun ne la laisse indécidable', () => {
    const { offenders } = sweepAttachmentPendingKey(SRC);

    // Le REMÈDE vit dans le message, pas seulement dans le docblock : la sortie
    // CI ne montre pas le second, et un rouge sans sortie envoie chercher.
    expect(offenders.map((site) => `${site.file} (${site.method}) : ${site.verdict} — ${site.why}`
      + ' ⇒ REMÈDE : poser `messageId` au site de création (`null` pour une pièce en attente,'
      + ' `x || null` si la valeur peut manquer) — jamais une ligne d’inventaire ici')).toEqual([]);
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
   * **POSER LA CLÉ NE SUFFIT PAS.** Prisma IGNORE un champ `undefined` comme un
   * champ absent (`helpers/mongo-where.ts` le dit en tête), si bien qu'une
   * valeur optionnelle reproduit EXACTEMENT le défaut que ce cliquet garde. La
   * première version du balayage rendait `poses` sur les deux formes ci-dessous
   * — trouvé par l'audit adversarial, et c'est le seul constat qui attaquait la
   * garantie que ce lot prétend installer.
   *
   * `UploadProcessor.ts:431` écrit `const finalMessageId = messageId || null;`
   * précisément pour fermer ce trou : la discipline du dépôt est « la clé est
   * posée ET sa valeur n'est jamais `undefined` », et le cliquet garde les deux.
   */
  it('rougit sur une valeur qui peut rendre `undefined`, que Prisma ignore comme une clé absente', () => {
    const optionnel = 'prisma.messageAttachment.create({ data: { messageId: peutEtre?.id, originalName: f } });';
    const litteral = 'prisma.messageAttachment.create({ data: { messageId: undefined, originalName: f } });';

    expect(attachmentCreationsIn('f.ts', optionnel).map((site) => site.verdict)).toEqual(['unresolved']);
    expect(attachmentCreationsIn('f.ts', litteral).map((site) => site.verdict)).toEqual(['unresolved']);
  });

  it('admet les formes des cinq créateurs vivants : `null`, un identifiant, et `x || null`', () => {
    const formes = [
      'prisma.messageAttachment.create({ data: { messageId: null, originalName: f } });',
      'prisma.messageAttachment.create({ data: { messageId: newMessageId, rank } });',
      'prisma.messageAttachment.create({ data: { messageId: messageId || null, originalName: f } });',
      // `?? null` ferme le cas même sur une chaîne OPTIONNELLE à gauche.
      'prisma.messageAttachment.create({ data: { messageId: peutEtre?.id ?? null, originalName: f } });',
    ];

    for (const forme of formes) expect(attachmentCreationsIn('f.ts', forme).map((s) => s.verdict)).toEqual(['poses']);
  });

  /**
   * UN LITTÉRAL DE REGEX NE DOIT PAS ÉTEINDRE LE RESTE DU FICHIER. Sans état
   * « regex », l'apostrophe d'un jeu de caractères ouvre une chaîne qui court
   * jusqu'à la fin du fichier, et tout créateur situé plus bas disparaît — le
   * pire défaut possible pour un balayage, parce qu'il se présente comme un
   * VERT. Le dépôt porte déjà un tel motif
   * (`jobs/backfill-search-tokens.ts` → `/for the field '([^']+)'/`), sauvé par
   * la seule PARITÉ de ses apostrophes.
   */
  it('voit un créateur écrit SOUS un littéral de regex à apostrophes impaires', () => {
    const source = "const re = /[^']+/;\nprisma.messageAttachment.create({ data: { messageId: null, originalName: f } });";

    expect(attachmentCreationsIn('f.ts', source).map((site) => site.verdict)).toEqual(['poses']);
  });

  it('ne prend pas une DIVISION pour une regex — le créateur qui suit reste vu', () => {
    const source = "const ratio = total / 2;\nprisma.messageAttachment.create({ data: { originalName: f } });";

    expect(attachmentCreationsIn('f.ts', source).map((site) => site.verdict)).toEqual(['missing']);
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
