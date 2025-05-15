
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Transaction, TransactionType } from "@/types";
import { CATEGORIES, getCategoriesByType, CategoryName, getCategoryLabel } from "@/types";
import { useState, useEffect } from "react";
import { useLanguage } from "@/context/language-context";

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  type: z.enum(["income", "expense"], { required_error: "Transaction type is required." }),
  category: z.string().min(1, { message: "Category is required." }),
  expenseType: z.enum(["upfront", "installment", "recurring"]).optional(), // Updated to reflect payment types
  paymentMethod: z.string().optional(), // Added for payment method
  installments: z.coerce.number().int().positive().optional(), // Added for installments
  date: z.date({ required_error: "Date is required." }),
  isRecurring: z.boolean().optional(), // Added for recurring income
});

type TransactionFormValues = z.infer<typeof formSchema>;
interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">) => Promise<void>;
  initialType: TransactionType;
}

export function TransactionForm({ onAddTransaction, initialType }: TransactionFormProps) {
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState(() => getCategoriesByType(initialType, language));
  const [selectedPaymentMethodType, setSelectedPaymentMethodType] = useState<"upfront" | "installment" | "recurring" | undefined>(undefined); // State for payment method type
  const [isSubmitting, setIsSubmitting] = useState(false);

  // TODO: Fetch configured payment methods and update the 'paymentMethods' state.

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
 amount: undefined, // Changed from 0 to undefined
      type: initialType,
      category: "",
      date: new Date(),
      expenseType: undefined,
      paymentMethod: undefined, // Initialize new field
      installments: undefined, // Initialize new field
      isRecurring: false, // Initialize new field
    },
  });

  useEffect(() => {
    form.setValue("type", initialType);
    const newCategories = getCategoriesByType(initialType, language);
    setAvailableCategories(newCategories);
    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm) {
        const isCategoryStillValid = newCategories.some(cat => cat.name === currentCategoryInForm);
        if (!isCategoryStillValid) {
            form.setValue("category", "", { shouldValidate: true });
        }
    }
  }, [initialType, language, form]);


  async function onSubmit(values: TransactionFormValues) {
    setIsSubmitting(true);
    try {
      console.log("Transaction object being sent:", { ...values, category: values.category as CategoryName });
      await onAddTransaction({
 description: values.description,
        amount: values.amount,
        type: values.type,
        category: values.category as CategoryName,
        // Include fields based on transaction type
        ...(values.type === 'expense' && values.expenseType && { expenseType: values.expenseType }), // Only include if expenseType is selected
        ...(values.type === 'expense' && selectedPaymentMethodType && { paymentMethod: selectedPaymentMethodType === 'installment' && values.installments ? `installment-${values.installments}` : selectedPaymentMethodType }), // Use selectedPaymentMethodType and format if installment
        ...(values.type === 'income' && { isRecurring: values.isRecurring || false }),
      })

      form.reset({
 amount: undefined, // Also reset to undefined
          // Reset new fields as well
 expenseType: undefined,
          paymentMethod: undefined, // Reset to undefined for form state
 installments: undefined, // Reset installments
 isRecurring: false, // Keep initialType and category
 description: "",
          date: new Date(),
      },{ keepValues: true, keepDirtyValues: true }); // Keep initialType and category
 setSelectedPaymentMethodType(undefined); // Reset payment method type
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

  const addTransactionButtonLabel = translate({ en: "Add Transaction", pt: "Adicionar Transação" });
  const submittingButtonLabel = translate({ en: "Adding...", pt: "Adicionando..." });

 return (
 <>
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
                <Input type="number" step="0.01" placeholder="0.00" {...field} />
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
 {form.getValues("type") === "income" && (
 <FormField
 control={form.control}
 name="isRecurring"
 render={({ field }) => (
 <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
 <FormControl>
 <Checkbox
 checked={field.value}
 onCheckedChange={field.onChange}
 />
 </FormControl>
 <div className="space-y-1 leading-none"><FormLabel>{isRecurringLabel}</FormLabel></div>
 <FormMessage />
 </FormItem>)}
 />
 )}
        {form.getValues("type") === "expense" && (
          <>
            <FormField
 control={form.control}
 name="paymentMethod"
 render={({ field }) => (
 <FormItem>
 <FormLabel>{paymentMethodLabel}</FormLabel>
 <Select onValueChange={field.onChange} value={field.value}>
 <FormControl>
 <SelectTrigger>
                      <SelectValue placeholder={translate({ en: "Select payment method", pt: "Selecione a forma de pagamento" })} />
 </SelectTrigger>
 </FormControl>
 <SelectContent>
                      <SelectItem value="Credit">{translate({ en: "Credit Card", pt: "Cartão de Crédito" })}</SelectItem>
                      <SelectItem value="Debit">{translate({ en: "Debit Card", pt: "Cartão de Débito" })}</SelectItem>
                      <SelectItem value="Cash">{translate({ en: "Cash", pt: "Dinheiro" })}</SelectItem>
 {/* Add more payment methods here if needed */}
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
                <>
                  <FormLabel>{paymentTypeLabel}</FormLabel>
                  <FormItem {...field}> {/* Corrected FormItem usage */}
                    <Select onValueChange={setSelectedPaymentMethodType} value={selectedPaymentMethodType}> {/* Simplified onValueChange */}
                      <FormControl>
                        <SelectTrigger ref={field.ref}> {/* Add ref */}
                          <SelectValue placeholder={translate({ en: "Select payment method", pt: "Selecione a forma de pagamento" })} />
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
                </>
              )}
            />
            {selectedPaymentMethodType === "installment" && ( // Check selectedPaymentMethodType
              <FormField
                control={form.control}
                name="installments"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{installmentsLabel}</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="e.g., 10" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </>
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
          {isSubmitting ? submittingButtonLabel : addTransactionButtonLabel}
        </Button>
      </form>
    </Form>
 </>
  );
}
