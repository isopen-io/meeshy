import { render, screen, fireEvent } from '@testing-library/react';
import { ToolbarButtons } from '@/components/common/message-composer/ToolbarButtons';
import { useAnimationConfig } from '@/hooks/composer/useAnimationConfig';

jest.mock('@/hooks/composer/useAnimationConfig');

describe('ToolbarButtons', () => {
  beforeEach(() => {
    (useAnimationConfig as jest.Mock).mockReturnValue({
      staggerDelay: 0.05,
      spring: { type: 'spring', stiffness: 400, damping: 25 },
    });
  });

  it('should render both Mic and Attachment buttons', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
      />
    );

    const micButton = screen.getByLabelText('Record voice message');
    const attachmentButton = screen.getByLabelText('Attach file');

    expect(micButton).toBeInTheDocument();
    expect(attachmentButton).toBeInTheDocument();
  });

  it('should call onMicClick when Mic button is clicked', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
      />
    );

    const micButton = screen.getByLabelText('Record voice message');
    fireEvent.click(micButton);

    expect(handleMicClick).toHaveBeenCalledTimes(1);
  });

  it('should call onAttachmentClick when Attachment button is clicked', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
      />
    );

    const attachmentButton = screen.getByLabelText('Attach file');
    fireEvent.click(attachmentButton);

    expect(handleAttachmentClick).toHaveBeenCalledTimes(1);
  });

  it('should not call handlers when disabled', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
        disabled={true}
      />
    );

    const micButton = screen.getByLabelText('Record voice message');
    const attachmentButton = screen.getByLabelText('Attach file');

    fireEvent.click(micButton);
    fireEvent.click(attachmentButton);

    expect(handleMicClick).not.toHaveBeenCalled();
    expect(handleAttachmentClick).not.toHaveBeenCalled();
  });

  it('should apply custom className to container', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    const { container } = render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
        className="custom-toolbar"
      />
    );

    const toolbarDiv = container.firstChild as HTMLElement;
    expect(toolbarDiv.className).toContain('custom-toolbar');
  });

  it('should have proper aria-labels for accessibility', () => {
    const handleMicClick = jest.fn();
    const handleAttachmentClick = jest.fn();

    render(
      <ToolbarButtons
        onMicClick={handleMicClick}
        onAttachmentClick={handleAttachmentClick}
      />
    );

    expect(screen.getByLabelText('Record voice message')).toBeInTheDocument();
    expect(screen.getByLabelText('Attach file')).toBeInTheDocument();
  });
});
