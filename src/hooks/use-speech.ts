"use client";

import React, { useState, useCallback, useEffect } from "react";
import { SpeechRecognition } from '@capacitor-community/speech-recognition';
import { Capacitor } from '@capacitor/core';

// Check if running on native platform (iOS/Android)
const isNativePlatform = () => Capacitor.isNativePlatform();

// Check web support
const isWebSupported = () => {
  if (typeof window === "undefined") return false;
  return !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
};

export interface UseSpeechReturn {
  isListening: boolean;
  transcript: string;
  visualStatus: 'idle' | 'starting' | 'listening' | 'stopping';
  startListening: (lang?: string, onTextCaptured?: (text: string) => void, inputRef?: React.RefObject<HTMLInputElement>) => void;
  stopListening: () => void;
  resetTranscript: () => void;
  browserSupportsSpeechRecognition: boolean;
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [visualStatus, setVisualStatus] = useState<'idle' | 'starting' | 'listening' | 'stopping'>('idle');

  // Combined support check
  const browserSupportsSpeechRecognition = isNativePlatform() || isWebSupported();

  // Stop listening - handles both native and web
  const stopListening = useCallback(async () => {
    console.log("[Speech] Stopping listening...");
    setVisualStatus('stopping');
    
    if (isNativePlatform()) {
      try {
        await SpeechRecognition.stop();
        console.log("[Speech] Native recognition stopped");
      } catch (e) {
        console.log("[Speech] Error stopping native recognition:", e);
      }
    }
    
    setIsListening(false);
    setVisualStatus('idle');
  }, []);

  // Start listening - native iOS implementation (RADICAL SIMPLIFICATION)
  const startNativeListening = useCallback(async (lang: string = "pt-BR", onTextCaptured?: (text: string) => void, inputRef?: React.RefObject<HTMLInputElement>) => {
    console.log("[Speech] Starting native listening (RADICAL SIMPLIFICATION)...");
    
    try {
      // RESET DE LISTENERS - Limpa pilha de processos acumulados
      console.log("[Speech] RESETANDO TODOS OS LISTENERS...");
      await SpeechRecognition.removeAllListeners();
      
      // Force stop any existing session
      console.log("[Speech] Force stopping any existing session...");
      await SpeechRecognition.stop();
      
      // Hardware delay - wait for iPhone to process stop()
      console.log("[Speech] Hardware delay...");
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Request permissions first
      console.log("[Speech] Requesting permissions...");
      const permResult = await SpeechRecognition.requestPermissions();
      console.log("[Speech] Permission result:", permResult);
      
      // Verification with delay
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Double-check permissions
      const permCheck = await SpeechRecognition.requestPermissions();
      console.log("[Speech] Permission double-check:", permCheck);
      
      if (permCheck.speechRecognition !== 'granted') {
        console.error("[Speech] Permissions not granted");
        throw new Error("Speech recognition permission required");
      }

      // Set listening status immediately
      setVisualStatus('listening');
      setIsListening(true);
      setTranscript("");

      // Hardware delay before start
      console.log("[Speech] Hardware delay before start...");
      await new Promise(resolve => setTimeout(resolve, 500));

      // Estabilização de listeners - delay adicional para hardware respirar
      console.log("[Speech] Estabilizando listeners (400ms)...");
      await new Promise(resolve => setTimeout(resolve, 400));

      // Single-shot recognition - FORÇA UI UPDATE
      console.log("[Speech] Starting single-shot recognition...");
      const result = await SpeechRecognition.start({
        language: 'pt-BR',
        maxResults: 1,
        prompt: "Fale agora...",
        partialResults: false, // DESATIVADO para estabilidade máxima
        popup: false
      });
      
      console.log("[Speech] Recognition result:", result);
      
      // FORCE UI UPDATE - Com injeção direta no DOM
      if (result.matches && result.matches.length > 0) {
        const finalText = result.matches[0];
        console.log('[Speech] FORÇANDO UI UPDATE:', finalText);
        
        // 1. Atualiza o estado (para o React saber)
        setTranscript(finalText);
        setIsListening(false);
        setVisualStatus('idle');
        
        // COFRE ANTI-RESET: Salva no sessionStorage antes de tudo
        sessionStorage.setItem('athena_backup', finalText);
        console.log('[Speech] TEXTO SALVO NO COFRE:', finalText);
        
        // 2. Injeta direto no elemento (para a tela mostrar na hora)
        if (inputRef?.current) {
          console.log('[Speech] Injetando diretamente no DOM via ref:', finalText);
          inputRef.current.value = finalText;
          // Dispara um evento manual para o React notar a mudança
          inputRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Execute callback if provided
        if (onTextCaptured) {
          console.log("[Speech] Executing onTextCaptured callback");
          onTextCaptured(finalText);
        }
      } else {
        console.log("[Speech] No matches found");
        setIsListening(false);
        setVisualStatus('idle');
      }
      
      console.log("[Speech] Single-shot recognition completed");
      
    } catch (error: any) {
      console.error("[Speech] Native recognition error:", error);
      
      // Tratamento amigável para "No speech detected"
      if (error.message?.includes('No speech detected') || error.message?.includes('no speech')) {
        console.log("[Speech] No speech detected - resetting gracefully");
      }
      
      // Sempre resetar status em caso de erro
      setIsListening(false);
      setVisualStatus('idle');
    }
  }, []);

  // Start listening - web implementation (fallback)
  const startWebListening = useCallback((lang: string = "pt-BR", onTextCaptured?: (text: string) => void) => {
    console.log("[Speech] Starting web listening...");
    
    if (!isWebSupported()) {
      console.error("[Speech] Web speech recognition not supported");
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();

    recognition.lang = lang;
    recognition.interimResults = false; // Single-shot também no web
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("[Speech] Web recognition started");
      setVisualStatus('listening');
      setIsListening(true);
      setTranscript("");
    };

    recognition.onresult = (event: any) => {
      console.log("[Speech] Web recognition result:", event);
      try {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal && result[0].transcript) {
            const finalText = result[0].transcript;
            setTranscript(finalText);
            if (onTextCaptured) {
              onTextCaptured(finalText);
            }
            break;
          }
        }
      } catch (error) {
        console.error("[Speech] Error processing web result:", error);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("[Speech] Web recognition error:", event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setVisualStatus('idle');
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      console.log("[Speech] Web recognition ended");
      setVisualStatus('idle');
      setIsListening(false);
    };

    // Start after small delay
    setTimeout(() => {
      try {
        recognition.start();
      } catch (e) {
        console.error("[Speech] Error starting web recognition:", e);
      }
    }, 100);
  }, []);

  // Main start listening function
  const startListening = useCallback((lang: string = "pt-BR", onTextCaptured?: (text: string) => void, inputRef?: React.RefObject<HTMLInputElement>) => {
    console.log("[Speech] Start listening called, isNative:", isNativePlatform());
    
    // Feedback visual forçado imediatamente
    setVisualStatus('starting');
    
    if (isNativePlatform()) {
      startNativeListening(lang, onTextCaptured, inputRef);
    } else {
      startWebListening(lang, onTextCaptured);
    }
  }, [startNativeListening, startWebListening]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  // Cleanup simplificado - sem listeners para remover
  useEffect(() => {
    console.log("[Speech] Cleanup effect running");
    
    return () => {
      console.log("[Speech] Cleaning up on unmount");
      
      // Apenas stop no cleanup - sem listeners
      if (isNativePlatform()) {
        SpeechRecognition.stop().catch(() => {});
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    visualStatus,
    startListening,
    stopListening,
    resetTranscript,
    browserSupportsSpeechRecognition
  };
}
