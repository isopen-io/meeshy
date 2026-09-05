import type { Lieu } from '@/lib/api/lieu';
import { FIL } from '@/lib/contenu/fil';
import { duree } from '@/lib/poids';

import { afficheLeRefus } from './fil-gestes';
import { identifiantClient, type Contexte } from './fil-contexte';
import * as F from './fil-etat';
import { piecesLocales } from './fil-reserve';

/**
 * LE MICRO ET LA POSITION (#5061) — deux GESTES de plus du fil, à côté de
 * `fil-gestes.ts` (réagir, répondre, modifier, retirer) : un fichier À PART,
 * jamais ajouté à `fil-gestes.ts`, parce qu'ils PARTAGENT un mécanisme que
 * les quatre autres n'ont pas (`MediaRecorder`, `navigator.geolocation`) et
 * qu'ils sont l'unique raison pour laquelle ce module existe. `ctx`,
 * `applique` et `envoieLaBulle` sont reçus en DÉPENDANCES, comme
 * `prendsLesGestes` — jamais un import circulaire vers `participate.ts`, qui
 * possède le socket et la boucle de peinture (`fil-gestes.ts` ligne 14).
 *
 * DEUX AMÉLIORATIONS PROGRESSIVES : le document sert les deux boutons
 * `hidden` INCONDITIONNELLEMENT (`fil-vue.ts`) ; ce module les RÉVÈLE quand
 * le NAVIGATEUR porte la capacité (`MediaRecorder`, `navigator.geolocation`)
 * ET que le lecteur PEUT ÉCRIRE (`ctx.droits.canSendMessages` — § 2.3 de la
 * spécification #5061, le MÊME droit pour les deux : ni `canSendFiles` ni
 * `canSendLocations`, que la passerelle n'applique NULLE PART à l'envoi).
 * `actualise()` est REJOUÉE par `participate.ts` › `appliqueLesDroits` — un
 * droit RENDU par l'hôte doit faire apparaître les deux boutons SANS
 * rechargement, exactement comme le trombone (`droits-peinture.ts`).
 *
 * LE VOCAL PART PAR LE MÊME TRANSPORT QU'UNE PIÈCE JOINTE ORDINAIRE
 * (`envoieLaBulle` → `expedie`, `POST /attachments/upload` PUIS le message
 * avec ses `attachmentIds` — le socket n'est jamais pris pour une bulle à
 * pièces, `participate.ts`). LA POSITION EST FORCÉE PAR LA ROUTE
 * (`bulle.lieu`, § 2.1 : « poste un champ `location` au premier niveau de
 * `POST /conversations/:id/messages` ») — `expedie` bascule sur ce transport
 * dès qu'une bulle porte un lieu, jamais le socket.
 */

type Applique = (ctx: Contexte, suivant: F.EtatDuFil) => void;
type EnvoieLaBulle = (ctx: Contexte, bulle: F.Bulle) => Promise<void>;

/** `audio/webm;codecs=opus` → `webm` : l'extension du fichier posté, lue sur le `mimeType` RÉEL du `MediaRecorder` — Safari en rend `audio/mp4`, jamais `audio/webm` (`ContentSignature.ts:150-160`). */
const EXTENSION_PAR_PREFIXE: readonly (readonly [string, string])[] = [
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/mpeg', 'mp3'],
];

const extensionDuType = (type: string): string => EXTENSION_PAR_PREFIXE.find(([prefixe]) => type.startsWith(prefixe))?.[1] ?? 'webm';

const peutEnregistrerUnVocal = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getUserMedia !== undefined &&
  typeof MediaRecorder !== 'undefined';

const peutGeolocaliser = (): boolean => typeof navigator !== 'undefined' && navigator.geolocation !== undefined;

export const prendsLaCapture = ({
  ctx,
  applique,
  envoieLaBulle,
}: {
  readonly ctx: Contexte;
  readonly applique: Applique;
  readonly envoieLaBulle: EnvoieLaBulle;
}): { readonly actualise: () => void; readonly detruit: () => void } => {
  const boutonMicro = ctx.main.querySelector<HTMLButtonElement>('#bouton-micro');
  const boutonPosition = ctx.main.querySelector<HTMLButtonElement>('#bouton-position');
  const formulaire = ctx.main.querySelector<HTMLFormElement>('form.composeur');
  const zoneEnregistrement = ctx.main.querySelector<HTMLElement>('#enregistrement');
  const dureeNoeud = ctx.main.querySelector<HTMLElement>('#duree-vocale');
  const boutonAnnulerVocal = ctx.main.querySelector<HTMLButtonElement>('.annuler-vocal');
  const boutonEnvoyerVocal = ctx.main.querySelector<HTMLButtonElement>('.envoyer-vocal');

  let piste: MediaStream | null = null;
  let enregistreur: MediaRecorder | null = null;
  let morceaux: Blob[] = [];
  let debut = 0;
  let minuteur: ReturnType<typeof setInterval> | null = null;

  /**
   * CE QUE LE MICRO ET LA POSITION MONTRENT — recalculé à chaque
   * changement de droit reçu (`participant:rights-updated`), comme le
   * trombone (`peinsLeTrombone`).
   */
  const actualise = (): void => {
    const ecrit = ctx.droits.canSendMessages;
    if (boutonMicro !== null) boutonMicro.hidden = !(ecrit && peutEnregistrerUnVocal());
    if (boutonPosition !== null) boutonPosition.hidden = !(ecrit && peutGeolocaliser());
  };

  const arreteLaPiste = (): void => {
    piste?.getTracks().forEach((canal) => canal.stop());
    piste = null;
  };

  const metAJourLaDuree = (): void => {
    if (dureeNoeud !== null) dureeNoeud.textContent = duree(Date.now() - debut) || '0:00';
  };

  const suspendsLeMinuteur = (): void => {
    if (minuteur !== null) clearInterval(minuteur);
    minuteur = null;
  };

  const fermeLaBarre = (): void => {
    formulaire?.classList.remove('enregistre');
    boutonMicro?.classList.remove('actif');
    if (zoneEnregistrement !== null) zoneEnregistrement.hidden = true;
  };

  const demarreLEnregistrement = async (): Promise<void> => {
    if (enregistreur !== null || boutonMicro === null || boutonMicro.hidden) return;
    let flux: MediaStream;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      afficheLeRefus(ctx, FIL.microRefuse);
      return;
    }
    piste = flux;
    morceaux = [];
    const recorder = new MediaRecorder(flux);
    enregistreur = recorder;
    recorder.addEventListener('dataavailable', (evenement) => {
      if (evenement.data.size > 0) morceaux.push(evenement.data);
    });
    recorder.start();
    debut = Date.now();
    metAJourLaDuree();
    minuteur = setInterval(metAJourLaDuree, 1_000);
    formulaire?.classList.add('enregistre');
    boutonMicro.classList.add('actif');
    if (zoneEnregistrement !== null) zoneEnregistrement.hidden = false;
  };

  const envoieLeVocal = (blob: Blob, type: string): void => {
    if (blob.size === 0) return;
    const fichier = new File([blob], `vocal-${Date.now()}.${extensionDuType(type)}`, { type });
    const clientMessageId = identifiantClient();
    ctx.fichiers.set(clientMessageId, [fichier]);
    const bulle: F.Bulle = {
      ...F.bulleOptimiste({
        clientMessageId,
        texte: '',
        auteur: ctx.config.nom,
        auteurId: ctx.config.moi,
        langue: ctx.config.langues[0] ?? 'fr',
        horsLigne: !ctx.enLigne,
        maintenant: Date.now(),
      }),
      pieces: piecesLocales(clientMessageId, [fichier]),
    };
    applique(ctx, F.insere(ctx.etat, bulle));
    void envoieLaBulle(ctx, bulle);
  };

  /** ARRÊTER = ENVOYER. Le `stop` du `MediaRecorder` est ASYNCHRONE : le dernier morceau n'arrive qu'à son `dataavailable`, jamais avant. */
  const arreteEtEnvoie = (): void => {
    const recorder = enregistreur;
    if (recorder === null) return;
    enregistreur = null;
    suspendsLeMinuteur();
    fermeLaBarre();
    const type = recorder.mimeType || 'audio/webm';
    recorder.addEventListener(
      'stop',
      () => {
        arreteLaPiste();
        const blob = new Blob(morceaux, { type });
        morceaux = [];
        envoieLeVocal(blob, type);
      },
      { once: true },
    );
    recorder.stop();
  };

  const annuleLEnregistrement = (): void => {
    const recorder = enregistreur;
    if (recorder === null) return;
    enregistreur = null;
    suspendsLeMinuteur();
    fermeLaBarre();
    recorder.addEventListener('stop', arreteLaPiste, { once: true });
    recorder.stop();
    morceaux = [];
  };

  const envoieLaPosition = (lieu: Lieu): void => {
    const clientMessageId = identifiantClient();
    const bulle = F.bulleOptimiste({
      clientMessageId,
      texte: '',
      auteur: ctx.config.nom,
      auteurId: ctx.config.moi,
      langue: ctx.config.langues[0] ?? 'fr',
      horsLigne: !ctx.enLigne,
      maintenant: Date.now(),
      lieu,
    });
    applique(ctx, F.insere(ctx.etat, bulle));
    void envoieLaBulle(ctx, bulle);
  };

  const surPosition = (): void => {
    if (boutonPosition === null || boutonPosition.hidden || !peutGeolocaliser()) return;
    navigator.geolocation.getCurrentPosition(
      (position) => envoieLaPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude, nom: null, adresse: null }),
      () => afficheLeRefus(ctx, FIL.positionRefusee),
    );
  };

  const surClicMicro = (): void => void demarreLEnregistrement();

  boutonMicro?.addEventListener('click', surClicMicro);
  boutonEnvoyerVocal?.addEventListener('click', arreteEtEnvoie);
  boutonAnnulerVocal?.addEventListener('click', annuleLEnregistrement);
  boutonPosition?.addEventListener('click', surPosition);

  actualise();

  return {
    actualise,
    detruit: () => {
      boutonMicro?.removeEventListener('click', surClicMicro);
      boutonEnvoyerVocal?.removeEventListener('click', arreteEtEnvoie);
      boutonAnnulerVocal?.removeEventListener('click', annuleLEnregistrement);
      boutonPosition?.removeEventListener('click', surPosition);
      suspendsLeMinuteur();
      if (enregistreur !== null) {
        try {
          enregistreur.stop();
        } catch {
          // Un enregistreur déjà arrêté (ou jamais démarré) lève sans risque — la destruction ne doit pas planter le reste du démontage.
        }
      }
      arreteLaPiste();
    },
  };
};
