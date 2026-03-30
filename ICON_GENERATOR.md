# 🦉 Gerador de Ícones Athena

Scripts automáticos para gerar ícones em alta qualidade para todas as plataformas a partir do `Logo.png`.

## 📁 Arquivos

- `generate-all-icons.sh` - Script principal que gera todos os ícones
- `generate-ios-icons.sh` - Gera ícones específicos para iOS
- `generate-android-icons.sh` - Gera ícones específicos para Android

## 🚀 Uso

### Gerar todos os ícones (recomendado)
```bash
./generate-all-icons.sh
```

### Gerar apenas iOS
```bash
./generate-ios-icons.sh
```

### Gerar apenas Android
```bash
./generate-android-icons.sh
```

## 📱 Ícones Gerados

### iOS
- **AppIcon**: 10 tamanhos (40x40 até 1024x1024)
  - iPhone: 20@2x, 20@3x, 29@2x, 29@3x, 40@2x, 40@3x, 60@2x, 60@3x
  - App Store: 1024x1024
- **Logo assets**: 1024x1024 para uso interno

### Android
- **Launcher Icons**: 5 tamanhos
  - mdpi: 48x48
  - hdpi: 72x72
  - xhdpi: 96x96
  - xxhdpi: 144x144
  - xxxhdpi: 192x192

### Web
- **Favicon**: Logo.png configurado no Next.js
- **PWA Icon**: Logo.png para manifest.json

## 🔧 Requisitos

- macOS (usa `sips` para redimensionamento)
- Logo.png em `public/images/`
- Node.js e Capacitor instalados

## 📝 Estrutura

```
ios/App/App/Assets.xcassets/
├── AppIcon.appiconset/
│   ├── icon-20@2x.png (40x40)
│   ├── icon-20@3x.png (60x60)
│   ├── icon-29@2x.png (58x58)
│   ├── icon-29@3x.png (87x87)
│   ├── icon-40@2x.png (80x80)
│   ├── icon-40@3x.png (120x120)
│   ├── icon-60@2x.png (120x120)
│   ├── icon-60@3x.png (180x180)
│   ├── icon-1024.png (1024x1024)
│   └── Contents.json
└── Logo.imageset/
    ├── Logo.png (1024x1024)
    └── Contents.json

android/app/src/main/res/mipmap-*/
├── mdpi/ic_launcher.png (48x48)
├── hdpi/ic_launcher.png (72x72)
├── xhdpi/ic_launcher.png (96x96)
├── xxhdpi/ic_launcher.png (144x144)
└── xxxhdpi/ic_launcher.png (192x192)
```

## 🎯 Benefícios

- ✅ **Alta qualidade**: Redimensionamento com `sips` do macOS
- ✅ **Automático**: Gera todos os tamanhos necessários
- ✅ **Consistente**: Mesmo logo em todas as plataformas
- ✅ **Rápido**: Um comando para tudo
- ✅ **Sincronizado**: Integra com Capacitor automaticamente

## 🔄 Após geração

1. **iOS**: `npx cap open ios` - Verifique no Xcode
2. **Android**: `npx cap open android` - Verifique no Android Studio
3. **Web**: `npm run dev` - Teste no navegador

## ⚠️ Notas

- Sempre mantenha o `Logo.png` original em alta resolução
- Os scripts sobrescrevem ícones existentes
- Execute após atualizar o Logo.png
- Funciona apenas em macOS (depende do `sips`)
