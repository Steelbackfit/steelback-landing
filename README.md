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

## Captación de emails

Los dos formularios (hero y CTA) hacen `POST /api/subscribe`, resuelto por la
Pages Function en `functions/api/subscribe.js`. El endpoint valida el email,
descarta bots con un honeypot, limita a 5 altas por IP y hora, guarda el alta
en KV y avisa por email a `info@steelbackfit.com`.

El alta se guarda **antes** de intentar el aviso: si el proveedor de email
falla, el lead no se pierde y quien se apunta no ve un error que no le compete.

### Configuración en Cloudflare Pages

Variables de entorno (Settings → Environment variables):

| Variable         | Obligatoria | Descripción                                       |
|------------------|-------------|---------------------------------------------------|
| `RESEND_API_KEY` | sí          | Secreto de Resend. Márcala como **Encrypt**.      |
| `NOTIFY_TO`      | no          | Destino del aviso. Por defecto `info@steelbackfit.com`. |
| `NOTIFY_FROM`    | no          | Remitente verificado en Resend.                   |

Binding de KV (Settings → Functions → KV namespace bindings): crea un namespace
y bíndealo como **`LEADS`**. Sin él la landing sigue funcionando, pero sin
persistencia ni rate limit: el aviso por email pasa a ser el único registro.

### Pruebas en local

```bash
npx wrangler pages dev dist --kv LEADS
curl -X POST localhost:8788/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"prueba@steelbackfit.com","origen":"hero"}'
```

## Pendiente

- Los enlaces sociales del footer y el logo apuntan a `href="#"`.
- Sin `RESEND_API_KEY` configurada no sale ningún aviso por email; con `LEADS`
  bindeado los registros quedan igualmente guardados en KV.
