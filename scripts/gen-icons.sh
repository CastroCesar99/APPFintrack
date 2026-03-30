#!/bin/bash
ICON_SRC="assets/icon.png"
DEST="ios/App/App/Assets.xcassets/AppIcon.appiconset"

mkdir -p "$DEST"

# iPhone App Icon
sips -z 40 40   "$ICON_SRC" --out "$DEST/icon-20@2x.png"
sips -z 60 60   "$ICON_SRC" --out "$DEST/icon-20@3x.png"
sips -z 58 58   "$ICON_SRC" --out "$DEST/icon-29@2x.png"
sips -z 87 87   "$ICON_SRC" --out "$DEST/icon-29@3x.png"
sips -z 80 80   "$ICON_SRC" --out "$DEST/icon-40@2x.png"
sips -z 120 120 "$ICON_SRC" --out "$DEST/icon-40@3x.png"
sips -z 120 120 "$ICON_SRC" --out "$DEST/icon-60@2x.png"
sips -z 180 180 "$ICON_SRC" --out "$DEST/icon-60@3x.png"

# App Store
sips -z 1024 1024 "$ICON_SRC" --out "$DEST/icon-1024.png"

# Contents.json
cat <<EOF > "$DEST/Contents.json"
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

echo "Icons generated successfully!"
