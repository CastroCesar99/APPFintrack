"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type SubmitHandler } from "react-hook-form";
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
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useLanguage } from "@/context/language-context";
import { Chrome } from "lucide-react"; // Using Chrome icon as a proxy for Google or just generic
import { Separator } from "@/components/ui/separator";

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
  const { logIn, signInWithGoogle, sendPasswordResetEmail } = useAuth(); // Use new method
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
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
      // Redirection is now handled globally by AuthGuard
    } else {
      toast({
        title: translate({ en: "Login Error", pt: "Erro no Login" }),
        description: translate({ en: "Invalid email or password. Please try again.", pt: "Email ou senha inválidos. Por favor, tente novamente." }),
        variant: "destructive",
      });
    }
  }

  async function handleGoogleLogin() {
    setIsGoogleLoading(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        toast({
          title: translate({ en: "Login successful!", pt: "Login bem-sucedido!" }),
          description: translate({ en: "Welcome back with Google.", pt: "Bem-vindo(a) de volta com o Google." })
        });
        // Redirection is now handled globally by AuthGuard
      }
    } catch (error) {
      console.error("Google login error:", error);
      toast({
        title: translate({ en: "Login Error", pt: "Erro no Login" }),
        description: translate({ en: "Could not sign in with Google. Please try again.", pt: "Não foi possível entrar com o Google. Tente novamente." }),
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  }

  const onForgotPasswordSubmit: SubmitHandler<ForgotPasswordFormValues> = async (data) => {
    setIsSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(data.resetEmail); // Use from context
      toast({
        title: translate({ en: "Password Reset Email Sent", pt: "E-mail de Redefinição Enviado" }),
        description: translate({ en: "If an account exists for this email, a password reset link has been sent.", pt: "Se existir uma conta para este e-mail, um link de redefinição de senha foi enviado." }),
      });
      setIsForgotPasswordOpen(false);
      forgotPasswordForm.reset();
    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      let errorMessage = translate({ en: "Could not send reset email. Please try again.", pt: "Não foi possível enviar o e-mail de redefinição. Por favor, tente novamente." });
      // Firebase specific error codes can be checked here if needed, e.g. error.code === 'auth/user-not-found'
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
          <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading || isGoogleLoading}>
            {isLoading ? translate({ en: "Signing in...", pt: "Entrando..." }) : translate({ en: "Sign In", pt: "Entrar" })}
          </Button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {translate({ en: "Or continue with", pt: "Ou continue com" })}
              </span>
            </div>
          </div>

          <Button 
            type="button" 
            variant="outline" 
            className="w-full" 
            onClick={handleGoogleLogin} 
            disabled={isLoading || isGoogleLoading}
          >
            {isGoogleLoading ? (
              <Chrome className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
              </svg>
            )}
            {translate({ en: "Login with Google", pt: "Entrar com Google" })}
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