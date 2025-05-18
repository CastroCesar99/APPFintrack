
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentMethodIcon, getSelectableIcons, iconNameToComponentMap } from "@/components/icons"; 
import { Edit, Trash2, PlusCircle, CircleHelp } from "lucide-react";
import {
  PAYMENT_METHODS,
  getPaymentMethodDisplayLabel,
  type CustomPaymentMethodData,
  type DisplayPaymentMethod,
  type UserPreferences,
  type PaymentMethodName,
} from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const selectableIcons = getSelectableIcons();

const paymentMethodFormSchema = z.object({
  methodName: z.string().min(1, { message: "Nome do método é obrigatório." }),
  selectedIcon: z.string().min(1, { message: "Ícone é obrigatório." }),
});
type PaymentMethodFormValues = z.infer<typeof paymentMethodFormSchema>;


export default function ManagePaymentMethodsPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [displayPaymentMethods, setDisplayPaymentMethods] = useState<DisplayPaymentMethod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [methodToEdit, setMethodToEdit] = useState<DisplayPaymentMethod | null>(null);
  const [originalMethodName, setOriginalMethodName] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<DisplayPaymentMethod | null>(null);

  const addMethodForm = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodFormSchema),
    defaultValues: {
      methodName: "",
      selectedIcon: selectableIcons.find(icon => icon.value === 'Wallet')?.value || selectableIcons[0]?.value || '',
    },
  });

  const editMethodForm = useForm<PaymentMethodFormValues>({
    resolver: zodResolver(paymentMethodFormSchema),
    defaultValues: {
      methodName: "",
      selectedIcon: "",
    },
  });

  const isTrulyPredefinedMethod = useCallback((methodName: string): boolean => {
    return PAYMENT_METHODS.some(pm => pm.name.toLowerCase() === methodName.toLowerCase());
  }, []);


  const fetchUserPaymentMethods = useCallback(async () => {
    if (!user) {
      setDisplayPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const preferencesDocSnap = await getDoc(preferencesDocRef);
      
      let effectiveMethods: DisplayPaymentMethod[] = [];
      const deselectedPredefinedNames: string[] = [];

      if (preferencesDocSnap.exists()) {
        const prefsData = preferencesDocSnap.data() as UserPreferences;
        (prefsData.deselectedPredefinedPaymentMethods || []).forEach(name => deselectedPredefinedNames.push(name.toLowerCase()));

        effectiveMethods = PAYMENT_METHODS.filter(
          predefMethod => !deselectedPredefinedNames.includes(predefMethod.name.toLowerCase())
        );
        
        const customMethods = prefsData.userDefinedPaymentMethods || [];
        const customMethodsMap = new Map<string, CustomPaymentMethodData>();
        customMethods.forEach(cm => customMethodsMap.set(cm.name.toLowerCase(), cm));

        effectiveMethods = effectiveMethods.map(meth => {
          const customOverride = customMethodsMap.get(meth.name.toLowerCase());
          if (customOverride) {
            customMethodsMap.delete(meth.name.toLowerCase()); 
            return customOverride;
          }
          return meth;
        });
        customMethodsMap.forEach(customMeth => effectiveMethods.push(customMeth));

      } else {
        effectiveMethods = [...PAYMENT_METHODS];
      }
      
      setDisplayPaymentMethods(effectiveMethods.sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));

    } catch (error) {
      console.error("Error fetching user payment methods:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your payment methods.", pt: "Não foi possível carregar seus métodos de pagamento." }),
        variant: "destructive",
      });
      setDisplayPaymentMethods([...PAYMENT_METHODS].sort((a,b) => getPaymentMethodDisplayLabel(a,language).localeCompare(getPaymentMethodDisplayLabel(b,language))));
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate, language]);

  useEffect(() => {
    if (!authLoading) { 
      fetchUserPaymentMethods();
    }
  }, [user, authLoading, fetchUserPaymentMethods]);

  const handleAddMethodSubmit: SubmitHandler<PaymentMethodFormValues> = async (data) => {
    if (!user) {
      toast({ title: translate({ en: "Authentication Error", pt: "Erro de Autenticação" }), description: translate({ en: "You must be logged in.", pt: "Você precisa estar logado." }), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const newMethodName = data.methodName.trim();
    const newMethodIcon = data.selectedIcon;

    const isDuplicate = displayPaymentMethods.some(
      (pm) => (getPaymentMethodDisplayLabel(pm, language).toLowerCase() === newMethodName.toLowerCase() || pm.name.toLowerCase() === newMethodName.toLowerCase())
    );
    if (isDuplicate) {
      toast({ title: translate({ en: "Duplicate Method", pt: "Método Duplicado" }), description: translate({ en: "This payment method name already exists.", pt: "Este nome de método de pagamento já existe." }), variant: "destructive" });
      setIsSaving(false);
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
      let currentDeselectedPredefined = prefsSnap.exists() ? (prefsSnap.data() as UserPreferences).deselectedPredefinedPaymentMethods || [] : [];
      currentDeselectedPredefined = currentDeselectedPredefined.filter(dn => dn.toLowerCase() !== newCustomMethod.name.toLowerCase());

      if (prefsSnap.exists()) {
        await updateDoc(preferencesDocRef, {
          userDefinedPaymentMethods: arrayUnion(newCustomMethod),
          selectedPaymentMethods: arrayUnion(newCustomMethod.name),
          deselectedPredefinedPaymentMethods: currentDeselectedPredefined,
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(preferencesDocRef, {
          userDefinedPaymentMethods: [newCustomMethod],
          selectedPaymentMethods: [newCustomMethod.name],
          deselectedPredefinedPaymentMethods: [],
          selectedCategories: CATEGORIES.map(c => c.name), 
          userDefinedCategories: [],
          language: language, 
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserPaymentMethods(); 
      toast({ title: translate({ en: "Method Added", pt: "Método Adicionado" }), description: `${getPaymentMethodDisplayLabel(newCustomMethod, language)} ${translate({ en: "has been added.", pt: "foi adicionado." })}` });
      addMethodForm.reset({
        methodName: "",
        selectedIcon: selectableIcons.find(icon => icon.value === 'Wallet')?.value || selectableIcons[0]?.value || '',
      });
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding custom payment method:", error);
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not add payment method.", pt: "Não foi possível adicionar o método de pagamento." }), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditDialog = (method: DisplayPaymentMethod) => {
    setMethodToEdit(method);
    setOriginalMethodName(method.name as string); 
    editMethodForm.reset({
        methodName: getPaymentMethodDisplayLabel(method, language),
        selectedIcon: method.icon
    });
    setIsEditDialogOpen(true);
  };

  const handleEditMethodSubmit: SubmitHandler<PaymentMethodFormValues> = async (data) => {
    if (!user || !methodToEdit || !originalMethodName) {
        toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Method to edit not found.", pt: "Método para editar não encontrado." }), variant: "destructive" });
        return;
    }
    setIsSaving(true);
    const updatedMethodDisplayName = data.methodName.trim();
    const updatedIcon = data.selectedIcon;
    
    let newInternalName = originalMethodName;
    if (getPaymentMethodDisplayLabel(methodToEdit, language).toLowerCase() !== updatedMethodDisplayName.toLowerCase()) {
        newInternalName = updatedMethodDisplayName;
    }

    const isDuplicate = displayPaymentMethods.some(
      (meth) => (meth.name.toLowerCase() === newInternalName.toLowerCase()) && meth.name.toLowerCase() !== originalMethodName.toLowerCase()
    );
    if (isDuplicate) {
        toast({ title: translate({ en: "Duplicate Method", pt: "Método Duplicado" }), description: translate({ en: "Another method with this name already exists.", pt: "Outro método com este nome já existe." }), variant: "destructive" });
        setIsSaving(false);
        return;
    }

    const updatedMethodData: CustomPaymentMethodData = {
        name: newInternalName,
        icon: updatedIcon,
        label: { en: updatedMethodDisplayName, pt: updatedMethodDisplayName }, 
    };

    try {
        const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
        const prefsSnap = await getDoc(preferencesDocRef);

        if (prefsSnap.exists()) {
            const preferencesData = prefsSnap.data() as UserPreferences;
            let currentCustomMethods = preferencesData.userDefinedPaymentMethods || [];
            let currentSelectedMethods = preferencesData.selectedPaymentMethods || [];
            let currentDeselectedPredefined = preferencesData.deselectedPredefinedPaymentMethods || [];

            currentCustomMethods = currentCustomMethods.filter(meth => meth.name.toLowerCase() !== originalMethodName.toLowerCase());
            currentCustomMethods.push(updatedMethodData);

            if (originalMethodName.toLowerCase() !== newInternalName.toLowerCase()) {
                currentSelectedMethods = currentSelectedMethods.filter(name => name.toLowerCase() !== originalMethodName.toLowerCase());
                 if (!currentSelectedMethods.map(n=>n.toLowerCase()).includes(newInternalName.toLowerCase())) {
                    currentSelectedMethods.push(newInternalName);
                }
            } else if (!currentSelectedMethods.map(n=>n.toLowerCase()).includes(newInternalName.toLowerCase())) {
                currentSelectedMethods.push(newInternalName);
            }
            currentSelectedMethods = Array.from(new Set(currentSelectedMethods));
            
            currentDeselectedPredefined = currentDeselectedPredefined.filter(dn => dn.toLowerCase() !== originalMethodName.toLowerCase() && dn.toLowerCase() !== newInternalName.toLowerCase());


            await updateDoc(preferencesDocRef, {
                userDefinedPaymentMethods: currentCustomMethods,
                selectedPaymentMethods: currentSelectedMethods,
                deselectedPredefinedPaymentMethods: currentDeselectedPredefined,
                updatedAt: serverTimestamp()
            });

            await fetchUserPaymentMethods(); 
            toast({ title: translate({ en: "Method Updated", pt: "Método Atualizado" }), description: `${getPaymentMethodDisplayLabel(updatedMethodData, language)} ${translate({ en: "has been updated.", pt: "foi atualizado." })}` });
            setIsEditDialogOpen(false);
            setMethodToEdit(null);
            setOriginalMethodName(null);
        } else {
            // This case should ideally not happen if user has any preferences
             await setDoc(preferencesDocRef, {
                userDefinedPaymentMethods: [updatedMethodData],
                selectedPaymentMethods: [updatedMethodData.name],
                deselectedPredefinedPaymentMethods: [],
                selectedCategories: CATEGORIES.map(c => c.name),
                userDefinedCategories: [],
                language: language,
                updatedAt: serverTimestamp()
            });
            console.warn("ManagePaymentMethodsPage: Preferences doc didn't exist during edit, created it.");
            await fetchUserPaymentMethods();
            toast({ title: translate({ en: "Method Updated", pt: "Método Atualizado" }) });
            setIsEditDialogOpen(false);
        }
    } catch (error) {
        console.error("Error updating payment method:", error);
        toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not update payment method.", pt: "Não foi possível atualizar o método de pagamento." }), variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };
  
  const openDeleteConfirmation = (method: DisplayPaymentMethod) => {
    setMethodToDelete(method);
  };

  const handleDeleteMethod = async () => {
    if (!user || !methodToDelete) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Method not found or user not authenticated.", pt: "Método não encontrado ou usuário não autenticado." }), variant: "destructive" });
      setMethodToDelete(null);
      return;
    }
    setIsSaving(true); 
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);
      if (prefsSnap.exists()) {
        const currentPrefs = prefsSnap.data() as UserPreferences;
        let updatedUserDefined = currentPrefs.userDefinedPaymentMethods || [];
        let updatedSelected = currentPrefs.selectedPaymentMethods || [];
        let updatedDeselectedPredefined = currentPrefs.deselectedPredefinedPaymentMethods || [];

        const methodInternalName = methodToDelete.name as string;
        const wasOriginallyPredefined = isTrulyPredefinedMethod(methodInternalName);
        const isAlsoInCustom = updatedUserDefined.some(meth => meth.name.toLowerCase() === methodInternalName.toLowerCase());

        if (isAlsoInCustom) { 
          updatedUserDefined = updatedUserDefined.filter(
            meth => meth.name.toLowerCase() !== methodInternalName.toLowerCase()
          );
        } else if (wasOriginallyPredefined) { 
          if (!updatedDeselectedPredefined.map(n=>n.toLowerCase()).includes(methodInternalName.toLowerCase())) {
            updatedDeselectedPredefined.push(methodInternalName);
          }
        }
        
        updatedSelected = updatedSelected.filter(
          name => name.toLowerCase() !== methodInternalName.toLowerCase()
        );

        await updateDoc(preferencesDocRef, {
          userDefinedPaymentMethods: updatedUserDefined,
          selectedPaymentMethods: updatedSelected,
          deselectedPredefinedPaymentMethods: updatedDeselectedPredefined,
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserPaymentMethods(); 
      toast({ title: translate({ en: "Method Action Complete", pt: "Ação do Método Concluída" }), description: `${getPaymentMethodDisplayLabel(methodToDelete, language)} ${translate({ en: "has been processed.", pt: "foi processado." })}` });
    } catch (error) {
      console.error("Error processing payment method action:", error);
      toast({ title: translate({ en: "Error Processing Action", pt: "Erro ao Processar Ação" }), description: translate({ en: "Could not complete the action for the method.", pt: "Não foi possível concluir a ação para o método." }), variant: "destructive" });
    } finally {
      setIsSaving(false);
      setMethodToDelete(null);
    }
  };

  const renderMethodForm = (formInstance: typeof addMethodForm | typeof editMethodForm, onSubmitHandler: SubmitHandler<PaymentMethodFormValues>, dialogType: "add" | "edit") => {
    const dialogTitle = dialogType === "add" 
        ? translate({ en: "Add New Payment Method", pt: "Adicionar Novo Método de Pagamento" })
        : translate({ en: "Edit Payment Method", pt: "Editar Método de Pagamento" });
    const dialogDescription = dialogType === "add"
        ? translate({ en: "Enter the name and choose an icon for your new payment method.", pt: "Digite o nome e escolha um ícone para o seu novo método de pagamento." })
        : translate({ en: "Update the name or icon of the payment method.", pt: "Atualize o nome ou ícone do método de pagamento." });
    const submitButtonText = dialogType === "add" 
        ? (isSaving ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Method", pt: "Adicionar Método" }))
        : (isSaving ? translate({ en: "Saving...", pt: "Salvando..." }) : translate({ en: "Save Changes", pt: "Salvar Alterações" }));

    return (
        <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>{dialogTitle}</DialogTitle>
                <DialogDescription>{dialogDescription}</DialogDescription>
            </DialogHeader>
            <Form {...formInstance}>
                <form onSubmit={formInstance.handleSubmit(onSubmitHandler)} className="space-y-4 py-4">
                <FormField
                    control={formInstance.control}
                    name="methodName"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>
                        {translate({ en: "Method Name", pt: "Nome do Método" })}
                        </FormLabel>
                        <FormControl>
                        <Input
                            placeholder={translate({ en: "e.g., My Bank Card", pt: "ex: Cartão Meu Banco"})}
                            {...field}
                        />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={formInstance.control}
                    name="selectedIcon"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>
                           {translate({ en: "Icon", pt: "Ícone" })}
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className="w-full">
                             <SelectValue>
                                {field.value ? (
                                  (() => {
                                    const foundIconOption = selectableIcons.find(i => i.value === field.value);
                                    const IconComp = foundIconOption ? foundIconOption.iconComponent : CircleHelp;
                                    const labelText = foundIconOption ? translate(foundIconOption.label) : field.value;
                                    return (
                                      <div className="flex items-center gap-2">
                                        <IconComp className="h-4 w-4 text-muted-foreground" />
                                        <span>{labelText}</span>
                                      </div>
                                    );
                                  })()
                                ) : (
                                  translate({ en: "Select an icon", pt: "Selecione um ícone" })
                                )}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {selectableIcons.map(iconOption => (
                              <SelectItem key={iconOption.value} value={iconOption.value}>
                                <div className="flex items-center gap-2">
                                  <iconOption.iconComponent className="h-4 w-4 text-muted-foreground" />
                                  <span>{translate(iconOption.label)}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <DialogFooter>
                    <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSaving}>
                        {translate({ en: "Cancel", pt: "Cancelar"})}
                    </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSaving}>
                    {submitButtonText}
                    </Button>
                </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    );
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Manage Payment Methods", pt: "Gerenciar Métodos de Pagamento" })}
          </h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Method", pt: "Adicionar Novo Método" })}
              </Button>
            </DialogTrigger>
            {renderMethodForm(addMethodForm, handleAddMethodSubmit, "add")}
          </Dialog>
        </div>
        
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
                setMethodToEdit(null);
                setOriginalMethodName(null);
            }
        }}>
            {methodToEdit && renderMethodForm(editMethodForm, handleEditMethodSubmit, "edit")}
        </Dialog>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Your Payment Methods", pt: "Seus Métodos de Pagamento" })}</CardTitle>
            <CardDescription>
              {translate({ en: "A list of all your payment methods.", pt: "Uma lista de todos os seus métodos de pagamento." })}
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
              <div className="space-y-1">
                {displayPaymentMethods.map((method, index) => (
                  <React.Fragment key={method.name as string}>
                    <div className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-md px-2 -mx-2">
                      <div className="flex items-center gap-3">
                        <PaymentMethodIcon iconName={method.icon} className="h-6 w-6 text-muted-foreground" />
                        <span className="font-medium">
                          {getPaymentMethodDisplayLabel(method, language)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleOpenEditDialog(method)}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                          disabled={isSaving} 
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openDeleteConfirmation(method)}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getPaymentMethodDisplayLabel(method, language)}
                          disabled={isSaving}
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
                {translate({ en: "No payment methods configured yet. Add some using the button above!", pt: "Nenhum método de pagamento configurado ainda. Adicione alguns usando o botão acima!" })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {methodToDelete && (
        <AlertDialog open={!!methodToDelete} onOpenChange={(open) => !open && setMethodToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Action", pt: "Confirmar Ação"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to process this action for method:", pt: "Tem certeza que deseja processar esta ação para o método:"})}{" "}
                <strong>{getPaymentMethodDisplayLabel(methodToDelete, language)}</strong>?{" "}
                {isTrulyPredefinedMethod(methodToDelete.name as string) && !displayPaymentMethods.find(m => m.name === methodToDelete.name && !(PAYMENT_METHODS as ReadonlyArray<DisplayPaymentMethod>).includes(m))
                  ? translate({en: "This is a predefined method. Deleting it will hide it from selection. Editing it will create a custom version.", pt: "Este é um método pré-definido. Excluí-lo irá ocultá-lo da seleção. Editá-lo criará uma versão personalizada."})
                  : translate({en: "This action might affect existing transactions if the name changes.", pt: "Esta ação pode afetar transações existentes se o nome mudar."})
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setMethodToDelete(null)} disabled={isSaving}>
                {translate({en: "Cancel", pt: "Cancelar"})}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteMethod} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSaving ? translate({en:"Processing...", pt: "Processando..."}) : translate({en: "Confirm", pt: "Confirmar"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}

    