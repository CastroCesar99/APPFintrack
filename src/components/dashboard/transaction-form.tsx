
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

// Schema for what react-hook-form will manage (inputs are strings)
const formInputSchema = z.object({
  description: z.string().min(2, { message: "A descrição deve ter pelo menos 2 caracteres." }).max(100, {message: "A descrição não pode exceder 100 caracteres."}),
  amount: z.string().optional(), // Amount is typed as string, validated later
  category: z.string().min(1, { message: "A categoria é obrigatória." }),
  date: z.date({ required_error: "Data é obrigatória."}),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.string().optional(), // Installments typed as string
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
});

// Schema for the output after Zod transformations (amount/installments are numbers)
const formOutputSchema = z.object({
  description: z.string().min(2).max(100),
  amount: z.string().optional().transform((val, ctx) => {
    if (val === undefined || val.trim() === "") {
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
  installments: z.string().optional().transform((val, ctx) => {
    if (val === undefined || val.trim() === "") return undefined;
    const intVal = parseInt(val.trim(), 10);
    if (isNaN(intVal) || !Number.isInteger(intVal)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Número de parcelas inválido." });
      return z.NEVER;
    }
    if (intVal < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Parcelas devem ser no mínimo 1." });
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

type TransactionFormInputValues = z.infer<typeof formInputSchema>;
type TransactionFormOutputValues = z.infer<typeof formOutputSchema>;


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
    resolver: zodResolver(formOutputSchema), // Validate against the output schema to catch type errors after transform
    defaultValues: {
      description: transactionToEdit?.description || "",
      amount: transactionToEdit?.amount !== undefined ? String(transactionToEdit.amount).replace(".", ",") : "",
      category: transactionToEdit?.category as string || "",
      date: transactionToEdit ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0)) : (defaultDate || new Date()),
      expenseType: transactionToEdit?.expenseType || (initialType === 'expense' ? 'upfront' : undefined),
      paymentMethod: transactionToEdit?.paymentMethod || undefined,
      installments: transactionToEdit?.installments !== undefined ? String(transactionToEdit.installments) : "",
      isRecurring: transactionToEdit?.isRecurring === undefined ? (initialType === 'income' ? false : undefined) : transactionToEdit.isRecurring,
      expenseNature: transactionToEdit?.expenseNature || undefined,
    },
  });

  const watchedExpenseType = form.watch('expenseType');

  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for transactionToEdit/initialType/defaultDate. TxToEdit ID:", transactionToEdit?.id, "InitialType:", initialType, "DefaultDate:", defaultDate?.toISOString());
    const dateToSet = transactionToEdit
      ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0))
      : (defaultDate || new Date());

    form.reset({
      description: transactionToEdit?.description || "",
      amount: transactionToEdit?.amount !== undefined ? String(transactionToEdit.amount).replace(".", ",") : "",
      category: transactionToEdit?.category as string || "",
      date: dateToSet,
      expenseType: transactionToEdit?.expenseType || (initialType === 'expense' ? 'upfront' : undefined),
      paymentMethod: transactionToEdit?.paymentMethod || undefined,
      installments: transactionToEdit?.installments !== undefined ? String(transactionToEdit.installments) : "",
      isRecurring: transactionToEdit?.isRecurring === undefined
                     ? (initialType === 'income' ? false : (initialType === 'expense' && (transactionToEdit?.expenseType || 'upfront') === 'recurring'))
                     : transactionToEdit.isRecurring,
      expenseNature: transactionToEdit?.expenseNature || undefined,
    });
  }, [transactionToEdit, initialType, defaultDate, form.reset]);


  useEffect(() => {
    const categoriesToFilter = Array.isArray(userCategories) ? userCategories : [];
    console.log(`TransactionForm TRACER --- useEffect for initialType/userCategories. initialType: '${initialType}', Prop userCategories length: ${categoriesToFilter.length}, First userCategory type if exists: ${categoriesToFilter[0]?.type}`);

    const relevantUserCategories = categoriesToFilter.filter(cat => cat.type === initialType);
    setAvailableCategories(relevantUserCategories);
    console.log(`TransactionForm TRACER --- relevantUserCategories length: ${relevantUserCategories.length} Based on initialType: '${initialType}'. Content:`, relevantUserCategories.map(c => ({name: getCategoryDisplayLabel(c, language), type: c.type })));


    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm && !relevantUserCategories.some(cat => cat.name === currentCategoryInForm)) {
      form.setValue("category", "");
    }

    if (initialType === 'income') {
      form.setValue('expenseType', undefined);
      form.setValue('paymentMethod', undefined);
      form.setValue('installments', "");
      form.setValue('expenseNature', undefined);
      // Preserve isRecurring for income if it was set, default to false if not
      form.setValue('isRecurring', form.getValues('isRecurring') ?? false);
    } else { // expense
      // isRecurring for expense is derived from expenseType
      form.setValue('isRecurring', form.getValues('expenseType') === 'recurring');
      if (form.getValues('expenseType') !== 'installment') {
        form.setValue('installments', "");
      }
    }
  }, [initialType, userCategories, form, language]);


  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for watchedExpenseType. WatchedExpenseType:", watchedExpenseType, "InitialType:", initialType);
    if (initialType === 'expense') {
      form.setValue('isRecurring', watchedExpenseType === 'recurring');
      if (watchedExpenseType !== 'installment') {
        form.setValue('installments', "");
      }
    }
  }, [watchedExpenseType, initialType, form.setValue]);


  async function onSubmit(data: TransactionFormInputValues) {
    console.log("TransactionForm TRACER --- onSubmit: Raw form values from react-hook-form:", data);
    console.log("TransactionForm TRACER --- onSubmit: Raw form.getValues():", form.getValues());

    setIsSubmitting(true);

    // Explicitly prepare data for Zod parsing, ensuring strings for amount/installments
    const dataForZod = {
      ...data,
      amount: (data.amount === undefined || data.amount === null || data.amount.trim() === "") ? undefined : String(data.amount).trim(),
      installments: (data.installments === undefined || data.installments === null || data.installments.trim() === "") ? undefined : String(data.installments).trim(),
      date: data.date instanceof Date ? data.date : new Date(), // Ensure date is a Date object
    };
    console.log("TransactionForm TRACER --- onSubmit: Values PREPARED for Zod parsing:", dataForZod);


    let validatedValues: TransactionFormOutputValues;
    try {
      validatedValues = formOutputSchema.parse(dataForZod);
      console.log("TransactionForm TRACER --- onSubmit: Values AFTER Zod parsing:", validatedValues);
    } catch (error) {
      console.error("TransactionForm TRACER --- Zod validation error:", error);
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          if (err.path.length > 0) {
            const fieldName = err.path[0] as keyof TransactionFormInputValues;
            form.setError(fieldName, { type: "manual", message: err.message });
          }
        });
      }
      setIsSubmitting(false);
      return;
    }

    const finalAmount = validatedValues.amount;
    const finalInstallments = validatedValues.installments;
    const finalExpenseType = validatedValues.expenseType;

    if (finalAmount === undefined || finalAmount <= 0) {
        form.setError("amount", { type: "manual", message: translate({pt: "O valor deve ser um número positivo.", en: "Amount must be a positive number."}) });
        setIsSubmitting(false);
        return;
    }
    if (initialType === 'expense' && finalExpenseType === 'installment' && (finalInstallments === undefined || finalInstallments < 1)) {
        form.setError("installments", { type: "manual", message: translate({pt: "O número de parcelas é obrigatório e deve ser no mínimo 1.", en: "Number of installments is required and must be at least 1."}) });
        setIsSubmitting(false);
        return;
    }

    let finalIsRecurringForSave = validatedValues.isRecurring;
    if (initialType === 'expense') {
      finalIsRecurringForSave = finalExpenseType === 'recurring';
    } else if (initialType === 'income') {
      finalIsRecurringForSave = data.isRecurring // Use the raw boolean from the form for income
    }


    const transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt"> = {
      description: validatedValues.description,
      amount: finalAmount, // Already a number from Zod transform
      type: initialType,
      category: validatedValues.category as CategoryName,
      date: formatDateFns(validatedValues.date, "yyyy-MM-dd"), // Format Date object to string
      paymentMethod: initialType === 'expense' ? validatedValues.paymentMethod : undefined,
      installments: initialType === 'expense' && finalExpenseType === 'installment' ? finalInstallments : undefined, // Already a number or undefined
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
          amount: "",
          category: "",
          date: defaultDate || new Date(),
          expenseType: initialType === 'expense' ? 'upfront' : undefined,
          paymentMethod: undefined,
          installments: "",
          isRecurring: initialType === 'income' ? false : (initialType === 'expense' && form.getValues('expenseType') === 'recurring'),
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
                  value={field.value}
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
                 <p className="text-xs text-muted-foreground">
                  {initialType === 'income' ? translate({pt: "Nenhuma categoria de receita encontrada. Verifique as configurações.", en: "No income categories found. Check settings."}) : translate({pt: "Nenhuma categoria de despesa encontrada. Verifique as configurações.", en: "No expense categories found. Check settings."})}
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
                   <p className="text-xs text-muted-foreground">
                    {translate({pt: "Nenhum método de pagamento encontrado. Verifique as configurações.", en: "No payment methods found. Check settings."})}
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
                      onValueChange={(value) => field.onChange(value as ExpenseType | undefined)}
                      value={field.value || "upfront"}
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
                        value={field.value}
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


