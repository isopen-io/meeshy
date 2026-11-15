import { videoDisplaySize } from '../video-display-size';

const landscapeCoded = (rotation: Partial<{
  side_data_list: ReadonlyArray<{ rotation?: string | number }>;
  rotation: string | number;
  tags: Record<string, string | number>;
}> = {}) => ({ width: 1920, height: 1080, ...rotation });

describe('videoDisplaySize', () => {
  it('turns a phone video filmed upright into its portrait display size (display matrix of recent ffmpeg)', () => {
    expect(videoDisplaySize(landscapeCoded({ side_data_list: [{ rotation: -90 }] }))).toEqual({ width: 1080, height: 1920 });
  });

  it('reads the quarter turn from the legacy rotate tag of older ffmpeg', () => {
    expect(videoDisplaySize(landscapeCoded({ tags: { rotate: '90' } }))).toEqual({ width: 1080, height: 1920 });
  });

  it('reads the quarter turn from the stream rotation field', () => {
    expect(videoDisplaySize(landscapeCoded({ rotation: '270' }))).toEqual({ width: 1080, height: 1920 });
  });

  it('finds the display matrix among other side data', () => {
    const stream = landscapeCoded({ side_data_list: [{}, { rotation: 90 }] });
    expect(videoDisplaySize(stream)).toEqual({ width: 1080, height: 1920 });
  });

  it('keeps the coded size for a half turn, which changes no proportion', () => {
    expect(videoDisplaySize(landscapeCoded({ side_data_list: [{ rotation: 180 }] }))).toEqual({ width: 1920, height: 1080 });
  });

  it('keeps the coded size when no rotation is carried', () => {
    expect(videoDisplaySize(landscapeCoded())).toEqual({ width: 1920, height: 1080 });
  });

  it('ignores a rotation that is not a number', () => {
    expect(videoDisplaySize(landscapeCoded({ tags: { rotate: 'upright' } }))).toEqual({ width: 1920, height: 1080 });
  });

  it('reports an unknown size as zero, turned or not', () => {
    expect(videoDisplaySize({ side_data_list: [{ rotation: -90 }] })).toEqual({ width: 0, height: 0 });
  });
});
