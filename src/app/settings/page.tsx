"use client";

import type React from 'react';
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ListChecks, CreditCard, Languages, Mail, Heart, Cog, Sun, Moon, Star, Download, Upload } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import { useToast } from "@/hooks/use-toast";
import Link from 'next/link';
import { useTheme } from "@/context/theme-context";
import { useAuth } from "@/context/auth-context";
import { collection, getDocs, doc, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SettingsPage() {
  const { language, setLanguage, translate } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { user } = useAuth();

  const handleExportData = async () => {
    if (!user?.uid) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "You must be logged in to export data", pt: "Você deve estar logado para exportar dados" }),
        variant: "destructive"
      });
      return;
    }

    try {
      const exportData: any = {
        version: "1.0",
        exportDate: new Date().toISOString(),
        userId: user.uid,
        data: {}
      };

      // Export transactions
      const transactionsSnap = await getDocs(collection(db, 'users', user.uid, 'transactions'));
      exportData.data.transactions = transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Export categories
      const categoriesSnap = await getDocs(collection(db, 'users', user.uid, 'categories'));
      exportData.data.categories = categoriesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Export payment methods
      const paymentMethodsSnap = await getDocs(collection(db, 'users', user.uid, 'paymentMethods'));
      exportData.data.paymentMethods = paymentMethodsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Export budgets
      const budgetsSnap = await getDocs(collection(db, 'users', user.uid, 'budgets'));
      exportData.data.budgets = budgetsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Export user preferences
      const userPrefsDoc = await getDocs(collection(db, 'users', user.uid, 'preferences'));
      if (!userPrefsDoc.empty) {
        exportData.data.preferences = userPrefsDoc.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Create and download JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `athena-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: translate({ en: "Export Successful", pt: "Exportação Bem-sucedida" }),
        description: translate({ en: "Your data has been exported successfully", pt: "Seus dados foram exportados com sucesso" })
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: translate({ en: "Export Failed", pt: "Exportação Falhou" }),
        description: translate({ en: "Failed to export your data", pt: "Falha ao exportar seus dados" }),
        variant: "destructive"
      });
    }
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.uid) {
      toast({
        title: translate({ en: "Error", pt: "Erro" }),
        description: translate({ en: "You must be logged in to import data", pt: "Você deve estar logado para importar dados" }),
        variant: "destructive"
      });
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);

      if (!importData.data) {
        throw new Error("Invalid backup file format");
      }

      // Confirm import
      const confirmed = window.confirm(
        translate({ 
          en: "This will replace your current data. Are you sure you want to continue?", 
          pt: "Isso substituirá seus dados atuais. Tem certeza que deseja continuar?" 
        })
      );

      if (!confirmed) {
        event.target.value = '';
        return;
      }

      // Clear existing data
      const batch = writeBatch(db);

      // Clear transactions
      const existingTransactions = await getDocs(collection(db, 'users', user.uid, 'transactions'));
      existingTransactions.docs.forEach(doc => batch.delete(doc.ref));

      // Clear categories
      const existingCategories = await getDocs(collection(db, 'users', user.uid, 'categories'));
      existingCategories.docs.forEach(doc => batch.delete(doc.ref));

      // Clear payment methods
      const existingPaymentMethods = await getDocs(collection(db, 'users', user.uid, 'paymentMethods'));
      existingPaymentMethods.docs.forEach(doc => batch.delete(doc.ref));

      // Clear budgets
      const existingBudgets = await getDocs(collection(db, 'users', user.uid, 'budgets'));
      existingBudgets.docs.forEach(doc => batch.delete(doc.ref));

      // Clear preferences
      const existingPrefs = await getDocs(collection(db, 'users', user.uid, 'preferences'));
      existingPrefs.docs.forEach(doc => batch.delete(doc.ref));

      await batch.commit();

      // Import new data
      const importBatch = writeBatch(db);

      // Import transactions
      if (importData.data.transactions) {
        for (const transaction of importData.data.transactions) {
          const { id, ...data } = transaction;
          const docRef = doc(collection(db, 'users', user.uid, 'transactions'), id);
          importBatch.set(docRef, { ...data, userId: user.uid });
        }
      }

      // Import categories
      if (importData.data.categories) {
        for (const category of importData.data.categories) {
          const { id, ...data } = category;
          const docRef = doc(collection(db, 'users', user.uid, 'categories'), id);
          importBatch.set(docRef, data);
        }
      }

      // Import payment methods
      if (importData.data.paymentMethods) {
        for (const method of importData.data.paymentMethods) {
          const { id, ...data } = method;
          const docRef = doc(collection(db, 'users', user.uid, 'paymentMethods'), id);
          importBatch.set(docRef, data);
        }
      }

      // Import budgets
      if (importData.data.budgets) {
        for (const budget of importData.data.budgets) {
          const { id, ...data } = budget;
          const docRef = doc(collection(db, 'users', user.uid, 'budgets'), id);
          importBatch.set(docRef, { ...data, userId: user.uid });
        }
      }

      // Import preferences
      if (importData.data.preferences) {
        for (const pref of importData.data.preferences) {
          const { id, ...data } = pref;
          const docRef = doc(collection(db, 'users', user.uid, 'preferences'), id);
          importBatch.set(docRef, data);
        }
      }

      await importBatch.commit();

      toast({
        title: translate({ en: "Import Successful", pt: "Importação Bem-sucedida" }),
        description: translate({ en: "Your data has been imported successfully", pt: "Seus dados foram importados com sucesso" })
      });

      // Reset file input
      event.target.value = '';
    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: translate({ en: "Import Failed", pt: "Importação Falhou" }),
        description: translate({ en: "Failed to import your data. Please check the file format.", pt: "Falha ao importar seus dados. Verifique o formato do arquivo." }),
        variant: "destructive"
      });
      event.target.value = '';
    }
  };

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
            <Link href="/settings/categories">
              <Button className="w-full sm:w-auto">
                {translate({ en: "Go to Categories", pt: "Ir para Categorias" })}
              </Button>
            </Link>
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
            <Link href="/settings/payment-methods">
              <Button className="w-full sm:w-auto">
                {translate({ en: "Go to Payment Methods", pt: "Ir para Métodos de Pagamento" })}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Star className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Subscription", pt: "Assinatura" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Manage your subscription plan and billing details.",
                  pt: "Gerencie seu plano de assinatura e detalhes de faturamento."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Link href="/subscription">
              <Button className="w-full sm:w-auto">
                {translate({ en: "Manage Subscription", pt: "Gerenciar Assinatura" })}
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Data Export/Import */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Download className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Data Export/Import", pt: "Exportar/Importar Dados" })}</CardTitle>
              <CardDescription>
                {translate({
                  en: "Download your data as JSON or import from a backup file.",
                  pt: "Baixe seus dados como JSON ou importe de um arquivo de backup."
                })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <Button
              onClick={handleExportData}
              className="w-full sm:w-auto"
              variant="outline"
            >
              <Download className="w-4 h-4 mr-2" />
              {translate({ en: "Export Data", pt: "Exportar Dados" })}
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button
                className="w-full sm:w-auto"
                variant="outline"
              >
                <Upload className="w-4 h-4 mr-2" />
                {translate({ en: "Import Data", pt: "Importar Dados" })}
              </Button>
            </div>
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

        {/* Contribute to Athena */}
        <Card className="shadow-lg">
          <CardHeader className="flex flex-row items-start gap-4 space-y-0">
            <Heart className="h-8 w-8 text-primary flex-shrink-0 mt-1" />
            <div className="flex-grow">
              <CardTitle>{translate({ en: "Contribute to Athena", pt: "Contribua com o Athena" })}</CardTitle>
              <CardDescription>
                {translate({ en: "Want to help improve Athena?", pt: "Quer ajudar a melhorar o Athena?" })}
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
