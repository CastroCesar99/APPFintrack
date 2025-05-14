
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
import { updateProfile } from "firebase/auth";
import { useLanguage } from "@/context/language-context";
import { db } from "@/lib/firebase"; // Import db
import { doc, setDoc, serverTimestamp } from "firebase/firestore"; // Import Firestore functions

const signupFormSchema = z.object({
  name: z.string().min(2, { message: "O nome deve ter pelo menos 2 caracteres." }),
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem.",
  path: ["confirmPassword"],
});

type SignupFormValues = z.infer<typeof signupFormSchema>;

export function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const { translate } = useLanguage();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: SignupFormValues) {
    setIsLoading(true);
    const user = await signUp(values.email, values.password);

    if (user) {
      try {
        await updateProfile(user, { displayName: values.name });

        // Create user document in Firestore
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
          uid: user.uid,
          name: values.name,
          email: values.email,
          createdAt: serverTimestamp(),
          onboardingComplete: false, // Initialize onboarding status
        });

        toast({
          title: translate({ en: "Signup successful!", pt: "Cadastro realizado!" }),
          description: translate({ en: "Your account has been created.", pt: "Sua conta foi criada com sucesso." })
        });
        localStorage.removeItem('onboardingComplete'); // Ensure old localStorage value is cleared
        router.push("/onboarding");
      } catch (error) {
        console.error("Error updating profile or creating user document:", error);
        // Attempt to roll back user creation or provide guidance
        toast({
          title: translate({ en: "Signup error", pt: "Erro no cadastro" }),
          description: translate({ en: "An error occurred during signup. Please try again.", pt: "Ocorreu um erro durante o cadastro. Por favor, tente novamente." }),
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: translate({ en: "Signup Error", pt: "Erro no Cadastro" }),
        description: translate({ en: "Could not create your account. Email might already be in use.", pt: "Não foi possível criar sua conta. O email já pode estar em uso." }),
        variant: "destructive",
      });
    }
    setIsLoading(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate({ en: "Name", pt: "Nome" })}</FormLabel>
              <FormControl>
                <Input placeholder={translate({ en: "First name", pt: "Primeiro nome" })} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
                <Input type="password" placeholder={translate({en: "•••••••• (minimum 6 characters)", pt: "•••••••• (mínimo 6 caracteres)"})} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{translate({ en: "Confirm Password", pt: "Confirmar Senha" })}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
          {isLoading ? translate({ en: "Creating account...", pt: "Criando conta..." }) : translate({ en: "Create Account", pt: "Criar Conta" })}
        </Button>
      </form>
    </Form>
  );
}
