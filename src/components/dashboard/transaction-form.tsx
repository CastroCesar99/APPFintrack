
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
  // Type is no longer selected in the form, it's passed as initialType
  // type: z.enum(["income", "expense"], { required_error: "Transaction type is required." }),
  category: z.string().min(1, { message: "Category is required." }),
  expenseType: z.enum(["upfront", "installment", "recurring"]).optional(),
  paymentMethod: z.string().optional(),
  installments: z.coerce.number().int().positive().optional(),
  date: z.date({ required_error: "Date is required." }),
  isRecurring: z.boolean().optional(),
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id" | "userId" | "createdAt">) => Promise<void>;
  initialType: TransactionType;
}

export function TransactionForm({ onAddTransaction, initialType }: TransactionFormProps) {
  const { language, translate } = useLanguage();
  const [availableCategories, setAvailableCategories] = useState(() => getCategoriesByType(initialType));
  const [selectedPaymentMethodType, setSelectedPaymentMethodType] = useState<"upfront" | "installment" | "recurring" | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);


  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      amount: undefined,
      category: "",
      date: new Date(),
      expenseType: undefined,
      paymentMethod: undefined,
      installments: undefined,
      isRecurring: false,
    },
  });

  // Effect to update available categories and reset category if type changes
  useEffect(() => {
    const newCategories = getCategoriesByType(initialType);
    setAvailableCategories(newCategories);
    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm) {
        const isCategoryStillValid = newCategories.some(cat => cat.name === currentCategoryInForm);
        if (!isCategoryStillValid) {
            form.setValue("category", "", { shouldValidate: true });
        }
    }
  }, [initialType, form]);


  async function onSubmit(values: TransactionFormValues) {
    setIsSubmitting(true);
    try {
      // Construct the transaction data, ensuring type is from initialType
      const transactionData: Omit<Transaction, "id" | "userId" | "createdAt"> = {
        description: values.description,
        amount: values.amount,
        type: initialType, // Use initialType passed as prop
        category: values.category as CategoryName,
        date: values.date.toISOString(), // Ensure date is an ISO string
        paymentMethod: values.paymentMethod,
        installments: values.installments,
        isRecurring: values.isRecurring,
      };
      await onAddTransaction(transactionData);

      form.reset({
        description: "",
        amount: undefined,
        category: "", // Reset category
        date: new Date(),
        expenseType: undefined,
        paymentMethod: undefined,
        installments: undefined,
        isRecurring: false,
      });
      setSelectedPaymentMethodType(undefined); // Reset payment method type
    } catch (error) {
      console.error("Error during transaction submission in TransactionForm:", error);
      // Error toast is handled by the parent component (QuickActionsSection)
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
  const paymentTypeLabel = translate({ en: "Payment Type", pt: "Método de Pagamento" }); // This label seems to refer to expenseType
  const installmentsLabel = translate({ en: "Number of Installments", pt: "Número de Parcelas" });
  const isRecurringLabel = translate({ en: "Apply to all months", pt: "Aplicar para todos os meses" });

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
        {initialType === "income" && (
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
        {initialType === "expense" && (
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
                      <SelectItem value="Credit Card">{translate({ en: "Credit Card", pt: "Cartão de Crédito" })}</SelectItem>
                      <SelectItem value="Debit Card">{translate({ en: "Debit Card", pt: "Cartão de Débito" })}</SelectItem>
                      <SelectItem value="Cash">{translate({ en: "Cash", pt: "Dinheiro" })}</SelectItem>
                      {/* TODO: Add user-defined payment methods */}
              </SelectContent>
              </Select>
              <FormMessage />
              </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="expenseType" // This field name seems more appropriate than "paymentType" which was a label
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{paymentTypeLabel}</FormLabel> {/* Label "Payment Type" referring to expenseType */}
                    <Select onValueChange={(value) => {
                        field.onChange(value); // Update RHF state
                        setSelectedPaymentMethodType(value as "upfront" | "installment" | "recurring" | undefined);
                    }} 
                    value={field.value}
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
          </>
        )}
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isSubmitting}>
          {isSubmitting ? submittingButtonLabel : addTransactionButtonLabel}
        </Button>
      </form>
    </Form>
  );
}
