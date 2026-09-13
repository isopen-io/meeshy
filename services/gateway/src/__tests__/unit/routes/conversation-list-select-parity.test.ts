/**
 * **CE QUE LE SCHÉMA DÉCLARE, LA REQUÊTE DOIT LE CHARGER** — audit de cohérence
 * iOS ↔ passerelle, 2026-09-11.
 *
 * ## Le défaut, et pourquoi un test VERT le couvrait
 *
 * `conversation-wire-fields.test.ts` mesure la moitié AVAL de la chaîne : il
 * sérialise une ligne et vérifie ce qui survit à `fast-json-stringify`. C'est le
 * bon témoin pour le piège qu'il nomme (un champ posé mais non déclaré est
 * retiré en silence). Mais l'objet qu'il sérialise est un LITTÉRAL écrit dans le
 * test, sous un commentaire qui affirme « ce que le handler pose réellement ».
 *
 * Il affirmait donc quelque chose qu'il ne mesurait pas. Quatre champs —
 * `description`, `defaultWriteRole`, `slowModeSeconds`, `autoTranslateEnabled` —
 * étaient déclarés par `conversationMinimalSchema`, présents dans le littéral du
 * test, verts à chaque exécution… et absents du `select` Prisma de la liste. Le
 * handler ne les avait jamais : ils partaient `undefined` sur chaque ligne.
 *
 * Symétrie exacte du piège d'origine, dans l'autre sens :
 *
 * | | déclaré au schéma | chargé par la requête | ce qui part |
 * |---|---|---|---|
 * | piège 2026-08-24 | ✗ | ✓ | rien (strippé) |
 * | piège 2026-09-11 | ✓ | ✗ | rien (jamais lu) |
 *
 * Et un test qui fabrique sa donnée ne peut attraper que le premier.
 *
 * ## Ce que ce fichier mesure
 *
 * La LOI, pas les quatre champs : *tout champ que le schéma de la ligne de liste
 * déclare et que la table `Conversation` porte en colonne doit figurer dans le
 * `select` de la liste.* Les colonnes viennent de `schema.prisma` — la source de
 * vérité, lue à l'exécution, pas recopiée ici : un miroir statique aurait la
 * même faiblesse que le littéral qu'on corrige.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from '@jest/globals';
import { conversationMinimalSchema } from '@meeshy/shared/types/api-schemas';

import { conversationListSelect } from '../../../routes/conversations/core-selects';

const SCHEMA_PRISMA = path.resolve(
  __dirname,
  '../../../../../../packages/shared/prisma/schema.prisma',
);

/**
 * Les noms de colonnes SCALAIRES de `model Conversation`. Une relation se
 * reconnaît à son type : un modèle (majuscule) qui n'est pas un scalaire Prisma.
 * On les écarte parce qu'elles se chargent par un `select` imbriqué, pas par
 * `true` — et que leur nom wire diffère souvent (`messages` → `lastMessage`).
 */
function colonnesScalairesDeConversation(): ReadonlySet<string> {
  const source = readFileSync(SCHEMA_PRISMA, 'utf8');
  const bloc = /^model Conversation \{$([\s\S]*?)^\}$/m.exec(source);
  if (!bloc) throw new Error(`model Conversation introuvable dans ${SCHEMA_PRISMA}`);

  const SCALAIRES = new Set([
    'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes',
  ]);

  const colonnes = new Set<string>();
  for (const ligne of bloc[1].split('\n')) {
    const nu = ligne.trim();
    if (nu === '' || nu.startsWith('//') || nu.startsWith('@@')) continue;
    const champ = /^(\w+)\s+(\w+)(\[\])?(\?)?/.exec(nu);
    if (!champ) continue;
    const [, nom, type, liste] = champ;
    if (liste || !SCALAIRES.has(type)) continue;
    colonnes.add(nom);
  }
  return colonnes;
}

/**
 * La SEULE exception admise, et elle est motivée : la ligne de liste sert
 * l'effectif compté par la base (`_count`), pas la colonne dénormalisée du même
 * nom, qui rend `0` pour toute conversation créée depuis la migration héritée.
 * Ajouter une entrée ici doit coûter une phrase — c'est tout l'intérêt.
 */
const SERVIS_AUTREMENT = new Set(['memberCount']);

const clefsDuSelect = new Set(Object.keys(conversationListSelect('507f1f77bcf86cd7994390bb')));

describe('GET /conversations — la requête charge ce que le schéma promet', () => {
  it('aucun champ déclaré et porté par une colonne ne manque au select', () => {
    const colonnes = colonnesScalairesDeConversation();
    const declares = Object.keys(conversationMinimalSchema.properties);

    const manquants = declares.filter(
      (nom) => colonnes.has(nom) && !SERVIS_AUTREMENT.has(nom) && !clefsDuSelect.has(nom),
    );

    expect(manquants).toEqual([]);
  });

  /**
   * LE TÉMOIN DE LA RÉGRESSION, nommé. La loi ci-dessus les couvre tous les
   * quatre, mais elle ne DIT pas lesquels ont manqué — et c'est ce qu'il faut
   * pouvoir relire dans six mois.
   */
  it('sert la description et les trois réglages de conteneur que l’écran iOS relit', () => {
    for (const champ of [
      'description',
      'defaultWriteRole',
      'slowModeSeconds',
      'autoTranslateEnabled',
    ]) {
      expect(clefsDuSelect.has(champ)).toBe(true);
    }
  });

  /**
   * L'exception doit rester une exception. Si `memberCount` réapparaissait dans
   * le `select`, la ligne de liste servirait de nouveau la colonne dénormalisée
   * — badge de groupe absent, accent de couleur divergent entre la liste et le
   * fil ouvert.
   */
  it('ne charge pas la colonne memberCount : l’effectif est compté par la base', () => {
    expect(clefsDuSelect.has('memberCount')).toBe(false);
    expect(clefsDuSelect.has('_count')).toBe(true);
  });

  /**
   * Le `select` reste la requête d'UN lecteur : ses préférences de conversation
   * sont filtrées sur lui. Une constante figée aurait servi les préférences du
   * premier venu à tout le monde — d'où la fonction plutôt que l'objet.
   */
  it('filtre les préférences de conversation sur le lecteur', () => {
    const select = conversationListSelect('68bf0000000000000000000a');
    expect(select.userPreferences.where).toEqual({ userId: '68bf0000000000000000000a' });
  });
});
