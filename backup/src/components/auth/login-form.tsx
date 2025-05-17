
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
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLanguage } from "@/context/language-context";

const loginFormSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um email válido." }), // Validation messages can be translated if schema is dynamic
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export function LoginForm() {
  const { logIn } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { translate } = useLanguage();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    setIsLoading(true);
    const user = await logIn(values.email, values.password);
    setIsLoading(false);
    if (user) {
      toast({
        title: translate({ en: "Login successful!", pt: "Login bem-sucedido!" }),
        description: translate({ en: "Welcome back.", pt: "Bem-vindo(a) de volta." })
      });
      router.push("/"); // Redirect to dashboard
    } else {
      toast({
        title: translate({ en: "Login Error", pt: "Erro no Login" }),
        description: translate({ en: "Invalid email or password. Please try again.", pt: "Email ou senha inválidos. Por favor, tente novamente." }),
        variant: "destructive",
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate({ en: "Email", pt: "Email" })}</FormLabel>
              <FormControl>
                <Input type="email" placeholder="seu@email.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate({ en: "Password", pt: "Senha" })}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
          {isLoading ? translate({ en: "Signing in...", pt: "Entrando..." }) : translate({ en: "Sign In", pt: "Entrar" })}
        </Button>
      </form>
    </Form>
  );
}
