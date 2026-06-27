import { renderHook, act } from '@testing-library/react';
import { useTextAttachmentDetection } from '@/hooks/useTextAttachmentDetection';

const createTextareaRef = () => {
  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  return { current: textarea };
};

const simulatePaste = (element: HTMLTextAreaElement, text: string) => {
  const event = new Event('paste', { bubbles: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
    configurable: true,
  });
  element.dispatchEvent(event);
};

beforeEach(() => {
  jest.resetAllMocks();
  document.body.innerHTML = '';
});

describe('useTextAttachmentDetection', () => {
  it('returns threshold with default value of 300', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();

    const { result } = renderHook(() =>
      useTextAttachmentDetection(ref, { onTextDetected })
    );

    expect(result.current.threshold).toBe(300);
  });

  it('calls onTextDetected when pasted text length exceeds threshold', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const longText = 'a'.repeat(301);

    renderHook(() => useTextAttachmentDetection(ref, { onTextDetected }));

    act(() => {
      simulatePaste(ref.current, longText);
    });

    expect(onTextDetected).toHaveBeenCalledWith(longText);
  });

  it('does not call onTextDetected when pasted text length is at or below threshold', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const shortText = 'a'.repeat(300);

    renderHook(() => useTextAttachmentDetection(ref, { onTextDetected }));

    act(() => {
      simulatePaste(ref.current, shortText);
    });

    expect(onTextDetected).not.toHaveBeenCalled();
  });

  it('does not call onTextDetected when enabled is false, even for long text', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const longText = 'a'.repeat(301);

    renderHook(() =>
      useTextAttachmentDetection(ref, { onTextDetected, enabled: false })
    );

    act(() => {
      simulatePaste(ref.current, longText);
    });

    expect(onTextDetected).not.toHaveBeenCalled();
  });

  it('uses custom threshold when provided', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const customThreshold = 50;

    const { result } = renderHook(() =>
      useTextAttachmentDetection(ref, { onTextDetected, threshold: customThreshold })
    );

    expect(result.current.threshold).toBe(customThreshold);

    const textJustAboveThreshold = 'b'.repeat(51);

    act(() => {
      simulatePaste(ref.current, textJustAboveThreshold);
    });

    expect(onTextDetected).toHaveBeenCalledWith(textJustAboveThreshold);
  });

  it('does not call onTextDetected after unmount', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const longText = 'a'.repeat(301);

    const { unmount } = renderHook(() =>
      useTextAttachmentDetection(ref, { onTextDetected })
    );

    unmount();

    act(() => {
      simulatePaste(ref.current, longText);
    });

    expect(onTextDetected).not.toHaveBeenCalled();
  });

  it('does not call onTextDetected for text at exactly the threshold length', () => {
    const ref = createTextareaRef();
    const onTextDetected = jest.fn();
    const exactThresholdText = 'x'.repeat(300);

    renderHook(() => useTextAttachmentDetection(ref, { onTextDetected }));

    act(() => {
      simulatePaste(ref.current, exactThresholdText);
    });

    expect(onTextDetected).not.toHaveBeenCalled();
  });
});
