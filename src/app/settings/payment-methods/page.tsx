
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentMethodIcon, getSelectableIcons, iconNameToComponentMap } from "@/components/icons"; 
import { Edit, Trash2, PlusCircle } from "lucide-react";
import {
  PAYMENT_METHODS,
  getPaymentMethodDisplayLabel,
  type PaymentMethod,
  type CustomPaymentMethodData,
  type DisplayPaymentMethod,
  type UserPreferences,
} from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, arrayRemove, arrayUnion } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const selectableIcons = getSelectableIcons();

const addMethodFormSchema = z.object({
  newMethodName: z.string().min(1, { message: "Nome do método é obrigatório." }),
  selectedNewMethodIcon: z.string().min(1, { message: "Ícone é obrigatório." }),
});
type AddMethodFormValues = z.infer<typeof addMethodFormSchema>;

export default function ManagePaymentMethodsPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [displayPaymentMethods, setDisplayPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSavingMethod, setIsSavingMethod] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<DisplayPaymentMethod | null>(null);

  const addMethodForm = useForm<AddMethodFormValues>({
    resolver: zodResolver(addMethodFormSchema),
    defaultValues: {
      newMethodName: "",
      selectedNewMethodIcon: selectableIcons.find(icon => icon.value === 'Wallet')?.value || selectableIcons[0]?.value || '',
    },
  });

  const fetchUserPaymentMethods = useCallback(async () => {
    if (!user) {
      setDisplayPaymentMethods([...PAYMENT_METHODS].sort((a, b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const preferencesDocSnap = await getDoc(preferencesDocRef);

      let effectiveMethods: DisplayPaymentMethod[] = [...PAYMENT_METHODS];

      if (preferencesDocSnap.exists()) {
        const preferencesData = preferencesDocSnap.data() as UserPreferences;
        const customMethods = preferencesData.userDefinedPaymentMethods || [];
        
        const allCustomMethods: DisplayPaymentMethod[] = customMethods.map(cm => ({
            name: cm.name,
            icon: cm.icon,
            label: cm.label || { en: cm.name, pt: cm.name } 
        }));

        const methodNames = new Set(effectiveMethods.map(m => m.name.toLowerCase()));
        allCustomMethods.forEach(customMethod => {
            if (!methodNames.has(customMethod.name.toLowerCase())) {
                effectiveMethods.push(customMethod);
                methodNames.add(customMethod.name.toLowerCase());
            }
        });
      }
      setDisplayPaymentMethods(effectiveMethods.sort((a, b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language))));

    } catch (error) {
      console.error("Error fetching user payment methods:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your payment methods.", pt: "Não foi possível carregar seus métodos de pagamento." }),
        variant: "destructive",
      });
      setDisplayPaymentMethods([...PAYMENT_METHODS].sort((a, b) => getPaymentMethodDisplayLabel(a, language).localeCompare(getPaymentMethodDisplayLabel(b, language)))); 
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate, language]);

  useEffect(() => {
    if (!authLoading) {
      fetchUserPaymentMethods();
    }
  }, [user, authLoading, fetchUserPaymentMethods]);

  const handleAddPaymentMethod: SubmitHandler<AddMethodFormValues> = async (data) => {
    if (!user) {
      toast({ title: translate({ en: "Authentication Error", pt: "Erro de Autenticação" }), description: translate({ en: "You must be logged in to add payment methods.", pt: "Você precisa estar logado para adicionar métodos de pagamento." }), variant: "destructive" });
      return;
    }
    setIsSavingMethod(true);
    const newMethodName = data.newMethodName.trim();
    const newMethodIcon = data.selectedNewMethodIcon;

    const isDuplicate = displayPaymentMethods.some(
      (pm) => pm.name.toLowerCase() === newMethodName.toLowerCase()
    );

    if (isDuplicate) {
      toast({ title: translate({ en: "Duplicate Method", pt: "Método Duplicado" }), description: translate({ en: "This payment method already exists.", pt: "Este método de pagamento já existe." }), variant: "destructive" });
      setIsSavingMethod(false);
      return;
    }

    const newCustomMethod: CustomPaymentMethodData = {
      name: newMethodName,
      icon: newMethodIcon,
      label: { en: newMethodName, pt: newMethodName }, 
    };

    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);

      if (prefsSnap.exists()) {
        await updateDoc(preferencesDocRef, {
          userDefinedPaymentMethods: arrayUnion(newCustomMethod),
          selectedPaymentMethods: arrayUnion(newCustomMethod.name), // Also add to selected
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(preferencesDocRef, {
          userDefinedPaymentMethods: [newCustomMethod],
          selectedPaymentMethods: [newCustomMethod.name], 
          selectedCategories: [], 
          userDefinedCategories: [],
          language: language,
          updatedAt: serverTimestamp()
        });
      }
      // Optimistically update UI or refetch
      fetchUserPaymentMethods(); 
      toast({ title: translate({ en: "Method Added", pt: "Método Adicionado" }), description: `${newMethodName} ${translate({ en: "has been added.", pt: "foi adicionado." })}` });
      addMethodForm.reset();
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding custom payment method:", error);
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not add payment method.", pt: "Não foi possível adicionar o método de pagamento." }), variant: "destructive" });
    } finally {
      setIsSavingMethod(false);
    }
  };

  const isPredefinedMethod = (methodName: string) => {
    return PAYMENT_METHODS.some(pm => pm.name === methodName);
  };

  const openDeleteConfirmation = (method: DisplayPaymentMethod) => {
    if (isPredefinedMethod(method.name)) {
      toast({
        title: translate({ en: "Cannot Delete", pt: "Não Pode Excluir" }),
        description: translate({ en: "Predefined payment methods cannot be deleted.", pt: "Métodos de pagamento pré-definidos não podem ser excluídos." }),
        variant: "destructive"
      });
      return;
    }
    setMethodToDelete(method);
  };

  const handleDeleteMethod = async () => {
    if (!user || !methodToDelete || isPredefinedMethod(methodToDelete.name)) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Method not found, user not authenticated, or trying to delete a predefined method.", pt: "Método não encontrado, usuário não autenticado, ou tentativa de excluir método pré-definido." }), variant: "destructive" });
      setMethodToDelete(null);
      return;
    }

    setIsSavingMethod(true); // Reuse for delete operation loading state
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      
      // To remove an item from an array, Firestore needs the exact object or value.
      // If newCustomMethod stored objects, we need to find the exact one.
      // It's often easier to read, modify, and set the array.
      const prefsSnap = await getDoc(preferencesDocRef);
      if (prefsSnap.exists()) {
        const currentPrefs = prefsSnap.data() as UserPreferences;
        const updatedUserDefinedMethods = (currentPrefs.userDefinedPaymentMethods || []).filter(
          pm => pm.name !== methodToDelete.name
        );
        const updatedSelectedMethods = (currentPrefs.selectedPaymentMethods || []).filter(
          name => name !== methodToDelete.name
        );

        await updateDoc(preferencesDocRef, {
          userDefinedPaymentMethods: updatedUserDefinedMethods,
          selectedPaymentMethods: updatedSelectedMethods,
          updatedAt: serverTimestamp()
        });
      }
      
      // Optimistically update UI or refetch
      fetchUserPaymentMethods();
      toast({ title: translate({ en: "Method Deleted", pt: "Método Excluído" }), description: `${getPaymentMethodDisplayLabel(methodToDelete, language)} ${translate({ en: "has been deleted.", pt: "foi excluído." })}` });
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast({ title: translate({ en: "Error Deleting Method", pt: "Erro ao Excluir Método" }), description: translate({ en: "Could not delete the payment method.", pt: "Não foi possível excluir o método de pagamento." }), variant: "destructive" });
    } finally {
      setIsSavingMethod(false);
      setMethodToDelete(null);
    }
  };

  const handleEditPlaceholder = (methodName: string) => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${translate({ en: "Editing", pt: "Editar" })} ${methodName} ${translate({ en: "is coming soon.", pt: "está chegando em breve."})}`,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4 sm:mb-0">
            {translate({ en: "Manage Payment Methods", pt: "Gerenciar Métodos de Pagamento" })}
          </h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Method", pt: "Adicionar Novo Método" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "Add New Payment Method", pt: "Adicionar Novo Método de Pagamento" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Enter the name and choose an icon for your new payment method.", pt: "Digite o nome e escolha um ícone para o seu novo método de pagamento." })}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={addMethodForm.handleSubmit(handleAddPaymentMethod)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="newMethodName" className="text-right">
                    {translate({ en: "Method Name", pt: "Nome do Método" })}
                  </Label>
                  <Input
                    id="newMethodName"
                    {...addMethodForm.register("newMethodName")}
                    className="mt-1"
                    placeholder={translate({ en: "e.g., My Bank Card", pt: "ex: Cartão Meu Banco"})}
                  />
                  {addMethodForm.formState.errors.newMethodName && (
                    <p className="text-sm text-destructive mt-1">{addMethodForm.formState.errors.newMethodName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="selectedNewMethodIcon" className="text-right">
                     {translate({ en: "Icon", pt: "Ícone" })}
                  </Label>
                  <Controller
                    control={addMethodForm.control}
                    name="selectedNewMethodIcon"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder={translate({ en: "Select an icon", pt: "Selecione um ícone" })}>
                            {field.value && iconNameToComponentMap[field.value] ? (
                              <div className="flex items-center gap-2">
                                <PaymentMethodIcon iconName={field.value} className="h-4 w-4" />
                                <span>{selectableIcons.find(i => i.value === field.value)?.label || field.value}</span>
                              </div>
                            ) : (translate({ en: "Select an icon", pt: "Selecione um ícone" }))}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {selectableIcons.map(iconOption => (
                            <SelectItem key={iconOption.value} value={iconOption.value}>
                              <div className="flex items-center gap-2">
                                <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                                <span>{iconOption.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {addMethodForm.formState.errors.selectedNewMethodIcon && (
                    <p className="text-sm text-destructive mt-1">{addMethodForm.formState.errors.selectedNewMethodIcon.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSavingMethod}>
                       {translate({ en: "Cancel", pt: "Cancelar"})}
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSavingMethod}>
                    {isSavingMethod ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Method", pt: "Adicionar Método" })}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                          onClick={() => handleEditPlaceholder(getPaymentMethodDisplayLabel(method, language))}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openDeleteConfirmation(method)}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                          disabled={isPredefinedMethod(method.name)}
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
      {methodToDelete && (
        <AlertDialog open={!!methodToDelete} onOpenChange={(open) => !open && setMethodToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Deletion", pt: "Confirmar Exclusão"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to delete the payment method:", pt: "Tem certeza que deseja excluir o método de pagamento:"})}{" "}
                <strong>{getPaymentMethodDisplayLabel(methodToDelete, language)}</strong>?{" "}
                {translate({en: "This action cannot be undone.", pt: "Esta ação não pode ser desfeita."})}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMethodToDelete(null)} disabled={isSavingMethod}>
                {translate({en: "Cancel", pt: "Cancelar"})}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteMethod} disabled={isSavingMethod} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSavingMethod ? translate({en:"Deleting...", pt: "Excluindo..."}) : translate({en: "Delete", pt: "Excluir"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}
