"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/context/language-context';
import { useAuth } from '@/context/auth-context';
import { motion } from 'framer-motion';
import Image from 'next/image';

export function WelcomeScreen() {
  const router = useRouter();
  const { translate } = useLanguage();
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [owlBlink, setOwlBlink] = useState(false);

  useEffect(() => {
    // Trigger entrance animation after mount
    const timer = setTimeout(() => setIsLoaded(true), 100);
    
    // Subtle owl blink animation every 10 seconds
    const blinkInterval = setInterval(() => {
      setOwlBlink(true);
      setTimeout(() => setOwlBlink(false), 150);
    }, 10000);

    return () => {
      clearTimeout(timer);
      clearInterval(blinkInterval);
    };
  }, []);

  const handleGetStarted = () => {
    // Haptic feedback for native feel
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    router.push('/signup');
  };

  const handleAccessAccount = () => {
    // Haptic feedback for native feel
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center px-6 relative overflow-hidden">
      
      {/* Subtle background pattern */}
      <div 
        className="absolute inset-0 opacity-30" 
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.02'%3E%3Ccircle cx='7' cy='7' r='1'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}
      />
      
      <div className="w-full max-w-sm mx-auto space-y-8 relative z-10">
        
        {/* Logo and Name - Animated Entrance */}
        <motion.div 
          className="text-center space-y-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 30 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          {/* Logo Container */}
          <div className="relative inline-block">
            <motion.div
              className="relative"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              {/* Glow effect */}
              <div className="absolute inset-0 bg-white rounded-full blur-3xl opacity-10 scale-150"></div>
              
              {/* Logo */}
              <div className="relative w-40 h-40 mx-auto">
                <Image
                  src="/images/Logo.png"
                  alt="Athena"
                  fill
                  className={`object-contain transition-all duration-300 ${owlBlink ? 'scale-95' : 'scale-100'}`}
                  priority
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
          <motion.h1 
            className="text-4xl font-light text-white tracking-wider"
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoaded ? 1 : 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            Athena
          </motion.h1>

          {/* Tagline */}
          <motion.p 
            className="text-sm text-white/60 font-light tracking-wide"
            initial={{ opacity: 0 }}
            animate={{ opacity: isLoaded ? 1 : 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            {translate({ 
              en: "Financial wisdom at your fingertips", 
              pt: "Sabedoria financeira na ponta dos dedos" 
            })}
          </motion.p>
        </motion.div>

        {/* Buttons - Animated Entrance */}
        <motion.div 
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 20 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          {/* Primary Button */}
          <motion.div
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <Button 
              onClick={handleGetStarted}
              className="w-full h-12 bg-white text-slate-900 hover:bg-white/90 rounded-xl font-medium text-base shadow-lg shadow-white/10 transition-all duration-200"
            >
              {translate({ 
                en: "Get Started Now", 
                pt: "Começar agora" 
              })}
            </Button>
          </motion.div>

          {/* Secondary Button */}
          <motion.div
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <Button 
              onClick={handleAccessAccount}
              variant="outline"
              className="w-full h-12 border-white/20 text-white hover:bg-white/10 hover:border-white/30 rounded-xl font-medium text-base transition-all duration-200"
            >
              {translate({ 
                en: "Access My Account", 
                pt: "Acessar minha conta" 
              })}
            </Button>
          </motion.div>
        </motion.div>

        {/* Trust Indicators */}
        <motion.div 
          className="flex justify-center space-x-8 pt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 0.8, delay: 1 }}
        >
          <div className="flex items-center space-x-2 text-white/40 text-xs">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span>{translate({ en: "Secure", pt: "Seguro" })}</span>
          </div>
          <div className="flex items-center space-x-2 text-white/40 text-xs">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span>{translate({ en: "Smart", pt: "Inteligente" })}</span>
          </div>
        </motion.div>
      </div>

      {/* Subtle floating particles */}
      <div className="absolute inset-0 pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + (i % 3) * 20}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 4 + i,
              repeat: Infinity,
              delay: i * 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}
