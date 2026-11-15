import { isDeepStrictEqual } from 'node:util';

export function amendmentDrift({ frames, anchors, svg }) {
  const names = [...new Set([...Object.keys(frames), ...Object.keys(anchors)])].sort();
  const reasonOf = (name) => {
    const amended = frames[name];
    if (!amended) return 'missing';
    if (!anchors[name]) return 'orphan';
    if (!isDeepStrictEqual(amended.anchors, anchors[name])) return 'anchors';
    if (svg && svg[name] !== amended.svg) return 'svg';
    return null;
  };
  return {
    drift: names.map((frame) => ({ frame, reason: reasonOf(frame) })).filter(({ reason }) => reason),
    pending: names.filter((name) => frames[name] && frames[name].png === null),
  };
}
