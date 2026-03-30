#!/bin/bash

# Script para gerar ícones Android em alta qualidade a partir do Logo.png
# Uso: ./generate-android-icons.sh

echo "🤖 Gerando ícones Android para Athena..."

# Verificar se o Logo.png existe
if [ ! -f "public/images/Logo.png" ]; then
    echo "❌ Erro: Logo.png não encontrado em public/images/"
    exit 1
fi

# Verificar se o sips está disponível (macOS)
if ! command -v sips &> /dev/null; then
    echo "❌ Erro: sips não encontrado. Este script requer macOS."
    exit 1
fi

# Criar diretórios necessários
echo "📁 Criando diretórios..."
mkdir -p android/app/src/main/res/mipmap-hdpi
mkdir -p android/app/src/main/res/mipmap-mdpi
mkdir -p android/app/src/main/res/mipmap-xhdpi
mkdir -p android/app/src/main/res/mipmap-xxhdpi
mkdir -p android/app/src/main/res/mipmap-xxxhdpi

# Função para redimensionar imagem
resize_icon() {
    local input=$1
    local output=$2
    local size=$3
    
    echo "🔧 Gerando $output (${size}x${size})..."
    sips -z $size $size "$input" --out "$output" > /dev/null 2>&1
}

# Gerar ícones Android
echo "📱 Gerando ícones Android..."
resize_icon "public/images/Logo.png" "android/app/src/main/res/mipmap-mdpi/ic_launcher.png" 48
resize_icon "public/images/Logo.png" "android/app/src/main/res/mipmap-hdpi/ic_launcher.png" 72
resize_icon "public/images/Logo.png" "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png" 96
resize_icon "public/images/Logo.png" "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png" 144
resize_icon "public/images/Logo.png" "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png" 192

# Sincronizar com Capacitor
echo "🔄 Sincronizando com Capacitor..."
npx cap sync android

echo "✅ Ícones Android gerados com sucesso!"
echo ""
echo "📊 Resumo dos ícones gerados:"
echo "   • mipmap-mdpi: 48x48"
echo "   • mipmap-hdpi: 72x72"
echo "   • mipmap-xhdpi: 96x96"
echo "   • mipmap-xxhdpi: 144x144"
echo "   • mipmap-xxxhdpi: 192x192"
