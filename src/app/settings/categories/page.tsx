
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CategoryIcon, getSelectableIcons, iconNameToComponentMap } from "@/components/icons";
import { Edit, Trash2, PlusCircle, TrendingUp, TrendingDown, CircleHelp, type LucideIcon } from "lucide-react";
import {
  CATEGORIES,
  getCategoryDisplayLabel,
  type Category,
  type CustomCategoryData,
  type DisplayCategory,
  type TransactionType,
  type UserPreferences,
  PAYMENT_METHODS, 
} from "@/types";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Skeleton } from '@/components/ui/skeleton';
import { useForm, type SubmitHandler, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormDescription as FormDesc, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const selectableIcons = getSelectableIcons();

const categoryFormSchema = z.object({
  categoryName: z.string().min(1, { message: "Nome da categoria é obrigatório." }),
  selectedIcon: z.string().min(1, { message: "Ícone é obrigatório." }),
  categoryType: z.enum(['income', 'expense'] as [TransactionType, ...TransactionType[]], {
    required_error: "Tipo da categoria é obrigatório."
  }),
});
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export default function ManageCategoriesPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [displayCategories, setDisplayCategories] = useState<DisplayCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<DisplayCategory | null>(null);
  const [originalCategoryName, setOriginalCategoryName] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<DisplayCategory | null>(null);

  const addCategoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      categoryName: "",
      selectedIcon: selectableIcons.find(icon => icon.value === 'CircleHelp')?.value || selectableIcons[0]?.value || '',
      categoryType: 'expense',
    },
  });

  const editCategoryForm = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      categoryName: "",
      selectedIcon: "",
      categoryType: 'expense',
    },
  });

  const fetchUserCategories = useCallback(async () => {
    if (!user) {
      const sortedPredefined = [...CATEGORIES].sort((a, b) => 
        getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))
      );
      setDisplayCategories(sortedPredefined);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const preferencesDocSnap = await getDoc(preferencesDocRef);
      
      let effectiveCategories: DisplayCategory[] = [...CATEGORIES];

      if (preferencesDocSnap.exists()) {
        const preferencesData = preferencesDocSnap.data() as UserPreferences;
        const customCategories = preferencesData.userDefinedCategories || [];
        
        const customCategoriesWithType: DisplayCategory[] = customCategories.map(cc => ({
            ...cc,
            type: cc.type || 'expense', 
            label: cc.label || { en: cc.name, pt: cc.name } 
        }));
        
        const categoryNames = new Set(effectiveCategories.map(cat => cat.name.toLowerCase()));
        customCategoriesWithType.forEach(customCat => {
            if (!categoryNames.has(customCat.name.toLowerCase())) {
                effectiveCategories.push(customCat);
                categoryNames.add(customCat.name.toLowerCase());
            }
        });
      }
      setDisplayCategories(effectiveCategories.sort((a,b) => getCategoryDisplayLabel(a,language).localeCompare(getCategoryDisplayLabel(b,language))));
    } catch (error) {
      console.error("Error fetching user categories:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your categories.", pt: "Não foi possível carregar suas categorias." }),
        variant: "destructive",
      });
      const sortedPredefinedOnError = [...CATEGORIES].sort((a, b) => 
        getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))
      );
      setDisplayCategories(sortedPredefinedOnError);
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate, language]);

  useEffect(() => {
    if (!authLoading) { 
      fetchUserCategories();
    }
  }, [user, authLoading, fetchUserCategories]);

  const isPredefinedCategory = useCallback((categoryName: string) => {
    return CATEGORIES.some(cat => cat.name === categoryName);
  }, []);

  const handleAddCategorySubmit: SubmitHandler<CategoryFormValues> = async (data) => {
    if (!user) {
      toast({ title: translate({ en: "Authentication Error", pt: "Erro de Autenticação" }), description: translate({ en: "You must be logged in.", pt: "Você precisa estar logado." }), variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const newCategoryName = data.categoryName.trim();
    const newCategoryIcon = data.selectedIcon;
    const newCategoryType = data.categoryType;

    const isDuplicate = displayCategories.some(
      (cat) => getCategoryDisplayLabel(cat, language).toLowerCase() === newCategoryName.toLowerCase() || cat.name.toLowerCase() === newCategoryName.toLowerCase()
    );
    if (isDuplicate) {
      toast({ title: translate({ en: "Duplicate Category", pt: "Categoria Duplicada" }), description: translate({ en: "This category already exists.", pt: "Esta categoria já existe." }), variant: "destructive" });
      setIsSaving(false);
      return;
    }

    const newCustomCategory: CustomCategoryData = {
      name: newCategoryName,
      icon: newCategoryIcon,
      type: newCategoryType,
      label: { en: newCategoryName, pt: newCategoryName }, 
    };

    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);

      if (prefsSnap.exists()) {
        await updateDoc(preferencesDocRef, {
          userDefinedCategories: arrayUnion(newCustomCategory),
          selectedCategories: arrayUnion(newCustomCategory.name), 
          updatedAt: serverTimestamp()
        });
      } else {
        await setDoc(preferencesDocRef, {
          userDefinedCategories: [newCustomCategory],
          selectedCategories: [newCustomCategory.name],
          selectedPaymentMethods: PAYMENT_METHODS.map(pm => pm.name), 
          userDefinedPaymentMethods: [],
          language: language, 
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserCategories(); 
      toast({ title: translate({ en: "Category Added", pt: "Categoria Adicionada" }), description: `${newCustomCategory.label[language]} ${translate({ en: "has been added.", pt: "foi adicionada." })}` });
      addCategoryForm.reset();
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding custom category:", error);
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not add category.", pt: "Não foi possível adicionar a categoria." }), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEditDialog = (category: DisplayCategory) => {
    if (isPredefinedCategory(category.name)) {
        toast({
            title: translate({ en: "Cannot Edit", pt: "Não Pode Editar" }),
            description: translate({ en: "Predefined categories cannot be edited.", pt: "Categorias pré-definidas não podem ser editadas." }),
            variant: "default"
        });
        return;
    }
    setCategoryToEdit(category);
    setOriginalCategoryName(category.name);
    editCategoryForm.reset({
        categoryName: category.name,
        selectedIcon: category.icon,
        categoryType: category.type
    });
    setIsEditDialogOpen(true);
  };

  const handleEditCategorySubmit: SubmitHandler<CategoryFormValues> = async (data) => {
    if (!user || !categoryToEdit || !originalCategoryName) {
        toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Category to edit not found.", pt: "Categoria para editar não encontrada." }), variant: "destructive" });
        return;
    }
    setIsSaving(true);
    const updatedCategoryName = data.categoryName.trim();
    const updatedIcon = data.selectedIcon;
    const updatedType = data.categoryType;

    // Check for duplicates, excluding the original name of the category being edited
    const isDuplicate = displayCategories.some(
        (cat) => (cat.name.toLowerCase() === updatedCategoryName.toLowerCase() || getCategoryDisplayLabel(cat, language).toLowerCase() === updatedCategoryName.toLowerCase()) && cat.name !== originalCategoryName
    );
    if (isDuplicate) {
        toast({ title: translate({ en: "Duplicate Category", pt: "Categoria Duplicada" }), description: translate({ en: "Another category with this name already exists.", pt: "Outra categoria com este nome já existe." }), variant: "destructive" });
        setIsSaving(false);
        return;
    }

    const updatedCustomCategory: CustomCategoryData = {
        name: updatedCategoryName,
        icon: updatedIcon,
        type: updatedType,
        label: { en: updatedCategoryName, pt: updatedCategoryName },
    };

    try {
        const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
        const prefsSnap = await getDoc(preferencesDocRef);

        if (prefsSnap.exists()) {
            const preferencesData = prefsSnap.data() as UserPreferences;
            const currentCustomCategories = preferencesData.userDefinedCategories || [];
            const currentSelectedCategories = preferencesData.selectedCategories || [];

            // Update userDefinedCategories
            const updatedUserDefined = currentCustomCategories.map(cat => 
                cat.name === originalCategoryName ? updatedCustomCategory : cat
            );

            // Update selectedCategories if name changed
            let updatedSelected = [...currentSelectedCategories];
            if (originalCategoryName !== updatedCategoryName) {
                const index = updatedSelected.indexOf(originalCategoryName);
                if (index > -1) {
                    updatedSelected.splice(index, 1, updatedCategoryName);
                } else {
                    // If original wasn't selected, but new one should be implicitly (or handle as per product logic)
                    // For simplicity, if user is editing it, let's assume they want it selected.
                    updatedSelected.push(updatedCategoryName); 
                }
                // Ensure no duplicates if original was not selected but new name matches an already selected one
                updatedSelected = Array.from(new Set(updatedSelected));
            }


            await updateDoc(preferencesDocRef, {
                userDefinedCategories: updatedUserDefined,
                selectedCategories: updatedSelected,
                updatedAt: serverTimestamp()
            });

            await fetchUserCategories();
            toast({ title: translate({ en: "Category Updated", pt: "Categoria Atualizada" }), description: `${updatedCustomCategory.label[language]} ${translate({ en: "has been updated.", pt: "foi atualizada." })}` });
            setIsEditDialogOpen(false);
            setCategoryToEdit(null);
            setOriginalCategoryName(null);
        } else {
            throw new Error("User preferences document not found.");
        }
    } catch (error) {
        console.error("Error updating custom category:", error);
        toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not update category.", pt: "Não foi possível atualizar a categoria." }), variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };


  const openDeleteConfirmation = (category: DisplayCategory) => {
    if (isPredefinedCategory(category.name)) {
      toast({
        title: translate({ en: "Cannot Delete", pt: "Não Pode Excluir" }),
        description: translate({ en: "Predefined categories cannot be deleted.", pt: "Categorias pré-definidas não podem ser excluídas." }),
        variant: "default"
      });
      return;
    }
    setCategoryToDelete(category);
  };

  const handleDeleteCategory = async () => {
    if (!user || !categoryToDelete || isPredefinedCategory(categoryToDelete.name)) {
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Category not found or cannot be deleted.", pt: "Categoria não encontrada ou não pode ser excluída." }), variant: "destructive" });
      setCategoryToDelete(null);
      return;
    }
    setIsSaving(true); 
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);
      if (prefsSnap.exists()) {
        const currentPrefs = prefsSnap.data() as UserPreferences;
        const updatedUserDefined = (currentPrefs.userDefinedCategories || []).filter(
          cat => cat.name !== categoryToDelete.name
        );
        const updatedSelected = (currentPrefs.selectedCategories || []).filter(
          name => name !== categoryToDelete.name
        );

        await updateDoc(preferencesDocRef, {
          userDefinedCategories: updatedUserDefined,
          selectedCategories: updatedSelected,
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserCategories(); 
      toast({ title: translate({ en: "Category Deleted", pt: "Categoria Excluída" }), description: `${getCategoryDisplayLabel(categoryToDelete, language)} ${translate({ en: "has been deleted.", pt: "foi excluída." })}` });
    } catch (error) {
      console.error("Error deleting category:", error);
      toast({ title: translate({ en: "Error Deleting Category", pt: "Erro ao Excluir Categoria" }), description: translate({ en: "Could not delete the category.", pt: "Não foi possível excluir a categoria." }), variant: "destructive" });
    } finally {
      setIsSaving(false);
      setCategoryToDelete(null);
    }
  };

  const getCategoryTypeLabel = (type: TransactionType) => {
    if (type === 'income') {
      return translate({ en: "Income", pt: "Receita" });
    }
    return translate({ en: "Expense", pt: "Despesa" });
  };

  const renderCategoryForm = (formInstance: typeof addCategoryForm | typeof editCategoryForm, onSubmitHandler: SubmitHandler<CategoryFormValues>, dialogType: "add" | "edit") => {
    const submitButtonText = dialogType === "add" 
        ? (isSaving ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Category", pt: "Adicionar Categoria" }))
        : (isSaving ? translate({ en: "Saving...", pt: "Salvando..." }) : translate({ en: "Save Changes", pt: "Salvar Alterações" }));

    return (
        <Form {...formInstance}>
            <form onSubmit={formInstance.handleSubmit(onSubmitHandler)} className="space-y-4 py-4">
              <FormField
                control={formInstance.control}
                name="categoryName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {translate({ en: "Category Name", pt: "Nome da Categoria" })}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={translate({ en: "e.g., Side Hustle", pt: "ex: Renda Extra"})}
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
                           <SelectValue placeholder={translate({en: "Select an icon", pt: "Selecione um ícone"})}>
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
              <FormField
                control={formInstance.control}
                name="categoryType"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>{translate({ en: "Category Type", pt: "Tipo da Categoria" })}</FormLabel>
                    <FormControl>
                      <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="flex flex-row items-center space-x-3 pt-1"
                      >
                          <FormItem className="flex items-center space-x-1.5">
                              <FormControl>
                                  <RadioGroupItem value="income" id={`type-income-${dialogType}-dialog`} />
                              </FormControl>
                              <Label htmlFor={`type-income-${dialogType}-dialog`} className="font-normal">{translate({en: "Income", pt: "Receita"})}</Label>
                          </FormItem>
                          <FormItem className="flex items-center space-x-1.5">
                              <FormControl>
                                  <RadioGroupItem value="expense" id={`type-expense-${dialogType}-dialog`} />
                              </FormControl>
                              <Label htmlFor={`type-expense-${dialogType}-dialog`} className="font-normal">{translate({en: "Expense", pt: "Despesa"})}</Label>
                          </FormItem>
                      </RadioGroup>
                    </FormControl>
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
    );
  };


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {translate({ en: "Manage Categories", pt: "Gerenciar Categorias" })}
          </h1>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                {translate({ en: "Add New Category", pt: "Adicionar Nova Categoria" })}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>{translate({ en: "Add New Category", pt: "Adicionar Nova Categoria" })}</DialogTitle>
                <DialogDescription>
                  {translate({ en: "Enter name, select icon, and choose type.", pt: "Digite o nome, selecione um ícone e escolha o tipo." })}
                </DialogDescription>
              </DialogHeader>
              {renderCategoryForm(addCategoryForm, handleAddCategorySubmit, "add")}
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Edit Category Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{translate({ en: "Edit Category", pt: "Editar Categoria" })}</DialogTitle>
                    <DialogDescription>
                        {translate({ en: "Update the name, icon, or type of your custom category.", pt: "Atualize o nome, ícone ou tipo da sua categoria personalizada." })}
                    </DialogDescription>
                </DialogHeader>
                {categoryToEdit && renderCategoryForm(editCategoryForm, handleEditCategorySubmit, "edit")}
            </DialogContent>
        </Dialog>


        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>{translate({ en: "Your Categories", pt: "Suas Categorias" })}</CardTitle>
            <CardDescription>
              {translate({ en: "A list of all your configured categories.", pt: "Uma lista de todas as suas categorias configuradas." })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <React.Fragment key={`skeleton-cat-${i}`}>
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
                    {i < 4 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : displayCategories.length > 0 ? (
              <div className="space-y-4">
                {displayCategories.map((category, index) => (
                  <React.Fragment key={category.name as string}>
                    <div className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon iconName={category.icon} className="h-6 w-6 text-muted-foreground" />
                        <div className="flex flex-col">
                           <span className="font-medium">
                            {getCategoryDisplayLabel(category, language)}
                          </span>
                          <Badge
                            variant={category.type === 'income' ? 'secondary' : 'outline'}
                            className={`w-fit text-xs ${category.type === 'income' ? 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700' : 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700'}`}
                          >
                            {category.type === 'income' ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                            {getCategoryTypeLabel(category.type)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleOpenEditDialog(category)}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getCategoryDisplayLabel(category, language)}
                          disabled={isPredefinedCategory(category.name)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => openDeleteConfirmation(category)}
                          className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                          aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getCategoryDisplayLabel(category, language)}
                          disabled={isPredefinedCategory(category.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {index < displayCategories.length - 1 && <Separator />}
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No categories configured yet.", pt: "Nenhuma categoria configurada ainda." })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {categoryToDelete && (
        <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Deletion", pt: "Confirmar Exclusão"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to delete the category:", pt: "Tem certeza que deseja excluir a categoria:"})}{" "}
                <strong>{getCategoryDisplayLabel(categoryToDelete, language)}</strong>?{" "}
                {translate({en: "This action cannot be undone.", pt: "Esta ação não pode ser desfeita."})}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCategoryToDelete(null)} disabled={isSaving}>
                {translate({en: "Cancel", pt: "Cancelar"})}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSaving ? translate({en:"Deleting...", pt: "Excluindo..."}) : translate({en: "Delete", pt: "Excluir"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}


    