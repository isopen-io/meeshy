/**
 * LE TALKIE D'URGENCE DU SERVICE WORKER, à part de `sw-push.js` pour que ce dernier tienne dans
 * son budget de taille (#18738). Chargé par `importScripts` JUSTE APRÈS `sw-push.js`
 * (`SERVICE_WORKER_SCRIPTS`, `vite/pwa.ts`) : les deux scripts classiques partagent la portée
 * globale du worker, si bien que `sw-push.js` appelle `annoncerTalkie` / `ouvrirTalkie` et lit
 * `langueDuNavigateur` d'ici, à l'exécution d'un écouteur, jamais au chargement.
 */
/**
 * LE TALKIE D'URGENCE, ONGLET FERMÉ (#17141, #17144) — un Proche parle pendant
 * que personne ne regarde : la passerelle pousse `talkie_incoming` (titre et
 * corps localisés, `talkieId`, `fromUserId`, nom de l'émetteur, et parfois
 * l'audio `audioUrl`). La notification dit « X vous parle » ; la toucher ouvre
 * (ou focalise) l'app, qui rattrape la voix par `talkie:join`.
 *
 * C'est la SEULE notification de Meeshy qui porte une action de LECTURE
 * (directive porteur 2026-11-08) : « Écouter » ({@link TALKIE_LISTEN_ACTION})
 * fait jouer la voix par un onglet déjà ouvert SANS le mettre au premier plan
 * — un worker ne joue pas de son lui-même ; sans onglet, elle ouvre l'app sur
 * le talkie. Aucune autre notification ne la porte : `sw-push-talkie.test.ts`
 * en est le témoin. D-11 vaut ici aussi : un onglet visible l'entend déjà.
 */
const TALKIE_PUSH_TYPE = 'talkie_incoming';
const TALKIE_TAG_PREFIX = 'talkie:';
const TALKIE_LISTEN_ACTION = 'talkie-listen';
/** JUMEAUX de `TALKIE_PARAM` et `TALKIE_WAKE_MESSAGE` (`src/lib/talkie/talkie-wake-intent.ts`). */
const TALKIE_PARAM = 'talkie';
const TALKIE_WAKE_MESSAGE = 'TALKIE_WAKE';
/** Le libellé d'« Écouter » quand la passerelle n'en sert pas : le worker ne charge aucun catalogue. */
const TALKIE_LISTEN_LABELS = { fr: 'Écouter', en: 'Listen', es: 'Escuchar', de: 'Anhören', it: 'Ascolta', pt: 'Ouvir', ar: 'استماع' };
const TALKIE_TALKS_LABELS = { fr: ' vous parle', en: ' is talking to you', es: ' te está hablando', de: ' spricht mit dir', it: ' ti sta parlando', pt: ' está falando com você', ar: ' يتحدث إليك' };

function langueDuNavigateur() {
  const langue = texte(self.navigator && self.navigator.language).slice(0, 2).toLowerCase();
  return Object.prototype.hasOwnProperty.call(TALKIE_LISTEN_LABELS, langue) ? langue : 'en';
}

/**
 * L'audio porté par le push ne voyage que s'il vient de la PASSERELLE
 * configurée (`apiBase` posé par la page avec le crédential) : une autre
 * origine ferait jouer une fausse voix d'urgence et partir une requête
 * arbitraire. Sans passerelle connue, rien ne voyage (fail-closed).
 */
function audioDuTalkie(valeur, apiBase) {
  try {
    const passerelle = new URL(texte(apiBase));
    const audio = new URL(texte(valeur));
    return audio.protocol === 'https:' && audio.origin === passerelle.origin ? audio.href : '';
  } catch {
    return '';
  }
}

async function annoncerTalkie(data) {
  const talkieId = texte(data.talkieId);
  const nom = texte(data.fromName) || texte(data.senderName);
  const langue = langueDuNavigateur();
  const titre = texte(data.title) || (nom === '' ? '' : nom + TALKIE_TALKS_LABELS[langue]);
  if (talkieId === '' || texte(data.fromUserId) === '' || titre === '') return;

  const ouvertes = await fenetres();
  if (ouvertes.some((client) => client.visibilityState === 'visible')) return;
  const stocke = await lireCredential();

  await self.registration.showNotification(titre, {
    body: texte(data.body),
    tag: TALKIE_TAG_PREFIX + talkieId,
    renotify: true,
    requireInteraction: true,
    icon: BANNER_ICON,
    badge: BANNER_BADGE,
    actions: [{ action: TALKIE_LISTEN_ACTION, title: texte(data.listenLabel) || TALKIE_LISTEN_LABELS[langue] }],
    data: { type: TALKIE_PUSH_TYPE, talkieId: talkieId, audioUrl: audioDuTalkie(voixDuTalkie(data), stocke && stocke.apiBase) },
  });
}

/* Le push de SUIVI (`phase: 'ended'`, même étiquette : il remplace la
   bannière) porte la voix gardée en pièce jointe, `attachmentUrl` ; le réveil
   en direct, sa capacité `audioUrl`. Les deux passent la même garde d'origine. */
function voixDuTalkie(data) {
  if (data.phase === 'ended') return texte(data.attachmentUrl) || data.audioUrl;
  return data.audioUrl;
}

async function ouvrirTalkie(data, action) {
  const talkieId = texte(data.talkieId);
  if (talkieId === '') return;
  const ecouter = action === TALKIE_LISTEN_ACTION;
  const audioUrl = ecouter ? texte(data.audioUrl) : '';
  const ouvertes = await fenetres();
  const client = ouvertes[0];
  if (client === undefined) {
    /* L'adresse d'un onglet neuf ne porte QUE la prise de parole : jamais
       d'audio dans l'URL de la page (un lien forgé ferait jouer une fausse
       voix). L'onglet rattrape par `talkie:join`. */
    await self.clients.openWindow(PUSH_ROUTE_PATTERNS.notifications + '?' + TALKIE_PARAM + '=' + encodeURIComponent(talkieId));
    return;
  }
  if (!ecouter) {
    await Promise.resolve()
      .then(() => client.focus())
      .catch(() => undefined);
  }
  client.postMessage({ type: TALKIE_WAKE_MESSAGE, talkieId: talkieId, ...(audioUrl !== '' ? { audioUrl: audioUrl } : {}) });
}
