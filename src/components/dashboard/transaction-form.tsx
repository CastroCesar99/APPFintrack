
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
import type { Transaction, TransactionType, ExpenseNature, CategoryName, DisplayCategory, DisplayPaymentMethod, ExpenseType } from "@/types";
import { CATEGORIES, getCategoryDisplayLabel, PAYMENT_METHODS, getPaymentMethodDisplayLabel } from "@/types"; 
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";
import { Calendar } from "@/components/ui/calendar";

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  category: z.string().min(1, { message: "Category is required." }),
  date: z.date({ required_error: "Date is required." }),
  expenseType: z.enum(["upfront", "installment", "recurring"] as [ExpenseType, ...ExpenseType[]]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.coerce.number().int().min(1, "Installments must be at least 1 if selected.").optional(),
  isRecurring: z.boolean().optional(),
  expenseNature: z.enum(["fixed", "variable"] as [ExpenseNature, ...ExpenseNature[]]).optional(),
}).refine(data => {
    if (data.expenseType === 'installment' && (data.installments === undefined || data.installments < 1)) {
        return false;
    }
    return true;
}, {
    message: "Number of installments is required for installment type expenses and must be at least 1.",
    path: ["installments"],
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
    console.log("TransactionForm TRACER --- useEffect for initialType running. initialType:", initialType, "defaultDate:", defaultDate?.toISOString());
    
    const relevantUserCategories = userCategories.filter(cat => cat.type === initialType);
    setAvailableCategories(relevantUserCategories);

    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm && !relevantUserCategories.some(cat => cat.name === currentCategoryInForm)) {
      form.setValue("category", "");
    }
    
    const currentExpenseType = form.getValues('expenseType');
    setSelectedExpenseType(currentExpenseType);

    if (initialType === 'income') {
      form.setValue('expenseType', undefined);
      form.setValue('paymentMethod', undefined);
      form.setValue('installments', undefined);
      form.setValue('expenseNature', undefined);
      setSelectedExpenseType(undefined); // Clear visual state as well
    } else { // expense
      // Ensure isRecurring is correctly set based on expenseType for expenses
      if (currentExpenseType === 'recurring') {
        form.setValue('isRecurring', true);
      } else {
        form.setValue('isRecurring', false);
        if (currentExpenseType !== 'installment') {
            form.setValue('installments', undefined);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType, form.setValue, form.getValues, userCategories]); // form.setValue and getValues are stable

  async function onSubmit(values: TransactionFormValues) {
    setIsSubmitting(true);
    console.log("TransactionForm TRACER --- onSubmit with values.date:", values.date);
    try {
      let finalIsRecurring = values.isRecurring || false;
      let finalExpenseType = values.expenseType;

      if (initialType === 'expense') {
        if (values.expenseType === 'recurring') {
          finalIsRecurring = true;
        } else { // 'upfront' or 'installment'
          finalIsRecurring = false; // Installments and upfront are not "recurring" in the same sense
        }
      } else { // initialType === 'income'
         // For income, isRecurring is directly from its checkbox
         finalIsRecurring = values.isRecurring || false;
         finalExpenseType = undefined; // Income doesn't have expenseType
      }

      const transactionData: Omit<Transaction, "id" | "userId" | "createdAt"> = {
        description: values.description,
        amount: values.amount,
        type: initialType,
        category: values.category as CategoryName,
        date: format(values.date, "yyyy-MM-dd"),
        paymentMethod: values.paymentMethod,
        installments: values.expenseType === 'installment' ? values.installments : undefined, // Only pass installments if type is installment
        isRecurring: finalIsRecurring,
        expenseNature: values.expenseNature,
        expenseType: initialType === 'expense' ? finalExpenseType : undefined, // Only pass expenseType for expenses
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
        isRecurring: false, 
        expenseNature: undefined,
      });
      setSelectedExpenseType(undefined);
      
    } catch (error) {
      console.error("Error submitting transaction from TransactionForm:", error);
    } finally {
      setIsSubmitting(false);
    }
  }
  console.log('TRANSACTION FORM RENDER START');
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate({ en: "Description", pt: "Descrição" })}</FormLabel>
              <FormControl>
                <Input placeholder={translate({ en: "e.g., Coffee, Salary", pt: "ex: Café, Salário" })} {...field} />
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
              <FormLabel>{selectedExpenseType === "installment" ? translate({ en: "Installment Amount", pt: "Valor da Parcela" }) : translate({ en: "Amount", pt: "Valor" })}</FormLabel>
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
              <FormLabel>{translate({ en: "Category", pt: "Categoria" })}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={availableCategories.length === 0}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={translate({ en: "Select a category", pt: "Selecione uma categoria" })} />
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
              <FormLabel>{translate({ en: "Date", pt: "Data" })}</FormLabel>
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
                        <span>{translate({ en: "Pick a date", pt: "Escolha uma data" })}</span>
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
                <FormLabel>{translate({ en: "Apply to all months", pt: "Aplicar para todos os meses" })}</FormLabel>
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
                <FormLabel>{translate({ en: "Payment Method", pt: "Forma de Pagamento" })}</FormLabel>
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
                  <FormLabel>{translate({ en: "Payment Type", pt: "Tipo de Pagamento" })}</FormLabel>
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
                    <FormLabel>{translate({ en: "Number of Installments", pt: "Número de Parcelas" })}</FormLabel>
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
                  <FormLabel>{translate({ en: "Expense Nature", pt: "Natureza da Despesa" })}</FormLabel>
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
                          {translate({ en: "Fixed", pt: "Fixo" })}
                        </FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-3 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="variable" />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {translate({ en: "Variable", pt: "Variável" })}
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
          {isSubmitting ? translate({ en: "Adding...", pt: "Adicionando..." }) : translate({ en: "Add Transaction", pt: "Adicionar Transação" })}
        </Button>
      </form>
    </Form>
  );
}
    
