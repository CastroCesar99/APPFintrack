"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, ArrowRight, Camera, Image as ImageIcon, Check, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { useSpeech } from '@/hooks/use-speech';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera } from '@capacitor/camera';

// Dynamic base URL: uses Vercel for native, relative for web
const baseUrl = Capacitor.isNativePlatform() 
  ? (process.env.NEXT_PUBLIC_API_URL || '') 
  : '';

interface PendingTransaction {
  id: string;
  amount: number;
  date: string;
  establishment: string;
  category: string;
  confidence: number;
  description?: string;
  paymentMethod?: string;
  expenseNature?: 'fixed' | 'variable';
}

interface SmartAddProps {
  onQuickAdd: (extractedData: any) => void;
  onBatchApprove: (transactions: PendingTransaction[]) => Promise<void>;
  disabled?: boolean;
  userCategories?: any[];
  userPaymentMethods?: any[];
  recentTransactions?: any[];
}

export function SmartAdd({ 
  onQuickAdd, 
  onBatchApprove,
  disabled, 
  userCategories = [], 
  userPaymentMethods = [],
  recentTransactions = []
}: SmartAddProps) {
  const { translate, language } = useLanguage();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [forcedPlaceholder, setForcedPlaceholder] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Pending list for OCR receipts
  const [pendingList, setPendingList] = useState<PendingTransaction[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  
  const {
    isListening,
    visualStatus,
    startListening,
    stopListening,
    browserSupportsSpeechRecognition
  } = useSpeech();

  const isNative = Capacitor.isNativePlatform();

  // Monitor listening state
  useEffect(() => {
    console.log('[SmartAdd] isListening changed:', isListening);
    if (isListening) {
      console.log('[SmartAdd] Microfone está ativo');
    } else {
      console.log('[SmartAdd] Microfone está inativo');
    }
  }, [isListening]);

  // Toggle voice listening
  const toggleListening = () => {
    if (isListening) {
      stopListening();
      setForcedPlaceholder("");
    } else {
      setText("");
      setForcedPlaceholder(translate({ en: "Listening now...", pt: "Ouvindo agora..." }));
      startListening(
        language === 'pt' ? 'pt-BR' : 'en-US',
        (capturedText) => {
          console.log('Texto capturado via onTextCaptured:', capturedText);
          setText(capturedText);
          setForcedPlaceholder("");
        },
        inputRef
      );
    }
  };

  // Image to base64 converter
  const imageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Data = base64.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
    });
  };

  // Process image with OCR
  const processImage = async (base64Image: string, mimeType: string = "image/jpeg") => {
    setIsProcessingImage(true);
    try {
      const response = await fetch(`${baseUrl}/api/ocr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Image, mimeType }),
      });

      if (!response.ok) {
        throw new Error("Falha ao processar imagem");
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        const newTransaction: PendingTransaction = {
          id: Date.now().toString(),
          amount: result.data.amount,
          date: result.data.date,
          establishment: result.data.establishment,
          category: result.data.category,
          confidence: result.data.confidence,
          description: `${result.data.establishment} - ${result.data.category}`,
          paymentMethod: 'credit_card',
          expenseNature: 'variable',
        };

        setPendingList((prev) => [...prev, newTransaction]);
        
        toast({
          title: translate({ en: "Receipt scanned", pt: "Recibo escaneado" }),
          description: `${result.data.establishment} - ${formatCurrency(result.data.amount)}`,
        });
      }
    } catch (error: any) {
      console.error("[OCR Error]:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: error.message || translate({ en: "Could not process receipt", pt: "Não foi possível processar o recibo" }),
        variant: "destructive",
      });
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Take photo (native)
  const takePhoto = async () => {
    try {
      const permission = await CapCamera.requestPermissions();
      
      if (permission.camera !== "granted") {
        toast({
          title: translate({ en: "Permission denied", pt: "Permissão negada" }),
          description: translate({ en: "Camera permission required", pt: "Permissão de câmera necessária" }),
          variant: "destructive",
        });
        return;
      }

      const image = await CapCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CapCamera.ResultType.Base64, // CORRIGIDO: Usar Base64 diretamente
        source: CapCamera.Source.Prompt, // CORRIGIDO: Permite escolher entre câmera e galeria
      });

      if (image.base64String) {
        // Monta o data URI completo para enviar
        const base64Image = `data:image/${image.format || 'jpeg'};base64,${image.base64String}`;
        console.log('[SmartAdd] Imagem capturada em Base64:', base64Image.substring(0, 100) + '...');
        await processImage(image.base64String, `image/${image.format || 'jpeg'}`);
      }
    } catch (error: any) {
      console.error("[Camera Error]:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Import from gallery (native)
  const importFromGallery = async () => {
    try {
      const permission = await CapCamera.requestPermissions();
      
      if (permission.photos !== "granted") {
        toast({
          title: translate({ en: "Permission denied", pt: "Permissão negada" }),
          description: translate({ en: "Gallery permission required", pt: "Permissão de galeria necessária" }),
          variant: "destructive",
        });
        return;
      }

      const image = await CapCamera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CapCamera.ResultType.Base64, // CORRIGIDO: Usar Base64 diretamente
        source: CapCamera.Source.Photos, // CORRIGIDO: Apenas galeria
      });

      if (image.base64String) {
        // Monta o data URI completo para enviar
        const base64Image = `data:image/${image.format || 'jpeg'};base64,${image.base64String}`;
        console.log('[SmartAdd] Imagem da galeria em Base64:', base64Image.substring(0, 100) + '...');
        await processImage(image.base64String, `image/${image.format || 'jpeg'}`);
      }
    } catch (error: any) {
      console.error("[Gallery Error]:", error);
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Web file upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, useCamera: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await imageToBase64(file);
      await processImage(base64, file.type);
    } catch (error) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "Could not read image", pt: "Não foi possível ler a imagem" }),
        variant: "destructive",
      });
    }
  };

  // Remove from pending list
  const removeFromQueue = (id: string) => {
    setPendingList((prev) => prev.filter((item) => item.id !== id));
  };

  // Approve all pending transactions
  const handleApproveAll = async () => {
    if (pendingList.length === 0) return;

    setIsLoading(true);
    try {
      await onBatchApprove(pendingList);
      setPendingList([]);
      toast({
        title: translate({ en: "Success", pt: "Sucesso" }),
        description: translate({ 
          en: `${pendingList.length} transactions added`, 
          pt: `${pendingList.length} transações adicionadas` 
        }),
      });
    } catch (error: any) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle text extraction (voice or manual)
  const handleExtract = async () => {
    if (!text.trim()) return;

    const requestId = `quickadd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${requestId}] Starting handleExtract with text:`, text.substring(0, 50));

    setIsLoading(true);
    try {
      let safeCategories: any[] = [];
      let safePaymentMethods: any[] = [];
      let safeHistory: any[] = [];

      try {
        safeCategories = userCategories.map(c => ({ 
          name: String(c.name || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          label: c.label 
        }));
      } catch (e) {
        safeCategories = [];
      }

      try {
        safePaymentMethods = userPaymentMethods.map(p => ({ 
          name: String(p.name || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          label: p.label 
        }));
      } catch (e) {
        safePaymentMethods = [];
      }

      try {
        safeHistory = recentTransactions.slice(0, 20).map(t => ({ 
          description: String(t.description || '').replace(/[\x00-\x1F\x7F]/g, ''), 
          expenseNature: String(t.expenseNature || 'variable').replace(/[\x00-\x1F\x7F]/g, '') 
        }));
      } catch (e) {
        safeHistory = [];
      }

      const sanitizedText = text.trim().replace(/[\x00-\x1F\x7F]/g, '');

      const res = await fetch(`${baseUrl}/api/extract`, {
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

      const textResponse = await res.text();
      
      if (!res.ok) {
        throw new Error(`Erro do Servidor: ${res.status} - ${textResponse.substring(0, 100)}`);
      }
      
      const result = JSON.parse(textResponse);

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

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      "Alimentação": "bg-orange-100 text-orange-700",
      "Transporte": "bg-blue-100 text-blue-700",
      "Moradia": "bg-green-100 text-green-700",
      "Saúde": "bg-red-100 text-red-700",
      "Lazer": "bg-purple-100 text-purple-700",
      "Compras": "bg-pink-100 text-pink-700",
      "Serviços": "bg-gray-100 text-gray-700",
      "Educação": "bg-yellow-100 text-yellow-700",
      "Outros": "bg-slate-100 text-slate-700",
    };
    return colors[category] || "bg-slate-100 text-slate-700";
  };

  return (
    <div className="space-y-4">
      {/* Voice/Text Input Card */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 bg-primary/10 p-2 rounded-full">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-grow relative">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleExtract()}
                placeholder={forcedPlaceholder || 
                  (visualStatus === 'listening' 
                    ? translate({ en: "Listening...", pt: "Ouvindo..." })
                    : visualStatus === 'starting'
                    ? translate({ en: "Starting...", pt: "Iniciando..." })
                    : translate({
                        en: "Quick add: 'Pizza 50 yesterday' or scan receipt...",
                        pt: "Adição rápida: 'Pizza 50 ontem' ou escaneie recibo...",
                      }))}
                className={cn(
                  "w-full bg-transparent border-none focus:ring-0 text-sm placeholder:text-muted-foreground/60 py-2 pr-32",
                  visualStatus === 'listening' && "text-primary font-medium animate-pulse",
                  visualStatus === 'starting' && "text-muted-foreground animate-pulse"
                )}
                disabled={isLoading || isProcessingImage || disabled}
              />
              
              <div className="absolute right-0 inset-y-0 flex items-center pr-1 gap-1">
                {/* Hidden file input para fallback web */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                
                {/* Botão Tirar Foto - funciona em nativo e web */}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-primary/10 transition-all"
                  onClick={isNative ? takePhoto : () => fileInputRef.current?.click()}
                  disabled={isLoading || isProcessingImage || disabled}
                  title={translate({ en: "Take Photo", pt: "Tirar Foto" })}
                >
                  <Camera className="h-4 w-4 text-muted-foreground/60" />
                </Button>
                
                {/* Botão Galeria - apenas nativo */}
                {isNative && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-full hover:bg-primary/10 transition-all"
                    onClick={importFromGallery}
                    disabled={isLoading || isProcessingImage || disabled}
                    title={translate({ en: "Import Gallery", pt: "Importar Galeria" })}
                  >
                    <ImageIcon className="h-4 w-4 text-muted-foreground/60" />
                  </Button>
                )}

                {browserSupportsSpeechRecognition && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      visualStatus === 'listening' ? "bg-red-500/20 text-red-500 animate-pulse" : 
                      visualStatus === 'starting' ? "bg-yellow-500/20 text-yellow-500 animate-pulse" :
                      "hover:bg-primary/10"
                    )}
                    onClick={toggleListening}
                    disabled={isLoading || isProcessingImage || disabled}
                  >
                    {visualStatus === 'listening' ? (
                      <span className="h-4 w-4 text-red-500 animate-pulse">●</span>
                    ) : visualStatus === 'starting' ? (
                      <span className="h-4 w-4 text-yellow-500 animate-pulse">◐</span>
                    ) : (
                      <span className="h-4 w-4 text-muted-foreground/60">○</span>
                    )}
                  </Button>
                )}

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary transition-all"
                  onClick={handleExtract}
                  disabled={!text.trim() || isLoading || isProcessingImage || disabled}
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

      {/* Pending Receipts Queue */}
      {pendingList.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">
                {translate({ 
                  en: `Pending Approval (${pendingList.length})`, 
                  pt: `Pendentes de Aprovação (${pendingList.length})` 
                })}
              </h3>
              <Button
                size="sm"
                onClick={handleApproveAll}
                disabled={isLoading || isProcessingImage}
                className="bg-primary hover:bg-primary/90"
              >
                <Check className="w-4 h-4 mr-1" />
                {translate({ en: "Approve All", pt: "Aprovar Todos" })}
              </Button>
            </div>
            
            <div className="space-y-2">
              {pendingList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate text-sm">
                        {item.establishment}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", getCategoryColor(item.category))}>
                        {item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="font-medium">{formatCurrency(item.amount)}</span>
                      <span>•</span>
                      <span>{new Date(item.date).toLocaleDateString("pt-BR")}</span>
                      {item.confidence < 0.7 && (
                        <span className="text-yellow-600">⚠️ {translate({ en: "Review", pt: "Revisar" })}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeFromQueue(item.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {isProcessingImage && (
        <div className="text-center py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          {translate({ en: "Processing receipt...", pt: "Processando recibo..." })}
        </div>
      )}
    </div>
  );
}
