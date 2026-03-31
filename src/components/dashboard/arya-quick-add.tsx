"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ArrowRight, Mic, MicOff } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { Capacitor } from '@capacitor/core';

// Dynamic base URL: uses Vercel for native, relative for web
const baseUrl = Capacitor.isNativePlatform() 
  ? (process.env.NEXT_PUBLIC_API_URL || '') 
  : '';

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

    // Generate unique request ID for debugging
    const requestId = `quickadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] Starting handleExtract with text:`, text.substring(0, 50));

    setIsLoading(true);
    try {
      // Safely prepare data with error handling for each step
      let safeCategories: any[] = [];
      let safePaymentMethods: any[] = [];
      let safeHistory: any[] = [];

      try {
        safeCategories = userCategories.map(c => ({ 
          name: String(c.name || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          label: c.label 
        }));
      } catch (e) {
        console.error(`[${requestId}] Error preparing categories:`, e);
        safeCategories = [];
      }

      try {
        safePaymentMethods = userPaymentMethods.map(p => ({ 
          name: String(p.name || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          label: p.label 
        }));
      } catch (e) {
        console.error(`[${requestId}] Error preparing payment methods:`, e);
        safePaymentMethods = [];
      }

      try {
        safeHistory = recentTransactions.slice(0, 20).map(t => ({ 
          description: String(t.description || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          expenseNature: String(t.expenseNature || 'variable').replace(/[\x00-\x1F\x7F]/g, '') 
        }));
      } catch (e) {
        console.error(`[${requestId}] Error preparing history:`, e);
        safeHistory = [];
      }

      // Sanitize input text
      const sanitizedText = text.trim().replace(/[\x00-\x1F\x7F]/g, '');
      console.log(`[${requestId}] Sanitized text:`, sanitizedText.substring(0, 50));

      let res;
      try {
        // Use dynamic baseUrl: empty for web, NEXT_PUBLIC_API_URL for native
        const endpoint = `${baseUrl}/api/extract`;
        
        console.log(`[${requestId}] Platform:`, Capacitor.isNativePlatform() ? 'Native' : 'Web');
        console.log(`[${requestId}] Fetching from:`, endpoint);
        
        res = await fetch(endpoint, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Request-ID": requestId
          },
          body: JSON.stringify({ 
            text: sanitizedText,
            categories: safeCategories,
            paymentMethods: safePaymentMethods,
            history: safeHistory,
            language
          }),
        });
      } catch (fetchError: any) {
        console.error(`[${requestId}] Fetch error:`, fetchError);
        throw new Error(`Network error: ${fetchError.message || 'Failed to connect'}`);
      }

      // Defensive parsing: read as text first, then parse JSON
      let result;
      try {
        const textResponse = await res.text(); // Read as text first
        console.log(`[${requestId}] Raw response (first 200 chars):`, textResponse.substring(0, 200));
        
        if (!res.ok) {
          console.error(`[${requestId}] API error (Raw):`, textResponse);
          throw new Error(`Erro do Servidor: ${res.status} - ${textResponse.substring(0, 100)}`);
        }
        
        // Only parse JSON if response is OK
        try {
          result = JSON.parse(textResponse);
        } catch (parseError: any) {
          console.error(`[${requestId}] JSON parse error:`, parseError);
          console.error(`[${requestId}] Response that failed to parse:`, textResponse);
          throw new Error('Invalid JSON response from server');
        }
      } catch (responseError: any) {
        console.error(`[${requestId}] Response handling error:`, responseError);
        throw responseError;
      }

      console.log(`[${requestId}] Response status:`, res.status);

      if (!res.ok) {
        console.error(`[${requestId}] API error:`, result);
        throw new Error(result.error || result.details || "Failed to extract");
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
      console.error(`[${requestId}] Quick Add Error:`, error);
      console.error(`[${requestId}] Error stack:`, error.stack);
      
      // Show detailed error message
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
      console.log(`[${requestId}] handleExtract completed`);
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
