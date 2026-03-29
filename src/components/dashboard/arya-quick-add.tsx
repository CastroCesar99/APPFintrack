"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ArrowRight, Mic, MicOff } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

interface AryaQuickAddProps {
  onQuickAdd: (extractedData: any) => void;
  disabled?: boolean;
  userCategories?: any[];
  userPaymentMethods?: any[];
  recentTransactions?: any[];
}

export function AryaQuickAdd({ 
  onQuickAdd, 
  disabled, 
  userCategories = [], 
  userPaymentMethods = [],
  recentTransactions = []
}: AryaQuickAddProps) {
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    isListening,
    transcript,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Update text when transcript changes
  useEffect(() => {
    if (transcript) {
      setText(transcript);
    }
  }, [transcript]);

  // Handle auto-submit when user stops talking (if we have text)
  useEffect(() => {
    if (!isListening && transcript && !isLoading) {
      handleExtract();
    }
  }, [isListening]);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening(language === 'pt' ? 'pt-BR' : 'en-US');
    }
  };

  const handleExtract = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text,
          categories: userCategories.map(c => ({ name: c.name, label: c.label })),
          paymentMethods: userPaymentMethods.map(p => ({ name: p.name, label: p.label })),
          history: recentTransactions.slice(0, 20).map(t => ({ description: t.description, expenseNature: t.expenseNature })),
          language
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to extract");
      }

      if (result.data) {
        onQuickAdd(result.data);
        setText("");
        toast({
          title: translate({ en: "Athena understood!", pt: "Athena entendeu!" }),
          description: translate({
            en: "Review the details and save your transaction.",
            pt: "Revise os detalhes e salve sua transação.",
          }),
        });
      }
    } catch (error: any) {
      console.error("Quick Add Error:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: error.message || translate({
          en: "Athena couldn't understand that. Try being more specific.",
          pt: "A Athena não conseguiu entender. Tente ser mais específico.",
        }),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 bg-primary/10 p-2 rounded-full">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          
          <div className="flex-grow relative">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleExtract()}
              placeholder={isListening 
                ? translate({ en: "Listening...", pt: "Ouvindo..." })
                : translate({
                  en: "Quick add with Athena: 'Pizza 50 yesterday'...",
                  pt: "Adição rápida com Athena: 'Pizza 50 ontem'...",
                })}
              className={cn(
                "w-full bg-transparent border-none focus:ring-0 text-sm placeholder:text-muted-foreground/60 py-2 pr-20",
                isListening && "text-primary font-medium animate-pulse"
              )}
              disabled={isLoading || disabled}
            />
            
            <div className="absolute right-0 inset-y-0 flex items-center pr-1 gap-1">
              {browserSupportsSpeechRecognition && (
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    isListening ? "bg-primary/20 text-primary animate-pulse" : "hover:bg-primary/10"
                  )}
                  onClick={toggleListening}
                  disabled={isLoading || disabled}
                >
                  {isListening ? (
                    <Mic className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4 text-muted-foreground/60" />
                  )}
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary transition-all"
                onClick={handleExtract}
                disabled={!text.trim() || isLoading || disabled}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
