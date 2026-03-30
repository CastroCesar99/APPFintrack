#!/bin/bash

# Script principal para gerar todos os ícones em alta qualidade
# Uso: ./generate-all-icons.sh

echo "🦉🤖 Gerando todos os ícones para Athena..."

# Verificar se o Logo.png existe
if [ ! -f "public/images/Logo.png" ]; then
    echo "❌ Erro: Logo.png não encontrado em public/images/"
    exit 1
fi

# Verificar se os scripts existem
if [ ! -f "./generate-ios-icons.sh" ]; then
    echo "❌ Erro: generate-ios-icons.sh não encontrado"
    exit 1
fi

if [ ! -f "./generate-android-icons.sh" ]; then
    echo "❌ Erro: generate-android-icons.sh não encontrado"
    exit 1
fi

# Dar permissão de execução
chmod +x generate-ios-icons.sh
chmod +x generate-android-icons.sh

# Gerar ícones iOS
echo "📱 Gerando ícones iOS..."
./generate-ios-icons.sh

if [ $? -ne 0 ]; then
    echo "❌ Erro ao gerar ícones iOS"
    exit 1
fi

echo ""
echo "🤖 Gerando ícones Android..."
./generate-android-icons.sh

if [ $? -ne 0 ]; then
    echo "❌ Erro ao gerar ícones Android"
    exit 1
fi

echo ""
echo "🎉 Todos os ícones gerados com sucesso!"
echo ""
echo "📱 Para iOS: npx cap open ios"
echo "🤖 Para Android: npx cap open android"
echo ""
echo "📊 Resumo completo:"
echo "   • iOS: 10 tamanhos de AppIcon + Logo assets"
echo "   • Android: 5 tamanhos de launcher icons"
echo "   • Web: Logo.png configurado para favicon"
echo "   • Qualidade: Alta resolução a partir do Logo.png original"
