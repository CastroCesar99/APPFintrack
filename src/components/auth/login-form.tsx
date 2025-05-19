
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form"; // Added SubmitHandler
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLanguage } from "@/context/language-context";
import { sendPasswordResetEmail, getAuth } from "firebase/auth";
import { auth as firebaseAuth } from "@/lib/firebase"; // Renamed to avoid conflict

const loginFormSchema = z.object({
  email: z.string().email({ message: "Por favor, insira um email válido." }),
  password: z.string().min(6, { message: "A senha deve ter pelo menos 6 caracteres." }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

const forgotPasswordSchema = z.object({
  resetEmail: z.string().email({ message: "Por favor, insira um email válido para redefinição." }),
});
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;


export function LoginForm() {
  const { logIn } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const { translate } = useLanguage();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      resetEmail: "",
    }
  });

  async function onLoginSubmit(values: LoginFormValues) {
    setIsLoading(true);
    const user = await logIn(values.email, values.password);
    setIsLoading(false);
    if (user) {
      toast({
        title: translate({ en: "Login successful!", pt: "Login bem-sucedido!" }),
        description: translate({ en: "Welcome back.", pt: "Bem-vindo(a) de volta." })
      });
      router.push("/"); 
    } else {
      toast({
        title: translate({ en: "Login Error", pt: "Erro no Login" }),
        description: translate({ en: "Invalid email or password. Please try again.", pt: "Email ou senha inválidos. Por favor, tente novamente." }),
        variant: "destructive",
      });
    }
  }

  const onForgotPasswordSubmit: SubmitHandler<ForgotPasswordFormValues> = async (data) => {
    setIsSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(firebaseAuth, data.resetEmail);
      toast({
        title: translate({ en: "Password Reset Email Sent", pt: "E-mail de Redefinição Enviado" }),
        description: translate({ en: "If an account exists for this email, a password reset link has been sent.", pt: "Se existir uma conta para este e-mail, um link de redefinição de senha foi enviado." }),
      });
      setIsForgotPasswordOpen(false);
      forgotPasswordForm.reset();
    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      let errorMessage = translate({ en: "Could not send reset email. Please try again.", pt: "Não foi possível enviar o e-mail de redefinição. Por favor, tente novamente." });
      if (error.code === 'auth/user-not-found') {
        errorMessage = translate({ en: "No user found with this email address.", pt: "Nenhum usuário encontrado com este endereço de e-mail." });
      }
      toast({
        title: translate({ en: "Password Reset Error", pt: "Erro na Redefinição de Senha" }),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  return (
    <>
      <Form {...loginForm}>
        <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-6">
          <FormField
            control={loginForm.control}
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
            control={loginForm.control}
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
          <div className="flex justify-center">
            <Button
              type="button"
              variant="link"
              className="px-0 text-sm h-auto"
              onClick={() => setIsForgotPasswordOpen(true)}
            >
              {translate({ en: "Forgot password?", pt: "Esqueci minha senha?" })}
            </Button>
          </div>
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
            {isLoading ? translate({ en: "Signing in...", pt: "Entrando..." }) : translate({ en: "Sign In", pt: "Entrar" })}
          </Button>
        </form>
      </Form>

      <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{translate({ en: "Forgot Password", pt: "Esqueceu a Senha?" })}</DialogTitle>
            <DialogDescription>
              {translate({ en: "Enter your email address and we'll send you a link to reset your password.", pt: "Digite seu endereço de e-mail e enviaremos um link para redefinir sua senha." })}
            </DialogDescription>
          </DialogHeader>
          <Form {...forgotPasswordForm}>
            <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)} className="space-y-4 py-4">
              <FormField
                control={forgotPasswordForm.control}
                name="resetEmail"
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
              <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline" disabled={isSendingResetEmail}>
                         {translate({ en: "Cancel", pt: "Cancelar"})}
                    </Button>
                </DialogClose>
                <Button type="submit" disabled={isSendingResetEmail}>
                  {isSendingResetEmail ? translate({ en: "Sending...", pt: "Enviando..." }) : translate({ en: "Send Reset Email", pt: "Enviar E-mail de Redefinição" })}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
