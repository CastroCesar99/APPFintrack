import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

export type HapticType = 'light' | 'medium' | 'heavy' | 'success';

export async function triggerHaptic(type: HapticType): Promise<void> {
  try {
    // Verificar se estamos em ambiente nativo
    if (typeof window !== 'undefined' && 'Capacitor' in window) {
      switch (type) {
        case 'light':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'medium':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'heavy':
          await Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case 'success':
          await Haptics.notification({ type: NotificationType.Success });
          break;
      }
    }
    // Na web, simplesmente não faz nada (sem erro)
  } catch (error) {
    // Silenciosamente ignora erros de haptics (não crítico para UX)
    console.debug('Haptic feedback not available:', error);
  }
}
