/**
 * #16965 — une lecture de plan signé qui TOMBE ne doit pas faire disparaître
 * `message:edited` pour les pairs EN LIGNE.
 *
 * `broadcastMessageMutation` enferme la lecture du plan ET les trois chemins
 * d'émission dans le MÊME `try`. Si la lecture lève, le `catch` absorbe et
 * AUCUN des trois n'a tourné : ni variante par lecteur, ni repli de citation
 * scellée, ni diffusion de room. Les participants HORS LIGNE sont servis
 * (l'enfilage est hors de ce `try`) ; les participants EN LIGNE sont par
 * construction sautés par `enqueueForOfflineParticipants`. Ils ne reçoivent donc
 * l'édition par AUCUN canal, et rien ne rejoue — leur bulle garde le texte
 * d'avant jusqu'à un rechargement complet.
 *
 * Sa jumelle `emitAttachmentUpdated` instruit explicitement ce cas
 * (`readerSignedPlanBestEffort` → `'unavailable'`), avec sa raison ÉCRITE :
 * « une lecture qui échoue NE retombe PAS sur la diffusion de room — elle
 * servirait les adresses nues d'une pièce peut-être protégée — : rien ne part
 * en direct, la file hors ligne et la relecture de la page servent la pièce
 * enrichie ». Ici le même comportement existait SANS décision écrite, et la
 * prémisse du repli de la jumelle — « la file hors ligne sert » — est FAUSSE
 * pour un pair EN LIGNE.
 *
 * ─── Ce que ce lot décide ────────────────────────────────────────────────────
 *
 * Il ne choisit AUCUNE des deux branches que l'issue proposait, parce que la
 * question « silence ou adresses nues ? » confondait DEUX lectures distinctes
 * sous un seul `try`, dont une seule a besoin d'être arbitrée :
 *
 * 1. **La lecture de PROTECTION** (`message.findUnique`, les cinq colonnes) est
 *    RÉCUPÉRABLE, et le module porte déjà sa valeur fail-closed : `protection:
 *    row ?? {}`, sous le commentaire « une ligne introuvable ne prouve pas
 *    l'ordinaire — la loi ferme, la pièce est signée » (une colonne `undefined`
 *    est lue par `contentExitLawOfSource` comme une preuve manquante, donc
 *    `nature !== 'ordinary'`). Une lecture qui LÈVE prouve encore MOINS qu'une
 *    ligne absente : elle mérite donc au moins le même traitement. La remise
 *    par lecteur, signée, a lieu normalement — aucune audience n'est élargie,
 *    et le pair en ligne reçoit son édition.
 *
 * 2. **La lecture des DESTINATAIRES** (`participant.findMany` sous le prédicat
 *    d'admission) n'a pas de valeur de repli : sans elle on ne sait adresser
 *    personne, et `carriesReaderBoundAttachment` a DÉJÀ répondu que la pièce
 *    est liée au lecteur. Retomber sur la room servirait l'adresse nue d'une
 *    pièce dont on vient d'établir qu'elle est protégée. Silence en direct,
 *    donc — la décision de la jumelle, et ici elle est juste.
 *
 * Le résidu assumé est nommé : dans le cas 2, le pair EN LIGNE ne rattrape
 * toujours rien. Le canal qui l'en informerait est une décision de produit (il
 * lui faut un consommateur client — un événement que personne n'écoute n'aurait
 * corrigé personne, cycle 122), et il est suivi par sa propre issue.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import { broadcastMessageMutation } from '../broadcastMessageMutation';
import { checkReaderFileToken, readSigningKeys } from '../../services/attachments/readerFileSignature';

const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo_8b1f0c1e.jpg';
const A = { id: 'cccccccccccccccccccccc01', userId: 'bbbbbbbbbbbbbbbbbbbbbb01' };
const B = { id: 'cccccccccccccccccccccc02', userId: 'bbbbbbbbbbbbbbbbbbbbbb02' };
const piece = { id: 'aaaaaaaaaaaaaaaaaaaaaaa1', fileUrl: KEY, isViewOnce: false, isBlurred: false, effectFlags: 0 };

/** Un message PROTÉGÉ : c'est lui qui met la remise sur le chemin du plan signé. */
const PROTECTED_ROW = { isViewOnce: true, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

type Failure = 'protection-read' | 'recipients-read' | null;

function setup(fails: Failure) {
  const emitted: Array<{ room: string; event: string; payload: { attachments?: Array<{ fileUrl: string }> } }> = [];
  const errors: unknown[] = [];
  const target = (room: string) => ({
    emit: (event: string, payload: never) => emitted.push({ room, event, payload }),
    except: () => target(room),
  });
  const enqueueOfflineMessageMutation = jest.fn(async () => undefined);
  const prisma = {
    participant: {
      findMany: jest.fn(async () => {
        if (fails === 'recipients-read') throw new Error('mongo down (recipients)');
        return [A, B];
      }),
    },
    message: {
      findUnique: jest.fn(async () => {
        if (fails === 'protection-read') throw new Error('mongo down (protection)');
        return PROTECTED_ROW;
      }),
      findFirst: jest.fn(async () => null),
    },
    conversationShareLink: { findMany: jest.fn(async () => []) },
  };
  const manager = {
    getIO: () => ({ to: target }),
    enqueueOfflineMessageMutation,
    emitUnreadCountsToRecipients: jest.fn(async () => undefined),
  };
  return { emitted, errors, prisma, manager, enqueueOfflineMessageMutation };
}

const readerOf = (url: string | undefined) => {
  const match = /^\/api\/v1\/attachments\/signed\/([^/]+)\/([^/]+)$/.exec(url ?? '');
  if (!match) return null;
  const check = checkReaderFileToken({
    token: match[1] as string,
    storageKey: decodeURIComponent(match[2] as string),
    keys: readSigningKeys(),
    now: new Date(),
  });
  return check.kind === 'valid' ? check.readerParticipantId : null;
};

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 9).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

const run = (prisma: unknown, manager: unknown, errors: unknown[]) =>
  broadcastMessageMutation({
    prisma: prisma as never,
    manager: manager as never,
    conversationId: 'conv-1',
    actorUserId: A.userId,
    messageId: 'msg-1',
    eventType: 'edited',
    payload: { id: 'msg-1', content: 'corrigé', attachments: [piece] } as never,
    onError: (error: unknown) => errors.push(error),
  });

const live = (emitted: Array<{ room: string; event: string }>) =>
  emitted.filter((e) => e.event === SERVER_EVENTS.MESSAGE_EDITED);

describe('#16965 — une lecture de plan qui tombe et le pair EN LIGNE', () => {
  it('la lecture de PROTECTION qui lève sert quand même chaque lecteur, signé pour lui', async () => {
    const { emitted, errors, prisma, manager } = setup('protection-read');

    await run(prisma, manager, errors);

    // La remise par lecteur a lieu : c'est la moitié qui disparaissait.
    expect(live(emitted).map((e) => e.room)).toEqual([`user:${A.userId}`, `user:${B.userId}`]);
    // Et elle est signée POUR CHACUN — la panne ne dégrade pas la protection,
    // elle la fait fermer : sans colonnes, la loi lit une preuve manquante.
    expect(live(emitted).map((e) => readerOf(e.payload.attachments?.[0]?.fileUrl))).toEqual([A.id, B.id]);
    // Aucune adresse nue n'a traversé.
    expect(JSON.stringify(emitted)).not.toContain(KEY);
  });

  it('la lecture de PROTECTION qui lève n’émet RIEN vers la room de la conversation', async () => {
    const { emitted, errors, prisma, manager } = setup('protection-read');

    await run(prisma, manager, errors);

    expect(emitted.map((e) => e.room)).not.toContain('conversation:conv-1');
  });

  it('la lecture des DESTINATAIRES qui lève n’émet rien en direct — décision assumée', async () => {
    const { emitted, errors, prisma, manager } = setup('recipients-read');

    await run(prisma, manager, errors);

    // Sans destinataires on ne sait adresser personne, et la pièce est DÉJÀ
    // établie comme liée au lecteur : la room servirait son adresse nue.
    expect(live(emitted)).toEqual([]);
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('l’enfilage hors ligne survit à la panne de PROTECTION — il est hors du `try` d’émission', async () => {
    const { errors, prisma, manager, enqueueOfflineMessageMutation } = setup('protection-read');

    await run(prisma, manager, errors);

    expect(enqueueOfflineMessageMutation.mock.calls.length).toBeGreaterThan(0);
  });

  /**
   * La panne des DESTINATAIRES retient désormais les DEUX canaux, et c'est un
   * resserrement DÉLIBÉRÉ de ce lot-ci, pas une régression de #16965.
   *
   * La raison est que la même lecture — `prisma.participant.findMany` — sert
   * deux questions, et que l'une est une question de DROIT : « qui a le droit
   * de lire ce message ? » (le plancher d'historique). Quand elle ne répond
   * pas, on ne sait NI qui est bloqué, NI qui est autorisé — et la file
   * PERSISTE la charge 48 h dans Redis sous la clé de chaque destinataire.
   * Enfiler pour « tout le monde » reviendrait à y déposer le texte d'un
   * message qu'un invité entré par un lien sans historique n'a le droit de lire
   * par aucune route.
   *
   * Entre une remise perdue et un contenu persisté chez qui n'y a pas droit, ce
   * lot choisit la première : le recours est la relecture de la page, qui
   * applique le plancher côté serveur et sert le texte édité à qui peut le
   * lire. En pratique l'écart est étroit — `enqueueForOfflineParticipants` fait
   * sa PROPRE requête de participants, qui tombe dans les mêmes conditions —
   * mais il est écrit ici parce qu'il se décide, il ne se constate pas.
   */
  it('la panne des DESTINATAIRES retient les DEUX canaux — décision de ce lot', async () => {
    const { emitted, errors, prisma, manager, enqueueOfflineMessageMutation } = setup('recipients-read');

    await run(prisma, manager, errors);

    expect(live(emitted)).toEqual([]);
    expect(enqueueOfflineMessageMutation.mock.calls).toEqual([]);
  });

  it('sans aucune panne, la remise par lecteur est inchangée (non-régression)', async () => {
    const { emitted, errors, prisma, manager } = setup(null);

    await run(prisma, manager, errors);

    expect(live(emitted).map((e) => e.room)).toEqual([`user:${A.userId}`, `user:${B.userId}`]);
    expect(errors).toEqual([]);
  });
});
