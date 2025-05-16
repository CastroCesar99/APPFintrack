
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR, enUS } from 'date-fns/locale';
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType, ExpenseNature, Category } from "@/types";
import { CATEGORIES, getCategoriesByType, CategoryName, getCategoryLabel } from "@/types";
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar"; // Ensure Calendar is imported

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  category: z.string().min(1, { message: "Category is required." }),
  date: z.date({ required_error: "Date is required." }),
  expenseType: z.enum(["upfront", "installment", "recurring"]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.coerce.number().int().positive().optional(),
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"]).optional(),
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id" | "userId" | "createdAt">) => Promise<void>;
  initialType: TransactionType;
  defaultDate?: Date;
}

export function TransactionForm({ onAddTransaction, initialType, defaultDate }: TransactionFormProps) {
  console.log("TransactionForm TRACER --- PROPS RECEIVED: defaultDate:", defaultDate?.toISOString(), "initialType:", initialType);
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState<Category[]>(() => getCategoriesByType(initialType));
  const [selectedPaymentMethodType, setSelectedPaymentMethodType] = useState<"upfront" | "installment" | "recurring" | undefined>(undefined);
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
    const newCategories = getCategoriesByType(initialType);
    setAvailableCategories(newCategories);

    const currentCategoryInForm = form.getValues("category");
    const isCategoryStillValid = (category: string, validCategories: Category[]) => {
      return validCategories.some(cat => cat.name === category);
    };
    if (!isCategoryStillValid(currentCategoryInForm, newCategories)) {
      form.setValue("category", "");
    }

    if (initialType === 'income') {
      setSelectedPaymentMethodType(undefined);
      form.setValue('expenseType', undefined);
      form.setValue('paymentMethod', undefined);
      form.setValue('installments', undefined);
      form.setValue('expenseNature', undefined);
    } else {
      // Ensure selectedPaymentMethodType reflects form value on initialType change to 'expense'
      setSelectedPaymentMethodType(form.getValues('expenseType'));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType, form.setValue, form.getValues]);


  async function onSubmit(values: TransactionFormValues) {
    setIsSubmitting(true);
    console.log("TransactionForm TRACER --- onSubmit with values.date:", values.date.toISOString());
    try {
      let finalIsRecurring = values.isRecurring || false;
      if (initialType === 'expense' && values.expenseType === 'recurring') {
        finalIsRecurring = true;
      }

      const transactionData: Omit<Transaction, "id" | "userId" | "createdAt"> = {
        description: values.description,
        amount: values.amount,
        type: initialType,
        category: values.category as CategoryName,
        date: format(values.date, "yyyy-MM-dd"), // Format to YYYY-MM-DD string
        paymentMethod: values.paymentMethod,
        installments: values.installments,
        isRecurring: finalIsRecurring,
        expenseNature: values.expenseNature as ExpenseNature | undefined,
      };
      await onAddTransaction(transactionData);

      form.reset({
        description: "",
        amount: undefined,
        category: "",
        date: defaultDate || new Date(), // Reset to the CURRENT defaultDate
        expenseType: undefined,
        paymentMethod: undefined,
        installments: undefined,
        isRecurring: false,
        expenseNature: undefined,
      });
      setSelectedPaymentMethodType(undefined);
      setAvailableCategories(getCategoriesByType(initialType)); // Ensure category list is correct for initialType

    } catch (error) {
      console.error("Error during transaction submission in TransactionForm:", error);
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
  const paymentTypeLabel = translate({ en: "Payment Type", pt: "Método de Pagamento" });
  const installmentsLabel = translate({ en: "Number of Installments", pt: "Número de Parcelas" });
  const isRecurringLabel = translate({ en: "Apply to all months", pt: "Aplicar para todos os meses" });
  const expenseNatureLabel = translate({ en: "Expense Nature", pt: "Natureza da Despesa" });
  const fixedLabel = translate({ en: "Fixed", pt: "Fixo" });
  const variableLabel = translate({ en: "Variable", pt: "Variável" });

  const addTransactionButtonLabel = translate({ en: "Add Transaction", pt: "Adicionar Transação" });
  const submittingButtonLabel = translate({ en: "Adding...", pt: "Adicionando..." });

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
              <FormLabel>{selectedPaymentMethodType === "installment" ? translate({ en: "Installment Amount", pt: "Valor da Parcela" }) : amountLabel}</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                  value={field.value === undefined ? '' : field.value}
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
            <div className="space-y-1 leading-none"><FormLabel>{isRecurringLabel}</FormLabel></div>
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
                      <SelectItem value="Credit Card">{translate({ en: "Credit Card", pt: "Cartão de Crédito" })}</SelectItem>
                      <SelectItem value="Debit Card">{translate({ en: "Debit Card", pt: "Cartão de Débito" })}</SelectItem>
                      <SelectItem value="Cash">{translate({ en: "Cash", pt: "Dinheiro" })}</SelectItem>
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
                        field.onChange(value);
                        setSelectedPaymentMethodType(value as "upfront" | "installment" | "recurring" | undefined);
                        if (value === 'recurring') {
                          form.setValue('isRecurring', true);
                        } else if (value === 'upfront' || value === 'installment') {
                           form.setValue('isRecurring', false);
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
            {selectedPaymentMethodType === "installment" && (
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
                        value={field.value === undefined ? '' : field.value}
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
          {isSubmitting ? submittingButtonLabel : addTransactionButtonLabel}
        </Button>
      </form>
    </Form>
  );
}
