import { Capacitor, registerPlugin } from '@capacitor/core'

const NativeFeedback = registerPlugin<{ feedback: () => Promise<void> }>('ZotStopNative')

export function touchFeedback() {
  if (Capacitor.getPlatform() === 'ios') void NativeFeedback.feedback().catch(() => {})
}
