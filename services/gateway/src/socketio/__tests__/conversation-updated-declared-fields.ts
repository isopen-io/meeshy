import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Les champs que `ConversationUpdatedEventData` DÉCLARE, lus à la source.
 *
 * Pourquoi lire la source plutôt qu'écrire la liste ici : une liste écrite dans
 * le témoin est une SECONDE déclaration, et deux déclarations du même contrat
 * dérivent. Celle-ci ne peut pas dériver — elle EST le contrat.
 *
 * ---
 *
 * ## Pourquoi ce balayage existe alors que la porte d'émission est typée
 *
 * Le cycle 104 a fait dériver la porte d'émission de `ServerToClientEvents`, le
 * cycle 105 a fermé le cast qui la contournait. Passer PAR la porte typée ne
 * suffit pourtant pas à faire vérifier les champs, et la raison est une règle
 * de TypeScript qu'aucun des deux cycles n'avait mesurée :
 *
 * ```ts
 * type Target = { readonly a: string };
 * declare function take(t: Target): void;
 *
 * take({ a: 'x', zzz: 1 });        // TS2353 — attrapé
 * const built = { a: 'x', zzz: 1 };
 * take({ ...built });              // SILENCE
 * ```
 *
 * **Une clé écrite dans la source d'un spread est invisible au contrôle des
 * propriétés excédentaires** ; seule une clé écrite DIRECTEMENT dans le
 * littéral l'est. Or les quatre émetteurs de `conversation:updated` composent
 * tous leur charge dans une variable (`updatePayload`, `basePayload`,
 * `changedFields`) avant de la répandre dans l'appel à `emit`. Le contrôle
 * n'avait donc jamais lieu.
 *
 * Corollaire mesuré, et c'est lui qui a décidé la forme de ce lot : **retirer
 * la signature d'index de `ConversationUpdatedEventData` ne produit AUCUNE
 * erreur** (0 sur `packages/shared` + `services/gateway`). Elle ne supprimait
 * qu'un contrôle que le spread supprimait déjà. Fermer la carte ouverte avait
 * l'air d'être le lot ; ce n'en était que la moitié cosmétique.
 *
 * Ce qui SURVIT au spread, en revanche — mesuré de la même façon — c'est le
 * contrôle d'un champ DÉCLARÉ : un champ requis absent et un champ de type
 * faux sont tous deux attrapés à travers un spread. Le levier n'est donc pas
 * de fermer la carte, c'est de DÉCLARER les champs. Les deux se ressemblent et
 * ne font pas le même travail.
 *
 * Restait le trou que le typage seul ne peut pas boucher : un champ NOUVEAU,
 * ajouté à un émetteur et à aucun contrat, redevient invisible au premier
 * spread — exactement ce qui était arrivé aux quatre champs porteurs du groupe
 * d'aperçu (`lastMessageId`, `lastMessageAt`, `lastMessagePreview`,
 * `senderId`), que les trois clients lisent et qu'aucune ligne ne déclarait.
 * C'est ce trou-là que ce balayage ferme, en confrontant les clés RÉELLEMENT
 * émises à celles que le contrat déclare.
 */
export function declaredConversationUpdatedFields(): ReadonlySet<string> {
  const source = readFileSync(
    join(__dirname, '../../../../../packages/shared/types/socketio-events.ts'),
    'utf8'
  );

  const start = source.indexOf('export interface ConversationUpdatedEventData {');
  if (start < 0) {
    throw new Error(
      'ConversationUpdatedEventData introuvable — le balayage ne peut pas se déclarer vide'
    );
  }
  const end = source.indexOf('\n}', start);
  if (end < 0) throw new Error('ConversationUpdatedEventData non terminée');

  const body = source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  const fields = new Set<string>();
  for (const line of body.split('\n')) {
    const match = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*:/.exec(line);
    if (match) fields.add(match[1]);
  }

  if (fields.size === 0) {
    throw new Error('aucun champ lu — le parseur du balayage est cassé, pas le contrat');
  }
  return fields;
}

/**
 * Vrai si le contrat garde une signature d'index — la carte ouverte qui laisse
 * un champ voyager sans être déclaré.
 *
 * Ce n'est PAS elle qui faisait taire le compilateur (voir plus haut : le
 * spread s'en chargeait), mais elle rendrait ce balayage-ci inutile en le
 * privant de son sens : « déclaré » cesserait de vouloir dire quoi que ce soit
 * si tout l'était d'avance.
 */
export function contractKeepsIndexSignature(): boolean {
  const source = readFileSync(
    join(__dirname, '../../../../../packages/shared/types/socketio-events.ts'),
    'utf8'
  );
  const start = source.indexOf('export interface ConversationUpdatedEventData {');
  const end = source.indexOf('\n}', start);
  // Les commentaires CITENT la forme fautive pour expliquer pourquoi elle n'est
  // pas là — c'est leur rôle, et c'est aussi le piège : sans dépouillement, ce
  // détecteur lit sa propre explication et se déclare rouge pour toujours.
  // Même précaution que `stripComments` dans `server-emit-door-sweep.ts`.
  const body = source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return /\[\s*key\s*:\s*string\s*\]\s*:/.test(body);
}
