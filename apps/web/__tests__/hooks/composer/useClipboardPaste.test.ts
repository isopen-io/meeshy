import { renderHook } from '@testing-library/react';
import { useClipboardPaste } from '@/hooks/composer/useClipboardPaste';

describe('useClipboardPaste', () => {
  it('should detect a pasted image (PNG)', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted })
    );

    const pngFile = new File(['dummy'], 'test.png', { type: 'image/png' });
    const mockClipboardEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => pngFile,
          },
        ],
        files: [],
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockClipboardEvent);

    expect(mockClipboardEvent.preventDefault).toHaveBeenCalled();
    expect(onImagesPasted).toHaveBeenCalledWith([pngFile]);
  });

  it('should ignore non-image files (text/plain)', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted })
    );

    const mockClipboardEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [
          {
            kind: 'string',
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
        files: [],
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockClipboardEvent);

    expect(mockClipboardEvent.preventDefault).not.toHaveBeenCalled();
    expect(onImagesPasted).not.toHaveBeenCalled();
  });

  it('should handle multiple images simultaneously (PNG + JPEG)', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted })
    );

    const pngFile = new File(['dummy1'], 'test1.png', { type: 'image/png' });
    const jpegFile = new File(['dummy2'], 'test2.jpeg', {
      type: 'image/jpeg',
    });

    const mockClipboardEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [
          {
            kind: 'file',
            type: 'image/png',
            getAsFile: () => pngFile,
          },
          {
            kind: 'file',
            type: 'image/jpeg',
            getAsFile: () => jpegFile,
          },
        ],
        files: [],
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockClipboardEvent);

    expect(mockClipboardEvent.preventDefault).toHaveBeenCalled();
    expect(onImagesPasted).toHaveBeenCalledWith([pngFile, jpegFile]);
  });
});
