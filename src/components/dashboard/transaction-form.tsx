
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
// RadioGroup and RadioGroupItem are not used if type is fixed by initialType
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType, ExpenseNature, CategoryName, DisplayCategory, DisplayPaymentMethod, ExpenseType } from "@/types"; // Added ExpenseType
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS, getPaymentMethodDisplayLabel } from "@/types"; // Ensure PAYMENT_METHODS and getPaymentMethodDisplayLabel are imported
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar";

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  category: z.string().min(1, { message: "Category is required." }),
  date: z.date({ required_error: "Date is required." }),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(), // Ensure ExpenseType is used here
  paymentMethod: z.string().optional(),
  installments: z.coerce.number().int().min(1, "Installments must be at least 1 if provided.").optional(), // min(1) if installments are active
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id" | "userId" | "createdAt">) => Promise<void>;
  initialType: TransactionType;
  defaultDate?: Date;
  userCategories: DisplayCategory[];
  userPaymentMethods: DisplayPaymentMethod[];
}

export function TransactionForm({ onAddTransaction, initialType, defaultDate, userCategories, userPaymentMethods }: TransactionFormProps) {
  console.log("TransactionForm TRACER --- PROPS RECEIVED: defaultDate:", defaultDate?.toISOString(), "initialType:", initialType);
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState<DisplayCategory[]>([]);
  const [selectedExpenseType, setSelectedExpenseType] = useState<ExpenseType | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      amount: undefined,
      category: "",
      date: defaultDate || new Date(),
      expenseType: undefined,
      paymentMethod: undefined,
      installments: undefined,
      isRecurring: false,
      expenseNature: undefined,
    },
  });

  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for defaultDate, resetting date to:", defaultDate?.toISOString());
    if (defaultDate) {
      form.resetField("date", { defaultValue: defaultDate });
    } else {
      form.resetField("date", { defaultValue: new Date() });
    }
  }, [defaultDate, form.resetField]);

  useEffect(() => {
    console.log("TransactionForm TRACER --- useEffect for initialType running. initialType:", initialType);
    
    const relevantUserCategories = userCategories.filter(cat => cat.type === initialType);
    setAvailableCategories(relevantUserCategories);

    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm && !relevantUserCategories.some(cat => cat.name === currentCategoryInForm)) {
      form.setValue("category", "");
    }

    if (initialType === 'income') {
      setSelectedExpenseType(undefined);
      form.setValue('expenseType', undefined);
      form.setValue('paymentMethod', undefined);
      form.setValue('installments', undefined);
      form.setValue('expenseNature', undefined);
    } else { // initialType === 'expense'
      const currentExpenseTypeInForm = form.getValues('expenseType');
      setSelectedExpenseType(currentExpenseTypeInForm);
    }
  }, [initialType, form, userCategories]); // form is a stable dependency from useForm

  async function onSubmit(values: TransactionFormValues) {
    setIsSubmitting(true);
    console.log("TransactionForm TRACER --- onSubmit with values.date:", values.date);
    try {
      let finalIsRecurring = values.isRecurring || false;
      let finalExpenseType = values.expenseType;

      if (initialType === 'expense') {
        if (values.expenseType === 'recurring') {
          finalIsRecurring = true;
        } else {
          finalIsRecurring = false;
        }
      } else { // initialType === 'income'
         finalExpenseType = undefined;
         // isRecurring is controlled by its own checkbox for income
      }

      const transactionData: Omit<Transaction, "id" | "userId" | "createdAt"> = {
        description: values.description,
        amount: values.amount,
        type: initialType,
        category: values.category as CategoryName,
        date: format(values.date, "yyyy-MM-dd"),
        paymentMethod: values.paymentMethod,
        installments: values.installments,
        isRecurring: finalIsRecurring,
        expenseNature: values.expenseNature,
        expenseType: finalExpenseType,
      };
      await onAddTransaction(transactionData);

      form.reset({
        description: "",
        amount: undefined,
        category: "",
        date: defaultDate || new Date(),
        expenseType: undefined,
        paymentMethod: undefined,
        installments: undefined,
        isRecurring: initialType === 'income' ? false : (form.getValues('expenseType') === 'recurring'), // Reset based on type
        expenseNature: undefined,
      });
      setSelectedExpenseType(undefined);
      // Categories will be re-evaluated by the effect watching initialType if it changes
    } catch (error) {
      console.error("Error submitting transaction from TransactionForm:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const descriptionLabel = translate({ en: "Description", pt: "Descrição" });
  const descriptionPlaceholder = translate({ en: "e.g., Coffee, Salary", pt: "ex: Café, Salário" });
  const amountLabel = translate({ en: "Amount", pt: "Valor" });
  const categoryLabel = translate({ en: "Category", pt: "Categoria" });
  const categoryPlaceholder = translate({ en: "Select a category", pt: "Selecione uma categoria" });
  const dateLabel = translate({ en: "Date", pt: "Data" });
  const pickDateLabel = translate({ en: "Pick a date", pt: "Escolha uma data" });
  const paymentMethodLabel = translate({ en: "Payment Method", pt: "Forma de Pagamento" });
  const paymentTypeLabel = translate({ en: "Payment Type", pt: "Tipo de Pagamento" }); // Used for Expense Type
  const installmentsLabel = translate({ en: "Number of Installments", pt: "Número de Parcelas" });
  const isRecurringLabel = translate({ en: "Apply to all months", pt: "Aplicar para todos os meses" });
  const expenseNatureLabel = translate({ en: "Expense Nature", pt: "Natureza da Despesa" });
  const fixedLabel = translate({ en: "Fixed", pt: "Fixo" });
  const variableLabel = translate({ en: "Variable", pt: "Variável" });
  const addTransactionButtonLabel = translate({ en: "Add Transaction", pt: "Adicionar Transação" });
  const submittingButtonLabel = translate({ en: "Adding...", pt: "Adicionando..." });

  console.log('TRANSACTION FORM RENDER START');
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
              <FormLabel>{selectedExpenseType === "installment" ? translate({ en: "Installment Amount", pt: "Valor da Parcela" }) : amountLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                  value={field.value === undefined ? '' : String(field.value)}
                  onChange={e => field.onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
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
              <Select onValueChange={field.onChange} value={field.value} disabled={availableCategories.length === 0}>
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
                <FormLabel>{isRecurringLabel}</FormLabel>
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
                <Select onValueChange={field.onChange} value={field.value || undefined}>
                  <FormControl>
                    <SelectTrigger>
                        <SelectValue placeholder={translate({ en: "Select payment method", pt: "Selecione a forma de pagamento" })} />
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
                        } else { // 'upfront' or 'installment'
                           form.setValue('isRecurring', false);
                           if (castValue !== 'installment') { // Clear installments if not installment type
                             form.setValue('installments', undefined);
                           }
                        }
                      }}
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={translate({ en: "Select payment type", pt: "Selecione o tipo de pagamento" })} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="upfront">{translate({ en: "Upfront", pt: "À Vista" })}</SelectItem>
                        <SelectItem value="installment">{translate({ en: "Installment", pt: "Parcelado" })}</SelectItem>
                        <SelectItem value="recurring">{translate({ en: "Recurring", pt: "Recorrente" })}</SelectItem>
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
                    <FormLabel>{installmentsLabel}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="e.g., 10"
                        {...field}
                        value={field.value === undefined ? '' : String(field.value)}
                        onChange={e => field.onChange(e.target.value === '' ? undefined : parseInt(e.target.value, 10))}
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
                    <RadioGroup // This RadioGroup was missing from the previous full re-emit. Adding it back.
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
          {isSubmitting ? submittingButtonLabel : addTransactionButtonLabel}
        </Button>
      </form>
    </Form>
  );
}
    