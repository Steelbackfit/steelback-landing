# Steelback — Landing

Landing de captación de Steelback, pensada para publicarse en
**landing.steelbackfit.com**, con `steelbackfit.com` libre para la app.

> **Sobre el dominio.** El encargo inicial decía `steelback.com`, pero ese
> dominio **no es nuestro**: está aparcado en venta en HugeDomains y redirige
> a su página de compra. El dominio registrado es `steelbackfit.com`, en
> nameservers de IONOS.
>
> Se eligió un **subdominio** en lugar de la ruta `steelbackfit.com/landing`
> porque el dominio personalizado de Pages se asocia a un *hostname* completo:
> un proyecto conectado a `steelbackfit.com` se queda con todo el dominio y no
> deja sitio a la app. Con subdominio, landing y app despliegan por separado y
> no comparten cookies. El coste es cero: los subdominios de primer nivel
> entran en el Universal SSL gratuito.

Página estática (un `index.html` con CSS y JS en línea) más dos Pages Functions
para la captación de emails, con base de datos **Cloudflare D1**. Todo dentro
del plan gratuito.

## Puesta en marcha (una sola vez)

### Camino rápido

```bash
npx wrangler login     # abre el navegador, una sola vez
npm run setup          # crea D1, aplica el esquema, crea Pages, secretos y despliega
```

`npm run setup` es idempotente: se puede repetir sin romper nada. Al terminar
imprime la URL y el `ADMIN_TOKEN` **una sola vez** — guárdalo.

> Solo está verificado el arranque del script (detecta la falta de sesión y
> para con código 1). Los pasos que tocan la cuenta de Cloudflare no se han
> podido ejecutar sin credenciales. Si alguno falla, sigue el camino manual.

Después queda **un paso que no automatiza nadie**, porque es una autorización
OAuth contra tu cuenta de GitHub:

> Cloudflare → Workers & Pages → `steelback-landing` → Settings → **Builds** →
> **Connect to Git** → `Steelbackfit/steelback-landing`, build command
> `npm run build`, output directory `dist`. Desde ahí cada push a `main`
> despliega solo.

### Camino manual

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

### 4. Dominio: `landing.steelbackfit.com`

**No hace falta mover los nameservers.** Pages admite un dominio personalizado
con el DNS en otro proveedor, mediante un CNAME, y emite el SSL igualmente.
El DNS y el correo se quedan intactos en IONOS. Esto solo funciona con
**subdominios**; un dominio raíz sí exigiría los nameservers de Cloudflare.

**El orden importa y no es negociable:**

1. Pages → proyecto `steelback-landing` → **Custom domains** → **Set up a
   custom domain** → `landing.steelbackfit.com`.
2. Cloudflare muestra el CNAME que espera. Créalo en **IONOS**:

   | Campo | Valor |
   |---|---|
   | Tipo | `CNAME` |
   | Nombre de host | `landing` (solo eso, no el dominio entero) |
   | Apunta a | `steelback-landing.pages.dev` |
   | TTL | el que venga por defecto |

3. Vuelve a Cloudflare y confirma. Valida el DNS y emite el certificado.

> ⚠️ **Si creas el CNAME en IONOS sin haber dado antes de alta el dominio en
> Pages, el subdominio no resuelve.** La documentación de Cloudflare lo dice
> expresamente: hay que pasar primero por *Add a custom domain*.

Mientras tanto la landing es accesible en `steelback-landing.pages.dev`.

<details>
<summary>Alternativa: mover todo el DNS a Cloudflare (no recomendada aquí)</summary>

Solo tiene sentido si algún día quieres usar el dominio raíz o el resto de
funciones de Cloudflare sobre `steelbackfit.com`. Implica riesgo para el correo:

1. Cloudflare → **Add a site** → `steelbackfit.com` → plan **Free**.
2. Comprueba que ha importado estos registros **antes** de seguir:

   | Tipo | Nombre | Valor | Proxy |
   |------|--------|-------|-------|
   | MX   | `@`    | `mx00.ionos.es` (prioridad 10) | DNS only |
   | MX   | `@`    | `mx01.ionos.es` (prioridad 10) | DNS only |
   | TXT  | `@`    | `v=spf1 include:_spf-eu.ionos.com ~all` | — |
   | TXT  | `@`    | `zone-ownership-verification-9abcb6…` | — |
   | A    | `@`    | `217.160.0.222` | a tu gusto |

3. En IONOS, sustituye los nameservers por los de Cloudflare.

⚠️ Los MX deben quedar en **DNS only** (nube gris): Cloudflare no hace de proxy
de correo y en naranja rompes la entrega a `info@steelbackfit.com`.

</details>

## Cómo ver los registros

```bash
# JSON
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://landing.steelbackfit.com/api/leads

# CSV descargable
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "https://landing.steelbackfit.com/api/leads?formato=csv" -o leads.csv

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
GUIA-NUEVA-LANDING.md      cómo montar otra landing igual que ésta
lib/validation.mjs         lógica pura: validación, hashing, CSV
functions/api/subscribe.js POST /api/subscribe — alta
functions/api/leads.js     GET  /api/leads     — consulta (token)
schema.sql                 tablas de D1
scripts/build.mjs          copia la whitelist a dist/
test/                      node:test
```

**La landing se sirve en la raíz (`dist/index.html`).** Al vivir en su propio
subdominio, `landing.steelbackfit.com/landing` no tendría sentido. La ruta
antigua `/landing` se mantiene redirigida a `/` para no romper enlaces ya
compartidos. **No añadas la regla inversa** (`/` → `/landing`): Pages normaliza
las rutas y se produce un bucle infinito de redirecciones. El CI lo comprueba.

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

---

Despliegue automático activo: cada push a `main` ejecuta los tests, compila y
publica en Cloudflare Pages. Si algún test falla, el build se detiene y no se
despliega.
