# Steelback — Landing

Landing de captación de Steelback, pensada para publicarse en
**steelbackfit.com/landing**.

> **Sobre el dominio.** El encargo inicial decía `steelback.com`, pero ese
> dominio **no es nuestro**: está aparcado en venta en HugeDomains
> (nameservers `nsg1.namebrightdns.com`, redirige a su página de compra). El
> dominio registrado es `steelbackfit.com`, en nameservers de IONOS
> (`ns1099.ui-dns.org`) y todavía sin nada servido. La documentación asume
> `steelbackfit.com`; si de verdad se compra `steelback.com`, basta con
> cambiar el dominio en Custom domains, el código no depende de él.

Página estática (un `index.html` con CSS y JS en línea) más dos Pages Functions
para la captación de emails, con base de datos **Cloudflare D1**. Todo dentro
del plan gratuito.

## Puesta en marcha (una sola vez)

Los pasos 1–4 requieren tu cuenta de Cloudflare, así que los tienes que hacer tú.

### 1. Crear la base de datos D1

```bash
npx wrangler login
npx wrangler d1 create steelback-leads
```

Copia el `database_id` que devuelve y pégalo en `wrangler.toml`, sustituyendo
`PON_AQUI_EL_ID_DE_TU_D1`. Luego crea las tablas:

```bash
npm run db:remote      # aplica schema.sql sobre la D1 real
```

### 2. Conectar el repo a Cloudflare Pages

Dashboard → **Workers & Pages** → **Create** → pestaña **Pages** →
**Connect to Git** → autoriza GitHub (dale acceso **solo** a este repositorio)
→ elige `Steelbackfit/steelback-landing`.

| Ajuste                 | Valor           |
|------------------------|-----------------|
| Project name           | `steelback-landing` |
| Production branch      | `main`          |
| Build command          | `npm run build` |
| Build output directory | `dist`          |
| Root directory         | `/`             |

`npm run build` ejecuta **los tests antes de compilar**: si un test falla, el
build falla y el despliegue no sale. Eso es lo que hace que solo se publique
código con los tests en verde.

> ⚠️ Al existir `wrangler.toml`, Pages lee de ahí los bindings e **ignora los
> que configures en el panel**. El binding D1 `DB` ya está declarado en el
> fichero; no lo dupliques en la interfaz.

### 3. Secretos

Pages → Settings → **Variables and Secrets**. Márcalos todos como **Secret**
(cifrado), no como texto plano:

| Variable         | Obligatoria | Para qué                                              |
|------------------|-------------|-------------------------------------------------------|
| `IP_SALT`        | **sí**      | Sal para hashear la IP. Cadena aleatoria larga.        |
| `ADMIN_TOKEN`    | **sí**      | Token para consultar `/api/leads`.                     |
| `RESEND_API_KEY` | no          | Aviso por email de cada alta.                          |
| `NOTIFY_FROM`    | no          | Remitente verificado en Resend.                        |
| `NOTIFY_TO`      | no          | Destino del aviso. Por defecto `info@steelbackfit.com`.|
| `TURNSTILE_SECRET` | no        | Si está, se exige captcha de Cloudflare Turnstile.     |

Genera los secretos con:

```bash
node -e "console.log(crypto.randomUUID().replace(/-/g,'') + crypto.randomUUID().replace(/-/g,''))"
```

Sin `IP_SALT` o `ADMIN_TOKEN` los endpoints devuelven 503 a propósito: fallan
cerrados en vez de servir datos mal configurados.

### 4. Dominio

`steelbackfit.com` **no está en Cloudflare**: sus nameservers son de IONOS
(`ns1099.ui-dns.org`, …). Antes de poder añadirlo como Custom domain hay que
pasar el dominio a Cloudflare:

1. Cloudflare → **Add a site** → `steelbackfit.com` → plan **Free**.
2. Cloudflare te da dos nameservers propios.
3. En el panel de **IONOS**, sustituye los nameservers actuales por esos.
4. La propagación tarda de minutos a 24 h. Cloudflare avisa por email.
5. Ya en el proyecto de Pages → **Custom domains** → añade `steelbackfit.com`.

> ⚠️ Cambiar los nameservers mueve **todo** el DNS del dominio a Cloudflare,
> incluido el correo. Antes de tocarlos, copia los registros **MX** y **TXT**
> (SPF, DKIM) que tengas en IONOS y recréalos en Cloudflare, o dejarás
> `info@steelbackfit.com` sin recibir correo.

Mientras tanto la landing es accesible en la URL que da Pages
(`steelback-landing.pages.dev/landing`), que sirve para probar todo el circuito
sin tocar el DNS.

## Cómo ver los registros

```bash
# JSON
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://steelbackfit.com/api/leads

# CSV descargable
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "https://steelbackfit.com/api/leads?formato=csv" -o leads.csv

# Directamente contra la base de datos
npx wrangler d1 execute steelback-leads --remote \
  --command "SELECT email, origen, fecha FROM leads ORDER BY fecha DESC"
```

Parámetros: `?formato=csv` y `?limite=N` (por defecto 200, máximo 1000).

## Desarrollo

```bash
npm test              # 12 tests de validación, sin red
npm run build         # tests + genera dist/
npm run db:local      # crea las tablas en la D1 local
npm run dev           # servidor local con D1 y bindings de prueba
```

## Arquitectura

```
index.html                 fuente de la landing (CSS y JS en línea)
lib/validation.mjs         lógica pura: validación, hashing, CSV
functions/api/subscribe.js POST /api/subscribe — alta
functions/api/leads.js     GET  /api/leads     — consulta (token)
schema.sql                 tablas de D1
scripts/build.mjs          copia la whitelist a dist/
test/                      node:test
```

**`dist/landing.html`, no `dist/landing/index.html`.** Con un `index.html`
dentro de una carpeta, Pages normaliza `/landing` → `/landing/` con un 308, y
cualquier regla que devuelva la barra final provoca un bucle infinito de
redirecciones. Servido como `landing.html`, `/landing` responde 200 directo.

**La whitelist del build es deliberada.** `uploads/` guarda material interno
(capturas de trabajo y la guía en PDF, 5,5 MB). `.gitignore` no filtra lo que
sube wrangler, así que desplegar el directorio raíz publicaría esa guía en un
CDN público. El CI falla si aparece un PDF en `dist/`.

## Seguridad

- Validación de email en cliente y servidor; el servidor nunca confía en el cliente.
- Honeypot: los bots reciben 200 y no se guarda nada, para no delatar la detección.
- Rate limit de 5 altas por IP y hora, contra la propia D1.
- La IP se guarda **hasheada con sal**, nunca en claro (RGPD).
- `/api/leads` exige token y compara en tiempo constante; falla cerrado sin él.
- El CSV neutraliza la inyección de fórmulas (un email que empiece por `=`
  se ejecutaría al abrirlo en Excel).
- CSP, HSTS, `X-Frame-Options: DENY` y `nosniff` en `_headers`.
- Turnstile opcional: se activa solo con poner `TURNSTILE_SECRET`.

## Pendiente

- Los enlaces sociales del footer y el logo apuntan a `href="#"`.
- `HEAD /api/leads` responde 405 en vez de 200 sin cuerpo. Irrelevante para un
  endpoint de administración, pero no es estrictamente correcto.
