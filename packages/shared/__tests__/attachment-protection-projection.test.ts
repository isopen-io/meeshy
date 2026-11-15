/**
 * L'INVENTAIRE DE LA PROTECTION, ET SA PROJECTION (#7014).
 *
 * `maskedAttachment` est juste, testée, bien placée — et elle échoue OUVERTE
 * quand on ne la nourrit pas : une entrée sans déclaration rend `false`, « le
 * seul défaut sûr ici, parce qu'une pièce sans déclaration est une pièce
 * ordinaire » (son doc-comment). Le fail-closed de ce domaine vit donc chez
 * celui qui REMET la charge, et c'est exactement là qu'il manquait : le
 * sérialiseur socket du gateway énumérait ses trente champs à la main, sans
 * les trois de la protection.
 *
 * Un relais qui RECOPIE champ par champ est un inventaire à tenir à jour, et
 * il ne l'est jamais (`services/gateway/CLAUDE.md` § cycle 126). Ces témoins
 * gardent les deux moitiés du remède :
 *
 *  - `ATTACHMENT_PROTECTION_FIELDS` — le SEUL endroit du dépôt qui NOMME les
 *    champs dont dépend le verdict de `maskedAttachment`. Le `select` Prisma
 *    du gateway et la projection de fil en dérivent tous les deux ; un
 *    quatrième champ de protection s'ajoute ICI et les atteint sans qu'aucun
 *    site n'ait à s'en souvenir.
 *  - `attachmentProtectionOf` — la projection MÉCANIQUE d'une ligne
 *    quelconque sur cet inventaire, FAIL-CLOSED sur l'absence.
 *
 * Pourquoi l'absence peut être fail-closed ICI alors que `maskedAttachment`
 * doit rester fail-open : les trois colonnes sont NON NULLABLES et à défaut
 * (`schema.prisma`, `MessageAttachment` — `isViewOnce Boolean @default(false)`,
 * `isBlurred Boolean @default(false)`, `effectFlags Int @default(0)`). Une
 * colonne SÉLECTIONNÉE n'est donc JAMAIS `undefined` : l'absence PROUVE que la
 * requête ne l'a pas chargée, elle ne dit jamais « cette pièce est ordinaire ».
 * C'est la distinction `gone` / `unknown` du § « Un verdict de garde a TROIS
 * états » — et sur un SECRET, `unknown` se tranche fermé.
 */

import { describe, expect, it } from 'vitest';

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags';
import {
  ATTACHMENT_PROTECTION_FIELDS,
  attachmentProtectionOf,
  maskedAttachment,
} from '../utils/attachment-protection';

describe('ATTACHMENT_PROTECTION_FIELDS — l’inventaire NOMME ce que la loi LIT', () => {
  /**
   * Un témoin par NOM laisserait passer le quatrième champ. Celui-ci
   * interroge la LOI : pour chaque nom de l'inventaire, il existe une valeur
   * qui fait basculer `maskedAttachment` — donc aucun nom n'y est décoratif.
   */
  it('chaque nom de l’inventaire fait basculer maskedAttachment', () => {
    const basculeur: Record<string, unknown> = {
      isViewOnce: true,
      isBlurred: true,
      effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE,
    };

    for (const champ of ATTACHMENT_PROTECTION_FIELDS) {
      expect(maskedAttachment({ [champ]: basculeur[champ] })).toBe(true);
    }
  });

  /**
   * La réciproque : aucun champ que la loi lit n'est ABSENT de l'inventaire.
   * Elle se mesure au compilateur (`AttachmentProtectionField` doit couvrir
   * `keyof AttachmentProtectionFlags`, assertion dans le module) ET ici, parce
   * qu'une assertion de type ne dit rien de la valeur EXÉCUTÉE.
   */
  it('l’inventaire couvre les trois canaux d’aujourd’hui, sans doublon', () => {
    expect([...ATTACHMENT_PROTECTION_FIELDS].sort()).toEqual([
      'effectFlags',
      'isBlurred',
      'isViewOnce',
    ]);
    expect(new Set(ATTACHMENT_PROTECTION_FIELDS).size).toBe(ATTACHMENT_PROTECTION_FIELDS.length);
  });
});

describe('attachmentProtectionOf — la projection est MÉCANIQUE, jamais énumérée', () => {
  it('rend une clé par nom de l’inventaire, et rien d’autre', () => {
    const projete = attachmentProtectionOf({
      id: 'att-1',
      fileUrl: 'https://cdn.meeshy.me/uploads/photo.jpg',
      isViewOnce: false,
      isBlurred: false,
      effectFlags: 0,
    });

    expect(Object.keys(projete).sort()).toEqual([...ATTACHMENT_PROTECTION_FIELDS].sort());
  });

  it('recopie la valeur chargée telle quelle — une pièce ordinaire reste ordinaire', () => {
    const projete = attachmentProtectionOf({ isViewOnce: false, isBlurred: false, effectFlags: 0 });

    expect(projete).toEqual({ isViewOnce: false, isBlurred: false, effectFlags: 0 });
    expect(maskedAttachment(projete)).toBe(false);
  });

  it('recopie une protection déclarée — la pièce à vue unique reste masquée', () => {
    const projete = attachmentProtectionOf({ isViewOnce: true, isBlurred: false, effectFlags: 0 });

    expect(maskedAttachment(projete)).toBe(true);
  });

  it('recopie le BITMASK seul — le canal qu’un témoin « à vue » ne couvrirait pas', () => {
    const projete = attachmentProtectionOf({
      isViewOnce: false,
      isBlurred: false,
      effectFlags: MESSAGE_EFFECT_FLAGS.BLURRED,
    });

    expect(maskedAttachment(projete)).toBe(true);
  });

  /**
   * LE CŒUR DE #7014. Une ligne dont la requête n'a PAS chargé la protection
   * ne prouve rien : la projeter en « pièce ordinaire » est exactement le
   * défaut qu'on ferme. Elle sort MASQUÉE.
   */
  it('une ligne SANS les colonnes de protection sort MASQUÉE — l’absence ne prouve pas l’innocuité', () => {
    const projete = attachmentProtectionOf({
      id: 'att-2',
      fileUrl: 'https://cdn.meeshy.me/uploads/secret.jpg',
    });

    expect(maskedAttachment(projete)).toBe(true);
  });

  it('une SEULE colonne manquante suffit à masquer — la projection ne panache pas', () => {
    for (const manquant of ATTACHMENT_PROTECTION_FIELDS) {
      const ligne: Record<string, unknown> = { isViewOnce: false, isBlurred: false, effectFlags: 0 };
      delete ligne[manquant];

      expect(maskedAttachment(attachmentProtectionOf(ligne))).toBe(true);
    }
  });

  /**
   * `null` n'est pas `undefined` : aucune des trois colonnes n'est nullable,
   * donc un `null` sur le fil vient d'un décodeur ou d'un double, jamais de
   * Prisma. Il ne PROUVE pas davantage l'innocuité qu'une absence.
   */
  it('un null vaut une absence — il ne prouve rien non plus', () => {
    expect(maskedAttachment(attachmentProtectionOf({ isViewOnce: null, isBlurred: false, effectFlags: 0 }))).toBe(true);
  });
});
