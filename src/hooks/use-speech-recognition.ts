"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  startListening: (lang?: string, onTranscript?: (transcript: string) => void, onStatusChange?: (status: 'starting' | 'listening' | 'stopped') => void) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  browserSupportsSpeechRecognition: boolean;
}

// Check if running on native platform (iOS/Android)
const isNativePlatform = () => Capacitor.isNativePlatform();

// Check web support
const isWebSupported = () => {
  if (typeof window === "undefined") return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
};

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);
  const nativeListenerRef = useRef<any>(null);
  const partialListenerRef = useRef<any>(null);

  // Combined support check
  const browserSupportsSpeechRecognition = isNativePlatform() || isWebSupported();

  // Stop listening - handles both native and web
  const stopListening = useCallback(async () => {
    console.log("[Speech] Stopping listening...");
    
    if (isNativePlatform()) {
      try {
        // Cleanup listeners first
        if (nativeListenerRef.current) {
          console.log("[Speech] Removing native listener on stop");
          nativeListenerRef.current.remove();
          nativeListenerRef.current = null;
        }
        
        if (partialListenerRef.current) {
          console.log("[Speech] Removing partial listener on stop");
          partialListenerRef.current.remove();
          partialListenerRef.current = null;
        }
        
        await SpeechRecognition.stop();
        console.log("[Speech] Native recognition stopped");
      } catch (e) {
        console.log("[Speech] Error stopping native recognition:", e);
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (e) {
        console.log("[Speech] Error stopping web recognition:", e);
      }
    }
    
    setIsListening(false);
  }, []);

  // Start listening - native iOS implementation
  const startNativeListening = useCallback(async (lang: string = "pt-BR", onTranscript?: (transcript: string) => void, onStatusChange?: (status: 'starting' | 'listening' | 'stopped') => void) => {
    console.log("[Speech] Starting native listening...");
    
    try {
      // Force stop any existing session
      console.log("[Speech] Force stopping any existing session...");
      await SpeechRecognition.stop();
      
      // Notify starting status
      if (onStatusChange) {
        onStatusChange('starting');
      }
      
      // Request permissions first
      console.log("[Speech] Requesting permissions...");
      const permResult = await SpeechRecognition.requestPermissions();
      console.log("[Speech] Permission result:", permResult);
      
      // Verification with delay - give iOS buffer time to register
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check permissions after delay
      const permCheck = await SpeechRecognition.requestPermissions();
      console.log("[Speech] Permission double-check:", permCheck);
      
      if (permCheck.speechRecognition !== 'granted') {
        console.error("[Speech] Permissions not granted after double-check");
        throw new Error("Speech recognition permission required");
      }

      // Map language codes - ensure explicit pt-BR
      const languageMap: Record<string, string> = {
        'pt-BR': 'pt-BR',
        'pt': 'pt-BR',
        'en-US': 'en-US',
        'en': 'en-US'
      };
      const nativeLang = languageMap[lang] || 'pt-BR';
      console.log("[Speech] Using language:", nativeLang);

      // Notify listening status
      if (onStatusChange) {
        onStatusChange('listening');
      }

      // Specific try/catch for start with retry logic
      try {
        console.log("[Speech] Starting recognition with explicit pt-BR and partial results...");
        const result = await SpeechRecognition.start({
          language: 'pt-BR', // Explicitly set to pt-BR as requested
          maxResults: 1,
          prompt: "Fale agora...",
          partialResults: true, // ATIVADO para feedback em tempo real
          popup: false
        });
        
        console.log("[Speech] Recognition result:", result);
        
        // Update transcript with captured speech
        if (result.matches && result.matches.length > 0) {
          const transcript = result.matches[0];
          console.log("[Speech] Transcript captured:", transcript);
          setTranscript(transcript);
          
          // Auto-submit callback se fornecido
          if (onTranscript) {
            console.log("[Speech] Executing auto-submit callback");
            onTranscript(transcript);
          }
        } else {
          console.log("[Speech] No matches found in result");
        }
        
        console.log("[Speech] Native recognition completed");
        setIsListening(false);
        
        // Notify stopped status
        if (onStatusChange) {
          onStatusChange('stopped');
        }
        
      } catch (startError: any) {
        console.error("[Speech] First start attempt failed:", startError);
        
        // If start fails due to permissions, try requesting once more
        if (startError.message?.includes('permission') || startError.message?.includes('Permission')) {
          console.log("[Speech] Retrying permission request...");
          const retryPerm = await SpeechRecognition.requestPermissions();
          
          if (retryPerm.speechRecognition === 'granted') {
            console.log("[Speech] Retry successful, starting recognition...");
            const retryResult = await SpeechRecognition.start({
              language: 'pt-BR',
              maxResults: 1,
              prompt: "Fale agora...",
              partialResults: true, // ATIVADO também no retry
              popup: false
            });
            
            console.log("[Speech] Retry recognition result:", retryResult);
            
            // Update transcript with captured speech from retry
            if (retryResult.matches && retryResult.matches.length > 0) {
              const transcript = retryResult.matches[0];
              console.log("[Speech] Retry transcript captured:", transcript);
              setTranscript(transcript);
              
              // Auto-submit callback se fornecido (retry)
              if (onTranscript) {
                console.log("[Speech] Executing auto-submit callback on retry");
                onTranscript(transcript);
              }
            } else {
              console.log("[Speech] No matches found in retry result");
            }
            
            console.log("[Speech] Native recognition retry completed");
            setIsListening(false);
            
            // Notify stopped status
            if (onStatusChange) {
              onStatusChange('stopped');
            }
            
          } else {
            throw new Error("Speech recognition permission still not granted after retry");
          }
        } else {
          throw startError;
        }
      }

      console.log("[Speech] Native recognition started successfully");
      setTranscript("");

      // Listen for results
      nativeListenerRef.current = await SpeechRecognition.addListener('listeningState', (state: any) => {
        console.log("[Speech] Listening state:", state);
        
        // Update status based on native listener
        if (onStatusChange && state.status) {
          if (state.status === 'started') {
            onStatusChange('listening');
          } else if (state.status === 'stopped') {
            onStatusChange('stopped');
          }
        }
      });

      // Listen for partial results (backup para captura)
      partialListenerRef.current = await SpeechRecognition.addListener('partialResults', (data: any) => {
        console.log("[Speech] Partial results:", data);
        if (data.matches && data.matches.length > 0) {
          const partialTranscript = data.matches[0];
          console.log("[Speech] Partial transcript detected:", partialTranscript);
          setTranscript(partialTranscript);
          
          // Se tiver callback, executa também
          if (onTranscript) {
            onTranscript(partialTranscript);
          }
        }
      });

    } catch (error: any) {
      console.error("[Speech] Native recognition error:", error);
      setIsListening(false);
      
      // Notify stopped status on error
      if (onStatusChange) {
        onStatusChange('stopped');
      }
      
      // Tratamento amigável para "No speech detected"
      if (error.message?.includes('No speech detected') || error.message?.includes('no speech')) {
        console.log("[Speech] No speech detected - resetting microphone state gracefully");
        // Não mostra erro assustador, apenas reseta o estado
        return;
      }
      
      throw error;
    }
  }, []);

  // Start listening - web implementation (fallback)
  const startWebListening = useCallback((lang: string = "pt-BR") => {
    console.log("[Speech] Starting web listening...");
    
    if (!isWebSupported()) {
      console.error("[Speech] Web speech recognition not supported");
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Speech] Web recognition started");
      setIsListening(true);
      setTranscript("");
    };

    recognition.onresult = (event: any) => {
      console.log("[Speech] Web recognition result:", event);
      try {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript = result[0].transcript;
          }
        }
        if (finalTranscript) {
          setTranscript(finalTranscript);
        }
      } catch (error) {
        console.error("[Speech] Error processing web result:", error);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("[Speech] Web recognition error:", event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      console.log("[Speech] Web recognition ended");
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    
    // Delay for Safari compatibility
    setTimeout(() => {
      try {
        recognition.start();
      } catch (e) {
        console.error("[Speech] Error starting web recognition:", e);
      }
    }, 100);
  }, []);

  // Main start listening function
  const startListening = useCallback((lang: string = "pt-BR", onTranscript?: (transcript: string) => void, onStatusChange?: (status: 'starting' | 'listening' | 'stopped') => void) => {
    console.log("[Speech] Start listening called, isNative:", isNativePlatform());
    
    if (isNativePlatform()) {
      startNativeListening(lang, onTranscript, onStatusChange);
    } else {
      startWebListening(lang);
    }
  }, [startNativeListening, startWebListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  // Cleanup on unmount and when stopping
  useEffect(() => {
    return () => {
      console.log("[Speech] Cleanup effect running");
      
      // Cleanup native listener
      if (nativeListenerRef.current) {
        console.log("[Speech] Removing native listener");
        nativeListenerRef.current.remove();
        nativeListenerRef.current = null;
      }
      
      // Cleanup partial listener
      if (partialListenerRef.current) {
        console.log("[Speech] Removing partial listener");
        partialListenerRef.current.remove();
        partialListenerRef.current = null;
      }
      
      // Stop native recognition
      if (isNativePlatform()) {
        SpeechRecognition.stop().catch(() => {});
      }
      
      // Cleanup web recognition
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
          recognitionRef.current = null;
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition
  };
}
