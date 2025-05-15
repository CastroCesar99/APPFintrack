
"use client";

import type React from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListChecks, CreditCard, Languages, Mail, Heart, Cog, Sun, Moon } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { useTheme } from "@/context/theme-context";

export default function SettingsPage() {
  const { language, setLanguage, translate } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const handlePlaceholderClick = (featureName: string) => {
    toast({
      title: translate({ en: "Coming Soon!", pt: "Em Breve!" }),
      description: `${featureName} ${translate({ en: "feature is under development.", pt: "está em desenvolvimento."})}`,
    });
  };

  const pageTitle = translate({ en: "Settings", pt: "Configurações" });

  return (
    <AppLayout>
      <div className="space-y-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          {pageTitle}
        </h1>

        {/* Manage Categories */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <ListChecks className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Manage Categories", pt: "Gerenciar Categorias" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Add, edit, or delete expense and income categories.",
                  pt: "Adicione, edite ou exclua categorias de despesas e receitas."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Button onClick={() => handlePlaceholderClick(translate({en: "Category Management", pt:"Gerenciamento de Categorias"}))} className="w-full sm:w-auto">
              {translate({ en: "Go to Categories", pt: "Ir para Categorias" })}
            </Button>
          </CardContent>
        </Card>

        {/* Manage Payment Methods */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <CreditCard className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Manage Payment Methods", pt: "Gerenciar Métodos de Pagamento" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Add, edit, or delete your payment methods (e.g., credit cards, bank accounts).",
                  pt: "Adicione, edite ou exclua seus métodos de pagamento (ex: cartões de crédito, contas bancárias)."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Link href="/settings/payment-methods" passHref>
              <Button className="w-full sm:w-auto">
                {translate({ en: "Go to Payment Methods", pt: "Ir para Métodos de Pagamento" })}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Appearance / Theme Selection */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            {theme === 'dark' ? <Moon className="h-8 w-8 text-primary flex-shrink-0 mt-1" /> : <Sun className="h-8 w-8 text-primary flex-shrink-0 mt-1" />}
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Appearance", pt: "Aparência" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Customize the look and feel of the application.",
                  pt: "Personalize a aparência da aplicação."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center space-x-3">
              <Switch
                id="theme-switch"
                checked={theme === 'dark'}
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                aria-label={translate({ en: "Toggle theme", pt: "Alternar tema"})}
              />
              <Label htmlFor="theme-switch" className="cursor-pointer">
                {theme === 'dark' ? translate({ en: "Dark Mode", pt: "Modo Escuro" }) : translate({ en: "Light Mode", pt: "Modo Claro" })}
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Language Selection */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Languages className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Language", pt: "Idioma" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Select your preferred language for the application.",
                  pt: "Selecione seu idioma de preferência para a aplicação."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <RadioGroup
              value={language}
              onValueChange={(value) => setLanguage(value as 'en' | 'pt')}
              className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="en" id="lang-en-page" />
                <Label htmlFor="lang-en-page">English</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pt" id="lang-pt-page" />
                <Label htmlFor="lang-pt-page">Português (Brasil)</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Support */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Mail className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Support", pt: "Suporte" })}</CardTitle>
              <CardDescription>
                {translate({ en: "Need help or have questions?", pt: "Precisa de ajuda ou tem perguntas?" })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 text-sm">
            {translate({
              en: "If you need support, please send an email to",
              pt: "Se precisar de suporte, por favor envie um email para"
            })}{' '}
            <Link href="mailto:Cesar@Castromanagement.com" className="text-primary hover:underline">
              Cesar@Castromanagement.com
            </Link>.
          </CardContent>
        </Card>

        {/* Contribute to FinTrack */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Heart className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Contribute to FinTrack", pt: "Contribua com o FinTrack" })}</CardTitle>
              <CardDescription>
                {translate({ en: "Want to help improve FinTrack?", pt: "Quer ajudar a melhorar o FinTrack?" })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 text-sm">
            {translate({
              en: "If you'd like to contribute financially or with development, please contact us at",
              pt: "Se você gostaria de contribuir financeiramente ou com desenvolvimento, por favor entre em contato conosco em"
            })}{' '}
            <Link href="mailto:Cesar@Castromanagement.com" className="text-primary hover:underline">
              Cesar@Castromanagement.com
            </Link>.
          </CardContent>
        </Card>
        
        {/* More Settings Coming Soon */}
        <Card className="shadow-lg bg-muted/50 border-dashed">
          <CardHeader className="flex flex-row items-center justify-center text-center gap-4 space-y-0 py-8">
            <Cog className="h-10 w-10 text-muted-foreground" />
            <div>
              <CardTitle className="text-xl text-muted-foreground">{translate({ en: "More Settings Coming Soon", pt: "Mais Configurações Em Breve" })}</CardTitle>
              <CardDescription className="mt-1">
                {translate({
                  en: "Additional application preferences will be available here in the future.",
                  pt: "Preferências adicionais da aplicação estarão disponíveis aqui no futuro."
                })}
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

      </div>
    </AppLayout>
  );
}
