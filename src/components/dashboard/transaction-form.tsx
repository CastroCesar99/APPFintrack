
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
import { CATEGORIES, getCategoriesByType, CategoryName } from "@/types";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

const formSchema = z.object({
  description: z.string().min(2, { message: "Description must be at least 2 characters." }).max(100),
  amount: z.coerce.number().positive({ message: "Amount must be positive." }),
  type: z.enum(["income", "expense"], { required_error: "Transaction type is required." }),
  category: z.string().min(1, { message: "Category is required." }),
  date: z.date({ required_error: "Date is required." }),
});

type TransactionFormValues = z.infer<typeof formSchema>;

interface TransactionFormProps {
  onAddTransaction: (transaction: Omit<Transaction, "id">) => void;
}

export function TransactionForm({ onAddTransaction }: TransactionFormProps) {
  const { toast } = useToast();
  const [selectedType, setSelectedType] = useState<TransactionType>("expense");
  const [availableCategories, setAvailableCategories] = useState(() => getCategoriesByType("expense"));

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      description: "",
      amount: 0,
      type: "expense",
      category: "",
      date: new Date(),
    },
  });

  const typeFieldValue = form.watch("type");

  useEffect(() => {
    setSelectedType(typeFieldValue);
    const newCategories = getCategoriesByType(typeFieldValue);
    setAvailableCategories(newCategories);

    const currentCategoryInForm = form.getValues("category");
    if (currentCategoryInForm) {
      const isCategoryStillValid = newCategories.some(cat => cat.name === currentCategoryInForm);
      if (!isCategoryStillValid) {
        form.setValue("category", "", { shouldValidate: true });
      }
    }
  }, [typeFieldValue, form, setSelectedType, setAvailableCategories]);


  function onSubmit(values: TransactionFormValues) {
    onAddTransaction({
      ...values,
      date: format(values.date, "yyyy-MM-dd"), // Format date to string
      category: values.category as CategoryName,
    });
    toast({
      title: "Transaction Added",
      description: `${values.description} for ${values.amount} has been added.`,
    });
    form.reset();
    // Reset date to today after submission
    form.setValue("date", new Date()); 
    form.setValue("type", "expense"); // Reset type to expense
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Coffee, Salary" {...field} />
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
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0.00" {...field} />
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
              <FormLabel>Type</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={(value) => {
                    field.onChange(value);
                    // setSelectedType(value as TransactionType); // This state is now updated via useEffect based on form.watch("type")
                  }}
                  defaultValue={field.value}
                  className="flex space-x-4"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="income" />
                    </FormControl>
                    <FormLabel className="font-normal">Income</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="expense" />
                    </FormControl>
                    <FormLabel className="font-normal">Expense</FormLabel>
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
              <FormLabel>Category</FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={availableCategories.length === 0}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name}
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
              <FormLabel>Date</FormLabel>
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
                        <span>Pick a date</span>
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
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Add Transaction</Button>
      </form>
    </Form>
  );
}
