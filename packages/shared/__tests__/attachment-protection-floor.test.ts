/**
 * LE PLANCHER DE PROTECTION — CANAL PAR CANAL, DEPUIS L'INVENTAIRE (#7029,
 * contrat de #7014).
 *
 * `maskedAttachment` est un OU sur les canaux de l'inventaire. Un cliquet posé
 * sur SON verdict laisse donc tomber un canal tant qu'un AUTRE tient debout :
 * une pièce à la fois à VUE UNIQUE et FLOUTÉE dont la charge dément la seule
 * vue unique repart floutée et plus à vue unique, l'agrégat n'ayant pas bougé.
 * C'est le défaut que la revue adversariale de #7017 a trouvé dans
 * `apps/web/src/lib/api/realtime-apply.ts`, et qu'elle a corrigé CHEZ ELLE —
 * en recopiant l'inventaire des canaux et le masque d'`effectFlags` dans un
 * `PROTECTION_KEYS` local, gardé par rien.
 *
 * DEUX inventaires du même secret sont exactement ce que #7014 existe pour
 * empêcher : le cliquet de compilation
 * (`AttachmentProtectionInventoryCoversTheLaw`) oblige un quatrième canal à
 * rejoindre `ATTACHMENT_PROTECTION_FIELDS`, d'où il atteint le `select` Prisma
 * du gateway et la projection du fil — mais il n'atteindrait PAS une copie
 * locale, et le plancher web laisserait alors la charge socket retirer ce
 * quatrième canal sans qu'aucun témoin ne rougisse. Un fail-OPEN, posé par le
 * remède au fail-open.
 *
 * CE QUE CES TÉMOINS GARDENT, et pourquoi ils ne peuvent pas être écrits par
 * NOM : chaque cas est DÉRIVÉ de `ATTACHMENT_PROTECTION_FIELDS` et de
 * `ATTACHMENT_PROTECTION_MASK`. Un quatrième canal ajouté à l'inventaire se
 * fait donc EXERCER ici sans qu'une ligne de ce fichier ne change — et fait
 * rougir `raisedAttachmentProtection` si elle ne sait pas le retenir. Un témoin
 * par nom aurait laissé passer le quatrième, ce qui est précisément la forme du
 * défaut qu'on garde.
 */

import { describe, expect, it } from 'vitest';

import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags';
import {
  ATTACHMENT_PROTECTION_FIELDS,
  ATTACHMENT_PROTECTION_MASK,
  maskedAttachment,
  raisedAttachmentProtection,
} from '../utils/attachment-protection';

/**
 * La valeur ORDINAIRE d'un canal — celle que sert une charge qui DÉMENT la
 * protection. Dérivée du masque, jamais écrite par nom : `false` pour un canal
 * booléen, `0` pour un bitfield.
 */
const ordinaire = (champ: (typeof ATTACHMENT_PROTECTION_FIELDS)[number]): boolean | number =>
  typeof ATTACHMENT_PROTECTION_MASK[champ] === 'boolean' ? false : 0;

/** La charge qui dément TOUS les canaux — ce que le fil remet après enrichissement. */
const chargeQuiDement = (): Record<string, unknown> =>
  Object.fromEntries(ATTACHMENT_PROTECTION_FIELDS.map((champ) => [champ, ordinaire(champ)]));

describe('raisedAttachmentProtection — la protection ne peut que MONTER, canal par canal', () => {
  it.each([...ATTACHMENT_PROTECTION_FIELDS])(
    'le canal %s, démenti par la charge, est retenu par le plancher',
    (champ) => {
      const cache = { [champ]: ATTACHMENT_PROTECTION_MASK[champ] };
      const fusionne = { ...cache, ...chargeQuiDement() };

      // La PRÉMISSE — sans plancher, ce canal tombe. Sans cette mesure, le
      // témoin suivant pourrait être vert par absence de sujet.
      expect(maskedAttachment(fusionne)).toBe(false);

      const plancher = { ...fusionne, ...raisedAttachmentProtection(cache, fusionne) };

      expect(maskedAttachment(plancher)).toBe(true);
    },
  );

  /**
   * LE DÉFAUT EXACT DE LA REVUE #7017 : un cliquet posé sur l'AGRÉGAT ne voit
   * pas tomber un canal tant qu'un autre tient. Le témoin interroge donc le
   * canal, jamais `maskedAttachment` — qui reste `true` des deux côtés.
   */
  it.each([...ATTACHMENT_PROTECTION_FIELDS])(
    'le canal %s est retenu même quand un AUTRE canal tient déjà l’agrégat debout',
    (champ) => {
      const autre = ATTACHMENT_PROTECTION_FIELDS.find((c) => c !== champ);
      if (autre === undefined) return;

      const cache = {
        [champ]: ATTACHMENT_PROTECTION_MASK[champ],
        [autre]: ATTACHMENT_PROTECTION_MASK[autre],
      };
      const fusionne = { ...cache, [champ]: ordinaire(champ) };

      expect(maskedAttachment(fusionne)).toBe(true);

      const plancher = { ...fusionne, ...raisedAttachmentProtection(cache, fusionne) };

      expect(maskedAttachment({ [champ]: plancher[champ] })).toBe(true);
    },
  );

  it('une pièce ORDINAIRE au cache ne reçoit aucun plancher — la charge fait foi', () => {
    const cache = Object.fromEntries(
      ATTACHMENT_PROTECTION_FIELDS.map((champ) => [champ, ordinaire(champ)]),
    );

    expect(raisedAttachmentProtection(cache, cache)).toEqual({});
  });

  it('une charge qui AJOUTE une protection la garde — le plancher ne la rabote pas', () => {
    const cache = Object.fromEntries(
      ATTACHMENT_PROTECTION_FIELDS.map((champ) => [champ, ordinaire(champ)]),
    );
    const fusionne = { ...cache, isViewOnce: true };

    const plancher = { ...fusionne, ...raisedAttachmentProtection(cache, fusionne) };

    expect(maskedAttachment(plancher)).toBe(true);
  });

  /**
   * LES BITS DÉCORATIFS NE SONT PAS DU SECRET. `EPHEMERAL` se juge au niveau
   * MESSAGE, sur son horloge ; un plancher qui le rattraperait ferait
   * reparaître un effet que le serveur vient de retirer. Le plancher ne retient
   * QUE les bits du masque.
   */
  it('les bits DÉCORATIFS d’effectFlags ne sont pas retenus', () => {
    const cache = { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL };
    const fusionne = { effectFlags: 0 };

    expect(raisedAttachmentProtection(cache, fusionne)).toEqual({});
  });

  it('un bit MASQUANT est retenu SANS effacer les bits que la charge apporte', () => {
    const cache = { effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE };
    const fusionne = { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL };

    const plancher = { ...fusionne, ...raisedAttachmentProtection(cache, fusionne) };

    expect(plancher.effectFlags).toBe(MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.VIEW_ONCE);
  });

  /**
   * FAIL-CLOSED SUR LE TYPE, comme `attachmentProtectionOf` : une valeur de
   * cache qui ne vient pas d'une ligne Prisma ne prouve rien — mais elle ne
   * doit pas non plus FABRIQUER un plancher qui n'existe pas. Une chaîne sur un
   * canal booléen n'est pas `true`, donc rien n'est retenu ; c'est la charge,
   * elle, qui décide.
   */
  it('une valeur de cache du mauvais TYPE ne fabrique aucun plancher', () => {
    const cache = { isViewOnce: 'true', effectFlags: 'VIEW_ONCE' };
    const fusionne = { isViewOnce: false, effectFlags: 0 };

    expect(raisedAttachmentProtection(cache, fusionne)).toEqual({});
  });

  it('un cache absent ne fabrique aucun plancher', () => {
    expect(raisedAttachmentProtection(null, { isViewOnce: false })).toEqual({});
    expect(raisedAttachmentProtection(undefined, undefined)).toEqual({});
  });
});
