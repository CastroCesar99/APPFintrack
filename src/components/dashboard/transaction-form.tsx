
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format as formatDateFns, parse as parseDateFns } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType, ExpenseNature, CategoryName, DisplayCategory, DisplayPaymentMethod, ExpenseType } from "@/types";
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const formInputSchema = z.object({
  description: z.string().min(2, { message: "A descrição deve ter pelo menos 2 caracteres." }).max(100, {message: "A descrição não pode exceder 100 caracteres."}),
  amount: z.string().optional(), 
  category: z.string().min(1, { message: "A categoria é obrigatória." }),
  date: z.date({ required_error: "Data é obrigatória."}),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.string().optional(),
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
  recurrenceEndDate: z.date().optional(),
});

const formOutputSchema = z.object({
  description: z.string().min(2).max(100),
  amount: z.string().optional()
    .transform((val, ctx) => {
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
  installments: z.string().optional()
    .transform((val, ctx) => {
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
  recurrenceEndDate: z.date().optional(),
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

  const form = useForm<TransactionFormInputValues>({
    resolver: zodResolver(formInputSchema),
    defaultValues: {
      description: "", amount: "", category: "",
      date: defaultDate || new Date(),
      expenseType: 'upfront', paymentMethod: "", installments: "",
      isRecurring: false, expenseNature: undefined,
      recurrenceEndDate: undefined,
    },
  });

  const watchedExpenseType = form.watch('expenseType');

  // Effect to populate the form for editing, now also depends on userCategories
  useEffect(() => {
    // Only reset if we are editing AND the category list is ready.
    if (transactionToEdit) {
      const parsedDate = transactionToEdit.date ? parseDateFns(transactionToEdit.date, "yyyy-MM-dd", new Date(0)) : (defaultDate || new Date());
      const parsedRecurrenceEndDate = transactionToEdit.recurrenceEndDate ? parseDateFns(transactionToEdit.recurrenceEndDate, "yyyy-MM-dd", new Date(0)) : undefined;
      
      form.reset({
        description: transactionToEdit.description || "",
        amount: transactionToEdit.amount !== undefined ? String(transactionToEdit.amount).replace('.', ',') : "",
        category: transactionToEdit.category as string || "",
        date: parsedDate,
        expenseType: transactionToEdit.expenseType || (initialType === 'expense' ? 'upfront' : undefined),
        paymentMethod: transactionToEdit.paymentMethod || undefined,
        installments: transactionToEdit.installments !== undefined ? String(transactionToEdit.installments) : "",
        isRecurring: transactionToEdit.isRecurring ?? (initialType === 'expense' ? transactionToEdit.expenseType === 'recurring' : false),
        expenseNature: transactionToEdit.expenseNature || undefined,
        recurrenceEndDate: parsedRecurrenceEndDate,
      });
    } else {
      // For adding new, reset to defaults
      form.reset({
        description: "",
        amount: "",
        category: "",
        date: defaultDate || new Date(),
        expenseType: initialType === 'expense' ? 'upfront' : undefined,
        paymentMethod: undefined,
        installments: "",
        isRecurring: initialType === 'income' ? false : (form.getValues('expenseType') === 'recurring'),
        expenseNature: undefined,
        recurrenceEndDate: undefined,
      });
    }
  }, [transactionToEdit, initialType, defaultDate, form.reset]);
  
  // Effect to filter available categories based on type
  useEffect(() => {
    const categoriesToFilter = Array.isArray(userCategories) ? userCategories : [];
    const relevantUserCategories = categoriesToFilter.filter(cat => cat.type === initialType);
    setAvailableCategories(relevantUserCategories);
  }, [initialType, userCategories]);

  // Syncs the "isRecurring" checkbox based on the selected expense type
  useEffect(() => {
    if (initialType === 'expense') {
      form.setValue('isRecurring', watchedExpenseType === 'recurring');
      if (watchedExpenseType !== 'installment') {
        form.setValue('installments', "", { shouldDirty: true, shouldValidate: false });
      }
    }
  }, [watchedExpenseType, initialType, form]);

  async function onSubmit(data: TransactionFormInputValues) {
    setIsSubmitting(true);
    const dataToParse = {
      ...data,
      amount: (data.amount === undefined || data.amount === null || String(data.amount).trim() === "") 
                ? undefined 
                : String(data.amount).trim(),
      installments: (data.installments === undefined || data.installments === null || String(data.installments).trim() === "") 
                      ? undefined 
                      : String(data.installments).trim(),
      date: data.date instanceof Date ? data.date : new Date(),
    };
    
    let validatedValues: TransactionFormOutputValues;
    try {
      validatedValues = formOutputSchema.parse(dataToParse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          if (err.path.length > 0) {
            const fieldName = err.path[0] as keyof TransactionFormInputValues;
            form.setError(fieldName, { type: "manual", message: err.message });
          } else {
             form.setError("description", { type: "manual", message: translate({en: "Invalid data submitted.", pt: "Dados inválidos enviados."}) + ` (${err.message})` });
          }
        });
      }
      setIsSubmitting(false);
      return;
    }

    const finalAmount = validatedValues.amount; 
    const finalInstallments = validatedValues.installments;
    const finalExpenseType = validatedValues.expenseType;
    let finalIsRecurringForSave: boolean;
    if (initialType === 'expense') {
      finalIsRecurringForSave = finalExpenseType === 'recurring';
    } else {
      finalIsRecurringForSave = data.isRecurring ?? false;
    }

    const transactionData: Omit<Transaction, "id" | "userId" | "createdAt" | "updatedAt"> = {
      description: validatedValues.description,
      amount: finalAmount,
      type: initialType,
      category: validatedValues.category as CategoryName,
      date: formatDateFns(validatedValues.date, "yyyy-MM-dd"),
      paymentMethod: initialType === 'expense' ? validatedValues.paymentMethod : undefined,
      installments: initialType === 'expense' && finalExpenseType === 'installment' ? finalInstallments : undefined,
      isRecurring: finalIsRecurringForSave,
      expenseNature: initialType === 'expense' ? validatedValues.expenseNature : undefined,
      expenseType: initialType === 'expense' ? finalExpenseType : undefined,
      recurrenceEndDate: finalIsRecurringForSave && validatedValues.recurrenceEndDate ? formatDateFns(validatedValues.recurrenceEndDate, "yyyy-MM-dd") : undefined,
    };
    try {
      await onSave(transactionData, transactionToEdit?.id);
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
  const expenseTypeLabel = translate({ en: "Payment Type", pt: "Tipo de Pagamento" });
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
  const recurrenceEndDateLabel = translate({ en: "End Recurrence On", pt: "Encerrar Recorrência em" });

  const submitButtonLabel = transactionToEdit
    ? (isSubmitting ? translate({ en: "Saving...", pt: "Salvando..." }) : translate({ en: "Save Changes", pt: "Salvar Alterações" }))
    : (isSubmitting ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Transaction", pt: "Adicionar Transação" }));

 return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 md:space-y-6">
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
                  value={field.value || ""}
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
                      {language === 'pt' ? cat.label.pt : cat.label.en}
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
            <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
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
                           {language === 'pt' ? pm.label.pt : pm.label.en}
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
                        value={field.value || ""}
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
                <FormItem className="space-y-2">
                  <FormLabel>{expenseNatureLabel}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value || undefined}
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

        {(form.watch('isRecurring') || false) && (
            <FormField
            control={form.control}
            name="recurrenceEndDate"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel>{recurrenceEndDateLabel} {translate({en: '(Optional)', pt: '(Opcional)'})}</FormLabel>
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
                        initialFocus
                    />
                    </PopoverContent>
                </Popover>
                <FormMessage />
                </FormItem>
            )}
            />
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
          {submitButtonLabel}
        </Button>
      </form>
    </Form>
  );
}

    