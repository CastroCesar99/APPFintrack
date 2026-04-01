
"use client"; // This page must be a client component

import type React from 'react';
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { ThemeAwareLogo } from '@/components/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { GoogleAuthProvider, signInWithRedirect, getRedirectResult, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { triggerHaptic } from '@/utils/haptics';

export default function LoginPage() {
  const { user, loading, signInWithGoogle, signUp, logIn } = useAuth();
  const { translate } = useLanguage();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    general: ''
  });

  useEffect(() => {
    // REMOVIDO: Não usar window.location.href na verificação para evitar loop infinito
    // O redirecionamento será feito apenas pelo AuthGuard
    
    // Verificar se há resultado de redirect do Google
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          // Success haptic feedback for Google login
          triggerHaptic('success');
          // Login via redirect bem-sucedido
          window.location.href = '/';
        }
      } catch (error) {
        console.log('No redirect result or error:', error);
      }
    };
    
    // Carregar email salvo do localStorage
    const savedEmail = localStorage.getItem('athena_remembered_email');
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
    
    // Atraso artificial premium de 3 segundos
    const timer = setTimeout(() => {
      setMinimumTimePassed(true);
    }, 3000);
    
    checkRedirectResult();
    
    // Limpar timer
    return () => clearTimeout(timer);
  }, []);

  // Estado de carregamento premium - mostra apenas o logo
  const shouldShowLoginForm = !loading && !user && minimumTimePassed;
  
  if (loading || (!loading && user)) {
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-8 h-8 animate-spin rounded-full border-4 border-white border-t-transparent mx-auto mb-4"></div>
          <p>{translate({ en: "Loading...", pt: "Carregando..." })}</p>
        </div>
      </div>
    );
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAuthenticating) return;
    
    // Trigger haptic feedback
    triggerHaptic('light');
    
    // Reset errors
    setErrors({ email: '', password: '', general: '' });
    
    // Validation
    let hasError = false;
    if (!formData.email) {
      setErrors(prev => ({ ...prev, email: translate({ en: 'Email is required', pt: 'Email é obrigatório' }) }));
      hasError = true;
    }
    if (!formData.password) {
      setErrors(prev => ({ ...prev, password: translate({ en: 'Password is required', pt: 'Senha é obrigatória' }) }));
      hasError = true;
    }
    
    if (hasError) return;
    
    setIsAuthenticating(true);
    
    try {
      // Login com e-mail e senha
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      
      // Success haptic feedback
      triggerHaptic('success');
      
      // Salvar email no localStorage se "Lembre-se" estiver marcado
      if (rememberMe) {
        localStorage.setItem('athena_remembered_email', formData.email);
      } else {
        localStorage.removeItem('athena_remembered_email');
      }
      
      // REGRA NUCLEAR: Hard reload após sucesso do login
      window.location.href = '/';
      
    } catch (error: any) {
      console.error('Email login error:', error);
      if (error.code === 'auth/user-not-found') {
        setErrors(prev => ({ ...prev, email: translate({ en: 'User not found', pt: 'Usuário não encontrado' }) }));
      } else if (error.code === 'auth/wrong-password') {
        setErrors(prev => ({ ...prev, password: translate({ en: 'Incorrect password', pt: 'Senha incorreta' }) }));
      } else {
        setErrors(prev => ({ ...prev, general: translate({ en: 'Login failed', pt: 'Falha no login' }) }));
      }
      
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isAuthenticating) return;
    
    // Trigger haptic feedback
    triggerHaptic('light');
    
    setIsAuthenticating(true);
    
    try {
      // Usar signInWithRedirect em vez de popup para evitar bloqueio
      const provider = new GoogleAuthProvider();
      await signInWithRedirect(auth, provider);
      
      // Success haptic feedback será chamado no getRedirectResult
      
    } catch (error) {
      console.error('Google login error:', error);
      setErrors(prev => ({ ...prev, general: translate({ en: 'Google login failed', pt: 'Falha no login Google' }) }));
      setIsAuthenticating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Renderização principal - apenas UM logo
  return (
    <div className="fixed inset-0 w-full h-full bg-[#0f172a] overflow-hidden flex flex-col">
      {/* Background Pattern */}
      <div 
        className="absolute inset-0 opacity-30" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="flex-1 w-full h-full overflow-y-auto overflow-x-hidden flex flex-col items-center justify-center px-4 relative z-10">
        
        {/* Logo and Name - Animated Entrance */}
        <div className="text-center space-y-1">
          {/* Logo Container */}
          <div className="relative inline-block">
            <motion.div
              className="relative"
              whileHover={{ scale: 1.02 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 7, ease: 'easeOut' }}
            >
              {/* Logo ÚNICO - Tamanho Ultra Compacto */}
              <div className="relative w-40 h-40 mx-auto">
                <ThemeAwareLogo 
                  width={160} 
                  height={160} 
                  className="object-contain"
                />
              </div>
              
              {/* Subtle shine animation */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-tr from-transparent via-white to-transparent opacity-0 rounded-full"
                animate={{ opacity: [0, 0.5, 0] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 7 }}
              />
            </motion.div>
          </div>

          {/* Brand Name */}
          <h1 className="text-3xl font-light text-white tracking-wider animate-fade-in" style={{ animationDelay: '0.2s' }}>
            Athena
          </h1>

          {/* Tagline */}
          <p className="text-sm text-white/60 font-light tracking-wide animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {translate({ 
              en: "Intelligent Financial Management", 
              pt: "Gestão Financeira Inteligente" 
            })}
          </p>
        </div>

        {/* Formulário aparece apenas após o tempo mínimo */}
        {shouldShowLoginForm && (
          <motion.div 
            className="w-full max-w-sm mx-auto bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 shadow-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
          >
          <form onSubmit={handleEmailLogin} className="space-y-1">
            {/* Email Input */}
            <div className="space-y-1">
              <label htmlFor="email" className="text-sm font-medium text-white/80">
                {translate({ en: 'Email', pt: 'Email' })}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all duration-200"
                placeholder={translate({ en: 'Enter your email', pt: 'Digite seu email' })}
                disabled={isAuthenticating}
              />
              {errors.email && (
                <p className="text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-1">
              <label htmlFor="password" className="text-sm font-medium text-white/80">
                {translate({ en: 'Password', pt: 'Senha' })}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-transparent transition-all duration-200"
                placeholder={translate({ en: 'Enter your password', pt: 'Digite sua senha' })}
                disabled={isAuthenticating}
              />
              {errors.password && (
                <p className="text-sm text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-white bg-white/10 border-white/20 rounded focus:ring-white/30 focus:ring-2"
              />
              <label htmlFor="remember" className="text-sm text-white/80 cursor-pointer">
                {translate({ en: 'Remember me', pt: 'Lembre-se' })}
              </label>
            </div>

            {/* General Error */}
            {errors.general && (
              <div className="p-3 bg-red-400/10 border border-red-400/20 rounded-lg">
                <p className="text-sm text-red-400">{errors.general}</p>
              </div>
            )}

            {/* Login Button */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.1 }}
              className="animate-scale-in duration-300"
              style={{ animationDelay: '6.0s' }}
            >
              <button
                type="submit"
                disabled={isAuthenticating}
                className="w-full h-10 bg-white text-slate-900 hover:bg-white/90 disabled:bg-white/70 rounded-xl font-medium text-base shadow-lg shadow-white/10 transition-all duration-200 flex items-center justify-center space-x-2"
              >
                {isAuthenticating ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-slate-900 border-t-transparent"></div>
                    <span>{translate({ en: "Signing in...", pt: "Entrando..." })}</span>
                  </>
                ) : (
                  <span>{translate({ 
                    en: "Sign In", 
                    pt: "Entrar" 
                  })}</span>
                )}
              </button>
            </motion.div>
          </form>

          {/* Divider */}
          <div className="relative my-6 w-full overflow-hidden">
            <div className="absolute inset-0 flex items-center w-full">
              <div className="w-full border-t border-white/20"></div>
            </div>
            <div className="relative flex justify-center text-sm w-full">
              <span className="px-2 bg-transparent text-white/60">
                {translate({ en: "or", pt: "ou" })}
              </span>
            </div>
          </div>

          {/* Google Login Button */}
          <motion.div
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
            className="animate-scale-in duration-300"
            style={{ animationDelay: '6.5s' }}
          >
            <button
              onClick={handleGoogleLogin}
              disabled={isAuthenticating}
              className="w-full h-10 border border-white/40 text-white hover:bg-white/20 hover:border-white/60 disabled:border-white/20 disabled:text-white/60 rounded-xl font-medium text-base transition-all duration-200 flex items-center justify-center space-x-2 bg-white/5"
            >
              {isAuthenticating ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>{translate({ en: "Connecting...", pt: "Conectando..." })}</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>{translate({ 
                    en: "Sign in with Google", 
                    pt: "Entrar com Google" 
                  })}</span>
                </>
              )}
            </button>
          </motion.div>

          {/* Sign Up Link */}
          <div className="text-center">
            <p className="text-sm text-white/60">
              {translate({ 
                en: "Don't have an account? ", 
                pt: "Não tem uma conta? " 
              })}
              <Link 
                href="/signup" 
                className="text-white hover:text-white/80 font-medium transition-colors"
              >
                {translate({ 
                  en: "Create one", 
                  pt: "Criar uma" 
                })}
              </Link>
            </p>
          </div>
        </motion.div>
        )}
      </div>

      {/* Subtle floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${20 + i * 15}%`,
              top: `${10 + (i % 3) * 30}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.8, 0.2],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
