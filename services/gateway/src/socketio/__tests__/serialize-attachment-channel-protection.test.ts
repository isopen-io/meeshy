/**
 * **TOUT CANAL QUI ALIMENTE `serializeAttachmentForSocket` CHARGE LA FORME DU
 * CANAL SOCKET** (#7028, suite de #7014).
 *
 * ## Ce que ce témoin remplace, et pourquoi
 *
 * `serialize-attachment-callers-select.test.ts` (#7014) gardait cette règle
 * par un GREP de source : « tout fichier qui IMPORTE le sérialiseur ne
 * sélectionne jamais `attachmentMediaSelect` ». La revue #7028 a trouvé sa
 * limite structurelle : `MessageProcessor.saveMessage` alimente `message:new`
 * via `message.attachments` **sans importer le sérialiseur** — hors de portée
 * d'un grep borné aux importateurs, par construction.
 *
 * La garde qui survit à cette limite est un CLIQUET DE TYPE, posé à la
 * source : `serializeAttachmentForSocket` exige désormais `SocketAttachmentRow`
 * (`Record<string, unknown> & Required<Pick<AttachmentProtectionFlags, …>>`).
 * Un `select` qui omet la protection ne compile plus — `tsc --noEmit`,
 * BLOQUANT en CI, le voit ; aucun témoin de ce fichier n'a besoin de le
 * prouver deux fois (`ts-jest` ignore justement le code TS2345 que produirait
 * une telle preuve posée ICI — `services/gateway/CLAUDE.md` § « Un cliquet
 * doit être ATTEIGNABLE par le compilateur »).
 *
 * Ce que le cliquet de TYPE ne peut PAS voir : la constante `attachmentSocketSelect`
 * elle-même perdant un champ (un `Prisma.validator` ne référence aucun type
 * de protection — il compilerait encore, plus étroit). C'est le trou que ces
 * témoins de COMPORTEMENT ferment, un par CANAL réel : construire une ligne
 * depuis les CLÉS que le canal charge réellement, la faire traverser le vrai
 * sérialiseur, et vérifier que `maskedAttachment` rend le verdict attendu.
 *
 * Preuve de discrimination (2026-09-18) : `routes/sync/messages.ts:126` remis
 * temporairement à `attachmentMediaSelect` (l'état d'avant 7b7cc35b2c) fait
 * ROUGIR le témoin `/sync` ci-dessous — la ligne construite depuis ce
 * `select` n'a plus les trois colonnes, et `serializeAttachmentForSocket`,
 * fail-closed, la sert MASQUÉE. Rétabli, le même témoin est VERT.
 */
import { describe, it, expect } from '@jest/globals';
import { serializeAttachmentForSocket, type SocketAttachmentRow } from '../serializeAttachmentForSocket';
import { attachmentSocketSelect } from '../../services/attachments/attachmentIncludes';
import { syncMessageSelect } from '../../routes/sync/messages';
import { maskedAttachment } from '@meeshy/shared/utils/attachment-protection';

/** Les trois colonnes à leur valeur ORDINAIRE — aucune protection active. */
const PROTECTION_ORDINAIRE = { isViewOnce: false, isBlurred: false, effectFlags: 0 } as const;

/**
 * Une ligne « ordinaire » construite depuis les CLÉS d'un `select` réel — pas
 * depuis une liste de champs recopiée à la main, qui dériverait du select le
 * jour où quelqu'un le change. Les colonnes de protection reçoivent leur
 * valeur ordinaire explicite ; toute autre colonne reçoit un placeholder —
 * le seul verdict qui compte ici est celui de `maskedAttachment`, pas la
 * forme du reste de la ligne.
 */
function ligneOrdinaireDepuis(select: Readonly<Record<string, unknown>>): SocketAttachmentRow {
  return Object.fromEntries(
    Object.keys(select).map((champ) => [
      champ,
      champ in PROTECTION_ORDINAIRE
        ? PROTECTION_ORDINAIRE[champ as keyof typeof PROTECTION_ORDINAIRE]
        : `valeur-de-test-${champ}`,
    ])
  ) as unknown as SocketAttachmentRow;
}

describe('un canal qui charge attachmentSocketSelect sert une pièce ordinaire SANS masque (#7028)', () => {
  it('le canal /sync (routes/sync/messages.ts, syncMessageSelect.attachments.select)', () => {
    const select = syncMessageSelect.attachments.select as Readonly<Record<string, unknown>>;
    const ligne = ligneOrdinaireDepuis(select);

    const servi = serializeAttachmentForSocket(ligne);

    expect(maskedAttachment(servi)).toBe(false);
  });

  /**
   * `attachmentSocketSelect` est la MÊME constante que `MessageHandler.ts:801`
   * (édition, `message:edited`) et `MeeshySocketIOManager.ts` (`_broadcastAttachmentUpdated`,
   * `message:attachment-updated`) chargent, sans en recopier une variante —
   * les vérifier via l'identité de l'objet évite trois fixtures qui diraient
   * la même chose. Le cliquet de TYPE couvre, lui, le risque qu'un des deux
   * sites cesse d'utiliser CETTE constante (§ en-tête de fichier) ; ce témoin
   * couvre le risque que la constante elle-même s'appauvrisse.
   */
  it('le canal partagé édition + attachment-updated (attachmentSocketSelect)', () => {
    const ligne = ligneOrdinaireDepuis(attachmentSocketSelect as Readonly<Record<string, unknown>>);

    const servi = serializeAttachmentForSocket(ligne);

    expect(maskedAttachment(servi)).toBe(false);
  });
});

describe('un canal qui charge attachmentMediaSelect (sans protection) sert MASQUÉ — le témoin doit pouvoir le voir', () => {
  /**
   * Rejoue directement le défaut que 7b7cc35b2c a fermé, SANS toucher au
   * fichier de production : `attachmentMediaSelect` est, par construction,
   * `attachmentSocketSelect` moins les trois colonnes de protection
   * (`services/attachments/attachmentIncludes.ts`). Une ligne construite
   * depuis ses clés est donc exactement ce que `/sync` servait avant le
   * correctif — fail-closed, elle sort masquée.
   */
  it('une ligne sans les trois colonnes de protection sort masquée', () => {
    const { attachmentMediaSelect } = jest.requireActual(
      '../../services/attachments/attachmentIncludes'
    ) as { attachmentMediaSelect: Readonly<Record<string, unknown>> };
    const ligne = ligneOrdinaireDepuis(attachmentMediaSelect);

    const servi = serializeAttachmentForSocket(ligne);

    expect(maskedAttachment(servi)).toBe(true);
  });
});
