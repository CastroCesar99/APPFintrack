
"use client";
import type React from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, parse as parseDateFns } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType, ExpenseNature, CategoryName, DisplayCategory, DisplayPaymentMethod, ExpenseType } from "@/types";
import { getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types"; 
import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const formSchema = z.object({
  description: z.string().min(2, { message: "A descrição deve ter pelo menos 2 caracteres." }).max(100, {message: "A descrição não pode exceder 100 caracteres."}),
  amount: z.string()
    .refine(val => val === "" || /^[0-9]*[.,]?[0-9]+$/.test(val), {
      message: "O valor deve ser um número válido (ex: 10 ou 10,50).",
    })
    .transform(val => val === "" ? undefined : parseFloat(val.replace(",", ".")))
    .refine(val => val === undefined || val > 0, {
      message: "O valor deve ser positivo se fornecido.",
    }),
  category: z.string().min(1, { message: "A categoria é obrigatória." }),
  date: z.date({invalid_type_error: "Data inválida.", required_error: "A data é obrigatória."}), // Using Zod's default error messages can be more informative
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.string()
    .transform(val => val === "" ? undefined : parseInt(val, 10))
    .refine(val => val === undefined || (Number.isInteger(val) && val >= 1), {
      message: "O número de parcelas deve ser um inteiro positivo se fornecido.",
    }).optional(),
  isRecurring: z.boolean().optional(), 
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
}).refine(data => {
    if (data.expenseType === 'installment' && (data.installments === undefined || data.installments < 1)) {
        return false;
    }
    return true;
}, {
    message: "O número de parcelas é obrigatório para despesas parceladas e deve ser no mínimo 1.",
    path: ["installments"],
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onSave: (data: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?: string) => Promise<void>;
  initialType: TransactionType;
  defaultDate?: Date;
  userCategories: DisplayCategory[];
  userPaymentMethods: DisplayPaymentMethod[];
  transactionToEdit?: Transaction | null;
}

export function TransactionForm({ 
  onSave, 
  initialType, 
  defaultDate, 
  userCategories = [],
  userPaymentMethods = [],
  transactionToEdit = null,
}: TransactionFormProps) {
  console.log("TransactionForm TRACER --- PROPS RECEIVED: defaultDate:", defaultDate?.toISOString(), "initialType:", initialType, "transactionToEdit ID:", transactionToEdit?.id);
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState<DisplayCategory[]>([]);
  const [selectedExpenseType, setSelectedExpenseType] = useState<ExpenseType | undefined>(transactionToEdit?.expenseType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: transactionToEdit?.description || "",
      amount: transactionToEdit?.amount !== undefined ? String(transactionToEdit.amount).replace(".", ",") : undefined,
      category: transactionToEdit?.category || "",
      date: transactionToEdit ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0)) : (defaultDate || new Date()),
      expenseType: transactionToEdit?.expenseType || undefined,
      paymentMethod: transactionToEdit?.paymentMethod || undefined,
      installments: transactionToEdit?.installments !== undefined ? String(transactionToEdit.installments) : undefined,
      isRecurring: transactionToEdit?.isRecurring || false, 
      expenseNature: transactionToEdit?.expenseNature || undefined,
    },
  });
  
  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for transactionToEdit or initialType. transactionToEdit ID:", transactionToEdit?.id, "initialType:", initialType, "defaultDate from prop:", defaultDate?.toISOString());
    const currentFormValues = form.getValues();
    const dateToSet = transactionToEdit 
      ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0))
      : (defaultDate || new Date());

    if (transactionToEdit) {
      form.reset({
        description: transactionToEdit.description,
        amount: transactionToEdit.amount !== undefined ? String(transactionToEdit.amount).replace(".", ",") : undefined,
        category: transactionToEdit.category as string,
        date: dateToSet,
        expenseType: transactionToEdit.expenseType,
        paymentMethod: transactionToEdit.paymentMethod,
        installments: transactionToEdit.installments !== undefined ? String(transactionToEdit.installments) : undefined,
        isRecurring: transactionToEdit.isRecurring,
        expenseNature: transactionToEdit.expenseNature,
      });
      setSelectedExpenseType(transactionToEdit.expenseType);
    } else {
      // For "add" mode, ensure date is reset based on defaultDate,
      // and other fields are reset or retain current input if form is just re-opening for same type.
      form.reset({
        description: currentFormValues.description || "", // Keep if user typed something
        amount: currentFormValues.amount, // Keep if user typed something
        category: currentFormValues.category || "", // Keep if user selected something
        date: dateToSet, // This is the key part for defaultDate
        expenseType: initialType === 'expense' ? currentFormValues.expenseType : undefined,
        paymentMethod: initialType === 'expense' ? currentFormValues.paymentMethod : undefined,
        installments: initialType === 'expense' && currentFormValues.expenseType === 'installment' ? currentFormValues.installments : undefined,
        expenseNature: initialType === 'expense' ? currentFormValues.expenseNature : undefined,
        isRecurring: initialType === 'income' ? (currentFormValues.isRecurring ?? false) : (initialType === 'expense' && currentFormValues.expenseType === 'recurring'),
      });
      setSelectedExpenseType(initialType === 'expense' ? currentFormValues.expenseType : undefined);
    }
  }, [transactionToEdit, defaultDate, initialType, form]); // form.reset can be used

  useEffect(() => {
    const categoriesToFilter = Array.isArray(userCategories) ? userCategories : [];
    console.log(`TransactionForm TRACER --- useEffect for category filter. initialType: '${initialType}', Prop userCategories length: ${categoriesToFilter.length}, First userCategory type if exists: ${categoriesToFilter.length > 0 ? categoriesToFilter[0]?.type : "N/A"}`);
    
    const relevantUserCategories = categoriesToFilter.filter(cat => cat.type === initialType);
    console.log(`TransactionForm TRACER --- relevantUserCategories length: ${relevantUserCategories.length} Based on initialType: '${initialType}' Content:`, JSON.stringify(relevantUserCategories.map(c => ({name: c.name, type: c.type, label: getCategoryDisplayLabel(c, language) }))));
    setAvailableCategories(relevantUserCategories);

    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm && !relevantUserCategories.some(cat => cat.name === currentCategoryInForm)) {
      console.log("TransactionForm TRACER --- Resetting category field as current selection is no longer valid for type:", initialType);
      form.setValue("category", "");
    }
  }, [initialType, userCategories, form, language]);


  async function onSubmit(values: TransactionFormValues) {
    console.log("TransactionForm TRACER --- onSubmit: Raw form values from getValues():", form.getValues()); 
    console.log("TransactionForm TRACER --- onSubmit: Values passed by handleSubmit to Zod resolver:", values);
    console.log("TransactionForm TRACER --- onSubmit: typeof values.date:", typeof values.date, "instanceof Date:", values.date instanceof Date, "Value:", values.date);

    setIsSubmitting(true);
    
    // Amount and Installments are already numbers due to Zod transform if they are defined
    const finalAmount = values.amount; 
    const finalInstallments = values.installments;

    if (finalAmount === undefined || finalAmount <= 0) {
        form.setError("amount", { type: "manual", message: "O valor deve ser um número positivo." });
        setIsSubmitting(false);
        return;
    }
    if (values.expenseType === 'installment' && (finalInstallments === undefined || finalInstallments < 1)) {
        form.setError("installments", { type: "manual", message: "O número de parcelas é obrigatório para despesas parceladas e deve ser no mínimo 1." });
        setIsSubmitting(false);
        return;
    }
     if (!(values.date instanceof Date) || isNaN(values.date.getTime())) {
      form.setError("date", { type: "manual", message: "Por favor, selecione uma data válida." });
      setIsSubmitting(false);
      return;
    }


    try {
      let finalIsRecurring = values.isRecurring || false;
      let finalExpenseType = values.expenseType;

      if (initialType === 'expense') {
        if (values.expenseType === 'recurring') {
          finalIsRecurring = true;
        } else if (values.expenseType !== 'installment') { 
          // For 'upfront' or undefined expenseType, ensure isRecurring is false
          // if not explicitly set by a recurring type.
          finalIsRecurring = false; 
        }
        // For installments, isRecurring is already false.
      } else { // initialType === 'income'
         finalIsRecurring = values.isRecurring || false;
         finalExpenseType = undefined; 
      }

      const transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt"> = {
        description: values.description,
        amount: finalAmount,
        type: initialType,
        category: values.category as CategoryName,
        date: format(values.date, "yyyy-MM-dd"),
        paymentMethod: initialType === 'expense' ? values.paymentMethod : undefined,
        installments: initialType === 'expense' && values.expenseType === 'installment' ? finalInstallments : undefined,
        isRecurring: finalIsRecurring,
        expenseNature: initialType === 'expense' ? values.expenseNature : undefined,
        expenseType: initialType === 'expense' ? finalExpenseType : undefined,
      };
      console.log("TransactionForm TRACER --- onSubmit: Data being sent to onSave:", transactionData);
      await onSave(transactionData, transactionToEdit?.id);

      if (!transactionToEdit) { 
        form.reset({
          description: "",
          amount: undefined, 
          category: "",
          date: defaultDate || new Date(),
          expenseType: undefined,
          paymentMethod: undefined,
          installments: undefined,
          isRecurring: false, 
          expenseNature: undefined,
        });
        setSelectedExpenseType(undefined);
      }
      
    } catch (error) {
      console.error("Error submitting transaction from TransactionForm:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const descriptionLabel = translate({ en: "Description", pt: "Descrição" });
  const descriptionPlaceholder = translate({ en: "e.g., Coffee, Salary", pt: "ex: Café, Salário" });
  const amountLabel = selectedExpenseType === "installment" ? translate({ en: "Installment Amount", pt: "Valor da Parcela" }) : translate({ en: "Amount", pt: "Valor" });
  const categoryLabel = translate({ en: "Category", pt: "Categoria" });
  const categoryPlaceholder = translate({ en: "Select a category", pt: "Selecione uma categoria" });
  const dateLabel = translate({ en: "Date", pt: "Data" });
  const pickDateLabel = translate({ en: "Pick a date", pt: "Escolha uma data" });
  const paymentMethodLabel = translate({ en: "Payment Method", pt: "Forma de Pagamento" });
  const paymentMethodPlaceholder = translate({ en: "Select payment method", pt: "Selecione a forma de pagamento" });
  const paymentTypeLabel = translate({ en: "Payment Type", pt: "Tipo de Pagamento" });
  const paymentTypePlaceholder = translate({ en: "Select payment type", pt: "Selecione o tipo de pagamento" });
  const upfrontLabel = translate({ en: "Upfront", pt: "À Vista" });
  const installmentLabel = translate({ en: "Installment", pt: "Parcelado" });
  const recurringLabel = translate({ en: "Recurring", pt: "Recorrente" });
  const installmentsNumberLabel = translate({ en: "Number of Installments", pt: "Número de Parcelas" });
  const installmentsNumberPlaceholder = translate({ en: "e.g., 10", pt: "ex: 10" });
  const applyToAllMonthsLabel = translate({ en: "Apply to all months (Recurring)", pt: "Aplicar para todos os meses (Recorrente)" });
  const expenseNatureLabel = translate({ en: "Expense Nature", pt: "Natureza da Despesa" });
  const fixedLabel = translate({ en: "Fixed", pt: "Fixo" });
  const variableLabel = translate({ en: "Variable", pt: "Variável" });
  
  const submitButtonLabel = transactionToEdit 
    ? (isSubmitting ? translate({ en: "Saving...", pt: "Salvando..." }) : translate({ en: "Save Changes", pt: "Salvar Alterações" }))
    : (isSubmitting ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Transaction", pt: "Adicionar Transação" }));

  console.log('TRANSACTION FORM RENDER START. Default date for calendar picker:', form.getValues("date")?.toISOString());
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
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  {...field}
                  value={field.value === undefined ? '' : String(field.value).replace(".",",")}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || /^[0-9]*[.,]?[0-9]*$/.test(value)) {
                      field.onChange(value === "" ? undefined : value);
                    }
                  }}
                />
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
              <Select
                onValueChange={field.onChange}
                value={field.value}
                disabled={availableCategories.length === 0}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={categoryPlaceholder} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {getCategoryDisplayLabel(cat, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableCategories.length === 0 && (
                 <p className="text-xs text-muted-foreground">
                  {initialType === 'income' ? translate({pt: "Nenhuma categoria de receita encontrada. Verifique as configurações de onboarding.", en: "No income categories found. Check onboarding settings."}) : translate({pt: "Nenhuma categoria de despesa encontrada. Verifique as configurações de onboarding.", en: "No expense categories found. Check onboarding settings."})}
                </p>
              )}
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
                        format(field.value, "PPP", { locale: language === 'pt' ? ptBR : enUS})
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
                    defaultMonth={field.value || defaultDate || new Date()}
                    disabled={(date) =>
                      date > new Date(new Date().setFullYear(new Date().getFullYear() + 5)) || date < new Date("1900-01-01")
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <FormMessage />
            </FormItem>
          )}
        />
        {initialType === "income" && (
          <FormField
            control={form.control}
            name="isRecurring"
            render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>{applyToAllMonthsLabel}</FormLabel>
              </div>
              <FormMessage />
            </FormItem>)}
          />
        )}
        {initialType === "expense" && (
          <>
            <FormField
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
              <FormItem>
                <FormLabel>{paymentMethodLabel}</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  value={field.value || undefined}
                  disabled={userPaymentMethods.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder={paymentMethodPlaceholder} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {userPaymentMethods.map((pm) => (
                        <SelectItem key={pm.name} value={pm.name}>
                           {getPaymentMethodDisplayLabel(pm, language)}
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {userPaymentMethods.length === 0 && (
                   <p className="text-xs text-muted-foreground">
                    {translate({pt: "Nenhum método de pagamento encontrado. Verifique as configurações de onboarding.", en: "No payment methods found. Check onboarding settings."})}
                  </p>
                )}
                <FormMessage />
              </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expenseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{paymentTypeLabel}</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        const castValue = value as ExpenseType | undefined;
                        field.onChange(castValue);
                        setSelectedExpenseType(castValue);
                        if (castValue === 'recurring') {
                          form.setValue('isRecurring', true);
                        } else { 
                           form.setValue('isRecurring', false);
                           if (castValue !== 'installment') { 
                             form.setValue('installments', undefined);
                           }
                        }
                      }}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={paymentTypePlaceholder} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="upfront">{upfrontLabel}</SelectItem>
                        <SelectItem value="installment">{installmentLabel}</SelectItem>
                        <SelectItem value="recurring">{recurringLabel}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
              )}
            />
            {selectedExpenseType === "installment" && (
              <FormField
                control={form.control}
                name="installments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{installmentsNumberLabel}</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        inputMode="numeric"
                        placeholder={installmentsNumberPlaceholder}
                        {...field}
                        value={field.value === undefined ? '' : String(field.value)}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (value === "" || /^[0-9]*$/.test(value)) {
                            field.onChange(value === "" ? undefined : value);
                          }
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             <FormField
              control={form.control}
              name="expenseNature"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>{expenseNatureLabel}</FormLabel>
                  <FormControl>
                    <RadioGroup 
                      onValueChange={field.onChange}
                      value={field.value || undefined}
                      className="flex flex-col space-y-1 sm:flex-row sm:space-y-0 sm:space-x-4"
                    >
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="fixed" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {fixedLabel}
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="variable" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {variableLabel}
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
          {submitButtonLabel}
        </Button>
      </form>
    </Form>
  );
}
