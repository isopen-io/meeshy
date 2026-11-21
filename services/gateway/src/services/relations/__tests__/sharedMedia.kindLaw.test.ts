/**
 * Les deux moitiés de la loi des genres de média partagé disent la MÊME chose
 * (#19285, lot #19200).
 *
 * `sharedMediaKindOf` classe EN MÉMOIRE et retombe sur `'file'`
 * (`found ?? 'file'`) : tout ce qui n'est ni image, ni vidéo, ni audio est un
 * fichier. C'est la loi, et elle est écrite là.
 *
 * `kindWhere('file')` est sa jumelle en REQUÊTE, et elle divergeait sur le seul
 * cas que la mémoire traite par défaut : une pièce jointe dont `mimeType` est
 * ABSENT. `MessageAttachment.mimeType` est un `String?`, et sur le connecteur
 * MongoDB une négation (`NOT: [{ startsWith }]`) **n'apparie pas** un document
 * sans le champ — c'est exactement ce que la garde de #8309 existe pour
 * attraper.
 *
 * La pièce tombait donc hors des QUATRE genres : `startsWith` l'écarte des
 * trois premiers, la négation du quatrième. **Invisible sous tout filtre**,
 * alors que le classeur en mémoire la déclare `file`. Le symptôme n'est pas une
 * erreur mais une absence — la forme la plus coûteuse à diagnostiquer.
 *
 * @jest-environment node
 */

import { kindWhere, sharedMediaKindOf, SHARED_ATTACHMENT_KINDS } from '../sharedMedia';

/**
 * Le prédicat MongoDB, joué en mémoire sur la forme des clauses que ce module
 * produit — `startsWith`, `NOT: [...]`, `isSet: false`, `OR: [...]`.
 *
 * Ce n'est PAS une réimplémentation de la production : la production rend une
 * CLAUSE, et ce qu'on veut vérifier est ce que le moteur en fait. Le dépôt n'a
 * pas de base en test, donc la sémantique du moteur est ce qu'on modélise —
 * avec la seule règle qui compte ici, écrite noir sur blanc :
 * **un document sans le champ n'est apparié ni par `startsWith` ni par une
 * négation ; seul `isSet: false` le nomme.**
 */
const matches = (clause: Record<string, unknown>, doc: { mimeType?: string }): boolean => {
  if ('OR' in clause) {
    return (clause.OR as Array<Record<string, unknown>>).some((c) => matches(c, doc));
  }
  if ('NOT' in clause) {
    // LE POINT QUI DÉCIDE DE TOUT, et il est MESURÉ, pas supposé : sur le
    // connecteur MongoDB « un champ absent ne matche ni `null` ni `NOT null` »
    // (`services/historyFloor.ts`, et toute la raison d'être d'`unsetOrNull`).
    // Une négation EXIGE donc la présence du champ.
    //
    // La première version de ce modèle rendait l'inverse — `every(c => !matches(c))`
    // tout court — et les deux témoins du défaut PASSAIENT : un témoin dont le
    // modèle contredit la plateforme ne peut pas tomber.
    const champs = (clause.NOT as Array<Record<string, unknown>>).flatMap((c) => Object.keys(c));
    if (champs.includes('mimeType') && doc.mimeType === undefined) return false;
    return (clause.NOT as Array<Record<string, unknown>>).every((c) => !matches(c, doc));
  }
  const mime = clause.mimeType as { startsWith?: string; isSet?: boolean } | undefined;
  if (mime === undefined) return true;
  if (mime.isSet === false) return doc.mimeType === undefined;
  if (mime.startsWith !== undefined) {
    return doc.mimeType !== undefined && doc.mimeType.startsWith(mime.startsWith);
  }
  return true;
};

const PIECES = [
  { label: 'image', doc: { mimeType: 'image/png' } },
  { label: 'vidéo', doc: { mimeType: 'video/mp4' } },
  { label: 'audio', doc: { mimeType: 'audio/mpeg' } },
  { label: 'PDF', doc: { mimeType: 'application/pdf' } },
  { label: 'type vide', doc: { mimeType: '' } },
] as const;

describe('les deux moitiés de la loi des genres s’accordent (#19285)', () => {
  it.each(PIECES)('$label : la requête du genre élu par la mémoire apparie la pièce', ({ doc }) => {
    const kind = sharedMediaKindOf(doc.mimeType);
    expect(matches(kindWhere(kind), doc)).toBe(true);
  });

  it.each(PIECES)('$label : aucun AUTRE genre ne l’apparie — les quatre sont disjoints', ({ doc }) => {
    const kind = sharedMediaKindOf(doc.mimeType);
    const autres = SHARED_ATTACHMENT_KINDS.filter((k) => k !== kind).filter((k) => matches(kindWhere(k), doc));
    expect(autres).toEqual([]);
  });

  /**
   * LE TÉMOIN DU DÉFAUT. `mimeType` ABSENT — pas vide, absent : la colonne est
   * `String?`, et rien n'oblige un chemin de création à l'écrire.
   */
  it('mimeType ABSENT : la pièce est un « file » pour la mémoire, et la requête l’apparie', () => {
    const absente = {};

    // La mémoire tranche par son repli, et c'est ELLE qui porte la loi.
    expect(sharedMediaKindOf('')).toBe('file');

    expect(matches(kindWhere('file'), absente)).toBe(true);
  });

  it('mimeType ABSENT : elle n’est apparue dans AUCUN autre genre', () => {
    const absente = {};
    const genres = SHARED_ATTACHMENT_KINDS.filter((k) => matches(kindWhere(k), absente));

    // Exactement un genre, et c'est `file`. Avant #19285 la liste était VIDE —
    // la pièce n'existait pour aucun filtre.
    expect(genres).toEqual(['file']);
  });

  it('sans genre demandé, la clause n’exclut rien', () => {
    expect(matches(kindWhere(undefined), {})).toBe(true);
    expect(matches(kindWhere(undefined), { mimeType: 'image/png' })).toBe(true);
  });
});
