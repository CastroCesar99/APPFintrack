
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
import { Edit, Trash2, PlusCircle, TrendingUp, TrendingDown } from "lucide-react";
import {
  CATEGORIES,
  getCategoryDisplayLabel,
  type Category,
  type CustomCategoryData,
  type DisplayCategory,
  type TransactionType,
  type UserPreferences,
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

const selectableIcons = getSelectableIcons();

const addCategoryFormSchema = z.object({
  newCategoryName: z.string().min(1, { message: "Nome da categoria é obrigatório." }),
  selectedNewCategoryIcon: z.string().min(1, { message: "Ícone é obrigatório." }),
  newCategoryType: z.enum(['income', 'expense'] as [TransactionType, ...TransactionType[]], {
    required_error: "Tipo da categoria é obrigatório."
  }),
});
type AddCategoryFormValues = z.infer<typeof addCategoryFormSchema>;


export default function ManageCategoriesPage() {
  const { language, translate } = useLanguage();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();

  const [displayCategories, setDisplayCategories] = useState<DisplayCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<DisplayCategory | null>(null);

  const addCategoryForm = useForm<AddCategoryFormValues>({
    resolver: zodResolver(addCategoryFormSchema),
    defaultValues: {
      newCategoryName: "",
      selectedNewCategoryIcon: selectableIcons.find(icon => icon.value === 'CircleHelp')?.value || selectableIcons[0]?.value || '',
      newCategoryType: 'expense',
    },
  });

  const fetchUserCategories = useCallback(async () => {
    if (!user) {
      setDisplayCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a,language).localeCompare(getCategoryDisplayLabel(b,language))));
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
            type: cc.type || 'expense', // Default to expense if type is missing
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
      setDisplayCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a,language).localeCompare(getCategoryDisplayLabel(b,language))));
    } finally {
      setIsLoading(false);
    }
  }, [user, toast, translate, language]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchUserCategories();
    } else if (!authLoading && !user) {
      setIsLoading(false);
      setDisplayCategories([...CATEGORIES].sort((a,b) => getCategoryDisplayLabel(a,language).localeCompare(getCategoryDisplayLabel(b,language))));
    }
  }, [user, authLoading, fetchUserCategories, language]);

  const handleAddCategory: SubmitHandler<AddCategoryFormValues> = async (data) => {
    if (!user) {
      toast({ title: translate({ en: "Authentication Error", pt: "Erro de Autenticação" }), description: translate({ en: "You must be logged in.", pt: "Você precisa estar logado." }), variant: "destructive" });
      return;
    }
    setIsSavingCategory(true);
    const newCategoryName = data.newCategoryName.trim();
    const newCategoryIcon = data.selectedNewCategoryIcon;
    const newCategoryType = data.newCategoryType;

    const isDuplicate = displayCategories.some(
      (cat) => cat.name.toLowerCase() === newCategoryName.toLowerCase()
    );
    if (isDuplicate) {
      toast({ title: translate({ en: "Duplicate Category", pt: "Categoria Duplicada" }), description: translate({ en: "This category already exists.", pt: "Esta categoria já existe." }), variant: "destructive" });
      setIsSavingCategory(false);
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
          selectedPaymentMethods: [],
          userDefinedPaymentMethods: [],
          language: language,
          updatedAt: serverTimestamp()
        });
      }
      await fetchUserCategories();
      toast({ title: translate({ en: "Category Added", pt: "Categoria Adicionada" }), description: `${newCategoryName} ${translate({ en: "has been added.", pt: "foi adicionada." })}` });
      addCategoryForm.reset();
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Error adding custom category:", error);
      toast({ title: translate({ en: "Error", pt: "Erro" }), description: translate({ en: "Could not add category.", pt: "Não foi possível adicionar a categoria." }), variant: "destructive" });
    } finally {
      setIsSavingCategory(false);
    }
  };

  const isPredefinedCategory = (categoryName: string) => {
    return CATEGORIES.some(cat => cat.name === categoryName);
  };

  const openDeleteConfirmation = (category: DisplayCategory) => {
    if (isPredefinedCategory(category.name)) {
      toast({
        title: translate({ en: "Cannot Delete", pt: "Não Pode Excluir" }),
        description: translate({ en: "Predefined categories cannot be deleted.", pt: "Categorias pré-definidas não podem ser excluídas." }),
        variant: "destructive"
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
    setIsSavingCategory(true);
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
      setIsSavingCategory(false);
      setCategoryToDelete(null);
    }
  };

  const handleEditPlaceholder = (categoryName: string) => {
    toast({
      title: translate({ en: "Feature In Development", pt: "Funcionalidade em Desenvolvimento" }),
      description: `${translate({en:"Edit", pt: "Editar"})} ${categoryName} ${translate({ en: "is coming soon.", pt: "está chegando em breve."})}`,
    });
  };

  const getCategoryTypeLabel = (type: TransactionType) => {
    if (type === 'income') {
      return translate({ en: "Income", pt: "Receita" });
    }
    return translate({ en: "Expense", pt: "Despesa" });
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
              <form onSubmit={addCategoryForm.handleSubmit(handleAddCategory)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="newCategoryName">
                    {translate({ en: "Category Name", pt: "Nome da Categoria" })}
                  </Label>
                  <Input
                    id="newCategoryName"
                    {...addCategoryForm.register("newCategoryName")}
                    className="mt-1"
                    placeholder={translate({ en: "e.g., Side Hustle", pt: "ex: Renda Extra"})}
                  />
                  {addCategoryForm.formState.errors.newCategoryName && (
                    <p className="text-sm text-destructive mt-1">{addCategoryForm.formState.errors.newCategoryName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="selectedNewCategoryIcon">
                     {translate({ en: "Icon", pt: "Ícone" })}
                  </Label>
                  <Controller
                    control={addCategoryForm.control}
                    name="selectedNewCategoryIcon"
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="w-full mt-1">
                          <SelectValue placeholder={translate({ en: "Select an icon", pt: "Selecione um ícone" })}>
                            {field.value && iconNameToComponentMap[field.value] ? (
                              <div className="flex items-center gap-2">
                                <CategoryIcon iconName={field.value} className="h-4 w-4" />
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
                  {addCategoryForm.formState.errors.selectedNewCategoryIcon && (
                    <p className="text-sm text-destructive mt-1">{addCategoryForm.formState.errors.selectedNewCategoryIcon.message}</p>
                  )}
                </div>
                <div>
                  <Label>{translate({ en: "Category Type", pt: "Tipo da Categoria" })}</Label>
                  <Controller
                    control={addCategoryForm.control}
                    name="newCategoryType"
                    render={({ field }) => (
                        <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex space-x-4 mt-1"
                        >
                            <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                    <RadioGroupItem value="income" id="type-income" />
                                </FormControl>
                                <Label htmlFor="type-income" className="font-normal">{translate({en: "Income", pt: "Receita"})}</Label>
                            </FormItem>
                            <FormItem className="flex items-center space-x-2">
                                <FormControl>
                                    <RadioGroupItem value="expense" id="type-expense" />
                                </FormControl>
                                <Label htmlFor="type-expense" className="font-normal">{translate({en: "Expense", pt: "Despesa"})}</Label>
                            </FormItem>
                        </RadioGroup>
                    )}
                   />
                   {addCategoryForm.formState.errors.newCategoryType && (
                    <p className="text-sm text-destructive mt-1">{addCategoryForm.formState.errors.newCategoryType.message}</p>
                  )}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSavingCategory}>
                       {translate({ en: "Cancel", pt: "Cancelar"})}
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSavingCategory}>
                    {isSavingCategory ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Category", pt: "Adicionar Categoria" })}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

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
                          onClick={() => handleEditPlaceholder(getCategoryDisplayLabel(category, language))}
                          aria-label={translate({en: "Edit", pt: "Editar"}) + " " + getCategoryDisplayLabel(category, language)}
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
              <AlertDialogCancel onClick={() => setCategoryToDelete(null)} disabled={isSavingCategory}>
                {translate({en: "Cancel", pt: "Cancelar"})}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteCategory} disabled={isSavingCategory} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isSavingCategory ? translate({en:"Deleting...", pt: "Excluindo..."}) : translate({en: "Delete", pt: "Excluir"})}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </AppLayout>
  );
}

    