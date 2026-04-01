"use client";

import React, { useState, useCallback, useRef } from "react";
import { Camera, Image as ImageIcon, X, Check, Trash2, Camera as CameraIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Camera as CapCamera } from "@capacitor/camera";

interface PendingTransaction {
  id: string;
  amount: number;
  date: string;
  establishment: string;
  category: string;
  confidence: number;
  imageUrl?: string;
}

interface ReceiptScannerProps {
  onApproveAll: (transactions: PendingTransaction[]) => Promise<void>;
  className?: string;
}

export function ReceiptScanner({ onApproveAll, className }: ReceiptScannerProps) {
  const { translate } = useLanguage();
  const { toast } = useToast();
  const [pendingList, setPendingList] = useState<PendingTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNative = Capacitor.isNativePlatform();

  // Converter imagem para base64
  const imageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        // Remove o prefixo "data:image/jpeg;base64,"
        const base64Data = base64.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
    });
  };

  // Processar imagem com OCR
  const processImage = async (base64Image: string, mimeType: string = "image/jpeg") => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/ocr", {
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
      setIsProcessing(false);
    }
  };

  // Tirar foto (nativo)
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
        resultType: "base64",
        source: "camera",
      });

      if (image.base64String) {
        await processImage(image.base64String, `image/${image.format || "jpeg"}`);
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

  // Importar da galeria (nativo)
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
        resultType: "base64",
        source: "photos",
      });

      if (image.base64String) {
        await processImage(image.base64String, `image/${image.format || "jpeg"}`);
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

  // Handler para upload web (fallback)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  // Remover item da fila
  const removeFromQueue = (id: string) => {
    setPendingList((prev) => prev.filter((item) => item.id !== id));
  };

  // Aprovar todos
  const handleApproveAll = async () => {
    if (pendingList.length === 0) return;

    setIsProcessing(true);
    try {
      await onApproveAll(pendingList);
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
      setIsProcessing(false);
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
    <div className={cn("space-y-4", className)}>
      {/* Botões de Ação */}
      <div className="flex gap-2">
        {isNative ? (
          <>
            <Button
              onClick={takePhoto}
              disabled={isProcessing}
              className="flex-1"
              variant="outline"
            >
              <CameraIcon className="w-4 h-4 mr-2" />
              {translate({ en: "Take Photo", pt: "Tirar Foto" })}
            </Button>
            <Button
              onClick={importFromGallery}
              disabled={isProcessing}
              className="flex-1"
              variant="outline"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {translate({ en: "Import Gallery", pt: "Importar Galeria" })}
            </Button>
          </>
        ) : (
          <>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="flex-1"
              variant="outline"
            >
              <CameraIcon className="w-4 h-4 mr-2" />
              {translate({ en: "Take Photo", pt: "Tirar Foto" })}
            </Button>
            <Button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute("capture");
                  fileInputRef.current.click();
                }
              }}
              disabled={isProcessing}
              className="flex-1"
              variant="outline"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              {translate({ en: "Import Gallery", pt: "Importar Galeria" })}
            </Button>
          </>
        )}
      </div>

      {/* Lista de Rascunhos */}
      {pendingList.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                {translate({ 
                  en: `Pending Approval (${pendingList.length})`, 
                  pt: `Pendentes de Aprovação (${pendingList.length})` 
                })}
              </CardTitle>
              <Button
                size="sm"
                onClick={handleApproveAll}
                disabled={isProcessing}
                className="bg-primary hover:bg-primary/90"
              >
                <Check className="w-4 h-4 mr-1" />
                {translate({ en: "Approve All", pt: "Aprovar Todos" })}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {pendingList.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {item.establishment}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", getCategoryColor(item.category))}>
                        {item.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{formatCurrency(item.amount)}</span>
                      <span>•</span>
                      <span>{new Date(item.date).toLocaleDateString("pt-BR")}</span>
                      {item.confidence < 0.7 && (
                        <span className="text-yellow-600">⚠️ {translate({ en: "Low confidence", pt: "Baixa confiança" })}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeFromQueue(item.id)}
                  >
                    <Trash2 className="w-4 h-4" />
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
