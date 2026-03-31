"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  transcript: string;
  startListening: (lang?: string) => void;
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

  // Combined support check
  const browserSupportsSpeechRecognition = isNativePlatform() || isWebSupported();

  // Stop listening - handles both native and web
  const stopListening = useCallback(async () => {
    console.log("[Speech] Stopping listening...");
    
    if (isNativePlatform()) {
      try {
        await SpeechRecognition.stop();
        console.log("[Speech] Native recognition stopped");
      } catch (e) {
        console.log("[Speech] Error stopping native recognition:", e);
      }
    } else if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.log("[Speech] Error stopping web recognition:", e);
      }
    }
    
    setIsListening(false);
  }, []);

  // Start listening - native iOS implementation
  const startNativeListening = useCallback(async (lang: string = "pt-BR") => {
    console.log("[Speech] Starting native listening...");
    
    try {
      // Request permissions first
      const permResult = await SpeechRecognition.requestPermissions();
      console.log("[Speech] Permission result:", permResult);
      
      if (permResult.speechRecognition !== 'granted' || permResult.microphone !== 'granted') {
        console.error("[Speech] Permissions not granted");
        throw new Error("Microphone and speech recognition permissions required");
      }

      // Map language codes
      const languageMap: Record<string, string> = {
        'pt-BR': 'pt-BR',
        'pt': 'pt-BR',
        'en-US': 'en-US',
        'en': 'en-US'
      };
      const nativeLang = languageMap[lang] || 'pt-BR';

      // Start native speech recognition
      await SpeechRecognition.start({
        language: nativeLang,
        maxResults: 1,
        prompt: "Fale agora...",
        partialResults: false,
        popup: false
      });

      console.log("[Speech] Native recognition started");
      setIsListening(true);
      setTranscript("");

      // Listen for results
      nativeListenerRef.current = await SpeechRecognition.addListener('listeningState', (state: any) => {
        console.log("[Speech] Listening state:", state);
      });

    } catch (error: any) {
      console.error("[Speech] Native recognition error:", error);
      setIsListening(false);
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
  const startListening = useCallback((lang: string = "pt-BR") => {
    console.log("[Speech] Start listening called, isNative:", isNativePlatform());
    
    if (isNativePlatform()) {
      startNativeListening(lang);
    } else {
      startWebListening(lang);
    }
  }, [startNativeListening, startWebListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[Speech] Cleanup effect running");
      
      if (isNativePlatform()) {
        SpeechRecognition.stop().catch(() => {});
        if (nativeListenerRef.current) {
          nativeListenerRef.current.remove();
        }
      } else if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
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
