export type HapticType = 'light' | 'medium' | 'heavy' | 'success';

export async function triggerHaptic(type: HapticType): Promise<void> {
  // Haptics not supported on web - no-op function
  return;
}
