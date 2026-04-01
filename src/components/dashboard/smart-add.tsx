"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Camera, Image as ImageIcon, Check, Trash2, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { cn, formatCurrency } from "@/lib/utils";
import { Capacitor } from '@capacitor/core';
import * as CapCamera from '@capacitor/camera';

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
}

export function SmartAdd({ onQuickAdd, onBatchApprove, disabled }: SmartAddProps) {
  const { translate } = useLanguage();
  const { toast } = useToast();
  
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingList, setPendingList] = useState<PendingTransaction[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const handleCapture = async (source: 'camera' | 'photos') => {
    try {
      const permission = await CapCamera.Camera.requestPermissions();
      
      if (source === 'camera' && permission.camera !== "granted") {
        toast({
          title: translate({ en: "Permission denied", pt: "Permissão negada" }),
          description: translate({ en: "Camera permission required", pt: "Permissão de câmera necessária" }),
          variant: "destructive",
        });
        return;
      }

      if (source === 'photos' && permission.photos !== "granted") {
        toast({
          title: translate({ en: "Permission denied", pt: "Permissão negada" }),
          description: translate({ en: "Gallery permission required", pt: "Permissão de galeria necessária" }),
          variant: "destructive",
        });
        return;
      }

      const image = await CapCamera.Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CapCamera.CameraResultType.Base64,
        source: source === 'camera' ? CapCamera.CameraSource.Camera : CapCamera.CameraSource.Photos,
      });

      if (image.base64String) {
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

  const removeFromQueue = (id: string) => {
    setPendingList((prev) => prev.filter((item) => item.id !== id));
  };

  const handleApproveAll = async () => {
    if (pendingList.length === 0) return;

    setIsApproving(true);
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
      setIsApproving(false);
    }
  };

  const handleExtract = async () => {
    if (!text.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${baseUrl}/api/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: text.trim(),
          language: 'pt'
        }),
      });

      if (!res.ok) {
        throw new Error("Erro ao processar texto");
      }
      
      const result = await res.json();

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
      {/* Text Input Card */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
        <CardContent className="p-4">
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
                placeholder={translate({
                  en: "Quick add: 'Pizza 50 yesterday'...",
                  pt: "Adição rápida: 'Pizza 50 ontem'...",
                })}
                className="w-full bg-transparent border-none focus:ring-0 text-sm placeholder:text-muted-foreground/60 py-2 pr-10"
                disabled={isLoading || isProcessingImage || disabled}
              />
            </div>
            
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full hover:bg-primary/20 hover:text-primary transition-all"
              onClick={handleExtract}
              disabled={!text.trim() || isLoading || isProcessingImage || disabled}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Camera/Gallery Card */}
      <Card className="border-primary/20 bg-primary/5 shadow-sm overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 bg-primary/10 p-2 rounded-full">
              <Camera className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-grow">
              <h3 className="text-sm font-medium mb-1">
                {translate({ en: "Scan Receipt", pt: "Escanear Recibo" })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {translate({ 
                  en: "Take a photo or import from gallery", 
                  pt: "Tire uma foto ou importe da galeria" 
                })}
              </p>
            </div>
            
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => handleCapture('camera')}
                disabled={isProcessingImage || disabled}
              >
                <Camera className="h-4 w-4" />
                {translate({ en: "Photo", pt: "Foto" })}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => handleCapture('photos')}
                disabled={isProcessingImage || disabled}
              >
                <ImageIcon className="h-4 w-4" />
                {translate({ en: "Gallery", pt: "Galeria" })}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isProcessingImage && (
        <div className="text-center py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          {translate({ en: "Processing receipt...", pt: "Processando recibo..." })}
        </div>
      )}

      {pendingList.length > 0 && (
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">
                {translate({ 
                  en: `Pending (${pendingList.length})`, 
                  pt: `Pendentes (${pendingList.length})` 
                })}
              </h3>
              <Button
                size="sm"
                onClick={handleApproveAll}
                disabled={isApproving || isProcessingImage}
                className="bg-primary hover:bg-primary/90"
              >
                <Check className="w-4 h-4 mr-1" />
                {translate({ en: "Approve All", pt: "Aprovar" })}
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
                        <span className="text-yellow-600">⚠️</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                    onClick={() => removeFromQueue(item.id)}
                    disabled={isApproving}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
