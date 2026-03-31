import { Camera, CameraResultType, CameraSource, ImageOptions } from '@capacitor/camera';

export interface CameraResult {
  base64String: string;
  format: string;
  saved: boolean;
}

/**
 * Opens the native camera to take a picture with high quality
 * Allows editing (cropping) and returns base64 image
 */
export async function takePicture(): Promise<CameraResult> {
  try {
    // Request permissions first
    const permissionStatus = await Camera.requestPermissions();
    
    if (permissionStatus.camera === 'denied') {
      throw new Error('Camera permission denied');
    }

    // Take picture with high quality and allow editing
    const image = await Camera.getPhoto({
      quality: 90, // High quality for better OCR
      allowEditing: true, // Allow user to crop the receipt
      resultType: CameraResultType.Base64,
      source: CameraSource.Camera,
      saveToGallery: false, // Don't save to device gallery
      correctOrientation: true, // Fix orientation issues
      width: 1920, // Max width for performance
      height: 1920, // Max height for performance
    });

    if (!image.base64String) {
      throw new Error('Failed to capture image');
    }

    return {
      base64String: image.base64String,
      format: image.format || 'jpeg',
      saved: false,
    };
  } catch (error: any) {
    console.error('Camera error:', error);
    
    // Handle specific error cases
    if (error.message?.includes('permission')) {
      throw new Error('Please allow camera access in your device settings');
    }
    
    if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
      throw new Error('Camera was cancelled');
    }
    
    throw new Error(error.message || 'Failed to take picture');
  }
}

/**
 * Opens the photo gallery to select an existing image
 */
export async function selectFromGallery(): Promise<CameraResult> {
  try {
    const permissionStatus = await Camera.requestPermissions();
    
    if (permissionStatus.photos === 'denied') {
      throw new Error('Gallery permission denied');
    }

    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: true,
      resultType: CameraResultType.Base64,
      source: CameraSource.Photos,
      correctOrientation: true,
      width: 1920,
      height: 1920,
    });

    if (!image.base64String) {
      throw new Error('Failed to select image');
    }

    return {
      base64String: image.base64String,
      format: image.format || 'jpeg',
      saved: false,
    };
  } catch (error: any) {
    console.error('Gallery error:', error);
    
    if (error.message?.includes('permission')) {
      throw new Error('Please allow gallery access in your device settings');
    }
    
    if (error.message?.includes('cancelled') || error.message?.includes('canceled')) {
      throw new Error('Selection was cancelled');
    }
    
    throw new Error(error.message || 'Failed to select picture');
  }
}

/**
 * Check camera permissions status
 */
export async function checkCameraPermissions(): Promise<{
  camera: 'granted' | 'denied' | 'prompt';
  photos: 'granted' | 'denied' | 'prompt';
}> {
  const status = await Camera.checkPermissions();
  return {
    camera: status.camera as 'granted' | 'denied' | 'prompt',
    photos: status.photos as 'granted' | 'denied' | 'prompt',
  };
}

/**
 * Request camera permissions
 */
export async function requestCameraPermissions(): Promise<boolean> {
  const status = await Camera.requestPermissions();
  return status.camera === 'granted';
}
