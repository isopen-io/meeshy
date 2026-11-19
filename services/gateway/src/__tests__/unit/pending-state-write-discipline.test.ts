/**
 * **UNE COLONNE « PAS ENCORE FAIT » SE POSE À LA CRÉATION** (#19802).
 *
 * Deux files se composent des lignes dont une colonne de date est encore vide,
 * et les deux la lisent par une ÉGALITÉ — `{ champ: null }`, qui sous MongoDB
 * exige la clé PRÉSENTE et nulle (`utils/prisma-unset.ts`). Un créateur qui
 * n'écrit pas la colonne produit donc une ligne qu'aucune des deux files ne
 * verra jamais, sans qu'aucune erreur ne remonte.
 *
 * | file | colonne | lecteur |
 * |---|---|---|
 * | la vérification des partenaires | `PartnerProfile.verifiedAt` | `LensPartners.pending()` |
 * | les rappels hebdomadaires de suppression de compte | `AccountDeletionRequest.lastReminderAt` | `MaintenanceService` (passe journalière) |
 *
 * ─── CE QUE LA MESURE REND, ET QUI N'EST PAS CE QUE L'ISSUE ANNONÇAIT ────────
 *
 * #19802 affirme que les CINQ créateurs omettent leur colonne. Mesuré site par
 * site, **deux des trois créateurs de `PartnerProfile` l'écrivent déjà** :
 *
 * | créateur | ce qu'il écrit |
 * |---|---|
 * | `LensPartners.ts:249` | `verifiedAt: null` — porté par `data`, RÉPANDU dans `create` |
 * | `PackPublishers.ts:585` | `verifiedAt: current?.verifiedAt ?? now` — l'éditeur officiel naît vérifié |
 * | `PackPublishers.ts:609` | **rien** — c'est le seul site nu |
 *
 * La file de vérification n'est donc pas VIDE : un partenaire qui déclare son
 * profil y entre. Ce qui n'y entre jamais est le profil d'éditeur **créé
 * automatiquement** quand un auteur publie un pack — et celui-là ne peut pas
 * être vérifié une première fois.
 *
 * > **L'erreur de l'issue n'est pas une inattention, c'est un SPREAD.**
 * > `create: { userId, createdAt: now, ...data }` ne montre pas ses clés : il
 * > faut résoudre `data`, trente lignes plus haut, pour voir `verifiedAt: null`.
 * > C'est exactement la raison pour laquelle le cliquet du cycle 183 rend
 * > `unresolved` — et non `missing` — devant un spread de premier niveau : une
 * > énumération de clés littérales conclut « absente » là où la valeur est
 * > posée ailleurs. **Ici, l'instrument avait raison et l'humain a tranché.**
 *
 * Les DEUX créateurs de demande de suppression, en revanche, sont nus comme
 * l'issue le dit — et leurs littéraux sont complets, sans aucun spread, donc la
 * mesure est directe. **Aucun premier rappel n'est jamais parti, pour aucune
 * demande.**
 *
 * ─── LA DISCIPLINE D'ÉCRITURE, ET PAS LA LECTURE ─────────────────────────────
 *
 * Les trois sites nus posent leur colonne. La lecture n'est PAS touchée, et
 * c'est la même raison qu'au cycle 183 : réparer la lecture ferait entrer d'un
 * coup tout l'arriéré — pour les rappels, cela veut dire **un envoi de courriels
 * de masse** à chaque demande expirée depuis la mise en service. Écrire la
 * colonne rend exactes les lignes À VENIR sans rien déclencher ; le sort de
 * l'arriéré est une décision séparée.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { matchesMongoWhere, type MongoDocument } from '../helpers/mongo-where';
import { stripCommentsPreservingStrings } from '../route-manifest/root-mounted-surfaces';

const SRC = join(__dirname, '..', '..');

/**
 * Le littéral que le créateur remet, relevé sur la SOURCE et borné par ses
 * ACCOLADES — jamais par un nombre de caractères.
 *
 * Un double Prisma rendrait ce qu'on lui dit : c'est le texte du créateur qui
 * porte la discipline, et c'est donc lui qu'on interroge. La clause de lecture,
 * elle, est évaluée pour de vrai (`matchesMongoWhere`) contre la ligne que ce
 * littéral produit — les deux moitiés composées, jamais chacune chez elle.
 *
 * > **Une fenêtre en CARACTÈRES est un témoin qui mentira.** La première
 * > version de ce fichier lisait `slice(at, at + 500)` : elle est passée au
 * > ROUGE dès que le correctif a posé la clé, parce que les commentaires qui
 * > l'expliquent l'avaient repoussée au-delà du 500e caractère. Le témoin
 * > accusait un code juste — et la version symétrique de cette erreur (une
 * > fenêtre trop LARGE qui attrape le littéral suivant) aurait blanchi un code
 * > faux, sans rien dire. L'appariement d'accolades n'a pas de réglage.
 */
/**
 * **ET LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE MESURE**, pour la raison que
 * ce lot a payée en direct : le commentaire qui EXPLIQUE la règle cite la
 * clause, donc contient `lastReminderAt: null`. Mesuré — en retirant la clé
 * d'un des deux `data`, le témoin restait **VERT**, blanchi par le texte qui
 * documente la discipline. Trois occurrences dans le fichier, deux seulement
 * étaient du code.
 *
 * C'est la même leçon que le cliquet du cycle 183 (#19801), qui blanchit les
 * commentaires pour cette exacte raison — et elle s'est reproduite dans le
 * TÉMOIN du cycle suivant, écrit par qui venait de l'appliquer à l'instrument.
 * **Une règle de méthode ne se transporte pas d'un outil à son voisin : elle se
 * réapplique.**
 */
const sourceOf = (file: string): string =>
  blanked(stripCommentsPreservingStrings(readFileSync(join(SRC, file), 'utf8')));

/**
 * Le même texte, **chaînes CONSERVÉES** — pour les seules assertions dont une
 * chaîne est le SUJET, et non un déguisement possible.
 *
 * La distinction est portante, et elle s'est imposée en écrivant le témoin de
 * `snapshotWhere` : `unsetOrNull('logoSha256')` porte son nom de colonne DANS
 * une chaîne. Blanchir les chaînes protège contre un littéral qui FEINT du code
 * (`note: 'lastReminderAt: null'`) ; cela aveugle devant une chaîne qui EST
 * l'argument. Un seul lecteur ne peut pas faire les deux, et choisir le mauvais
 * fait soit bénir un code faux, soit accuser un code juste.
 */
const codeOf = (file: string): string =>
  stripCommentsPreservingStrings(readFileSync(join(SRC, file), 'utf8'));

/**
 * **ET LES CONTENUS DE CHAÎNES AUSSI**, relevé par l'audit : le lot avait fermé
 * le trou des COMMENTAIRES et laissé celui des CHAÎNES, que
 * `stripCommentsPreservingStrings` PRÉSERVE par construction (elle y cherche
 * des chemins de route). Un `note: 'lastReminderAt: null'` blanchissait donc la
 * discipline. La longueur est conservée, pour que l'appariement d'accolades
 * garde ses indices.
 */
function blanked(source: string): string {
  const out = source.split('');
  let quote: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote !== null) {
      if (char === '\\') { out[index] = ' '; out[index + 1] = ' '; index += 1; continue; }
      if (char === quote) { quote = null; continue; }
      if (char !== '\n') out[index] = ' ';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
  }
  return out.join('');
}

/**
 * Le seul objet `create:` / `data:` du littéral d'appel — **jamais l'objet
 * d'ARGUMENTS**. L'audit a reproduit ce que coûtait l'ancienne borne : la clé
 * DÉPLACÉE de `create` vers `update` laissait le témoin VERT et `tsc` à zéro
 * erreur, alors que le `create` redevenait nu **et** que chaque publication de
 * pack DÉVÉRIFIAIT un éditeur déjà vérifié — pire que le défaut corrigé, et béni.
 */
const payloadOf = (call: string, key: 'create' | 'data'): string => {
  const at = call.indexOf(`${key}:`);
  expect(at).toBeGreaterThan(-1);
  return blockFrom(call, at);
};

/**
 * La PAIRE clé→`null`, jamais la seule clé : `verifiedAt: undefined` satisfait
 * un `toContain('verifiedAt:')` et n'écrit RIEN — Prisma ignore `undefined`
 * comme une clé absente. Deuxième faux négatif reproduit par l'audit.
 */
const posesNull = (payload: string, column: string): boolean =>
  new RegExp(`\\b${column}\\s*:\\s*null\\s*[,}]`).test(payload);

const blockFrom = (source: string, start: number): string => {
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error('littéral non refermé');
};

const creationLiteral = (file: string, anchor: string): string => {
  const source = sourceOf(file);
  const at = source.indexOf(anchor);
  expect(at).toBeGreaterThan(-1);
  return blockFrom(source, at);
};

describe('une colonne « pas encore fait » se pose à la création (#19802)', () => {
  describe('la file de vérification des partenaires — `PartnerProfile.verifiedAt`', () => {
    /**
     * Le site NU : l'éditeur créé automatiquement quand un auteur publie un
     * pack. Son `create` est un littéral COMPLET, sans spread — donc la mesure
     * est directe, et l'absence est une absence.
     */
    it('l’éditeur créé automatiquement à la publication d’un pack pose `verifiedAt`', () => {
      const appel = creationLiteral(
        'services/packs/PackPublishers.ts',
        'await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, displayName, nameKey',
      );

      expect(posesNull(payloadOf(appel, 'create'), 'verifiedAt')).toBe(true);
    });

    /**
     * Et la ligne qu'il produit est APPARIÉE par la clause que `pending()`
     * envoie. C'est le témoin qui COMPOSE les deux unités : sans lui, chaque
     * moitié atteste une règle que l'autre ne reçoit pas (leçon du cycle 182).
     */
    it('la ligne ainsi créée entre dans la file que `pending()` interroge', () => {
      const ligneNue: MongoDocument = { userId: 'u1', displayName: 'Studio', nameKey: 'studio' };
      const ligneAvecCle: MongoDocument = { ...ligneNue, verifiedAt: null };

      expect(matchesMongoWhere(ligneNue, { verifiedAt: null })).toBe(false);
      expect(matchesMongoWhere(ligneAvecCle, { verifiedAt: null })).toBe(true);
    });

    /**
     * **ET LA LIGNE QUI ENTRE DANS LA FILE DOIT POUVOIR EN SORTIR.** Relevé par
     * l'audit adversarial : poser la clé d'attente faisait entrer les profils
     * d'`adopt` dans la file, et `verify()` ne pouvait JAMAIS les écrire.
     *
     * `snapshotWhere` apparie `logoSha256` et `website` — deux colonnes
     * OPTIONNELLES qu'`adopt` ne pose pas. Prisma rend `null` pour un scalaire
     * absent, donc l'instantané valait `{ website: null, logoSha256: null }`, et
     * l'égalité nue n'appariait RIEN : `count: 0`, `profile-changed`, et la route
     * rendait 409 `PARTNER_PROFILE_CHANGED` à chaque essai — pour toujours,
     * puisque rien n'avait changé.
     *
     * Le témoin évalue l'instantané RÉEL contre la ligne que `adopt` CRÉE. La
     * suite `pack-publishers` ne pouvait pas le voir : sa fixture pose toutes
     * les colonnes — **un double qui remplit plus que la production ne peut pas
     * voir ce que la production laisse vide.**
     */
    it('une ligne créée par `adopt` est APPARIÉE par l’instantané que `verify()` exige', () => {
      const écrite = new Date('2026-11-19T00:00:00Z');
      const adoptée: MongoDocument = { userId: 'u1', displayName: 'Studio', nameKey: 'studio', verifiedAt: null, updatedAt: écrite };
      // Ce que Prisma rend d'une telle ligne : les optionnelles absentes sortent `null`.
      const relue = { userId: 'u1', displayName: 'Studio', logoSha256: null, website: null, updatedAt: écrite };

      const nu = { ...relue };
      const disantLAbsence = {
        AND: [
          { userId: relue.userId, displayName: relue.displayName, updatedAt: relue.updatedAt },
          { OR: [{ logoSha256: null }, { logoSha256: { isSet: false } }] },
          { OR: [{ website: null }, { website: { isSet: false } }] },
        ],
      };

      expect(matchesMongoWhere(adoptée, nu)).toBe(false);
      expect(matchesMongoWhere(adoptée, disantLAbsence)).toBe(true);
    });

    /**
     * Et la production dit bien l'absence — sinon le témoin ci-dessus
     * n'attesterait que sa propre copie de la clause (leçon du cycle 182).
     */
    it('`snapshotWhere` dit l’absence des deux colonnes optionnelles', () => {
      const source = codeOf('services/packs/LensPartners.ts');
      const instantané = blockFrom(source, source.indexOf('const snapshotWhere'));

      expect(instantané).toContain("unsetOrNull('logoSha256')");
      expect(instantané).toContain("unsetOrNull('website')");
    });

    /**
     * LES DEUX AUTRES CRÉATEURS SONT DÉJÀ JUSTES, et le témoin le dit — sans
     * quoi un lot de nettoyage retirerait la clé en croyant la rendre
     * cohérente avec le troisième. Celui de `LensPartners` la porte par un
     * SPREAD : c'est la forme qui a trompé l'issue.
     */
    it('les deux créateurs qui l’écrivaient déjà continuent de l’écrire', () => {
      // Chez `LensPartners`, la clé vit dans le `data` RÉPANDU dans le `create`
      // — c'est la forme qui a fait conclure à l'issue que le site était nu, et
      // c'est donc le `data` qu'il faut résoudre, pas l'appel.
      const partenaire = creationLiteral('services/packs/LensPartners.ts', 'const data = {');
      const officiel = creationLiteral('services/packs/PackPublishers.ts', 'const data = { slug: MEESHY_PUBLISHER_SLUG');

      expect(posesNull(partenaire, 'verifiedAt')).toBe(true);
      // L'éditeur officiel écrit une DATE, pas `null` — mais jamais `undefined`,
      // que Prisma ignorerait : `linked` resterait faux, l'upsert se rejouerait
      // sans fin, et l'officiel entrerait dans la file de vérification.
      expect(/\bverifiedAt\s*:\s*(?!undefined)\S/.test(officiel)).toBe(true);
    });
  });

  describe('les rappels hebdomadaires de suppression — la clé N\'est PAS posée, et c\'est la garde', () => {
    /**
     * **CE TÉMOIN GARDE UNE ABSENCE VOULUE**, et c'est l'audit adversarial du
     * cycle 184 qui l'a imposé en lisant la passe de rappels de bout en bout —
     * ce que le lot n'avait pas fait.
     *
     * Son statut cible, `GRACE_PERIOD_EXPIRED`, est écrit par l'étape qui PURGE
     * et ANONYMISE le compte, dans la même itération (`MaintenanceService`,
     * § « 1. Expiration des grace periods »). Poser `lastReminderAt: null` à la
     * création allumerait donc, pour chaque demande :
     *
     * - un courriel dès la nuit où le compte est DÉTRUIT ;
     * - puis un tous les sept jours, **sans fin** — `reminderCount` n'est
     *   jamais plafonné (il n'est lu que par un `logger.info`), et rien ne fait
     *   sortir une ligne de ce statut hors d'un clic utilisateur ;
     * - vers `…@deleted.meeshy.invalid`, l'adresse que l'anonymisation écrit :
     *   une chaîne NON VIDE, donc que la garde `if (!user?.email)` ne retient
     *   pas, et un TLD réservé (RFC 2606) — 100 % de rebonds durs sur le
     *   domaine d'envoi de production ;
     * - avec deux liens déjà morts : le rappel tourne les jetons sans
     *   rafraîchir `tokenExpiresAt` (TTL 72 h, grâce 30 jours).
     *
     * > **L'ÉGALITÉ NUE DU BALAYAGE EST CE QUI TIENT CETTE PASSE INERTE.** Le
     * > défaut est aujourd'hui la seule chose qui empêche un défaut pire, et le
     * > correctif « évident » était l'interrupteur. C'est la forme du cycle 124
     * > retournée : là, un champ DÉCLARAIT une restriction qu'il n'appliquait
     * > pas ; ici, c'est le LOT qui déclarait l'innocuité d'un chemin dont il
     * > était le seul interrupteur.
     *
     * La passe se répare (statut visé, plafond, TTL, exclusion des comptes
     * purgés) et c'est une décision du porteur, parce qu'elle écrit à de vraies
     * personnes depuis le domaine de production : #19900.
     */
    it('aucune des deux routes ne pose `lastReminderAt` — la passe reste inerte jusqu\'à #19900', () => {
      const source = sourceOf('routes/me/delete-account.ts');
      const créations = [...source.matchAll(/accountDeletionRequest\.create\(/g)]
        .map((match) => blockFrom(source, match.index ?? 0));

      expect(créations.length).toBeGreaterThanOrEqual(2);
      for (const création of créations) expect(création).not.toContain('lastReminderAt');
    });

    /**
     * Et la clause reste celle qui n'apparie rien — si quelqu'un la réparait
     * sans réparer la passe, ce témoin tombe. C'est l'autre moitié de la garde :
     * l'absence d'écriture ne protège que tant que la lecture reste stricte.
     */
    it('la clause du balayage n\'apparie pas une ligne sans la clé — les DEUX branches', () => {
      const ilYaSeptJours = new Date('2026-11-01T00:00:00Z');
      const clause = {
        status: 'GRACE_PERIOD_EXPIRED',
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: ilYaSeptJours } }],
      };
      const nue: MongoDocument = { userId: 'u1', status: 'GRACE_PERIOD_EXPIRED' };

      expect(matchesMongoWhere(nue, clause)).toBe(false);
      expect(matchesMongoWhere({ ...nue, lastReminderAt: null }, clause)).toBe(true);
    });
  });
});
