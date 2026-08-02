# Steelback — Landing

Landing de captación de Steelback. Página estática autónoma: un solo
`index.html` con el CSS y el JS en línea. Sin framework ni paso de compilación
más allá de copiar los ficheros que se publican.

## Desarrollo

Abre `index.html` en el navegador, o levanta un servidor local:

```bash
npm run preview     # build + wrangler pages dev sobre dist/
```

## Build

```bash
npm run build       # copia los ficheros publicables a dist/
```

`scripts/build.mjs` usa una **whitelist deliberada**. `uploads/` contiene
material interno de diseño (capturas de trabajo y la guía en PDF) que no debe
publicarse en un CDN público, así que solo se copian los assets que la página
usa de verdad. Si añades un asset nuevo, súmalo a `ASSETS` en ese script.

## Despliegue en Cloudflare Pages

**Opción A — Git (recomendada).** En el panel de Cloudflare:
Workers & Pages → Create → Pages → Connect to Git → `Steelbackfit/steelback-landing`.

| Ajuste                  | Valor           |
|-------------------------|-----------------|
| Build command           | `npm run build` |
| Build output directory  | `dist`          |
| Root directory          | `/`             |

Cada push a `main` despliega solo.

**Opción B — Subida directa.**

```bash
npx wrangler login
npm run deploy
```

## Cabeceras

`_headers` fija CSP, `X-Frame-Options`, `Referrer-Policy` y el cacheo de los
assets. La CSP permite estilos y scripts en línea (la página los lleva
incrustados) y las fuentes de Google. Verificada en navegador: sin violaciones.

## Pendiente

- ⚠️ **Los formularios no envían nada.** `submitForm()` solo oculta el
  formulario y muestra el mensaje de éxito; no hay ninguna petición de red. Hay
  que conectarlos a un backend (Mailchimp, Formspree, un Worker…) antes de
  meter tráfico.
- Los enlaces sociales del footer y el logo apuntan a `href="#"`.
