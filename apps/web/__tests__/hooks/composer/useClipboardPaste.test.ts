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

  it('should not handle paste when disabled', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted, enabled: false })
    );

    const pngFile = new File(['dummy'], 'test.png', { type: 'image/png' });
    const mockEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [{
          kind: 'file',
          type: 'image/png',
          getAsFile: () => pngFile,
        }],
        files: [pngFile],
        getData: jest.fn(),
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockEvent);

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(onImagesPasted).not.toHaveBeenCalled();
  });

  it('should call onTextPasted for text content when no images', async () => {
    const onImagesPasted = jest.fn();
    const onTextPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted, onTextPasted })
    );

    const mockEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [],
        files: [],
        getData: jest.fn((format) => format === 'text/plain' ? 'Hello world' : ''),
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockEvent);

    expect(onTextPasted).toHaveBeenCalledWith('Hello world');
    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(onImagesPasted).not.toHaveBeenCalled();
  });

  it('should use fallback to files when items are empty', async () => {
    const onImagesPasted = jest.fn();
    const { result } = renderHook(() =>
      useClipboardPaste({ onImagesPasted })
    );

    const pngFile = new File(['dummy'], 'test.png', { type: 'image/png' });
    const mockEvent = {
      preventDefault: jest.fn(),
      clipboardData: {
        items: [], // Empty items triggers fallback
        files: [pngFile], // Fallback to files
        getData: jest.fn(),
      },
    } as unknown as ClipboardEvent;

    await result.current.handlePaste(mockEvent);

    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(onImagesPasted).toHaveBeenCalledWith([pngFile]);
  });
});
