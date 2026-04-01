"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/hooks/use-speech";
import { useLanguage } from "@/context/language-context";

interface StubbornInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

// Componente 'STUBBORN' (Teimoso) - Não re-renderiza com atualizações da página pai
// Usa React.memo para ignorar renderizações externas
const StubbornInputComponent = ({
  id = "input-athena",
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder,
  className,
}: StubbornInputProps) => {
  const { translate, language } = useLanguage();
  const {
    isListening,
    visualStatus,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition,
  } = useSpeech();

  const inputRef = useRef<HTMLInputElement>(null);
  const [localValue, setLocalValue] = useState(value);

  // Recuperação do Cofre Anti-Reset no mount
  useEffect(() => {
    const saved = sessionStorage.getItem('athena_backup');
    if (saved) {
      console.log('[StubbornInput] RECUPERANDO do cofre:', saved);
      setLocalValue(saved);
      onChange(saved);
      // Limpa cofre após recuperação
      setTimeout(() => {
        sessionStorage.removeItem('athena_backup');
        console.log('[StubbornInput] Cofre limpo');
      }, 500);
    }
  }, [onChange]);

  // Sincroniza valor externo
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleVoiceCapture = useCallback(
    (capturedText: string) => {
      console.log('[StubbornInput] Capturado:', capturedText);
      setLocalValue(capturedText);
      onChange(capturedText);
      if (onSubmit) {
        setTimeout(() => onSubmit(), 500);
      }
    },
    [onChange, onSubmit]
  );

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      // Limpa antes de começar
      setLocalValue("");
      onChange("");
      sessionStorage.removeItem('athena_backup');
      
      startListening(
        language === "pt" ? "pt-BR" : "en-US",
        handleVoiceCapture,
        inputRef
      );
    }
  };

  return (
    <div className={cn("relative flex items-center gap-2", className)}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
          onChange(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && localValue.trim() && !disabled && onSubmit) {
            onSubmit();
          }
        }}
        placeholder={
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
      )}
    </div>
  );
};

// React.memo com comparação customizada - IGNORA atualizações da página pai
export const StubbornInput = React.memo(StubbornInputComponent, (prev, next) => {
  // Só re-renderiza se value ou disabled mudarem
  // Ignora completamente outras props que possam vir da página pai
  return (
    prev.value === next.value &&
    prev.disabled === next.disabled &&
    prev.placeholder === next.placeholder
  );
});
