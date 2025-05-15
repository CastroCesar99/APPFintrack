
"use client";

import React from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentMethodIcon } from "@/components/icons";
import { Edit, Trash2, PlusCircle } from "lucide-react";
import { PAYMENT_METHODS, getPaymentMethodLabel, type PaymentMethod } from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';

export default function ManagePaymentMethodsPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();

  // For now, we use the static list. Later, this would come from user's Firestore data.
  const userPaymentMethods: PaymentMethod[] = [...PAYMENT_METHODS];

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
          <Button onClick={handleAddNewMethod} className="w-full sm:w-auto">
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
            {userPaymentMethods.length > 0 ? (
              <div className="space-y-4">
                {userPaymentMethods.map((method, index) => (
                  <React.Fragment key={method.name as string}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <PaymentMethodIcon iconName={method.icon} className="h-6 w-6 text-muted-foreground" />
                        <span className="font-medium">
                          {getPaymentMethodLabel(method.name, language)}
                          {method.isDefault && ` (${translate({en: "Default", pt: "Padrão"})})`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Edit", pt: "Editar"}), getPaymentMethodLabel(method.name, language))}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getPaymentMethodLabel(method.name, language)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleActionPlaceholder(translate({en:"Delete", pt: "Excluir"}), getPaymentMethodLabel(method.name, language))}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getPaymentMethodLabel(method.name, language)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {index < userPaymentMethods.length - 1 && <Separator />}
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
