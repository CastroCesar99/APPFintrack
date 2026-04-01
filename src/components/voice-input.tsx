"use client";

import React, { useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/hooks/use-speech";
import { useLanguage } from "@/context/language-context";

interface VoiceInputProps {
  onTextCaptured: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  listeningPlaceholder?: string;
  className?: string;
}

// Componente isolado para lógica de voz - mantém estado independente da página pai
export function VoiceInput({
  onTextCaptured,
  disabled = false,
  placeholder,
  listeningPlaceholder = "Ouvindo...",
  className,
}: VoiceInputProps) {
  const { translate, language } = useLanguage();
  const {
    isListening,
    visualStatus,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeech();

  // useRef para persistir texto entre re-renders do componente pai
  const capturedTextRef = useRef<string>("");
  const [forcedPlaceholder, setForcedPlaceholder] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Flag para prevenir múltiplos stops
  const isProcessingRef = useRef(false);

  const handleVoiceTextCaptured = useCallback(
    (capturedText: string) => {
      console.log(
        "[VoiceInput] Texto recebido e salvando no ref:",
        capturedText
      );

      // Guarda no ref para persistir entre re-renders
      capturedTextRef.current = capturedText;

      // Injeta diretamente no input
      if (inputRef.current) {
        inputRef.current.value = capturedText;
        inputRef.current.dispatchEvent(
          new Event("input", { bubbles: true })
        );
      }

      setForcedPlaceholder("");
      isProcessingRef.current = false;

      // Notifica o componente pai
      onTextCaptured(capturedText);
    },
    [onTextCaptured]
  );

  const toggleListening = () => {
    // Prevenção de cliques múltiplos ou ações concorrentes
    if (isProcessingRef.current) {
      console.log("[VoiceInput] Ignorando clique - processamento em andamento");
      return;
    }

    if (isListening) {
      console.log("[VoiceInput] Usuário clicou para parar");
      stopListening();
      setForcedPlaceholder("");
      isProcessingRef.current = false;
    } else {
      console.log("[VoiceInput] Iniciando captura de voz");
      isProcessingRef.current = true;

      // Limpa estado anterior
      capturedTextRef.current = "";
      if (inputRef.current) {
        inputRef.current.value = "";
      }

      // Feedback visual imediato
      setForcedPlaceholder(
        translate({
          en: listeningPlaceholder,
          pt: listeningPlaceholder,
        })
      );

      // Inicia listening
      startListening(
        language === "pt" ? "pt-BR" : "en-US",
        handleVoiceTextCaptured,
        inputRef
      );
    }
  };

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        type="text"
        defaultValue={capturedTextRef.current}
        placeholder={
          forcedPlaceholder ||
          placeholder ||
          translate({
            en: "Ask Athena something...",
            pt: "Pergunte algo à Athena...",
          })
        }
        className={cn(
          "flex-1 bg-background/50 border border-primary/20 rounded-lg px-4 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all",
          visualStatus === "listening" &&
            "text-primary font-medium animate-pulse border-primary/40 bg-primary/5",
          visualStatus === "starting" && "text-muted-foreground animate-pulse"
        )}
        disabled={disabled}
        readOnly={isListening} // Previne edição durante escuta
      />

      {browserSupportsSpeechRecognition && (
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
              : "hover:bg-primary/10"
          )}
          onClick={toggleListening}
          disabled={disabled || isProcessingRef.current}
        >
          {visualStatus === "listening" ? (
            <Mic className="h-4 w-4 text-red-500 animate-pulse" />
          ) : visualStatus === "starting" ? (
            <Mic className="h-4 w-4 text-yellow-500 animate-pulse" />
          ) : (
            <Mic className="h-4 w-4 text-muted-foreground/60" />
          )}
        </Button>
      )}
    </div>
  );
}
