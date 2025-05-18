
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
import { CategoryIcon, getSelectableIcons, iconNameToComponentMap, PaymentMethodIcon } from "@/components/icons"; // Added PaymentMethodIcon just in case
import { Edit, Trash2, PlusCircle, TrendingUp, TrendingDown, CircleHelp, type LucideIcon } from "lucide-react";
import {
  CATEGORIES,
  getCategoryDisplayLabel,
  type CustomCategoryData,
  type DisplayCategory,
  type TransactionType,
  type UserPreferences,
  type Category,
  type CategoryName,
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

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
  const [originalCategoryName, setOriginalCategoryName] = useState<string | null>(null); // Stores the internal name

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

  const isPredefinedCategory = useCallback((categoryInternalName: string): boolean => {
    return CATEGORIES.some(cat => cat.name.toLowerCase() === categoryInternalName.toLowerCase());
  }, []);

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
      
      let effectiveCategories: DisplayCategory[] = [];

      if (preferencesDocSnap.exists()) {
        const prefsData = preferencesDocSnap.data() as UserPreferences;
        const deselectedNames = (prefsData.deselectedPredefinedCategories || []).map(name => name.toLowerCase());
        const customCategoriesFromDb = prefsData.userDefinedCategories || [];
        
        const customCategoriesMap = new Map<string, CustomCategoryData>();
        customCategoriesFromDb.forEach(cc => customCategoriesMap.set(cc.name.toLowerCase(), cc));

        // Start with predefined categories that are not deselected
        effectiveCategories = CATEGORIES.filter(
          predefCat => !deselectedNames.includes(predefCat.name.toLowerCase())
        ).map(predefCat => {
          // Check if this predefined category has a custom override
          const customOverride = customCategoriesMap.get(predefCat.name.toLowerCase());
          if (customOverride) {
            customCategoriesMap.delete(predefCat.name.toLowerCase()); // Remove from map as it's been used
            return customOverride; // Use the custom version (which includes custom label, icon, type)
          }
          return predefCat; // Use the predefined version
        });
        
        // Add any remaining custom categories (those that didn't override a predefined one by internal name)
        customCategoriesMap.forEach(customCat => {
            if (!effectiveCategories.some(ec => ec.name.toLowerCase() === customCat.name.toLowerCase())) {
                 effectiveCategories.push(customCat);
            }
        });

      } else {
        // No preferences doc, use all predefined
        effectiveCategories = [...CATEGORIES];
      }
      
      setDisplayCategories(effectiveCategories.sort((a,b) => getCategoryDisplayLabel(a,language).localeCompare(getCategoryDisplayLabel(b,language))));
       console.log("ManageCategoriesPage TRACER --- Fetched and set displayCategories:", effectiveCategories.map(c => ({name: c.name, type: c.type, label: getCategoryDisplayLabel(c, language) })));

    } catch (error) {
      console.error("Error fetching user categories:", error);
      toast({
        title: translate({ en: "Error Loading Data", pt: "Erro ao Carregar Dados" }),
        description: translate({ en: "Could not load your categories.", pt: "Não foi possível carregar suas categorias." }),
        variant: "destructive",
      });
      setDisplayCategories([...CATEGORIES].sort((a, b) => getCategoryDisplayLabel(a, language).localeCompare(getCategoryDisplayLabel(b, language))));
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate, language]);

  useEffect(() => {
    if (!authLoading) { 
      fetchUserCategories();
    }
  }, [user, authLoading, fetchUserCategories]);


  const handleAddCategorySubmit: SubmitHandler<CategoryFormValues> = async (data) => {
    if (!user) return;
    setIsSaving(true);
    const newCategoryDisplayName = data.categoryName.trim(); // This is also the new internal name for brand-new categories
    const newCategoryIcon = data.selectedIcon;
    const newCategoryType = data.categoryType;

    const isDisplayNameDuplicate = displayCategories.some(
      (cat) => getCategoryDisplayLabel(cat, language).toLowerCase() === newCategoryDisplayName.toLowerCase()
    );
    if (isDisplayNameDuplicate) {
      toast({ title: translate({ en: "Duplicate Category", pt: "Categoria Duplicada" }), description: translate({ en: "A category with this display name already exists.", pt: "Uma categoria com este nome de exibição já existe." }), variant: "destructive" });
      setIsSaving(false);
      return;
    }

    const newCustomCategory: CustomCategoryData = {
      name: newCategoryDisplayName, // For new categories, name (identifier) is the display name
      icon: newCategoryIcon,
      type: newCategoryType,
      label: { en: newCategoryDisplayName, pt: newCategoryDisplayName }, 
    };

    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);
      
      if (prefsSnap.exists()) {
        await updateDoc(preferencesDocRef, {
          userDefinedCategories: arrayUnion(newCustomCategory),
          selectedCategories: arrayUnion(newCustomCategory.name), // Add by its internal name
          deselectedPredefinedCategories: arrayRemove(newCustomCategory.name), // Ensure it's not in deselected if it matches a predefined
          updatedAt: serverTimestamp()
        });
      } else {
        // Create preferences doc if it doesn't exist
        await setDoc(preferencesDocRef, {
          language: language,
          selectedCategories: [newCustomCategory.name],
          userDefinedCategories: [newCustomCategory],
          deselectedPredefinedCategories: [],
          selectedPaymentMethods: [], // Initialize if needed
          userDefinedPaymentMethods: [], // Initialize if needed
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserCategories(); 
      toast({ title: translate({ en: "Category Added", pt: "Categoria Adicionada" }), description: `${getCategoryDisplayLabel(newCustomCategory, language)} ${translate({ en: "has been added.", pt: "foi adicionada." })}` });
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
    setCategoryToEdit(category);
    setOriginalCategoryName(category.name); // Store the internal name
    editCategoryForm.reset({
        categoryName: getCategoryDisplayLabel(category, language), // Populate form with display name
        selectedIcon: category.icon,
        categoryType: category.type
    });
    setIsEditDialogOpen(true);
  };

  const handleEditCategorySubmit: SubmitHandler<CategoryFormValues> = async (data) => {
    if (!user || !categoryToEdit || !originalCategoryName) return;

    setIsSaving(true);
    const updatedCategoryDisplayName = data.categoryName.trim(); // New display name from form

    try {
        const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
        const prefsSnap = await getDoc(preferencesDocRef);

        if (!prefsSnap.exists()) {
            toast({ title: translate({en: "Error", pt: "Erro"}), description: translate({en: "User preferences not found.", pt: "Preferências do usuário não encontradas."}), variant: "destructive"});
            setIsSaving(false);
            return;
        }
        const preferencesData = prefsSnap.data() as UserPreferences;
        let currentCustomCategories = preferencesData.userDefinedCategories || [];
        let currentSelectedCategories = preferencesData.selectedCategories || [];
        
        const originalIsPredefined = isPredefinedCategory(originalCategoryName);
        
        // The internal name for the updated category.
        // If original was predefined, its internal name doesn't change.
        // If original was custom, its internal name changes IF the display name (which is its id) changes.
        const internalNameToUpdate = originalIsPredefined ? originalCategoryName : updatedCategoryDisplayName;

        // Check for display name duplication, excluding the category being edited (if its internal name isn't changing)
        const otherCategories = displayCategories.filter(c => c.name.toLowerCase() !== originalCategoryName.toLowerCase());
        const isDisplayNameDuplicate = otherCategories.some(
            (cat) => getCategoryDisplayLabel(cat, language).toLowerCase() === updatedCategoryDisplayName.toLowerCase()
        );

        if (isDisplayNameDuplicate) {
            toast({ title: translate({ en: "Duplicate Category", pt: "Categoria Duplicada" }), description: translate({ en: "Another category with this display name already exists.", pt: "Outra categoria com este nome de exibição já existe." }), variant: "destructive" });
            setIsSaving(false);
            return;
        }
        
        const updatedCategoryData: CustomCategoryData = {
            name: internalNameToUpdate, 
            icon: data.selectedIcon,
            type: data.categoryType,
            label: { en: updatedCategoryDisplayName, pt: updatedCategoryDisplayName },
        };

        // Find and update/replace in customCategories
        const existingCustomIndex = currentCustomCategories.findIndex(
            (cat) => cat.name.toLowerCase() === originalCategoryName.toLowerCase()
        );

        if (existingCustomIndex !== -1) { // It was an existing custom category
            currentCustomCategories[existingCustomIndex] = updatedCategoryData;
        } else { // It was a predefined category being customized, or a new custom one (should not happen here)
            currentCustomCategories.push(updatedCategoryData);
        }
        // Ensure unique by name if somehow duplicates were created (e.g. if originalCategoryName was a display name that changed)
        const tempMap = new Map<string, CustomCategoryData>();
        currentCustomCategories.forEach(cat => tempMap.set(cat.name.toLowerCase(), cat));
        currentCustomCategories = Array.from(tempMap.values());

        // Update selectedCategories if internal name changed (only for originally custom categories)
        if (!originalIsPredefined && originalCategoryName.toLowerCase() !== internalNameToUpdate.toLowerCase()) {
            currentSelectedCategories = currentSelectedCategories.filter(
                (name) => name.toLowerCase() !== originalCategoryName.toLowerCase()
            );
        }
        // Ensure the (potentially new) internal name is in selectedCategories
        if (!currentSelectedCategories.map(n => n.toLowerCase()).includes(internalNameToUpdate.toLowerCase())) {
            currentSelectedCategories.push(internalNameToUpdate);
        }
        currentSelectedCategories = Array.from(new Set(currentSelectedCategories.map(n => n.trim()).filter(Boolean)));

        await updateDoc(preferencesDocRef, {
            userDefinedCategories: currentCustomCategories,
            selectedCategories: currentSelectedCategories,
            updatedAt: serverTimestamp()
        });

        await fetchUserCategories(); 
        toast({ title: translate({ en: "Category Updated", pt: "Categoria Atualizada" }), description: `${updatedCategoryDisplayName} ${translate({ en: "has been updated.", pt: "foi atualizada." })}` });
        setIsEditDialogOpen(false);
        setCategoryToEdit(null);
        setOriginalCategoryName(null);
        
    } catch (error) {
        console.error("Error updating category:", error);
        toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not update category.", pt: "Não foi possível atualizar a categoria." }), variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  const openDeleteConfirmation = (category: DisplayCategory) => {
    setCategoryToDelete(category);
  };

  const handleDeleteCategory = async () => {
    if (!user || !categoryToDelete) return;
    setIsSaving(true); 
    try {
      const preferencesDocRef = doc(db, `users/${user.uid}/preferences/userPreferences`);
      const prefsSnap = await getDoc(preferencesDocRef);
      if (prefsSnap.exists()) {
        const currentPrefs = prefsSnap.data() as UserPreferences;
        let updatedUserDefined = currentPrefs.userDefinedCategories || [];
        let updatedSelected = currentPrefs.selectedCategories || [];
        let updatedDeselectedPredefined = currentPrefs.deselectedPredefinedCategories || [];

        const categoryInternalName = categoryToDelete.name; 
        const wasOriginallyPredefined = isPredefinedCategory(categoryInternalName);

        // Remove from userDefinedCategories if it's there
        updatedUserDefined = updatedUserDefined.filter(
          cat => cat.name.toLowerCase() !== categoryInternalName.toLowerCase()
        );
        
        // Remove from selectedCategories
        updatedSelected = updatedSelected.filter(
          name => name.toLowerCase() !== categoryInternalName.toLowerCase()
        );

        // If it was originally predefined and not just a custom version, add to deselected
        if (wasOriginallyPredefined) {
          if (!updatedDeselectedPredefined.map(n => n.toLowerCase()).includes(categoryInternalName.toLowerCase())) {
            updatedDeselectedPredefined.push(categoryInternalName);
          }
        }

        await updateDoc(preferencesDocRef, {
          userDefinedCategories: updatedUserDefined,
          selectedCategories: updatedSelected,
          deselectedPredefinedCategories: updatedDeselectedPredefined,
          updatedAt: serverTimestamp()
        });
      }
      
      await fetchUserCategories(); 
      toast({ title: translate({ en: "Category Processed", pt: "Categoria Processada" }), description: `${getCategoryDisplayLabel(categoryToDelete, language)} ${translate({ en: "has been processed.", pt: "foi processada." })}` });
    } catch (error) {
      console.error("Error processing category action:", error);
      toast({ title: translate({ en: "Error Processing Action", pt: "Erro ao Processar Ação" }), description: translate({ en: "Could not complete the action.", pt: "Não foi possível concluir a ação." }), variant: "destructive" });
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
    const dialogTitle = dialogType === "add" 
        ? translate({ en: "Add New Category", pt: "Adicionar Nova Categoria" })
        : translate({ en: "Edit Category", pt: "Editar Categoria" });
    const dialogDescription = dialogType === "add"
        ? translate({ en: "Enter name, select icon, and choose type.", pt: "Digite o nome, selecione um ícone e escolha o tipo." })
        : translate({ en: "Update the name, icon, or type of the category.", pt: "Atualize o nome, ícone ou tipo da categoria." });
    const submitButtonText = dialogType === "add" 
        ? (isSaving ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Category", pt: "Adicionar Categoria" }))
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
                                    <RadioGroupItem value="income" id={`type-income-${dialogType}-cat-dialog`} />
                                </FormControl>
                                <Label htmlFor={`type-income-${dialogType}-cat-dialog`} className="font-normal">{translate({en: "Income", pt: "Receita"})}</Label>
                            </FormItem>
                            <FormItem className="flex items-center space-x-1.5">
                                <FormControl>
                                    <RadioGroupItem value="expense" id={`type-expense-${dialogType}-cat-dialog`} />
                                </FormControl>
                                <Label htmlFor={`type-expense-${dialogType}-cat-dialog`} className="font-normal">{translate({en: "Expense", pt: "Despesa"})}</Label>
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
        </DialogContent>
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
            {renderCategoryForm(addCategoryForm, handleAddCategorySubmit, "add")}
          </Dialog>
        </div>
        
        <Dialog open={isEditDialogOpen} onOpenChange={(isOpen) => {
            setIsEditDialogOpen(isOpen);
            if (!isOpen) {
                setCategoryToEdit(null);
                setOriginalCategoryName(null);
            }
        }}>
            {categoryToEdit && renderCategoryForm(editCategoryForm, handleEditCategorySubmit, "edit")}
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
              <div className="space-y-1">
                {displayCategories.map((category, index) => {
                  // const originalIsPredefined = isPredefinedCategory(category.name as string);
                  console.log(`ManageCategoriesPage TRACER --- Rendering category: ${getCategoryDisplayLabel(category, language)}, Original Name: ${category.name}, Is Predefined: ${isPredefinedCategory(category.name)}`);
                  return (
                    <React.Fragment key={category.name + '-' + index}>
                      <div className="flex items-center justify-between py-3 hover:bg-muted/50 rounded-md px-2 -mx-2">
                        <div className="flex items-center gap-3">
                          <CategoryIcon iconName={category.icon} className="h-6 w-6 text-muted-foreground" />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {getCategoryDisplayLabel(category, language)}
                            </span>
                            <Badge
                              variant={category.type === 'income' ? 'secondary' : 'outline'}
                              className={`w-fit text-xs ${category.type === 'income' ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-700/50' : 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/50 dark:text-red-300 dark:border-red-700/50'}`}
                            >
                              {category.type === 'income' ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                              {getCategoryTypeLabel(category.type)}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleOpenEditDialog(category)}
                            aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getCategoryDisplayLabel(category, language)}
                            disabled={isSaving} 
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => openDeleteConfirmation(category)}
                            className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                            aria-label={translate({en: "Delete", pt: "Excluir"}) + " " + getCategoryDisplayLabel(category, language)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      {index < displayCategories.length - 1 && <Separator />}
                    </React.Fragment>
                  )
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                {translate({ en: "No categories configured yet. Add some using the button above!", pt: "Nenhuma categoria configurada ainda. Adicione algumas usando o botão acima!" })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      {categoryToDelete && (
        <AlertDialog open={!!categoryToDelete} onOpenChange={(open) => !open && setCategoryToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{translate({en: "Confirm Action", pt: "Confirmar Ação"})}</AlertDialogTitle>
              <AlertDialogDescription>
                {translate({en: "Are you sure you want to process this action for category:", pt: "Tem certeza que deseja processar esta ação para a categoria:"})}{" "}
                <strong>{getCategoryDisplayLabel(categoryToDelete, language)}</strong>?{" "}
                {isPredefinedCategory(categoryToDelete.name)
                  ? translate({en: "This is a predefined category. Editing it will create a custom version. Deleting it will hide it from selection.", pt: "Esta é uma categoria pré-definida. Editá-la criará uma versão personalizada. Excluí-la irá ocultá-la da seleção."})
                  : translate({en: "This action might affect existing transactions if its name changes.", pt: "Esta ação pode afetar transações existentes vinculadas a esta categoria se o nome dela mudar."})
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCategoryToDelete(null)} disabled={isSaving}>
                {translate({en: "Cancel", pt: "Cancelar"})}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} disabled={isSaving} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSaving ? translate({en:"Processing...", pt: "Processando..."}) : translate({en: "Confirm", pt: "Confirmar"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}

    
