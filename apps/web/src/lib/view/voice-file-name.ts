/**
 * LE NOM D'UN FICHIER SONORE DANS SA BULLE — lisible, ou rien.
 *
 * Un vocal ENREGISTRÉ dans l'app porte un nom fabriqué (`vocal.webm`,
 * `audio_2026….m4a`, un horodatage, un UUID) qui n'apprend rien : il est
 * masqué. Un fichier importé garde son nom, tronqué AU MILIEU quand il est
 * trop long, l'extension toujours visible.
 */
const GENERATED_STEM =
  /^(?:vocal|voice|voix|audio|aud|ptt|rec|record|recording|enregistrement|message|memo|note)(?:[\s._-]*[a-z]{0,3}\d+(?!\d))*$|^[\d\s._-]+$|^[0-9a-f]{8}(?:-?[0-9a-f]{4}){3}-?[0-9a-f]{12}$/i;

const splitName = (name: string): { readonly stem: string; readonly extension: string } => {
  const dot = name.lastIndexOf('.');
  return dot <= 0 || name.length - dot > 6 ? { stem: name, extension: '' } : { stem: name.slice(0, dot), extension: name.slice(dot) };
};

export const truncateMiddle = (name: string, max: number): string => {
  if (name.length <= max) return name;
  const { stem, extension } = splitName(name);
  const room = Math.max(2, max - extension.length - 1);
  const head = Math.ceil(room * 0.6);
  const tail = room - head;
  return `${stem.slice(0, head)}…${tail > 0 ? stem.slice(stem.length - tail) : ''}${extension}`;
};

export const voiceFileLabel = (originalName: string, max = 28): string | null => {
  const name = originalName.trim();
  if (name === '') return null;
  const { stem } = splitName(name);
  if (GENERATED_STEM.test(stem.trim())) return null;
  return truncateMiddle(name, max);
};
