
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentMethodIcon } from "@/components/icons";
import { Edit, Trash2, PlusCircle } from "lucide-react";
import { PAYMENT_METHODS, getPaymentMethodDisplayLabel, type PaymentMethod, type CustomPaymentMethodData, type DisplayPaymentMethod, type UserPreferences } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';

export default function ManagePaymentMethodsPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [displayPaymentMethods, setDisplayPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserPaymentMethods = useCallback(async () => {
    if (!user) {
      // Default to predefined if no user, though page should be protected
      setDisplayPaymentMethods([...PAYMENT_METHODS]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const preferencesDocSnap = await getDoc(preferencesDocRef);

      let effectiveMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS]; // Start with predefined

      if (preferencesDocSnap.exists()) {
        const preferencesData = preferencesDocSnap.data() as UserPreferences;
        const customMethods = preferencesData.userDefinedPaymentMethods || [];
        
        // Add custom methods, ensuring labels are present
        const allCustomMethods: DisplayPaymentMethod[] = customMethods.map(cm => ({
            name: cm.name,
            icon: cm.icon,
            label: cm.label || { en: cm.name, pt: cm.name } // Fallback label
        }));

        // Combine and avoid duplicates by name (case-insensitive for robustness)
        const methodNames = new Set(effectiveMethods.map(m => m.name.toLowerCase()));
        allCustomMethods.forEach(customMethod => {
            if (!methodNames.has(customMethod.name.toLowerCase())) {
                effectiveMethods.push(customMethod);
                methodNames.add(customMethod.name.toLowerCase());
            }
        });
      }
      // If preferencesData.selectedPaymentMethods exists and is not empty,
      // you could filter `effectiveMethods` here based on that selection.
      // For now, we show all predefined + all custom defined.
      
      setDisplayPaymentMethods(effectiveMethods);

    } catch (error) {
      console.error("Error fetching user payment methods:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your payment methods.", pt: "Não foi possível carregar seus métodos de pagamento." }),
        variant: "destructive",
      });
      setDisplayPaymentMethods([...PAYMENT_METHODS]); // Fallback on error
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchUserPaymentMethods();
    } else if (!authLoading && !user) {
      setIsLoading(false);
      setDisplayPaymentMethods([...PAYMENT_METHODS]); // Show defaults if not logged in
    }
  }, [user, authLoading, fetchUserPaymentMethods]);


  const handleActionPlaceholder = (actionName: string, methodName: string) => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${actionName} ${translate({ en: "for", pt: "para" })} ${methodName} ${translate({ en: "is coming soon.", pt: "está chegando em breve."})}`,
    });
  };
  
  const handleAddNewMethod = () => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: translate({ en: "Adding new payment methods will be available soon.", pt: "Adicionar novos métodos de pagamento estará disponível em breve."}),
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Manage Payment Methods", pt: "Gerenciar Métodos de Pagamento" })}
          </h1>
          <Button onClick={handleAddNewMethod} variant="outline" className="w-full sm:w-auto">
            <PlusCircle className="mr-2 h-4 w-4" />
            {translate({ en: "Add New Method", pt: "Adicionar Novo Método" })}
          </Button>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Your Payment Methods", pt: "Seus Métodos de Pagamento" })}</CardTitle>
            <CardDescription>
              {translate({ en: "A list of all your configured payment methods.", pt: "Uma lista de todos os seus métodos de pagamento configurados." })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <React.Fragment key={`skeleton-pm-${i}`}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-6 w-6 rounded" />
                        <Skeleton className="h-5 w-32" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                      </div>
                    </div>
                    {i < 2 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : displayPaymentMethods.length > 0 ? (
              <div className="space-y-4">
                {displayPaymentMethods.map((method, index) => (
                  <React.Fragment key={method.name as string}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <PaymentMethodIcon iconName={method.icon} className="h-6 w-6 text-muted-foreground" />
                        <span className="font-medium">
                          {getPaymentMethodDisplayLabel(method, language)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Edit", pt: "Editar"}), getPaymentMethodDisplayLabel(method, language))}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Delete", pt: "Excluir"}), getPaymentMethodDisplayLabel(method, language))}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {index < displayPaymentMethods.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No payment methods configured yet.", pt: "Nenhum método de pagamento configurado ainda." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
