/**
 * La taille d'AFFICHAGE d'une vidéo, celle que tout lecteur peint (#14609).
 *
 * Un téléphone tenu droit filme des pixels couchés (1920×1080) et pose une
 * rotation d'affichage de ±90° dans la matrice de la piste : ffprobe rend la
 * taille CODÉE dans `width`/`height`, et la rotation à côté — dans
 * `side_data_list` (matrice d'affichage, ffmpeg récents), dans `rotation`, ou
 * dans l'étiquette `tags.rotate` (ffmpeg anciens). Enregistrer la taille codée
 * peignait une vidéo portrait dans une boîte paysage chez chaque lecteur qui
 * cadre un média sur ses dimensions. Un quart de tour échange donc largeur et
 * hauteur ; un demi-tour ne change aucune proportion.
 */

type Rotation = string | number;

export type ProbedVideoStream = {
  readonly width?: number;
  readonly height?: number;
  readonly rotation?: Rotation;
  readonly tags?: Readonly<Record<string, Rotation>>;
  readonly side_data_list?: ReadonlyArray<{ readonly rotation?: Rotation }>;
};

export type VideoDisplaySize = { readonly width: number; readonly height: number };

const degrees = (value: Rotation | undefined): number | null => {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rotationOf = (stream: ProbedVideoStream): number =>
  [
    ...(stream.side_data_list ?? []).map((side) => side.rotation),
    stream.rotation,
    stream.tags?.rotate,
  ]
    .map(degrees)
    .find((turn): turn is number => turn !== null) ?? 0;

const isQuarterTurn = (turn: number): boolean => Math.abs(Math.round(turn)) % 180 === 90;

export function videoDisplaySize(stream: ProbedVideoStream): VideoDisplaySize {
  const width = stream.width || 0;
  const height = stream.height || 0;
  return isQuarterTurn(rotationOf(stream)) ? { width: height, height: width } : { width, height };
}
