'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Icone } from '@/components/ui/icone';
import { revalideLaPlace } from '@/lib/api/adhesion';
import { envoieUnMessage } from '@/lib/api/messagerie';
import { useCycleDeVie } from '@/lib/realtime/lifecycle';
import {
  enfile,
  videLaFile,
  type EntreeDeFile,
} from '@/lib/realtime/queue/offline-queue';
import type { Participation } from '@/lib/realtime/participate';
import { rattrape } from '@/lib/realtime/sync/delta-client';

import { BulleDuFil } from './bulle';
import {
  estColleEnBas,
  libelleDesNonLus,
  nonLusApresAjout,
} from './defilement';
import { engagementARejouer, peutOuvrirLeTransport } from './engagement';
import styles from './fil.module.css';
import {
  BANNIERE_HORS_LIGNE,
  FIL_VIDE_FERME,
  FIL_VIDE_OUVERT,
  LECTURE_INDISPONIBLE,
  LECTURE_SEULE,
  SEPARATEUR_DE_LACUNE,
  avisDuFil,
  fermetureDuFil,
  libelleDeLAnnulation,
  type EvenementDuFil,
} from './fil-etats';
import {
  bulleEnAttente,
  bulleServie,
  filAPeindre,
  fusionneLesBulles,
  type Bulle,
  type MessageServi,
} from './fil-modele';

/**
 * L'ÎLOT DU FIL — le SEUL composant client du rôle premier, et tout ce que le
 * § 6 exige tient dedans (planche `thread`, `cible/thread.png`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS, ET QUI EST LA MOITIÉ DU SUJET
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Il n'appelle JAMAIS `POST /anonymous/leave`. La place est un BAIL SERVEUR
 * (§ 6.2) : le battement en est la preuve de présence, un balayage la libère.
 * Aucun événement du navigateur ne se déclenche à l'arrêt forcé de
 * l'application, au crash de l'onglet, à la coupure de tunnel ni à l'extinction
 * du téléphone — un signal qui se tait quand il faudrait ET part quand il ne
 * faut pas ne peut pas tenir un compteur d'admission (§ 6.3 H).
 *
 * Le BALAYAGE, lui, n'existe pas encore côté passerelle : c'est l'issue
 * hors-web `gw:bail-anonyme`, déclarée par #4524 et portée par le cas `H-bail`
 * de `e2e/visual/lib/lifecycle.ts`. Tant qu'elle n'est pas levée, une place
 * abandonnée reste occupée — un fait qui appartient au serveur, et qu'aucune
 * ligne d'ici ne peut corriger, mais que rien ne doit laisser croire couvert.
 *
 * Il ne REJOINT jamais tout seul. Un 401 n'autorise pas un re-join : mesure à
 * l'appui (§ 6.1 point 3), le retour coûte une identité neuve, un pseudo
 * suffixé, la paternité des messages, +1 sur trois compteurs, et une boucle
 * épuiserait le `maxUses` du lien de son créateur. Il affiche un BOUTON.
 *
 * Il n'attache AUCUN écouteur de cycle de vie. Les sept événements du § 6.2 ont
 * un seul point d'écoute — `lib/realtime/lifecycle.ts` —, et le lint de zone
 * l'impose. C'est ce partage qui rend vraie par construction la première ligne
 * du § 6.2 : un onglet caché n'a pas de minuterie du tout, donc il ne peut rien
 * faire partir.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DES RÉFÉRENCES, PAS SEULEMENT DE L'ÉTAT — et ce n'est pas un raccourci
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La reprise du § 6.3 C est une SÉQUENCE asynchrone : revalider, rattraper,
 * vider la file. Chaque étape lit ce que la précédente a produit. Une fermeture
 * qui capturerait l'état de rendu servirait des valeurs périmées — la file
 * qu'on croit vide, le curseur d'avant. Ce qui doit rester JUSTE entre deux
 * `await` vit donc dans une référence, et l'état de rendu en est le miroir.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE TRANSPORT N'EST PAS ICI
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `socket.io-client` pèse 12 796 octets mesurés et le § 8.3 l'interdit avant le
 * tap. Il vit derrière `await import()` dans `lib/realtime/participate.ts`, et
 * ce fichier ne le nomme nulle part : le fil se LIT sans une seule connexion
 * tenue, par le rendu serveur et par `GET /sync`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ET LE PRISME N'EST PAS DESCENDU ICI POUR CE QUE LE SERVEUR A DÉJÀ LU
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'îlot recevait les MESSAGES — original, langue d'origine, et la carte
 * COMPLÈTE des traductions — pour en descendre le Prisme dans le navigateur.
 * Le paquet Flight sérialisé (`self.__next_f`) transportait donc, pour chacun
 * des 50 messages, N textes dont un seul serait lu, et le HTML en portait une
 * copie : un document en O(2 × messages × langues) pour servir UNE langue, sur
 * l'écran dont la question est « combien d'octets avant le premier pixel
 * utile ». Le serveur descend désormais le Prisme lui-même (`fil-serveur.tsx`)
 * et ne passe que des BULLES — le texte servi et sa langue. La descente reste
 * ici pour ce que le serveur n'a pas vu : le delta de `GET /sync` et le socket.
 */

export type DroitsDuFil = {
  readonly ecrire: boolean;
};

export type ContexteDuFil = {
  /** La base PUBLIQUE de la passerelle — celle que le NAVIGATEUR peut joindre. */
  readonly base: string;
  readonly jeton: string;
  readonly participantId: string;
  readonly conversationId: string;
  readonly pseudo: string;
  /** La clé d'entrée de la place : `meeshy.guest.<lien>`, composée par son détenteur. */
  readonly cleDuJeton: string;
  /** Le rang 1 du Prisme du lecteur, et la langue de ce qu'il écrit. */
  readonly langueDeclaree: string | null;
  /** `<html lang>` — ce contre quoi `lang` se décide sur chaque bulle. */
  readonly langueDuDocument: string;
  readonly prisme: readonly string[];
  readonly droits: DroitsDuFil;
  /** Ce que le SERVEUR a déjà résolu — des bulles, jamais des messages bruts. */
  readonly bulles: readonly Bulle[];
  /** Le refus NOMMÉ que la lecture serveur a rencontré (401 / 410), s'il y en a un. */
  readonly refusInitial: EvenementDuFil | null;
  /** La passerelle n'a rien pu dire au rendu — ce n'est ni un refus, ni un fil vide. */
  readonly lectureIndisponible: boolean;
  /** Le watermark du premier `GET /sync` — l'instant du rendu serveur. */
  readonly depuis: string;
};

/**
 * LA CADENCE DE LA PREUVE DE PRÉSENCE (§ 5, § 6.4) : 5 min, soit deux
 * battements manqués avant le bail.
 */
export const PERIODE_DU_BATTEMENT_MS = 5 * 60_000;

/**
 * LA CADENCE DU RATTRAPAGE — et pourquoi elle est DISTINCTE de la précédente.
 *
 * Le battement ne faisait QUE prouver la place. Conséquence mesurable : un
 * onglet visible, jamais masqué, dont le réseau ne tombe pas et dont on ne
 * touche pas le composeur — c'est-à-dire le comportement NOMINAL de quelqu'un
 * qui LIT une conversation partagée sur son téléphone — n'affichait AUCUN
 * message nouveau, indéfiniment. Le transport n'est ouvert qu'au focus du
 * composeur (§ 8.3), et `rattrape()` n'était appelé qu'à la transition
 * `reprise` : la moitié « lit » du titre du lot n'était vivante que pour qui
 * bascule d'application ou perd le réseau.
 *
 * La minuterie du cycle de vie tourne donc à la MINUTE, et la preuve de place
 * ne part qu'un tour sur `TOURS_PAR_BATTEMENT` — le compte de
 * `POST /anonymous/refresh` sur la fenêtre de recette est inchangé (§ 8.5 et
 * cas E : deux sur dix minutes, portés par UN onglet élu). Ce qui s'ajoute est
 * un `GET /sync` par minute sur le seul onglet PORTEUR et seulement tant qu'il
 * est ACTIF : la minuterie est déjà suspendue à `hidden`, donc la barre « 0
 * requête pendant que l'onglet est caché » n'est pas touchée.
 */
export const PERIODE_DU_RATTRAPAGE_MS = 60_000;

export const TOURS_PAR_BATTEMENT = PERIODE_DU_BATTEMENT_MS / PERIODE_DU_RATTRAPAGE_MS;

type EnvoiAnnule = {
  readonly entree: EntreeDeFile;
  readonly evenement: EvenementDuFil;
};

export function IlotDuFil({
  contexte,
  reprise,
}: {
  readonly contexte: ContexteDuFil;
  /**
   * Le geste de l'état F, posé par le SERVEUR : il ferme la place côté client
   * et rouvre le formulaire d'entrée avec le pseudo pré-rempli. C'est le
   * visiteur qui appuie — jamais l'écran qui rejoint seul.
   */
  readonly reprise: () => void | Promise<void>;
}) {
  const [servies, poseServies] = useState<readonly Bulle[]>(contexte.bulles);
  const [file, poseFile] = useState<readonly EntreeDeFile[]>([]);
  const [annules, poseAnnules] = useState<readonly EnvoiAnnule[]>([]);
  const [evenement, poseEvenement] = useState<EvenementDuFil | null>(contexte.refusInitial);
  const [lacune, poseLacune] = useState(false);
  const [horsLigne, poseHorsLigne] = useState(false);
  const [indisponible, poseIndisponible] = useState(contexte.lectureIndisponible);
  const [brouillon, poseBrouillon] = useState('');
  const [nonLus, poseNonLus] = useState(0);
  /**
   * Le fuseau de l'heure affichée. `UTC` au rendu serveur ET au premier rendu
   * client — sans quoi chaque bulle opposerait une divergence d'hydratation —,
   * puis `locale` dans un effet, c'est-à-dire après l'hydratation. Voir
   * `heureDe` dans `fil-modele.ts`.
   */
  const [fuseau, poseFuseau] = useState<'UTC' | 'locale'>('UTC');
  /**
   * L'ÉTAT DU TRANSPORT, et il n'existe qu'APRÈS l'engagement.
   *
   * `absent` n'est pas « coupé » : un lecteur qui n'a pas touché le composeur
   * n'a AUCUNE connexion, par décision (§ 8.3), et lui peindre un point creux
   * lui annoncerait une panne qui n'existe pas. Le § 7 ne demande le point
   * d'état que quand une connexion est censée tenir — « un point d'état discret
   * passe de plein à creux. RIEN D'AUTRE : pas de bannière, pas de spinner ».
   */
  const [transport, poseTransport] = useState<'absent' | 'branche' | 'coupe'>('absent');

  const fileVive = useRef<readonly EntreeDeFile[]>([]);
  const curseur = useRef(contexte.depuis);
  const evenementVif = useRef<EvenementDuFil | null>(contexte.refusInitial);
  const participation = useRef<Participation | null>(null);
  const engagement = useRef(false);
  /** Un vidage à la fois : deux `videLaFile` concurrents enverraient deux fois. */
  const vidageEnCours = useRef(false);
  /**
   * L'état HORS-LIGNE, en référence : `engage()` est une fermeture appelée par
   * un gestionnaire d'événement, et l'état de rendu qu'elle capturerait peut
   * dater d'avant la coupure.
   */
  const horsLigneVif = useRef(false);
  /** Le composeur a été touché — même hors-ligne, où l'engagement est REPORTÉ. */
  const engagementVoulu = useRef(false);
  const tour = useRef(0);
  const zone = useRef<HTMLOListElement | null>(null);
  /** Le lecteur suit-il le bas du fil ? On ne défile jamais sous quelqu'un qui a remonté. */
  const colle = useRef(true);
  const dernierCompte = useRef(contexte.bulles.length);

  const poseLEvenement = useCallback((suivant: EvenementDuFil): void => {
    evenementVif.current = suivant;
    poseEvenement(suivant);
  }, []);

  const rangeLaFile = useCallback((suivante: readonly EntreeDeFile[]): void => {
    fileVive.current = suivante;
    poseFile(suivante);
  }, []);

  const appel = useMemo(
    () => ({ base: contexte.base, jeton: contexte.jeton }),
    [contexte.base, contexte.jeton],
  );

  /** La descente du Prisme sur ce que le SERVEUR n'a pas vu : le delta et le socket. */
  const enBulle = useCallback(
    (message: MessageServi): Bulle =>
      bulleServie({
        message,
        prisme: contexte.prisme,
        langueDuDocument: contexte.langueDuDocument,
      }),
    [contexte.langueDuDocument, contexte.prisme],
  );

  /**
   * LE VIDAGE — FIFO strict, et son refus est VISIBLE.
   *
   * Il ne part pas quand la place est déjà close : réessayer un envoi sur un
   * jeton mort produirait une rafale de 401 sans qu'aucun d'eux n'apprenne
   * quoi que ce soit.
   */
  const vide = useCallback(async (): Promise<void> => {
    if (fileVive.current.length === 0 || evenementVif.current !== null) return;
    if (vidageEnCours.current) return;
    vidageEnCours.current = true;

    try {
      const resultat = await videLaFile({
        file: fileVive.current,
        envoie: (entree) =>
          envoieUnMessage({
            ...appel,
            conversationId: contexte.conversationId,
            participantId: contexte.participantId,
            contenu: entree.texte,
            langue: entree.langue,
          }),
      });

      rangeLaFile(resultat.restantes);
      if (resultat.partis.length > 0) {
        const parties = resultat.partis.map(enBulle);
        poseServies((precedentes) => fusionneLesBulles(precedentes, parties));
      }

      const refus = resultat.refus;
      if (refus === null) return;

      const cause = refus.cause;

      poseLEvenement(cause);
      poseAnnules((precedents) => [
        ...precedents,
        ...refus.annulees.map((entree) => ({ entree, evenement: cause })),
      ]);
    } finally {
      vidageEnCours.current = false;
    }
  }, [appel, contexte.conversationId, contexte.participantId, enBulle, poseLEvenement, rangeLaFile]);

  /**
   * LA PLACE — `false` quand elle est refusée, et c'est le refresh de CONTRÔLE
   * du § 6.3 F : il n'y a pas lieu d'en faire un second pour arbitrer un 401.
   * Une indisponibilité rend `true` : « erreur réseau ≠ 401 » (§ 7).
   */
  const prouveLaPlace = useCallback(async (): Promise<boolean> => {
    const place = await revalideLaPlace(appel);

    if (place.etat === 'close') {
      poseLEvenement({ type: 'place-fermee' });
      return false;
    }
    if (place.etat === 'lien-mort') {
      poseLEvenement({ type: 'lien-mort', cause: place.cause });
      return false;
    }
    return true;
  }, [appel, poseLEvenement]);

  /**
   * LE RATTRAPAGE — `GET /sync` depuis le watermark, et rien d'autre.
   *
   * Le socket ne rejoue pas ce qui s'est dit pendant une absence, et il n'est
   * même pas ouvert pour qui ne fait que lire : sans cet appel, la conversation
   * n'avance jamais. Une charge servie efface la ligne « les messages n'ont pas
   * pu être chargés » — c'est ce qui distingue une coupure d'un fil vide.
   */
  const rattrapeUneFois = useCallback(async (): Promise<void> => {
    const delta = await rattrape({
      ...appel,
      conversationId: contexte.conversationId,
      participantId: contexte.participantId,
      depuis: curseur.current,
    });

    if (delta.etat !== 'servi') return;

    poseIndisponible(false);
    curseur.current = delta.valeur.curseur ?? curseur.current;
    if (delta.valeur.lacune) poseLacune(true);
    if (delta.valeur.messages.length > 0) {
      const arrivees = delta.valeur.messages.map(enBulle);
      poseServies((precedentes) => fusionneLesBulles(precedentes, arrivees));
    }
  }, [appel, contexte.conversationId, contexte.participantId, enBulle]);

  /**
   * LA REPRISE (§ 6.3 C, § 7) — trois pas, dans cet ordre, et l'ordre compte.
   *
   *   1. la PLACE d'abord : un jeton mort rend tout le reste sans objet ;
   *   2. le RATTRAPAGE ensuite : le socket ne rejoue pas ce qui s'est dit
   *      pendant l'absence, donc sans `GET /sync` la conversation revient avec
   *      un trou et sans le dire ;
   *   3. la FILE enfin : ce qu'on a écrit hors-ligne part après avoir su que la
   *      place tient, jamais avant.
   *
   * Une indisponibilité n'interrompt RIEN et ne ferme RIEN : « erreur réseau ≠
   * 401 » (§ 7). L'écran ne bouge pas, ce qui est exactement ce que le § 7
   * demande — « c'est une coupure, pas un refus ».
   */
  const reprend = useCallback(async (): Promise<void> => {
    if (!(await prouveLaPlace())) return;
    await rattrapeUneFois();
    await vide();
  }, [prouveLaPlace, rattrapeUneFois, vide]);

  /**
   * LE BATTEMENT — la preuve de présence du bail (§ 6.4) ET le rattrapage d'un
   * lecteur qui ne fait que lire.
   *
   * Il ne faisait QUE la première, et le titre du lot en perdait la moitié :
   * voir `PERIODE_DU_RATTRAPAGE_MS`. La preuve de place garde sa cadence de
   * cinq minutes — un tour sur `TOURS_PAR_BATTEMENT` —, et ce qu'elle apprend
   * compte : un 401 ici est l'état F, un 410 l'état G, et dans les deux cas il
   * n'y a plus rien à rattraper.
   */
  const bat = useCallback((): void => {
    tour.current += 1;
    const doitProuver = tour.current % TOURS_PAR_BATTEMENT === 0;

    void (async () => {
      if (doitProuver && !(await prouveLaPlace())) return;
      await rattrapeUneFois();
      await vide();
    })();
  }, [prouveLaPlace, rattrapeUneFois, vide]);

  /**
   * L'ENGAGEMENT — le seul moment où les 12 796 octets du transport partent.
   *
   * Le § 8.3 gate `socket.io-client` à ZÉRO avant le tap, et le § 2 explique
   * pourquoi la LECTURE n'en a pas besoin : le fil arrive rendu par le serveur,
   * et le rattrapage se fait par `GET /sync`. Ce qui exige une connexion tenue,
   * c'est la PARTICIPATION — envoyer, recevoir dans la seconde, dire qu'on
   * écrit —, et elle commence quand le visiteur touche le composeur.
   *
   * PAS HORS LIGNE, et c'est la troisième garde. Toucher le composeur pendant
   * une coupure — le chemin que le lot met en avant : « ce qu'on écrit dans le
   * métro n'est pas perdu » — téléchargeait 12,8 Ko sur un réseau qui n'existe
   * pas, puis lançait une boucle de reconnexion 1 s → 30 s pour toute la durée
   * de la coupure. La suspension ne rattrapait rien : `perte-du-reseau` était
   * déjà passée, donc `participation.current` valait `null` au moment du
   * `suspend()`. Et le point d'état passait à « Reconnexion en cours » sous une
   * bannière disant « Hors ligne » — deux messages pour un seul fait. Le
   * souhait est donc RETENU (`engagementVoulu`) et rejoué à la reprise.
   *
   * `await import()` est ce qui rend la promesse vraie : le paquet devient un
   * chunk ASYNCHRONE, absent des chunks que la page réclame au chargement.
   *
   * Une seule fois : `engagement` est une référence et pas un état, parce qu'un
   * second rendu ne doit pas rouvrir une seconde connexion (le défaut des trois
   * `io(...)` de `apps/web`, § 5.3).
   */
  const engage = useCallback((): void => {
    engagementVoulu.current = true;
    if (
      !peutOuvrirLeTransport({
        dejaEngage: engagement.current,
        refuse: evenementVif.current !== null,
        horsLigne: horsLigneVif.current,
      })
    ) {
      return;
    }
    engagement.current = true;
    poseTransport('coupe');

    void import('@/lib/realtime/participate')
      .then(({ ouvreLaParticipation }) =>
        ouvreLaParticipation({
          base: contexte.base,
          jeton: contexte.jeton,
          conversationId: contexte.conversationId,
          participantId: contexte.participantId,
          surMessage: (message) =>
            poseServies((precedentes) => fusionneLesBulles(precedentes, [enBulle(message)])),
          surEtat: (branche) => poseTransport(branche ? 'branche' : 'coupe'),
        }),
      )
      .then((ouverte) => {
        participation.current = ouverte;
      })
      .catch(() => {
        // Un transport qui ne se charge pas ne casse pas la lecture : le fil
        // reste servi, et `GET /sync` continue de le compléter à chaque reprise.
        engagement.current = false;
        poseTransport('absent');
      });
  }, [contexte.base, contexte.conversationId, contexte.jeton, contexte.participantId, enBulle]);

  /**
   * CE QUI RESTE EN MÉMOIRE UNE FOIS L'ÉCRAN QUITTÉ : rien.
   *
   * Le cycle de vie ferme ses propres écouteurs ; le transport, lui, n'est pas
   * à lui — il est ouvert ICI, par un `await import()` que rien d'autre ne
   * connaît. Sans cette fermeture, quitter le fil laisserait une connexion
   * tenue, sa minuterie de reconnexion et ses gestionnaires vivants pour la
   * durée de la session (dimension « Optimisation mémoire »). L'effet ne dépend
   * d'AUCUNE valeur : il ne doit se dérouler qu'au démontage.
   */
  useEffect(
    () => () => {
      participation.current?.ferme();
      participation.current = null;
      engagement.current = false;
    },
    [],
  );

  /** L'heure passe en fuseau LOCAL une fois l'hydratation faite, jamais avant. */
  useEffect(() => {
    poseFuseau('locale');
  }, []);

  useCycleDeVie({
    cleDuJeton: contexte.cleDuJeton,
    battement: { intervalleMs: PERIODE_DU_RATTRAPAGE_MS, battre: bat },
    sur: (transition) => {
      if (transition.type === 'masquage' || transition.type === 'destruction') {
        // La première ligne du § 6.2 : un onglet caché ne fait RIEN partir. Une
        // connexion tenue est une requête de fond — le repli d'Engine.IO est du
        // long-polling — donc elle se suspend avec le reste.
        participation.current?.suspend();
        return;
      }
      if (transition.type === 'perte-du-reseau') {
        horsLigneVif.current = true;
        poseHorsLigne(true);
        participation.current?.suspend();
        return;
      }
      if (transition.type === 'reprise') {
        horsLigneVif.current = false;
        poseHorsLigne(false);
        participation.current?.reprend();
        // Ce qu'on a voulu engager hors-ligne s'ouvre MAINTENANT : la file est
        // déjà partie par REST, le transport ne sert que la suite.
        if (
          engagementARejouer({
            voulu: engagementVoulu.current,
            dejaEngage: engagement.current,
          })
        ) {
          engage();
        }
        void reprend();
      }
    },
  });

  /**
   * L'ENVOI OPTIMISTE. La bulle apparaît AVANT le réseau (« Optimistic
   * Updates ») et le composeur reste actif hors-ligne (§ 7) : ce qu'on écrit
   * dans le métro n'est pas perdu, il attend.
   */
  const envoie = useCallback((): void => {
    const texte = brouillon.trim();
    if (texte === '') return;

    const entree: EntreeDeFile = {
      cle: `brouillon-${Date.now()}-${fileVive.current.length}`,
      texte,
      langue: contexte.langueDeclaree,
      ecriteA: Date.now(),
    };

    rangeLaFile(enfile(fileVive.current, entree));
    poseBrouillon('');
    // Ce qu'on vient d'écrire, on le regarde : le geste REPREND le pli, même si
    // le lecteur avait remonté pour relire.
    colle.current = true;
    void vide();
  }, [brouillon, contexte.langueDeclaree, rangeLaFile, vide]);

  const bulles = useMemo(() => {
    const enAttente: readonly Bulle[] = [
      ...file.map((entree) =>
        bulleEnAttente({
          cle: entree.cle,
          texte: entree.texte,
          auteur: contexte.pseudo,
          instantMs: entree.ecriteA,
        }),
      ),
      ...annules.map((annule) => ({
        ...bulleEnAttente({
          cle: annule.entree.cle,
          texte: annule.entree.texte,
          auteur: contexte.pseudo,
          instantMs: annule.entree.ecriteA,
        }),
        etat: 'refusee' as const,
        raison: libelleDeLAnnulation(annule.evenement),
      })),
    ];

    return filAPeindre({ servis: servies, enAttente, lacune });
  }, [annules, contexte.pseudo, file, lacune, servies]);

  const auPresent = useCallback((): void => {
    const element = zone.current;
    if (element === null) return;
    element.scrollTop = element.scrollHeight;
    colle.current = true;
    poseNonLus(0);
  }, []);

  /**
   * LE PLI — la moitié POSITIVE du § 7 (« les messages manqués s'insèrent SANS
   * FAIRE SAUTER le scroll » : ne pas sauter, ET être au bon endroit).
   *
   * Au montage, on se pose sur le PRÉSENT : la passerelle sert les 50 messages
   * les plus récents, et sans cet effet le fil s'ouvrait sur le plus ancien.
   * Ensuite, on ne suit que si le lecteur SUIVAIT déjà ; sinon on COMPTE, et le
   * bouton dit combien. Les deux règles tiennent ensemble : personne ne se fait
   * déplacer le texte sous les yeux, et personne ne rate le présent.
   */
  useEffect(() => {
    const compte = bulles.bulles.length;
    const avant = dernierCompte.current;
    dernierCompte.current = compte;

    if (colle.current) {
      auPresent();
      return;
    }
    poseNonLus((precedents) =>
      nonLusApresAjout({ nonLus: precedents, avant, apres: compte, colle: false }),
    );
  }, [auPresent, bulles.bulles.length]);

  const surDefilement = useCallback((): void => {
    const element = zone.current;
    if (element === null) return;
    const enBas = estColleEnBas(element);
    colle.current = enBas;
    if (enBas) poseNonLus(0);
  }, []);

  const avis = evenement === null ? null : avisDuFil(evenement);
  const fermeture =
    evenement !== null
      ? fermetureDuFil(evenement)
      : contexte.droits.ecrire
        ? null
        : LECTURE_SEULE;

  const filEstVide = bulles.bulles.length === 0;

  return (
    <>
      {horsLigne ? (
        <p className={styles.horsLigne} role="status">
          {BANNIERE_HORS_LIGNE}
        </p>
      ) : null}

      {avis === null ? null : (
        <div className={styles.avis} role="alert">
          <strong>{avis.titre}</strong>
          <span>{avis.corps}</span>
          {avis.reprise === null ? null : (
            <form action={reprise}>
              <button className={styles.reprendre} type="submit">
                {avis.reprise}
              </button>
            </form>
          )}
        </div>
      )}

      {/*
        `tabIndex` sur une zone qui DÉFILE : sans lui, ce qui est hors du pli est
        inatteignable au clavier dès que la liste ne contient aucun élément
        focalisable — c'est-à-dire le cas nominal d'un fil de lecture (règle
        `scrollable-region-focusable`, impact serious). Le nom accessible dit ce
        que la zone EST, puisqu'elle devient une cible de tabulation.
      */}
      <ol
        className={styles.bulles}
        ref={zone}
        onScroll={surDefilement}
        tabIndex={0}
        aria-label="Fil de la conversation"
      >
        {bulles.lacune ? (
          <li className={styles.lacune}>
            <Icone nom="ph-clock-counter-clockwise" />
            {SEPARATEUR_DE_LACUNE}
          </li>
        ) : null}
        {bulles.bulles.map((bulle) => (
          <BulleDuFil
            key={bulle.id}
            bulle={bulle}
            langueDuDocument={contexte.langueDuDocument}
            fuseau={fuseau}
          />
        ))}
        {/*
          LES TROIS FILS VIDES, distingués (dimension 8). Une coupure de lecture
          n'est pas une conversation neuve : l'une se DIT et s'efface au premier
          rattrapage, l'autre INVITE à écrire.
        */}
        {filEstVide && indisponible ? (
          /*
            Pas de `role="status"` ici : la ligne est là dès le premier rendu,
            donc il n'y a rien à ANNONCER — et un `li` dont le rôle cesse d'être
            `listitem` casse la structure de la liste qui le contient.
          */
          <li className={styles.vide}>{LECTURE_INDISPONIBLE}</li>
        ) : null}
        {filEstVide && !indisponible ? (
          <li className={styles.vide}>
            {fermeture === null ? FIL_VIDE_OUVERT : FIL_VIDE_FERME}
          </li>
        ) : null}
      </ol>

      {nonLus > 0 ? (
        <button className={styles.nonLus} type="button" onClick={auPresent}>
          <Icone nom="ph-arrow-down" />
          {libelleDesNonLus(nonLus)}
        </button>
      ) : null}

      {fermeture === null ? (
        <form
          className={styles.composeur}
          action={() => {
            envoie();
          }}
        >
          {/*
            Le point d'état du § 7 : « discret », et le SEUL retour visuel d'une
            connexion tombée. Il porte un nom accessible plutôt qu'une couleur
            seule — une information portée par la seule teinte n'existe pas pour
            qui ne la distingue pas.
          */}
          {transport === 'absent' ? null : (
            <span
              className={`${styles.etat} ${transport === 'branche' ? styles.plein : styles.creux}`}
              role="img"
              aria-label={transport === 'branche' ? 'Connecté' : 'Reconnexion en cours'}
            />
          )}
          <button className={styles.jointure} type="button" disabled aria-label="Joindre un fichier">
            <Icone nom="ph-paperclip" />
          </button>
          <input
            className={styles.champ}
            name="message"
            aria-label="Votre message"
            placeholder={`Écrire en ${contexte.langueDeclaree ?? contexte.langueDuDocument}…`}
            value={brouillon}
            onFocus={engage}
            onChange={(evenementDeSaisie) => poseBrouillon(evenementDeSaisie.target.value)}
            autoComplete="off"
          />
          <button className={styles.envoyer} type="submit" aria-label="Envoyer">
            <Icone nom="ph-arrow-up" />
          </button>
        </form>
      ) : (
        <p className={styles.composeurFerme}>{fermeture}</p>
      )}
    </>
  );
}
