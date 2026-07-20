// `/mood/[postId]` re-exports the `/feeds/post` screen, which relies on the
// Global Pulse providers (V2ThemeProvider + ToastProvider + SplitViewProvider).
// Reuse the canonical feeds layout so `useToast()` / `useSplitView()` resolve.
export { default } from '@/app/feeds/layout';
