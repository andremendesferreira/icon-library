# Imagens de origem

`iconlibrary-source.png` é o logo original em alta resolução (1254×1254, ~1,2 MB). Ele **não** é servido pelo site; as versões usadas em `public/` são geradas a partir dele:

| Arquivo | Tamanho | Uso |
|---|---|---|
| `public/img/logo-180.webp`, `logo-360.webp` | 180 e 360 px | logo do cabeçalho (1x e telas de alta densidade) |
| `public/favicon.ico` | 16, 32, 48 px | favicon (pedido automaticamente pelos navegadores) |
| `public/img/favicon-32.png` | 32 px | favicon em PNG |
| `public/img/apple-touch-icon.png` | 180 px, fundo claro | atalho na tela inicial (iOS/Android) |
| `public/img/og-image.png` | 512 px, fundo claro | prévia em redes sociais (`og:image`) |

O logo é recortado na borda transparente e centralizado num quadrado; os PNGs usam paleta de 256 cores e os WebP qualidade 88. Para regerar depois de trocar o logo, redimensione com um filtro de boa qualidade (Lanczos) mantendo esses tamanhos.
