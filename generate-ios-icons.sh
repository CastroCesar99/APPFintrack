#!/bin/bash

# Script para gerar ícones iOS em alta qualidade a partir do Logo.png
# Uso: ./generate-ios-icons.sh

echo "🦉 Gerando ícones iOS para Athena..."

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
mkdir -p ios/App/App/Assets.xcassets/AppIcon.appiconset
mkdir -p ios/App/App/Assets.xcassets/Logo.imageset

# Função para redimensionar imagem
resize_icon() {
    local input=$1
    local output=$2
    local size=$3
    
    echo "🔧 Gerando $output (${size}x${size})..."
    sips -z $size $size "$input" --out "$output" > /dev/null 2>&1
}

# Gerar AppIcons
echo "📱 Gerando AppIcons..."
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20@2x.png" 40
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-20@3x.png" 60
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29@2x.png" 58
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-29@3x.png" 87
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40@2x.png" 80
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-40@3x.png" 120
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60@2x.png" 120
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-60@3x.png" 180
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/AppIcon.appiconset/icon-1024.png" 1024

# Gerar Logo para assets internos
echo "🎨 Gerando Logo para assets..."
resize_icon "public/images/Logo.png" "ios/App/App/Assets.xcassets/Logo.imageset/Logo.png" 1024

# Criar Contents.json para AppIcon
echo "📄 Criando Contents.json para AppIcon..."
cat > ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json << 'EOF'
{
  "images" : [
    { "size" : "20x20", "idiom" : "iphone", "filename" : "icon-20@2x.png", "scale" : "2x" },
    { "size" : "20x20", "idiom" : "iphone", "filename" : "icon-20@3x.png", "scale" : "3x" },
    { "size" : "29x29", "idiom" : "iphone", "filename" : "icon-29@2x.png", "scale" : "2x" },
    { "size" : "29x29", "idiom" : "iphone", "filename" : "icon-29@3x.png", "scale" : "3x" },
    { "size" : "40x40", "idiom" : "iphone", "filename" : "icon-40@2x.png", "scale" : "2x" },
    { "size" : "40x40", "idiom" : "iphone", "filename" : "icon-40@3x.png", "scale" : "3x" },
    { "size" : "60x60", "idiom" : "iphone", "filename" : "icon-60@2x.png", "scale" : "2x" },
    { "size" : "60x60", "idiom" : "iphone", "filename" : "icon-60@3x.png", "scale" : "3x" },
    { "size" : "1024x1024", "idiom" : "ios-marketing", "filename" : "icon-1024.png", "scale" : "1x" }
  ],
  "info" : { "version" : 1, "author" : "xcode" }
}
EOF

# Criar Contents.json para Logo
echo "📄 Criando Contents.json para Logo..."
cat > ios/App/App/Assets.xcassets/Logo.imageset/Contents.json << 'EOF'
{
  "images" : [
    {
      "idiom" : "universal",
      "scale" : "1x"
    },
    {
      "idiom" : "universal",
      "scale" : "2x"
    },
    {
      "idiom" : "universal",
      "scale" : "3x"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
EOF

# Copiar para pasta public também
echo "📋 Copiando para pasta public..."
cp public/images/Logo.png ios/App/App/public/images/Logo.png
cp public/images/Logo.png ios/App/App/public/images/fintrack-logo.png
cp public/images/Logo.png "ios/App/App/public/images/white fintrack logo.png"

# Sincronizar com Capacitor
echo "🔄 Sincronizando com Capacitor..."
npx cap sync ios

echo "✅ Ícones iOS gerados com sucesso!"
echo "📱 Abra o Xcode para verificar: npx cap open ios"
echo ""
echo "📊 Resumo dos ícones gerados:"
echo "   • AppIcon: 10 tamanhos (40x40 até 1024x1024)"
echo "   • Logo assets: 1024x1024"
echo "   • Public images: 3 cópias do Logo.png"
