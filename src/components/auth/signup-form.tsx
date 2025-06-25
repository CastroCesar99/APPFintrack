
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
import { updateProfile, sendEmailVerification } from "firebase/auth";
import { useLanguage } from '@/context/language-context';
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";

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

        // Create or merge user document in Firestore
        const userDocRef = doc(db, "users", user.uid);
        const trialEndDate = new Date();
        trialEndDate.setDate(trialEndDate.getDate() + 7);

        await setDoc(userDocRef, {
          uid: user.uid,
          name: values.name,
          email: values.email,
          createdAt: serverTimestamp(),
          onboardingComplete: false,
          emailVerified: false,
          subscriptionStatus: 'trial',
          trialEndDate: Timestamp.fromDate(trialEndDate),
        }, { merge: true });

        await sendEmailVerification(user);

        toast({
          title: translate({ en: "Signup successful!", pt: "Cadastro realizado!" }),
          description: translate({ 
            en: "Your account has been created. Please check your email to verify your account before proceeding.", 
            pt: "Sua conta foi criada com sucesso. Por favor, verifique seu e-mail para ativar sua conta antes de prosseguir." 
          })
        });
        localStorage.removeItem('onboardingComplete'); 
        router.push("/verify-email"); 
      } catch (error: any) {
        console.error("Error during signup post-processing:", error);
        let errorMessage = translate({ en: "An error occurred. Please try again.", pt: "Ocorreu um erro. Por favor, tente novamente." });
        if (error.code === 'auth/email-already-in-use') {
          errorMessage = translate({ en: "This email is already in use.", pt: "Este e-mail já está em uso." });
        } else if (error.code) {
          errorMessage = `${translate({ en: "Error:", pt: "Erro:" })} ${error.code} - ${error.message}`;
        }
        toast({
          title: translate({ en: "Signup Error", pt: "Erro no Cadastro" }),
          description: errorMessage,
          variant: "destructive",
        });
      }
    } else {
      toast({
        title: translate({ en: "Signup Error", pt: "Erro no Cadastro" }),
        description: translate({ en: "Could not create your account. The email might already be in use or another error occurred.", pt: "Não foi possível criar sua conta. O e-mail já pode estar em uso ou ocorreu outro erro." }),
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
                <Input placeholder={translate({en: "First name", pt: "Primeiro nome"})} {...field} />
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
