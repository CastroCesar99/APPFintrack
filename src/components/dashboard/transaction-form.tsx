
"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType } from "@/types";
import { CATEGORIES, getCategoriesByType, CategoryName, getCategoryLabel } from "@/types"; // Added getCategoryLabel
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context"; // Import useLanguage

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  type: z.enum(["income", "expense"], { required_error: "Transaction type is required." }),
  category: z.string().min(1, { message: "Category is required." }),
  date: z.date({ required_error: "Date is required." }),
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>; // Changed to Promise<void> to allow async handling
  initialType?: TransactionType;
}

export function TransactionForm({ onAddTransaction, initialType = "expense" }: TransactionFormProps) {
  const { language, translate } = useLanguage(); // Use language context
  const [selectedType, setSelectedType] = useState<TransactionType>(initialType);
  const [availableCategories, setAvailableCategories] = useState(() => getCategoriesByType(initialType, language));


  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      amount: 0,
      type: initialType,
      category: "",
      date: new Date(),
    },
  });

  const typeFieldValue = form.watch("type");

  useEffect(() => {
    form.setValue("type", initialType);
    setSelectedType(initialType);
    const newCategories = getCategoriesByType(initialType, language);
    setAvailableCategories(newCategories);
    form.setValue("category", "", { shouldValidate: true }); // Reset category when initialType changes
  }, [initialType, form, language]);


  useEffect(() => {
    // This effect reacts to user changing the type via radio buttons
    if (typeFieldValue !== selectedType) {
      setSelectedType(typeFieldValue);
      const newCategories = getCategoriesByType(typeFieldValue, language);
      setAvailableCategories(newCategories);

      const currentCategoryInForm = form.getValues("category");
      if (currentCategoryInForm) {
        const isCategoryStillValid = newCategories.some(cat => cat.name === currentCategoryInForm);
        if (!isCategoryStillValid) {
          form.setValue("category", "", { shouldValidate: true });
        }
      }
    }
  }, [typeFieldValue, form, language, selectedType]);


  async function onSubmit(values: TransactionFormValues) {
    await onAddTransaction({
      ...values,
      date: format(values.date, "yyyy-MM-dd"), // Format date to string
      category: values.category as CategoryName,
    });
    // Toast is now handled by the parent component (QuickActionsSection)
    form.reset({
        description: "",
        amount: 0,
        type: initialType, // Reset to initial type or a default like 'expense'
        category: "",
        date: new Date(),
    });
    // Ensure type related state is also reset if form is part of a dialog being reused
    setSelectedType(initialType);
    setAvailableCategories(getCategoriesByType(initialType, language));
  }

  const descriptionLabel = translate({ en: "Description", pt: "Descrição" });
  const descriptionPlaceholder = translate({ en: "e.g., Coffee, Salary", pt: "ex: Café, Salário" });
  const amountLabel = translate({ en: "Amount", pt: "Valor" });
  const typeLabel = translate({ en: "Type", pt: "Tipo" });
  const incomeLabel = translate({ en: "Income", pt: "Receita" });
  const expenseLabel = translate({ en: "Expense", pt: "Despesa" });
  const categoryLabel = translate({ en: "Category", pt: "Categoria" });
  const categoryPlaceholder = translate({ en: "Select a category", pt: "Selecione uma categoria" });
  const dateLabel = translate({ en: "Date", pt: "Data" });
  const pickDateLabel = translate({ en: "Pick a date", pt: "Escolha uma data" });
  const addTransactionButtonLabel = translate({ en: "Add Transaction", pt: "Adicionar Transação" });


  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{descriptionLabel}</FormLabel>
              <FormControl>
                <Input placeholder={descriptionPlaceholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="amount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{amountLabel}</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>{typeLabel}</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  value={field.value} // Controlled component
                  className="flex space-x-4"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="income" />
                    </FormControl>
                    <FormLabel className="font-normal">{incomeLabel}</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="expense" />
                    </FormControl>
                    <FormLabel className="font-normal">{expenseLabel}</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{categoryLabel}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={availableCategories.length === 0}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={categoryPlaceholder} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {getCategoryLabel(cat.name, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>{dateLabel}</FormLabel>
              <Popover>
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-full pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                    >
                      {field.value ? (
                        format(field.value, "PPP")
                      ) : (
                        <span>{pickDateLabel}</span>
                      )}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={field.onChange}
                    disabled={(date) =>
                      date > new Date() || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90">{addTransactionButtonLabel}</Button>
      </form>
    </Form>
  );
}
