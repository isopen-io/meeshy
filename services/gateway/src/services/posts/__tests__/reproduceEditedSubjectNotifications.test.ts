/**
 * L'édition d'un post ou d'un commentaire ANNULE les notifications qu'il avait
 * produites et les REPRODUIT sur le nouveau texte.
 *
 * Jumeau social de `reproduceEditedMessageNotifications`, et ce qui l'en
 * distingue est le témoin central de cette suite : ici, l'extrait n'ouvre pas
 * le texte affiché, il est SERTI au milieu d'une phrase composée et localisée
 * (« Votre story : « … » · 📷 Photo »). Une substitution de préfixe — la règle
 * du jumeau message — ne peut donc rien réécrire, et une recomposition
 * demanderait de re-résoudre la langue de chaque destinataire.
 *
 * La règle est autre : remplacer l'ANCIEN EXTRAIT LUI-MÊME, lu dans
 * `metadata.postPreview` / `metadata.commentPreview`. C'est exactement la
 * chaîne que le compositeur a sertie, donc la remplacer là où elle apparaît
 * rend la phrase d'après — quelle que soit la langue, quel que soit le type.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

import { reproduceEditedSubjectNotifications } from '../reproduceEditedSubjectNotifications';

const POST_ID = '507f1f77bcf86cd799439011';
const COMMENT_ID = '507f1f77bcf86cd799439012';
const RECIPIENT_ID = '64a000000000000000000001';

const runCommandRaw = jest.fn<any>();
const update = jest.fn<any>();
const announceNotificationsReproduced = jest.fn<any>();

const announcer = { announceNotificationsReproduced } as any;
const prisma = { $runCommandRaw: runCommandRaw, notification: { update } } as any;

interface Row {
  readonly id: string;
  readonly content?: string;
  readonly subtitle?: string;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Le double rend UN lot puis se tarit — le drainage pagine par `_id`, donc un
 * double qui rendrait toujours le même lot boucleraient jusqu'au plafond.
 */
function seed(rows: readonly Row[]): void {
  let served = false;
  runCommandRaw.mockImplementation(async () => {
    if (served) return { cursor: { firstBatch: [] } };
    served = true;
    return {
      cursor: {
        firstBatch: rows.map((row) => ({
          _id: { $oid: row.id },
          userId: { $oid: RECIPIENT_ID },
          content: row.content,
          subtitle: row.subtitle,
          metadata: row.metadata ?? {},
        })),
      },
    };
  });
}

function updatedData(index = 0): any {
  return update.mock.calls[index][0].data;
}

beforeEach(() => {
  jest.clearAllMocks();
  update.mockResolvedValue({});
  announceNotificationsReproduced.mockResolvedValue(undefined);
  seed([]);
});

describe('reproduceEditedSubjectNotifications', () => {
  describe('l’extrait serti suit le nouveau texte', () => {
    /**
     * Le témoin central. `subtitle` est une phrase composée dont l'extrait
     * n'occupe ni la tête ni la queue : seule la substitution de l'extrait
     * lui-même peut la rendre juste sans rejouer la composition.
     */
    it('réécrit l’extrait au milieu d’un sous-titre composé', async () => {
      seed([
        {
          id: '607f1f77bcf86cd799439001',
          subtitle: 'Votre story : « ancien texte » · 📷 Photo',
          metadata: { action: 'view_post', postPreview: 'ancien texte' },
        },
      ]);

      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(1);
      expect(updatedData().subtitle).toBe('Votre story : « nouveau texte » · 📷 Photo');
      expect(updatedData().metadata).toMatchObject({ postPreview: 'nouveau texte' });
    });

    /**
     * `post_comment` fait de l'extrait du commentaire son CORPS ; les deux
     * champs doivent donc suivre, pas seulement le sous-titre.
     */
    it('réécrit aussi le corps quand il porte l’extrait', async () => {
      seed([
        {
          id: '607f1f77bcf86cd799439002',
          content: 'ancien commentaire',
          subtitle: 'Votre publication : « le post »',
          metadata: { action: 'view_post', commentPreview: 'ancien commentaire' },
        },
      ]);

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'comment', id: COMMENT_ID }, content: 'nouveau commentaire' },
        announcer
      );

      expect(updatedData().content).toBe('nouveau commentaire');
      // Le sous-titre décrit le POST, pas le commentaire : il ne doit pas bouger.
      expect(updatedData()).not.toHaveProperty('subtitle');
    });

    /**
     * L'extrait est du texte UTILISATEUR : il contient couramment des
     * caractères qu'une expression régulière interpréterait. La substitution
     * doit être littérale, sinon un extrait contenant `(`, `*` ou `?` ferait
     * échouer — ou pire, réécrire n'importe où.
     */
    it('substitue littéralement un extrait qui contient des métacaractères', async () => {
      seed([
        {
          id: '607f1f77bcf86cd799439003',
          content: 'prix (50%) ?',
          metadata: { commentPreview: 'prix (50%) ?' },
        },
      ]);

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'comment', id: COMMENT_ID }, content: 'gratuit' },
        announcer
      );

      expect(updatedData().content).toBe('gratuit');
    });

    /**
     * Sans extrait en métadonnée, rien ne dit QUELLE portion de la phrase
     * composée décrivait le texte édité. Réécrire au jugé produirait une
     * phrase fausse ; on laisse donc la ligne intacte.
     */
    it('laisse intacte une ligne qui ne porte pas l’extrait en métadonnée', async () => {
      seed([
        {
          id: '607f1f77bcf86cd799439004',
          subtitle: 'Votre publication',
          metadata: { action: 'view_post' },
        },
      ]);

      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau texte' },
        announcer
      );

      expect(reproduced).toBe(0);
      expect(update).not.toHaveBeenCalled();
    });

    /**
     * Une édition qui ne change pas le texte — un ajustement d'effets visuels,
     * un changement de visibilité — ne doit produire NI écriture NI annonce :
     * les clients retireraient puis ré-inséreraient la notification pour rien.
     */
    it('n’écrit rien quand l’extrait est déjà à jour', async () => {
      seed([
        {
          id: '607f1f77bcf86cd799439005',
          content: 'texte',
          metadata: { postPreview: 'texte' },
        },
      ]);

      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'texte' },
        announcer
      );

      expect(reproduced).toBe(0);
      expect(update).not.toHaveBeenCalled();
      expect(announceNotificationsReproduced).not.toHaveBeenCalled();
    });

    it('tronque le nouvel extrait comme la création le faisait', async () => {
      seed([{ id: '607f1f77bcf86cd799439006', metadata: { postPreview: 'court' } }]);

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'x'.repeat(250) },
        announcer
      );

      const preview: string = updatedData().metadata.postPreview;
      expect(preview.length).toBeLessThanOrEqual(101);
      expect(preview.endsWith('…')).toBe(true);
    });
  });

  describe('la cible, et rien d’autre', () => {
    /**
     * Un commentaire est nommé sous DEUX chemins JSON — `context.commentId`
     * pour `comment_reaction`, `metadata.commentId` pour `post_comment` et
     * `comment_like`. Ne lire qu'un chemin laisserait la moitié de la famille
     * avec l'ancien texte, exactement comme pour le retrait jumeau.
     */
    it('interroge les DEUX chemins d’id d’un commentaire', async () => {
      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'comment', id: COMMENT_ID }, content: 'x' },
        announcer
      );

      const filter = runCommandRaw.mock.calls[0][0].filter;
      expect(filter.$or).toEqual([
        { 'context.commentId': COMMENT_ID },
        { 'metadata.commentId': COMMENT_ID },
      ]);
    });

    it('interroge le chemin d’id d’un post', async () => {
      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'x' },
        announcer
      );

      expect(runCommandRaw.mock.calls[0][0].filter.$or).toEqual([{ 'context.postId': POST_ID }]);
    });

    it('ne lit même pas la base sans cible', async () => {
      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: '' }, content: 'x' },
        announcer
      );

      expect(reproduced).toBe(0);
      expect(runCommandRaw).not.toHaveBeenCalled();
    });
  });

  describe('annuler puis reproduire', () => {
    it('annonce la reproduction après la réécriture', async () => {
      seed([
        { id: '607f1f77bcf86cd799439007', content: 'ancien', metadata: { postPreview: 'ancien' } },
      ]);
      const order: string[] = [];
      update.mockImplementation(async () => {
        order.push('update');
        return {};
      });
      announceNotificationsReproduced.mockImplementation(async () => {
        order.push('announce');
      });

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau' },
        announcer
      );

      expect(order).toEqual(['update', 'announce']);
      expect(announceNotificationsReproduced).toHaveBeenCalledWith([
        { id: '607f1f77bcf86cd799439007', userId: RECIPIENT_ID },
      ]);
    });

    /**
     * Ce qui distingue la reproduction d'un `delete` + `create` : une
     * notification déjà consommée voit son texte se rafraîchir SANS repasser en
     * non lue. Une correction de faute de frappe ne re-sonne pas.
     */
    it('ne ressuscite pas une notification déjà lue', async () => {
      seed([
        { id: '607f1f77bcf86cd799439008', content: 'ancien', metadata: { postPreview: 'ancien' } },
      ]);

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau' },
        announcer
      );

      expect(updatedData()).not.toHaveProperty('isRead');
      expect(updatedData()).not.toHaveProperty('readAt');
    });

    it('réécrit même sans annonceur câblé', async () => {
      seed([
        { id: '607f1f77bcf86cd799439009', content: 'ancien', metadata: { postPreview: 'ancien' } },
      ]);

      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau' },
        undefined
      );

      expect(reproduced).toBe(1);
    });

    it('rafraîchit les autres lignes quand l’une échoue', async () => {
      seed([
        { id: '607f1f77bcf86cd79943900a', content: 'ancien', metadata: { postPreview: 'ancien' } },
        { id: '607f1f77bcf86cd79943900b', content: 'ancien', metadata: { postPreview: 'ancien' } },
      ]);
      update.mockRejectedValueOnce(new Error('write conflict'));

      const reproduced = await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau' },
        announcer
      );

      expect(reproduced).toBe(1);
      expect(announceNotificationsReproduced).toHaveBeenCalledWith([
        { id: '607f1f77bcf86cd79943900b', userId: RECIPIENT_ID },
      ]);
    });

    /**
     * La réécriture ne retire PAS les lignes du prédicat — contrairement aux
     * retraits jumeaux, dont la suppression fait progresser la lecture d'elle-
     * même. Sans pagination par `_id`, le premier lot reviendrait
     * indéfiniment : le drainage doit donc avancer un curseur.
     */
    it('pagine par _id pour que le drainage progresse', async () => {
      seed([
        { id: '607f1f77bcf86cd79943900c', content: 'ancien', metadata: { postPreview: 'ancien' } },
      ]);

      await reproduceEditedSubjectNotifications(
        prisma,
        { subject: { kind: 'post', id: POST_ID }, content: 'nouveau' },
        announcer
      );

      expect(runCommandRaw.mock.calls[0][0].sort).toEqual({ _id: 1 });
    });
  });
});
