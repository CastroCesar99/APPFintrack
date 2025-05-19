
"use client";
import type React from 'react';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
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
import { format as formatDateFns, parse as parseDateFns } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType, ExpenseNature, CategoryName, DisplayCategory, DisplayPaymentMethod, ExpenseType } from "@/types";
import { getCategoryDisplayLabel, getPaymentMethodDisplayLabel } from "@/types";
import { useState, useEffect, useCallback } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Schema for what react-hook-form will manage (inputs are strings or specific types)
const formInputSchema = z.object({
  description: z.string().min(2, { message: "A descrição deve ter pelo menos 2 caracteres." }).max(100, {message: "A descrição não pode exceder 100 caracteres."}),
  amount: z.string().optional(), // Form stores as string
  category: z.string().min(1, { message: "A categoria é obrigatória." }),
  date: z.date({ required_error: "Data é obrigatória."}),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.string().optional(), // Form stores as string
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
});

// Schema for the output after Zod transformations (amount/installments are numbers)
const formOutputSchema = z.object({
  description: z.string().min(2).max(100),
  amount: z.string().optional() // Expects string | undefined from dataToParse
    .transform((val, ctx) => {
      if (val === undefined || val.trim() === "") { // val is string or undefined
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O valor é obrigatório." });
        return z.NEVER;
      }
      const numericVal = parseFloat(val.trim().replace(',', '.'));
      if (isNaN(numericVal)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor monetário inválido." });
        return z.NEVER;
      }
      if (numericVal <= 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "O valor deve ser positivo." });
        return z.NEVER;
      }
      return numericVal;
    }),
  category: z.string().min(1),
  date: z.date(),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.string().optional() // Expects string | undefined from dataToParse
    .transform((val, ctx) => {
      if (val === undefined || val.trim() === "") {
          return undefined; // Optional, so pass undefined if empty/not provided
      }
      const intVal = parseInt(val.trim(), 10);
      if (isNaN(intVal) || !Number.isInteger(intVal) || intVal < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Número de parcelas inválido (mínimo 1)." });
        return z.NEVER;
      }
      return intVal;
    }),
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


type TransactionFormInputValues = z.infer<typeof formInputSchema>; // This will have amount and installments as string | undefined
type TransactionFormOutputValues = z.infer<typeof formOutputSchema>; // This will have amount and installments as number | undefined


interface TransactionFormProps {
  onSave: (data: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt">, id?: string) => Promise<void>;
  initialType: TransactionType;
  defaultDate?: Date;
  userCategories?: DisplayCategory[];
  userPaymentMethods?: DisplayPaymentMethod[];
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
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState<DisplayCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  console.log("TransactionForm TRACER --- PROPS RECEIVED: defaultDate:", defaultDate?.toISOString(), "initialType:", initialType, "txToEdit:", transactionToEdit?.id);

  const form = useForm<TransactionFormInputValues>({
    resolver: zodResolver(formInputSchema), // Use formInputSchema for resolver as RHF works with form inputs
    defaultValues: {
      description: "",
      amount: "", // Default to empty string
      category: "",
      date: defaultDate || new Date(),
      expenseType: initialType === 'expense' ? 'upfront' : undefined,
      paymentMethod: undefined,
      installments: "", // Default to empty string
      isRecurring: initialType === 'income' ? false : undefined,
      expenseNature: undefined,
    },
  });

  const watchedExpenseType = form.watch('expenseType');

  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for defaultDate, current form.date:", form.getValues("date")?.toISOString(), "new defaultDate:", defaultDate?.toISOString());
    if (defaultDate) {
        // Only reset the date field if defaultDate has actually changed
        // to avoid potential loops if defaultDate reference is unstable.
        // Or, if the component is re-keyed, this effect is less critical for date initialization
        // as useForm defaultValues would handle it.
        if (form.getValues("date")?.getTime() !== defaultDate.getTime()) {
            form.setValue("date", defaultDate, { shouldValidate: true, shouldDirty: true });
            console.log("TransactionForm TRACER --- Date field explicitly reset to:", defaultDate.toISOString());
        }
    }
  }, [defaultDate, form.setValue, form.getValues]);


  useEffect(() => {
    const categoriesToFilter = Array.isArray(userCategories) ? userCategories : [];
    console.log(`TransactionForm TRACER --- useEffect for initialType/userCategories. initialType: '${initialType}', Prop userCategories length: ${categoriesToFilter.length}, First userCategory type if exists: ${categoriesToFilter[0]?.type}`);

    const relevantUserCategories = categoriesToFilter.filter(cat => cat.type === initialType);
    setAvailableCategories(relevantUserCategories);
    const translatedLabels = relevantUserCategories.map(c => getCategoryDisplayLabel(c, language));
    console.log(`TransactionForm TRACER --- relevantUserCategories length: ${relevantUserCategories.length} Based on initialType: '${initialType}'. Content:`, translatedLabels);


    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm && !relevantUserCategories.some(cat => cat.name === currentCategoryInForm)) {
      form.setValue("category", "", { shouldValidate: true });
    }

    if (initialType === 'income') {
      form.setValue('expenseType', undefined, { shouldValidate: true });
      form.setValue('paymentMethod', undefined, { shouldValidate: true });
      form.setValue('installments', "", { shouldValidate: true });
      form.setValue('expenseNature', undefined, { shouldValidate: true });
      // For income, isRecurring is managed by its own checkbox, so preserve or default it
      form.setValue('isRecurring', form.getValues('isRecurring') ?? false, { shouldValidate: true });
    } else { // expense
      // For expenses, isRecurring is derived from expenseType
      form.setValue('isRecurring', form.getValues('expenseType') === 'recurring', { shouldValidate: true });
      if (form.getValues('expenseType') !== 'installment') {
        form.setValue('installments', "", { shouldValidate: true });
      }
    }
  }, [initialType, userCategories, form, language]);


  useEffect(() => {
    // This effect handles side-effects when expenseType changes
    console.log("TransactionForm TRACER --- useEffect for watchedExpenseType. WatchedExpenseType:", watchedExpenseType, "InitialType:", initialType);
    if (initialType === 'expense') {
      form.setValue('isRecurring', watchedExpenseType === 'recurring', { shouldDirty: true });
      if (watchedExpenseType !== 'installment') {
        form.setValue('installments', "", { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [watchedExpenseType, initialType, form]);

  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for transactionToEdit. TxToEdit ID:", transactionToEdit?.id);
    if (transactionToEdit) {
      form.reset({
        description: transactionToEdit.description || "",
        amount: transactionToEdit.amount !== undefined ? String(transactionToEdit.amount).replace(".", ",") : "",
        category: transactionToEdit.category as string || "",
        date: transactionToEdit.date ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0)) : (defaultDate || new Date()),
        expenseType: transactionToEdit.expenseType || (initialType === 'expense' ? 'upfront' : undefined),
        paymentMethod: transactionToEdit.paymentMethod || undefined,
        installments: transactionToEdit.installments !== undefined ? String(transactionToEdit.installments) : "",
        isRecurring: transactionToEdit.isRecurring === undefined
                     ? (initialType === 'income' ? false : transactionToEdit.expenseType === 'recurring')
                     : transactionToEdit.isRecurring,
        expenseNature: transactionToEdit.expenseNature || undefined,
      });
    } else if (!transactionToEdit && defaultDate) { // Ensure form resets correctly for "add" mode if defaultDate changes
        form.reset({
            description: "",
            amount: "",
            category: "",
            date: defaultDate,
            expenseType: initialType === 'expense' ? 'upfront' : undefined,
            paymentMethod: undefined,
            installments: "",
            isRecurring: initialType === 'income' ? false : (initialType === 'expense' ? (form.getValues('expenseType') === 'recurring') : undefined),
            expenseNature: undefined,
        });
    }
  }, [transactionToEdit, initialType, defaultDate, form.reset, form]);


  async function onSubmit(data: TransactionFormInputValues) { // data here should have amount/installments as string | undefined
    console.log("TransactionForm TRACER --- onSubmit: Raw form.getValues():", form.getValues());
    console.log("TransactionForm TRACER --- onSubmit: 'data' arg from handleSubmit:", data);
    setIsSubmitting(true);

    // Prepare data for Zod output schema parsing.
    // Ensure amount and installments are string or undefined for Zod's initial schema expectation.
    const dataToParse: {
        description: string;
        amount?: string; 
        category: string;
        date: Date;
        expenseType?: ExpenseType;
        paymentMethod?: string;
        installments?: string; 
        isRecurring?: boolean;
        expenseNature?: ExpenseNature;
    } = {
        ...data, // Spread all fields from form (TransactionFormInputValues)
        date: data.date instanceof Date ? data.date : new Date(), // Ensure date is valid
        // Ensure amount is string or undefined for formOutputSchema
        amount: (data.amount === null || data.amount === undefined || String(data.amount).trim() === "") 
                  ? undefined 
                  : String(data.amount).trim(),
        // Ensure installments is string or undefined for formOutputSchema
        installments: (data.installments === null || data.installments === undefined || String(data.installments).trim() === "") 
                      ? undefined 
                      : String(data.installments).trim(),
    };

    console.log("TransactionForm TRACER --- onSubmit: Values PREPARED for Zod parsing ('dataToParse'):", dataToParse);

    let validatedValues: TransactionFormOutputValues;
    try {
      // Use formOutputSchema for final validation and transformation
      validatedValues = formOutputSchema.parse(dataToParse);
      console.log("TransactionForm TRACER --- onSubmit: Values AFTER Zod parsing:", validatedValues);
    } catch (error) {
      console.error("TransactionForm TRACER --- Zod validation error:", error);
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          // Check if path[0] exists and is a valid key of TransactionFormInputValues
          if (err.path.length > 0) {
            const fieldName = err.path[0] as keyof TransactionFormInputValues;
            if (fieldName in form.getValues()) { // Ensure fieldName is a valid form field
                 form.setError(fieldName, { type: "manual", message: err.message });
            } else {
                console.warn("TransactionForm TRACER --- Zod error for unmappable path:", err.path, err.message)
            }
          } else {
             // Handle global form error or error without specific path
             // For example, by setting an error on a known field or a general error message
             form.setError("description", { type: "manual", message: err.message}); // Fallback
          }
        });
      }
      setIsSubmitting(false);
      return;
    }

    const finalAmount = validatedValues.amount; // This is now number | undefined
    const finalInstallments = validatedValues.installments; // This is now number | undefined
    const finalExpenseType = validatedValues.expenseType; // This is ExpenseType | undefined

    // This check is now redundant if Zod transform handles it, but as a safeguard
    if (finalAmount === undefined) { // Amount is mandatory if Zod transform is correct
        form.setError("amount", { type: "manual", message: translate({pt: "O valor é obrigatório e deve ser positivo.", en: "Amount is required and must be positive."}) });
        setIsSubmitting(false);
        return;
    }

    if (initialType === 'expense' && finalExpenseType === 'installment' && (finalInstallments === undefined || finalInstallments < 1)) {
        form.setError("installments", { type: "manual", message: translate({pt: "O número de parcelas é obrigatório para despesas parceladas e deve ser no mínimo 1.", en: "Number of installments is required for installment expenses and must be at least 1."}) });
        setIsSubmitting(false);
        return;
    }

    let finalIsRecurringForSave: boolean | undefined;
    if (initialType === 'expense') {
      finalIsRecurringForSave = finalExpenseType === 'recurring';
    } else if (initialType === 'income') {
      finalIsRecurringForSave = data.isRecurring ?? false; // Use value from form's checkbox
    }


    const transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt"> = {
      description: validatedValues.description,
      amount: finalAmount, // This is a number from Zod
      type: initialType,
      category: validatedValues.category as CategoryName,
      date: formatDateFns(validatedValues.date, "yyyy-MM-dd"),
      paymentMethod: initialType === 'expense' ? validatedValues.paymentMethod : undefined,
      installments: initialType === 'expense' && finalExpenseType === 'installment' ? finalInstallments : undefined,
      isRecurring: finalIsRecurringForSave,
      expenseNature: initialType === 'expense' ? validatedValues.expenseNature : undefined,
      expenseType: initialType === 'expense' ? finalExpenseType : undefined,
    };
    console.log("TransactionForm TRACER --- onSubmit: Data being sent to onSave:", transactionData);
    try {
      await onSave(transactionData, transactionToEdit?.id);
      if (!transactionToEdit) {
        form.reset({
          description: "",
          amount: "", // Reset to empty string
          category: "",
          date: defaultDate || new Date(),
          expenseType: initialType === 'expense' ? 'upfront' : undefined,
          paymentMethod: undefined,
          installments: "", // Reset to empty string
          isRecurring: initialType === 'income' ? false : (initialType === 'expense' ? (form.getValues('expenseType') === 'recurring') : undefined),
          expenseNature: undefined,
        });
      }
    } catch (error) {
      console.error("TransactionForm: Error during onSave callback", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const descriptionLabel = translate({ en: "Description", pt: "Descrição" });
  const descriptionPlaceholder = translate({ en: "e.g., Coffee, Salary", pt: "ex: Café, Salário" });
  const amountLabel = watchedExpenseType === "installment" ? translate({ en: "Installment Amount", pt: "Valor da Parcela" }) : translate({ en: "Amount", pt: "Valor" });
  const categoryLabel = translate({ en: "Category", pt: "Categoria" });
  const categoryPlaceholder = translate({ en: "Select a category", pt: "Selecione uma categoria" });
  const dateLabel = translate({ en: "Date", pt: "Data" });
  const pickDateLabel = translate({ en: "Pick a date", pt: "Escolha uma data" });
  const paymentMethodLabel = translate({ en: "Payment Method", pt: "Forma de Pagamento" });
  const paymentMethodPlaceholder = translate({ en: "Select payment method", pt: "Selecione a forma de pagamento" });
  const expenseTypeLabel = translate({ en: "Payment Type", pt: "Tipo de Pagamento" }); // Renamed from paymentTypeLabel
  const expenseTypePlaceholder = translate({ en: "Select payment type", pt: "Selecione o tipo de pagamento" });
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-6"> {/* Adjusted spacing for consistency */}
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
                  value={field.value} // field.value should be string or undefined from formInputSchema
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    if (/^[0-9]*([,.][0-9]{0,2})?$/.test(inputValue) || inputValue === "") {
                       field.onChange(inputValue);
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
                 <p className="text-xs text-muted-foreground mt-1">
                  {initialType === 'income' ? translate({pt: "Nenhuma categoria de receita disponível.", en: "No income categories available."}) : translate({pt: "Nenhuma categoria de despesa disponível.", en: "No expense categories available."})}
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
                        formatDateFns(field.value, "PPP", { locale: language === 'pt' ? ptBR : enUS})
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
            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3"> {/* Adjusted padding */}
              <FormControl>
                <Checkbox
                  checked={field.value || false}
                  onCheckedChange={field.onChange}
                  id="isRecurringIncome"
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <Label htmlFor="isRecurringIncome" className="font-normal">{applyToAllMonthsLabel}</Label>
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
                  value={field.value || ""}
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
                   <p className="text-xs text-muted-foreground mt-1">
                    {translate({pt: "Nenhum método de pagamento disponível.", en: "No payment methods available."})}
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
                  <FormLabel>{expenseTypeLabel}</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value as ExpenseType | undefined)}
                      value={field.value || "upfront"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={expenseTypePlaceholder} />
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
            {form.watch('expenseType') === "installment" && (
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
                        value={field.value} // Should be string from formInputSchema
                        onChange={(e) => {
                          const inputValue = e.target.value;
                          if (/^[0-9]*$/.test(inputValue) || inputValue === "") {
                            field.onChange(inputValue);
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
                <FormItem className="space-y-2"> {/* Adjusted spacing */}
                  <FormLabel>{expenseNatureLabel}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value || undefined} // Ensure value is controlled
                      className="flex flex-row items-center space-x-3 pt-1"
                    >
                      <FormItem className="flex items-center space-x-1.5">
                        <FormControl>
                          <RadioGroupItem value="fixed" id={`nature-fixed-${transactionToEdit?.id || 'add'}`}/>
                        </FormControl>
                        <Label htmlFor={`nature-fixed-${transactionToEdit?.id || 'add'}`} className="font-normal">
                          {fixedLabel}
                        </Label>
                      </FormItem>
                      <FormItem className="flex items-center space-x-1.5">
                        <FormControl>
                          <RadioGroupItem value="variable" id={`nature-variable-${transactionToEdit?.id || 'add'}`}/>
                        </FormControl>
                        <Label htmlFor={`nature-variable-${transactionToEdit?.id || 'add'}`} className="font-normal">
                          {variableLabel}
                        </Label>
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

    