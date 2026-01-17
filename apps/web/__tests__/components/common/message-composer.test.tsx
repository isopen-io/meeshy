/**
 * MessageComposer Component Tests
 *
 * Tests the message composer including:
 * - Basic rendering
 * - Text input and onChange
 * - Character limit enforcement
 * - Language selector
 * - Attachment handling
 * - Send button state
 * - Reply preview
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MessageComposer, MessageComposerRef } from '../../../components/common/message-composer';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'writeMessage': 'Write a message...',
        'replyingTo': 'Replying to',
        'unknownUser': 'Unknown user',
        'translations': 'translations',
        'conversations.pasteTooLongTxtCreated': 'Text converted to file attachment',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock reply store
const mockReplyingTo = {
  id: 'reply-123',
  content: 'Original message content',
  sender: { displayName: 'John Doe', username: 'johndoe' },
  createdAt: new Date().toISOString(),
  attachments: [],
  translations: [],
};
const mockClearReply = jest.fn();

jest.mock('@/stores/reply-store', () => ({
  useReplyStore: () => ({
    replyingTo: null,
    clearReply: mockClearReply,
  }),
}));

// Mock language constants
jest.mock('@/lib/constants/languages', () => ({
  getMaxMessageLength: () => 2000,
}));

// Mock hooks
jest.mock('@/hooks/composer', () => ({
  useTextareaAutosize: () => ({
    textareaRef: { current: null },
    handleTextareaChange: jest.fn(),
    resetTextareaSize: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
  }),
  useAttachmentUpload: () => ({
    selectedFiles: [],
    uploadedAttachments: [],
    isUploading: false,
    isCompressing: false,
    isDragOver: false,
    uploadProgress: {},
    compressionProgress: {},
    showAttachmentLimitModal: false,
    attemptedCount: 0,
    handleFilesSelected: jest.fn(),
    handleRemoveFile: jest.fn(),
    clearAttachments: jest.fn(),
    handleCreateTextAttachment: jest.fn(),
    handleDragEnter: jest.fn(),
    handleDragLeave: jest.fn(),
    handleDragOver: jest.fn(),
    handleDrop: jest.fn(),
    handleFileInputChange: jest.fn(),
    closeAttachmentLimitModal: jest.fn(),
    fileInputRef: { current: null },
    handleAttachmentClick: jest.fn(),
  }),
  useAudioRecorder: () => ({
    showAudioRecorder: false,
    audioRecorderKey: 0,
    isRecording: false,
    audioRecorderRef: { current: null },
    handleRecordingStateChange: jest.fn(),
    handleAudioRecordingComplete: jest.fn(),
    handleRemoveAudioRecording: jest.fn(),
    handleBeforeStop: jest.fn(),
    handleMicrophoneClick: jest.fn(),
    resetAudioState: jest.fn(),
  }),
  useMentions: () => ({
    showMentionAutocomplete: false,
    mentionQuery: '',
    mentionPosition: { top: 0, left: 0 },
    mentionedUserIds: [],
    handleTextChange: jest.fn(),
    handleMentionSelect: jest.fn(),
    closeMentionAutocomplete: jest.fn(),
    clearMentionedUserIds: jest.fn(),
    getMentionedUserIds: () => [],
  }),
}));

// Mock useTextAttachmentDetection hook
jest.mock('@/hooks/useTextAttachmentDetection', () => ({
  useTextAttachmentDetection: jest.fn(),
}));

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    info: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Mock LanguageFlagSelector
jest.mock('@/components/translation', () => ({
  LanguageFlagSelector: ({ value, onValueChange }: any) => (
    <button
      data-testid="language-selector"
      onClick={() => onValueChange('fr')}
    >
      Language: {value}
    </button>
  ),
}));

// Mock AttachmentCarousel
jest.mock('@/components/attachments/AttachmentCarousel', () => ({
  AttachmentCarousel: () => <div data-testid="attachment-carousel">Attachments</div>,
}));

// Mock AttachmentLimitModal
jest.mock('@/components/attachments/AttachmentLimitModal', () => ({
  AttachmentLimitModal: () => <div data-testid="attachment-limit-modal">Limit modal</div>,
}));

// Mock AttachmentPreviewReply
jest.mock('@/components/attachments/AttachmentPreviewReply', () => ({
  AttachmentPreviewReply: () => <div data-testid="attachment-preview-reply">Preview</div>,
}));

// Mock AudioRecorderWithEffects
jest.mock('@/components/audio/AudioRecorderWithEffects', () => ({
  AudioRecorderWithEffects: React.forwardRef((props: any, ref: any) => (
    <div data-testid="audio-recorder">Audio recorder</div>
  )),
}));

// Mock MentionAutocomplete
jest.mock('../../../components/common/MentionAutocomplete', () => ({
  MentionAutocomplete: () => <div data-testid="mention-autocomplete">Mentions</div>,
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: React.forwardRef(({ children, onClick, disabled, className, ...props }: any, ref: any) => (
    <button ref={ref} onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  )),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: React.forwardRef(({ value, onChange, placeholder, maxLength, disabled, className, ...props }: any, ref: any) => (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={className}
      data-testid="message-textarea"
      {...props}
    />
  )),
}));

describe('MessageComposer', () => {
  const defaultProps = {
    value: '',
    onChange: jest.fn(),
    onSend: jest.fn(),
    selectedLanguage: 'en',
    onLanguageChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the composer with textarea', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByTestId('message-textarea')).toBeInTheDocument();
    });

    it('renders with custom placeholder', () => {
      render(<MessageComposer {...defaultProps} placeholder="Custom placeholder" />);

      expect(screen.getByPlaceholderText('Custom placeholder')).toBeInTheDocument();
    });

    it('renders default placeholder when not provided', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByPlaceholderText('Write a message...')).toBeInTheDocument();
    });

    it('renders language selector', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByTestId('language-selector')).toBeInTheDocument();
    });

    it('renders microphone button', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Enregistrer un message vocal/i })).toBeInTheDocument();
    });

    it('renders attachment button', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Ajouter des fichiers/i })).toBeInTheDocument();
    });

    it('renders send button', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.getByRole('button', { name: /Envoyer/i })).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(<MessageComposer {...defaultProps} className="custom-class" />);

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Text Input', () => {
    it('displays value prop in textarea', () => {
      render(<MessageComposer {...defaultProps} value="Hello world" />);

      expect(screen.getByTestId('message-textarea')).toHaveValue('Hello world');
    });

    it('calls onChange when text is entered', async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();

      render(<MessageComposer {...defaultProps} onChange={onChange} />);

      const textarea = screen.getByTestId('message-textarea');
      await user.type(textarea, 'Test message');

      expect(onChange).toHaveBeenCalled();
    });

    it('sets maxLength on textarea', () => {
      render(<MessageComposer {...defaultProps} />);

      const textarea = screen.getByTestId('message-textarea');
      expect(textarea).toHaveAttribute('maxLength', '2000');
    });
  });

  describe('Send Button State', () => {
    it('disables send button when value is empty', () => {
      render(<MessageComposer {...defaultProps} value="" />);

      const sendButton = screen.getByRole('button', { name: /Envoyer/i });
      expect(sendButton).toBeDisabled();
    });

    it('enables send button when value has content', () => {
      render(<MessageComposer {...defaultProps} value="Hello" />);

      const sendButton = screen.getByRole('button', { name: /Envoyer/i });
      expect(sendButton).not.toBeDisabled();
    });

    it('disables send button when composing is disabled', () => {
      render(<MessageComposer {...defaultProps} value="Hello" isComposingEnabled={false} />);

      const sendButton = screen.getByRole('button', { name: /Envoyer/i });
      expect(sendButton).toBeDisabled();
    });

    it('calls onSend when send button is clicked', async () => {
      const onSend = jest.fn();
      const user = userEvent.setup();

      render(<MessageComposer {...defaultProps} value="Hello" onSend={onSend} />);

      const sendButton = screen.getByRole('button', { name: /Envoyer/i });
      await user.click(sendButton);

      expect(onSend).toHaveBeenCalled();
    });
  });

  describe('Language Selector', () => {
    it('displays selected language', () => {
      render(<MessageComposer {...defaultProps} selectedLanguage="en" />);

      expect(screen.getByTestId('language-selector')).toHaveTextContent('en');
    });

    it('calls onLanguageChange when language is changed', async () => {
      const onLanguageChange = jest.fn();
      const user = userEvent.setup();

      render(<MessageComposer {...defaultProps} onLanguageChange={onLanguageChange} />);

      await user.click(screen.getByTestId('language-selector'));

      expect(onLanguageChange).toHaveBeenCalledWith('fr');
    });
  });

  describe('Disabled State', () => {
    it('disables textarea when isComposingEnabled is false', () => {
      render(<MessageComposer {...defaultProps} isComposingEnabled={false} />);

      expect(screen.getByTestId('message-textarea')).toBeDisabled();
    });

    it('disables microphone button when isComposingEnabled is false', () => {
      render(<MessageComposer {...defaultProps} isComposingEnabled={false} />);

      expect(screen.getByRole('button', { name: /Enregistrer un message vocal/i })).toBeDisabled();
    });

    it('disables attachment button when isComposingEnabled is false', () => {
      render(<MessageComposer {...defaultProps} isComposingEnabled={false} />);

      expect(screen.getByRole('button', { name: /Ajouter des fichiers/i })).toBeDisabled();
    });
  });

  describe('Location Display', () => {
    it('displays location when provided', () => {
      render(<MessageComposer {...defaultProps} location="Paris, France" />);

      // Location should be visible on desktop
      expect(screen.getByText('Paris, France')).toBeInTheDocument();
    });

    it('does not display location when not provided', () => {
      render(<MessageComposer {...defaultProps} />);

      expect(screen.queryByText(/Paris/)).not.toBeInTheDocument();
    });
  });

  describe('Key Press Handler', () => {
    it('calls onKeyPress when key is pressed', async () => {
      const onKeyPress = jest.fn();
      const user = userEvent.setup();

      render(<MessageComposer {...defaultProps} onKeyPress={onKeyPress} />);

      const textarea = screen.getByTestId('message-textarea');
      textarea.focus();
      await user.keyboard('a');

      expect(onKeyPress).toHaveBeenCalled();
    });
  });

  describe('File Input', () => {
    it('renders hidden file input', () => {
      const { container } = render(<MessageComposer {...defaultProps} />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveClass('hidden');
    });

    it('accepts correct file types', () => {
      const { container } = render(<MessageComposer {...defaultProps} />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('accept');
      expect(fileInput?.getAttribute('accept')).toContain('image/*');
      expect(fileInput?.getAttribute('accept')).toContain('video/*');
      expect(fileInput?.getAttribute('accept')).toContain('audio/*');
      expect(fileInput?.getAttribute('accept')).toContain('application/pdf');
    });
  });

  describe('Accessibility', () => {
    it('has accessible send button', () => {
      render(<MessageComposer {...defaultProps} />);

      const sendButton = screen.getByRole('button', { name: /Envoyer/i });
      expect(sendButton).toBeInTheDocument();
    });

    it('has accessible microphone button', () => {
      render(<MessageComposer {...defaultProps} />);

      const micButton = screen.getByRole('button', { name: /Enregistrer un message vocal/i });
      expect(micButton).toBeInTheDocument();
    });

    it('has accessible attachment button', () => {
      render(<MessageComposer {...defaultProps} />);

      const attachButton = screen.getByRole('button', { name: /Ajouter des fichiers/i });
      expect(attachButton).toBeInTheDocument();
    });

    it('has accessible file input', () => {
      const { container } = render(<MessageComposer {...defaultProps} />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toHaveAttribute('aria-label');
    });
  });

  describe('Ref Methods', () => {
    it('exposes focus method via ref', () => {
      const ref = React.createRef<MessageComposerRef>();

      render(<MessageComposer {...defaultProps} ref={ref} />);

      expect(ref.current).toHaveProperty('focus');
      expect(typeof ref.current?.focus).toBe('function');
    });

    it('exposes blur method via ref', () => {
      const ref = React.createRef<MessageComposerRef>();

      render(<MessageComposer {...defaultProps} ref={ref} />);

      expect(ref.current).toHaveProperty('blur');
      expect(typeof ref.current?.blur).toBe('function');
    });

    it('exposes clearAttachments method via ref', () => {
      const ref = React.createRef<MessageComposerRef>();

      render(<MessageComposer {...defaultProps} ref={ref} />);

      expect(ref.current).toHaveProperty('clearAttachments');
      expect(typeof ref.current?.clearAttachments).toBe('function');
    });

    it('exposes getMentionedUserIds method via ref', () => {
      const ref = React.createRef<MessageComposerRef>();

      render(<MessageComposer {...defaultProps} ref={ref} />);

      expect(ref.current).toHaveProperty('getMentionedUserIds');
      expect(typeof ref.current?.getMentionedUserIds).toBe('function');
    });

    it('exposes resetTextareaSize method via ref', () => {
      const ref = React.createRef<MessageComposerRef>();

      render(<MessageComposer {...defaultProps} ref={ref} />);

      expect(ref.current).toHaveProperty('resetTextareaSize');
      expect(typeof ref.current?.resetTextareaSize).toBe('function');
    });
  });
});
