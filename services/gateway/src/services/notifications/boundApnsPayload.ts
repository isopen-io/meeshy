/**
 * Borner la charge push au budget APNs — le geste, extrait de son site.
 *
 * GW5 : au-delà de 4 Ko, APNs rejette SILENCIEUSEMENT (`PayloadTooLarge`), et
 * `handleFailedToken` compterait un strike sur un token parfaitement sain. La
 * dégradation se fait donc par ÉTAGES, avec re-vérification après chaque coupe :
 * la traduction du Prisme d'abord, le texte du message ensuite. Une bannière
 * générique DÉLIVRÉE — la NSE retombe sur le corps composé par le serveur —
 * vaut mieux qu'un push rejeté qui ne s'affiche jamais.
 *
 * Extrait de `NotificationService.createNotification` avec #7451 : ce fichier
 * pèse presque quatre fois le plafond de 1 200 lignes et la directive interdit
 * d'y ajouter avant d'en avoir extrait — or le lot devait y ajouter les deux
 * champs d'éphémère que la NSE lit pour recomposer un décompte local. Le bornage
 * est le candidat évident : une fonction PURE, sans état, sans `this`, dont le
 * seul lien au service était d'être écrite dans son corps.
 */

/** Marge sous les 4 Ko d'APNs : de quoi absorber l'enveloppe que le fournisseur ajoute. */
export const APNS_SAFE_PAYLOAD_BYTES = 3800;

/**
 * Les clés que le bornage sait couper, par étage. `content`/`originalLanguage`
 * partent AVEC `encryptedContent` : les trois portent le texte du message, et un
 * push rejeté ne pré-enregistre rien du tout. Ils sont de toute façon exclusifs
 * — un message chiffré n'a pas d'aperçu de base `message-content`, donc jamais
 * de `content`.
 */
export interface BoundablePushPayload {
  readonly data: Record<string, unknown>;
  readonly [key: string]: unknown;
}

const payloadBytes = (payload: unknown): number =>
  Buffer.byteLength(JSON.stringify(payload), 'utf8');

export function boundApnsPayload<T extends BoundablePushPayload>(payload: T): T {
  const { translatedContent: _tc, translatedLanguage: _tl, ...sansTraduction } = payload.data;
  const {
    encryptedContent: _ec,
    content: _mc,
    originalLanguage: _ol,
    ...sansContenu
  } = sansTraduction;

  // Le dernier étage est aussi le repli : quand même lui dépasse, on l'envoie —
  // c'est la charge la plus courte qu'on sache composer.
  const degrade = { ...payload, data: sansContenu };
  return (
    [payload, { ...payload, data: sansTraduction }, degrade].find(
      (candidate) => payloadBytes(candidate) <= APNS_SAFE_PAYLOAD_BYTES,
    ) ?? degrade
  );
}
