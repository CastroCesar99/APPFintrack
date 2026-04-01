"use client";

import React, { useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/hooks/use-speech";
import { useLanguage } from "@/context/language-context";

const STORAGE_KEY = "last_speech";

// Componente COMPLETAMENTE ISOLADO com localStorage "Cofre de Texto"
// React.memo impede re-render quando a página pai atualiza
const VoiceLayerComponent = ({
  targetInputId = "input-athena",
  disabled = false,
  onCapture,
  className,
}: {
  targetInputId?: string;
  disabled?: boolean;
  onCapture?: (text: string) => void;
  className?: string;
}) => {
  const { translate, language } = useLanguage();
  const {
    isListening,
    visualStatus,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeech();

  // REFS para tudo - React não sabe o que está acontecendo
  const capturedTextRef = useRef<string>("");
  const isProcessingRef = useRef(false);
  const inputElementRef = useRef<HTMLInputElement | null>(null);

  // 1. RECUPERAÇÃO AUTOMÁTICA do localStorage no mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      console.log("[VoiceLayer] RECUPERANDO do localStorage:", saved);

      // Injeta no input imediatamente
      const input = window.document.getElementById(
        targetInputId
      ) as HTMLInputElement;
      if (input) {
        input.value = saved;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Notifica callback
      if (onCapture) {
        onCapture(saved);
      }

      // Limpa o cofre
      localStorage.removeItem(STORAGE_KEY);
      console.log("[VoiceLayer] Cofre limpo após recuperação");
    }
  }, [onCapture, targetInputId]);

  // Encontrar o input alvo uma vez
  useEffect(() => {
    inputElementRef.current = window.document.getElementById(
      targetInputId
    ) as HTMLInputElement;
  }, [targetInputId]);

  // 2. SALVAMENTO DE EMERGÊNCIA no callback
  const handleVoiceTextCaptured = useCallback(
    (capturedText: string) => {
      console.log("[VoiceLayer] TRANSCRIPT CAPTURED:", capturedText);

      // SALVA NO localStorage ANTES DE QUALQUER COISA (Cofre de Texto)
      localStorage.setItem(STORAGE_KEY, capturedText);
      console.log("[VoiceLayer] TEXTO SALVO NO COFRE:", capturedText);

      // 1. Guarda na ref (invisível pro React)
      capturedTextRef.current = capturedText;

      // 2. INJEÇÃO MANUAL NO DOM - JavaScript puro!
      const input = inputElementRef.current;
      if (input) {
        console.log("[VoiceLayer] INJETANDO DIRETAMENTE NO DOM:", capturedText);
        input.value = capturedText;

        // Dispara evento para que o React note (mas sem re-render)
        const event = new Event("input", { bubbles: true });
        input.dispatchEvent(event);
      } else {
        // Fallback: tenta encontrar novamente
        const fallbackInput = window.document.getElementById(
          targetInputId
        ) as HTMLInputElement;
        if (fallbackInput) {
          fallbackInput.value = capturedText;
          fallbackInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      // 3. Libera o bloqueio global
      (window as any).isAthendListening = false;
      isProcessingRef.current = false;

      // 4. Notifica callback externo (se existir)
      if (onCapture) {
        onCapture(capturedText);
      }

      // 5. Limpa o cofre após um delay (garante que foi recuperado)
      setTimeout(() => {
        localStorage.removeItem(STORAGE_KEY);
        console.log("[VoiceLayer] Cofre limpo após delay");
      }, 1000);
    },
    [onCapture, targetInputId]
  );

  const toggleListening = () => {
    // Bloqueio contra múltiplos cliques
    if (isProcessingRef.current) {
      console.log("[VoiceLayer] Ignorando - processamento em andamento");
      return;
    }

    if (isListening) {
      console.log("[VoiceLayer] Parando...");
      stopListening();
      (window as any).isAthendListening = false;
      isProcessingRef.current = false;
    } else {
      console.log("[VoiceLayer] Iniciando...");
      isProcessingRef.current = true;

      // BLOQUEIO GLOBAL - Impede outros updates na tela
      (window as any).isAthendListening = true;

      // Limpa estado anterior
      capturedTextRef.current = "";
      localStorage.removeItem(STORAGE_KEY); // Limpa cofre anterior
      const input = inputElementRef.current;
      if (input) {
        input.value = "";
      }

      // Inicia listening
      startListening(
        language === "pt" ? "pt-BR" : "en-US",
        handleVoiceTextCaptured,
        inputElementRef // Passa ref para injeção direta
      );
    }
  };

  if (!browserSupportsSpeechRecognition) return null;

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "h-9 w-9 rounded-full transition-all shrink-0",
        visualStatus === "listening"
          ? "bg-red-500/20 text-red-500 animate-pulse"
          : visualStatus === "starting"
          ? "bg-yellow-500/20 text-yellow-500 animate-pulse"
          : "hover:bg-primary/10",
        className
      )}
      onClick={toggleListening}
      disabled={disabled}
    >
      {visualStatus === "listening" ? (
        <Mic className="h-4 w-4 text-red-500 animate-pulse" />
      ) : visualStatus === "starting" ? (
        <Mic className="h-4 w-4 text-yellow-500 animate-pulse" />
      ) : (
        <Mic className="h-4 w-4 text-muted-foreground/60" />
      )}
    </Button>
  );
};

// React.memo impede re-render quando a página pai atualiza
// Comparação superficial de props - só re-renderiza se props mudarem
export const VoiceLayer = React.memo(VoiceLayerComponent, (prevProps, nextProps) => {
  // Só re-renderiza se disabled mudar
  return prevProps.disabled === nextProps.disabled &&
         prevProps.targetInputId === nextProps.targetInputId;
});
