# Mobile-Responsive Video Call Interface

Complete implementation of browser-based P2P video calls optimized for mobile devices using Next.js 14, WebRTC, and Socket.IO.

## Features

### Core Functionality
- **P2P WebRTC Connections**: Direct peer-to-peer video calls with minimal latency
- **Real-time Signaling**: Socket.IO integration for WebRTC offer/answer/ICE exchange
- **Multi-participant Support**: Scalable architecture supporting multiple participants

### Mobile-First UI
- **Responsive Layout**: Optimized for mobile (<768px), tablet (768-1024px), and desktop (>1024px)
- **Draggable Local Video**: Touch-friendly draggable overlay for local video feed
- **Portrait & Landscape**: Automatic layout adjustment for device orientation
- **Touch-Optimized Controls**: Large, accessible touch targets (minimum 48x48px)

### Advanced Controls
- **Audio/Video Toggle**: Mute/unmute microphone and enable/disable camera
- **Camera Switch**: Front/back camera switching on mobile devices
- **Speaker Toggle**: Toggle between speaker and earpiece (mobile)
- **End Call**: Graceful call termination with cleanup

### Status Indicators
- **Connection Quality**: Real-time visual feedback (excellent/good/poor/offline)
- **Call Duration**: Live timer showing elapsed call time
- **Participant Info**: Display participant names and status
- **Reconnection States**: Clear UI feedback during connection issues

### Error Handling
- **Permission Requests**: Guided flow for camera/microphone permissions
- **Browser Compatibility**: Automatic detection and user-friendly messages
- **Connection Failures**: Automatic retry with ICE restart
- **Error Boundaries**: Graceful error handling with recovery options

## File Structure

```
components/video-calls/
├── VideoCallInterface.tsx       # Main call UI component
├── VideoStream.tsx              # Video element wrapper
├── CallControls.tsx             # Control buttons (mobile-optimized)
├── CallStatusIndicator.tsx      # Connection quality & status
├── CallErrorBoundary.tsx        # Error boundary component
├── PermissionRequest.tsx        # Permission request UI
├── hooks/
│   ├── useWebRTC.ts            # WebRTC logic hook
│   └── useCallSignaling.ts     # Socket.IO signaling hook
├── index.ts                     # Export index
└── README.md                    # This file

app/call/[callId]/
└── page.tsx                     # Dynamic call route

styles/
└── video-call.css              # Mobile-specific CSS optimizations
```

## Component Architecture

### VideoCallInterface
Main orchestrator component that:
- Initializes WebRTC connections
- Manages local/remote streams
- Handles call lifecycle (join, leave, end)
- Implements draggable local video overlay
- Tracks call duration

**Props:**
```typescript
interface VideoCallInterfaceProps {
  callId: string;
}
```

### VideoStream
Reusable video element wrapper with:
- Automatic stream attachment
- Participant name display
- Audio/video status indicators
- No-video placeholder

**Props:**
```typescript
interface VideoStreamProps {
  stream: MediaStream | null;
  muted?: boolean;
  isLocal?: boolean;
  className?: string;
  participantName?: string;
  isAudioEnabled?: boolean;
  isVideoEnabled?: boolean;
}
```

### CallControls
Mobile-optimized control panel with:
- Audio toggle (mute/unmute)
- Video toggle (on/off)
- Camera switch (mobile only)
- Speaker toggle
- Hang up button

**Props:**
```typescript
interface CallControlsProps {
  audioEnabled: boolean;
  videoEnabled: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onSwitchCamera?: () => void;
  onHangUp: () => void;
}
```

### CallStatusIndicator
Shows real-time call status:
- Connection quality (visual icon + label)
- Participant name
- Connecting/reconnecting states

**Props:**
```typescript
interface CallStatusIndicatorProps {
  connectionState: RTCPeerConnectionState;
  callDuration?: number;
  participantName?: string;
  connectionQuality?: 'excellent' | 'good' | 'poor' | 'offline';
}
```

## Custom Hooks

### useWebRTC
Manages WebRTC media streams and browser compatibility:

```typescript
const {
  localStream,
  isInitializing,
  error,
  checkBrowserSupport,
  getLocalStream,
  switchCamera,
  toggleAudio,
  toggleVideo,
  stopLocalStream,
} = useWebRTC({ onError });
```

**Features:**
- Browser compatibility checks
- HTTPS requirement validation
- Camera/microphone access
- Camera switching (mobile)
- Track enable/disable

### useCallSignaling
Handles Socket.IO signaling for WebRTC:

```typescript
const {
  sendSignal,
  joinCall,
  leaveCall,
  toggleAudio,
  toggleVideo,
} = useCallSignaling({
  callId,
  userId,
  onSignal,
  onParticipantJoined,
  onParticipantLeft,
  onCallEnded,
  onMediaToggle,
  onError,
});
```

**Socket.IO Events:**
- `call:signal` - WebRTC signaling (offer/answer/ICE)
- `call:join` - Join call
- `call:leave` - Leave call
- `call:toggle-audio` - Toggle audio state
- `call:toggle-video` - Toggle video state
- `call:initiated` - Call started
- `call:participant-joined` - Participant joined
- `call:participant-left` - Participant left
- `call:ended` - Call ended
- `call:media-toggled` - Remote participant toggled media

## Usage

### Direct Call Access
Navigate to `/call/[callId]` to join a call directly:

```typescript
// Example: /call/abc123xyz
// Automatically joins the call if authenticated
```

### Programmatic Call Initiation
```typescript
import { useCallStore } from '@/stores/call-store';

const { setCurrentCall, setInCall } = useCallStore();

// Start a call
const startCall = async (callId: string) => {
  const socket = meeshySocketIOService.getSocket();

  socket.emit('call:initiate', {
    conversationId: 'conversation-id',
    mode: 'video',
    participants: ['user-id-1', 'user-id-2'],
  });
};
```

## Mobile Optimizations

### Portrait Mode
- Full-screen remote video
- Small draggable local video (bottom-right)
- Bottom overlay controls
- Minimal UI chrome

### Landscape Mode
- Side-by-side video layout (when 2 participants)
- Grid layout (when 3+ participants)
- Adjusted control positioning

### Touch Interactions
- **Minimum 48x48px touch targets**: All buttons meet accessibility standards
- **Touch manipulation**: Prevents accidental zoom on double-tap
- **Draggable local video**: Smooth touch-based dragging
- **Safe area insets**: Respects device notches and rounded corners

### Performance
- **Hardware acceleration**: All videos use GPU rendering
- **Reduced motion**: Respects user's motion preferences
- **Battery optimization**: Efficient video encoding (640x480 @ 24fps default)

## Browser Compatibility

### Supported Browsers
- **Chrome/Edge**: Full support (desktop & mobile)
- **Firefox**: Full support (desktop & mobile)
- **Safari**: Full support (iOS 14.3+, macOS)

### Requirements
- **HTTPS**: Required for getUserMedia (except localhost)
- **WebRTC API**: RTCPeerConnection support
- **MediaDevices API**: getUserMedia support

### Feature Detection
The implementation automatically detects:
- WebRTC support
- Camera/microphone availability
- Multiple camera support (for camera switching)
- HTTPS requirement

## Error Handling

### Permission Errors
- Clear UI guidance for granting permissions
- Browser-specific instructions
- Retry mechanism

### Connection Errors
- Automatic ICE restart on connection failure
- Reconnection UI feedback
- Graceful degradation

### Browser Compatibility
- Early detection with user-friendly messages
- HTTPS requirement validation
- Feature availability checks

## Integration with Existing Services

### WebRTC Service
Uses existing `/services/webrtc-service.ts`:
- Peer connection management
- ICE candidate handling
- Stream management
- Connection state tracking

### Socket.IO Service
Integrates with `/services/meeshy-socketio.service.ts`:
- Real-time signaling
- Call lifecycle events
- Participant management
- Media state synchronization

### Call Store
Uses Zustand store at `/stores/call-store.ts`:
- Global call state
- Stream management
- Peer connection tracking
- UI state (controls, errors, etc.)

## Accessibility

- **ARIA labels**: All interactive elements properly labeled
- **Keyboard navigation**: Full keyboard support (not just touch)
- **Screen reader support**: Meaningful element descriptions
- **High contrast mode**: Tested with high contrast themes
- **Touch target size**: Minimum 48x48px for all buttons

## Performance Considerations

### Network Optimization
- **Adaptive bitrate**: Automatically adjusts quality based on network
- **ICE restart**: Recovers from network issues automatically
- **STUN servers**: Uses Google's public STUN servers

### Mobile Battery
- **Video constraints**: 640x480 @ 24fps (configurable)
- **Audio processing**: Echo cancellation, noise suppression
- **Hardware acceleration**: GPU-accelerated video rendering

### Memory Management
- **Stream cleanup**: Proper disposal on component unmount
- **Peer connection closure**: Clean shutdown on call end
- **Event listener cleanup**: No memory leaks

## Testing

### Manual Testing Checklist
- [ ] Camera/microphone permissions granted
- [ ] Video displays correctly (local & remote)
- [ ] Audio works in both directions
- [ ] Camera switch works (mobile)
- [ ] Draggable local video works smoothly
- [ ] Portrait/landscape orientation changes
- [ ] Call duration updates correctly
- [ ] Connection quality indicator responds to network changes
- [ ] Hang up button ends call gracefully
- [ ] Error handling for denied permissions
- [ ] Browser compatibility messages
- [ ] Safe area insets on notched devices

### Browser Testing
Test on:
- iOS Safari (iPhone)
- Android Chrome (Android phone)
- Desktop Chrome
- Desktop Firefox
- Desktop Safari (macOS)

## Future Enhancements

### Phase 1B - SFU Support
- Scalable multi-participant calls using mediasoup
- Bandwidth optimization for large calls

### Phase 2 - Real-time Transcription
- Live speech-to-text transcription
- Conversation history

### Phase 3 - Real-time Translation
- Multi-language support
- Live translation overlay

### Phase 4 - Advanced Features
- Screen sharing
- Virtual backgrounds
- Noise cancellation
- Beauty filters

## Troubleshooting

### No Video/Audio
1. Check browser permissions
2. Verify HTTPS connection
3. Try different browser
4. Check firewall/antivirus settings

### Poor Connection Quality
1. Check network bandwidth
2. Close other applications using camera
3. Move closer to WiFi router
4. Try wired connection

### Camera Switch Not Working
1. Verify multiple cameras available
2. Check camera permissions
3. Try restarting browser

## License

Copyright 2025 Meeshy. All rights reserved.
