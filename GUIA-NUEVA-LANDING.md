# Guía: montar otra landing igual que ésta

Todo lo que hay que tocar para levantar una landing nueva con despliegue
automático, captación de emails en base de datos y la misma seguridad.

Está escrita a partir de este repo, ya funcionando en producción. Los avisos
marcados con ⚠️ son fallos que **ya ocurrieron aquí** y costaron tiempo: no son
teoría.

## Índice

1. [Cómo funciona esto en 30 segundos](#1-como-funciona-esto-en-30-segundos)
2. [Crear una landing nueva desde cero](#2-crear-una-landing-nueva-desde-cero)
3. [Assets: cómo se gestionan](#3-assets-como-se-gestionan)
4. [Formularios: el contrato completo](#4-formularios-el-contrato-completo)
5. [Base de datos](#5-base-de-datos)
6. [Secretos](#6-secretos)
7. [Dominio](#7-dominio)
8. [Tests y CI](#8-tests-y-ci)
9. [Trampas conocidas](#9-trampas-conocidas)
10. [Comprobación final antes de dar por buena una landing](#10-comprobacion-final-antes-de-dar-por-buena-una-landing)
11. [Rediseñar la landing sin romper nada](#11-redisenar-la-landing-sin-romper-nada)
12. [Comandos de referencia](#12-comandos-de-referencia)
13. [Estructura de ficheros](#13-estructura-de-ficheros)

---

## 1. Cómo funciona esto en 30 segundos

```
git push a main
      ↓
Cloudflare Pages detecta el push (integración Git)
      ↓
ejecuta `npm run build`  =  npm test  &&  node scripts/build.mjs
      ↓                        ↑
      ↓              si un test falla, PARA AQUÍ y no despliega
      ↓
copia una whitelist de ficheros a dist/
      ↓
publica dist/ + functions/ en la CDN
```

Tres piezas:

| Pieza | Qué es | Dónde vive |
|---|---|---|
| La página | Un `index.html` con CSS y JS **en línea**, sin framework | `index.html` |
| El backend | Dos Pages Functions (endpoints serverless) | `functions/api/` |
| Los datos | Base de datos Cloudflare D1 (SQLite) | `schema.sql` + panel |

No hay build de JS ni bundler. `scripts/build.mjs` solo **copia ficheros**.

---

## 2. Crear una landing nueva desde cero

### 2.1 Copiar el esqueleto

```bash
# Desde la carpeta que contiene este repo
cp -r steelback-landing landing-nueva
cd landing-nueva
rm -rf .git .wrangler dist node_modules
git init && git branch -M main
```

### 2.2 Renombrar el proyecto

Hay **cuatro** sitios con el nombre del proyecto. Si te dejas uno, el
despliegue va a otro proyecto o falla:

| Fichero | Qué cambiar | Línea aprox. |
|---|---|---|
| `package.json` | `"name"`, y `--project-name` en el script `deploy` | 2, 12 |
| `wrangler.toml` | `name`, `database_name` | 1, 12 |
| `scripts/setup.mjs` | constantes `PROYECTO`, `BD` y **`DOMINIO`** | 22, 23, 26 |
| `.github/workflows/deploy.yml` | `--project-name` en el último paso | 53 |

⚠️ **No te dejes `DOMINIO` en `scripts/setup.mjs`.** Está fijado a
`steelbackfit.com`: si no lo cambias, `npm run setup` intentará conectar el
dominio de otro proyecto al nuevo. El paso falla sin romper nada, pero te deja
un aviso confuso. También puedes saltártelo con `CF_DOMINIO= npm run setup`.

```bash
# Atajo (revisa el resultado antes de commitear)
grep -rl "steelback-landing" --exclude-dir=.git . | xargs sed -i 's/steelback-landing/landing-nueva/g'
grep -rl "steelback-leads"   --exclude-dir=.git . | xargs sed -i 's/steelback-leads/landing-nueva-leads/g'
```

### 2.3 Vaciar el `database_id`

En `wrangler.toml`, deja el marcador para que `npm run setup` lo rellene solo:

```toml
database_id = "PON_AQUI_EL_ID_DE_TU_D1"
```

⚠️ **Si te dejas el ID de la landing vieja, la nueva escribirá los emails en la
base de datos de la vieja.** Los dos proyectos parecerán funcionar y los leads
se mezclarán sin ningún error visible.

### 2.4 Crear el repo en GitHub y subirlo

```bash
git add -A && git commit -m "chore: esqueleto inicial"
gh repo create TuOrg/landing-nueva --private --source=. --push
# o crea el repo a mano y luego:
# git remote add origin https://github.com/TuOrg/landing-nueva.git && git push -u origin main
```

### 2.5 Levantar la infraestructura

```bash
npx wrangler login     # solo la primera vez en el equipo
npm run setup
```

`npm run setup` es idempotente y hace: crea la D1, escribe su `database_id` en
`wrangler.toml`, aplica `schema.sql`, crea el proyecto de Pages, genera y sube
`IP_SALT` y `ADMIN_TOKEN`, compila y despliega.

**Al terminar imprime el `ADMIN_TOKEN` una sola vez. Guárdalo en tu gestor de
contraseñas en ese momento.** Si lo pierdes, no se recupera: hay que generar
otro con `npx wrangler pages secret put ADMIN_TOKEN --project-name landing-nueva`.

Commitea el `database_id` que el script ha escrito:

```bash
git add wrangler.toml && git commit -m "chore: fija el database_id de la D1" && git push
```

### 2.6 Activar el despliegue automático

**Este paso es manual y no se puede automatizar.** Es una autorización OAuth
entre tu cuenta de Cloudflare y la de GitHub: no existe comando ni endpoint que
la conceda, porque la API necesita un `installation_id` que solo existe después
de instalar la GitHub App de Cloudflare.

> Cloudflare → Workers & Pages → `landing-nueva` → Settings → **Builds** →
> **Connect to Git** → elige el repositorio

| Ajuste | Valor |
|---|---|
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

Comprueba que ha quedado conectado:

```bash
npx wrangler pages project list
# La columna "Git Provider" debe decir Yes, no No
```

### 2.7 Dominio

Ver §7.

---

## 3. Assets: cómo se gestionan

### 3.1 La regla de oro

`scripts/build.mjs` tiene una **whitelist explícita**. Solo se publica lo que
está en esa lista:

```js
const ASSETS = [
  ['index.html',                      'index.html'],
  ['logo-bolt.svg',                   'assets/logo-bolt.svg'],
  ['uploads/SIMBOLO.svg',             'assets/SIMBOLO.svg'],
  ['uploads/logo_steelback_white.png','assets/logo_steelback_white.png'],
  ['_headers',                        '_headers'],
  ['_redirects',                      '_redirects'],
];
```

Cada entrada es `[origen en el repo, destino dentro de dist/]`.

**Por qué whitelist y no copiar la carpeta entera:** `uploads/` contiene
material interno de trabajo — capturas y un PDF de 4,5 MB. Están en
`.gitignore`, pero **`.gitignore` no filtra lo que sube wrangler**. Desplegar el
directorio raíz publicaría ese PDF en una CDN pública con URL adivinable. La
whitelist lo hace imposible por construcción, y el CI falla si aparece un PDF
en `dist/`.

### 3.2 Añadir un asset nuevo

Tres pasos, y **los tres son obligatorios**:

**1. Copia el fichero al repo** (raíz o `uploads/`):

```bash
cp ~/Descargas/foto-hero.webp .
```

**2. Añádelo a `ASSETS` en `scripts/build.mjs`:**

```js
['foto-hero.webp', 'assets/foto-hero.webp'],
```

**3. Referéncialo en el HTML con ruta absoluta desde la raíz:**

```html
<img src="/assets/foto-hero.webp" alt="Descripción real de la imagen" width="800" height="600">
```

⚠️ **Si te saltas el paso 2, el fallo es silencioso y engañoso.** Abriendo
`index.html` con doble clic la imagen se ve (el navegador lee del disco). En
producción da 404. Comprueba siempre con `npm run dev`, que sirve `dist/` y por
tanto reproduce el comportamiento real.

### 3.3 Verificar que un asset llegó

```bash
npm run build
find dist -type f | sort        # ¿está tu fichero?
```

Y después del despliegue:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://tu-proyecto.pages.dev/assets/foto-hero.webp
# 200 = bien | 404 = te falta el paso 2
```

### 3.4 Assets externos: hay que tocar la CSP

⚠️ **Ésta es la trampa más cara.** `_headers` define una Content-Security-Policy
restrictiva. Cualquier recurso de un dominio no listado **se bloquea en
silencio**: la página carga, pero sin esa fuente, imagen o script. En la consola
del navegador sale `Refused to load…`, pero si no la miras, parece un problema
de diseño.

CSP actual:

```
default-src 'self';
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src    https://fonts.gstatic.com;
script-src  'self' 'unsafe-inline' https://challenges.cloudflare.com;
frame-src   https://challenges.cloudflare.com;
connect-src 'self';
img-src     'self' data:;
base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

| Si añades… | Toca esta directiva |
|---|---|
| Imagen desde otro dominio | `img-src` |
| Google Analytics, Meta Pixel | `script-src` **y** `connect-src` |
| Vídeo de YouTube o Vimeo | `frame-src` |
| Fuente que no sea Google Fonts | `font-src` |
| Llamada a una API externa | `connect-src` |

`'unsafe-inline'` en `style-src` y `script-src` es **necesario** aquí porque la
página lleva el CSS y el JS incrustados. No lo quites sin extraerlos a ficheros
antes.

Cómo comprobar que no has roto nada:

```bash
npm run dev
# En el navegador: F12 → Consola → busca "Content Security Policy" o "Refused to"
```

### 3.5 Fuentes

Se cargan de Google Fonts con un `<link>` en el `<head>`. Si cambias la
tipografía, actualiza **las dos** líneas (`preconnect` y el `href` con la lista
de pesos) y mantén `fonts.googleapis.com` en `style-src` y `fonts.gstatic.com`
en `font-src`.

### 3.6 Caché

`_headers` marca `/assets/*` como `immutable` durante un año. **Si sustituyes un
asset conservando el nombre, quien ya lo tenga cacheado seguirá viendo el
viejo.** Cambia el nombre al cambiar el contenido: `hero-v2.webp`.

---

## 4. Formularios: el contrato completo

Es la parte con más piezas acopladas. Hay un contrato entre **HTML**, **JS** y
**servidor**, y saltarse cualquiera lo rompe.

### 4.1 Anatomía del HTML

```html
<form class="email-form" id="heroForm" data-signup novalidate>
  <input class="email-input" type="email" name="email"
         placeholder="tu@email.com" required autocomplete="email">
  <input class="hp-field" type="text" name="empresa"
         tabindex="-1" autocomplete="off" aria-hidden="true">
  <button class="email-btn" type="submit">Quiero acceso anticipado</button>
</form>
<p class="form-error" id="heroError" role="alert"></p>
<div class="form-success" id="heroSuccess" role="status">✓ Apuntado.</div>
```

Qué hace cada cosa, y por qué no se puede quitar:

| Elemento | Para qué |
|---|---|
| `data-signup` | El JS engancha **todos** los formularios con este atributo. Sin él, el formulario no hace nada |
| `id="heroForm"` | **Debe acabar en `Form`.** El JS deriva de ahí los IDs de error y éxito |
| `id="heroError"` | Prefijo idéntico + `Error`. Si no coincide, el JS peta al mostrar un error |
| `id="heroSuccess"` | Prefijo idéntico + `Success` |
| `name="email"` | El JS busca `input[name="email"]` literalmente |
| `name="empresa"` | **Honeypot.** Invisible para personas; los bots lo rellenan |
| `novalidate` | Desactiva la validación nativa para poder mostrar mensajes en castellano y con nuestro estilo |
| `role="alert"` / `role="status"` | Los lectores de pantalla anuncian el mensaje al aparecer |

**La convención de nombres es estricta:**

```
id="ctaForm"  →  id="ctaError"  +  id="ctaSuccess"
id="pieForm"  →  id="pieError"  +  id="pieSuccess"
```

El JS hace literalmente `form.id.replace(/Form$/, '')` y concatena.

### 4.2 El honeypot

```css
.hp-field {
  position: absolute; left: -9999px;
  width: 1px; height: 1px;
  opacity: 0; pointer-events: none;
}
```

⚠️ **No uses `display: none`.** Los bots que interpretan CSS lo detectan y lo
saltan. Fuera de pantalla con `opacity: 0` es más eficaz.

El servidor, si viene relleno, responde **200 `{"ok":true}` sin guardar nada**.
Devolver un error le confirmaría al bot que ha sido detectado y le permitiría
ajustar su ataque.

### 4.3 Añadir un tercer formulario

Supongamos uno en el pie, `pieForm`. Hay que tocar **tres** sitios:

**1. HTML** — copia el bloque de §4.1 cambiando los tres IDs a `pieForm`,
`pieError`, `pieSuccess`.

**2. JS** — el `origen` se calcula con un ternario que solo contempla dos casos:

```js
origen: form.id === 'heroForm' ? 'hero' : 'cta'
```

Cámbialo por algo que escale:

```js
origen: form.dataset.origen || 'desconocido'
```

y pon `data-origen="pie"` en cada `<form>`.

**3. Servidor** — `lib/validation.mjs` tiene una whitelist:

```js
export const ORIGENES = ['hero', 'cta'];   // añade 'pie'
```

⚠️ **Si te dejas el paso 3, el alta se guarda igualmente pero con
`origen: "desconocido"`.** No falla nada, simplemente pierdes para siempre el
dato de qué formulario convirtió mejor.

**4. Test** — añade el caso en `test/validation.test.mjs`:

```js
assert.equal(validarAlta({ email:'a@b.com', origen:'pie' }).alta.origen, 'pie');
```

### 4.4 Qué hace el JS, paso a paso

1. `preventDefault()` — nunca hay recarga de página.
2. Limpia el error anterior (texto y clase).
3. Valida en cliente: vacío y regex de email. **Si falla, no sale ninguna
   petición de red.**
4. Bloquea el botón: `disabled`, `aria-busy="true"`, texto → "Enviando…".
5. `POST /api/subscribe` con `{ email, empresa, origen }`.
6. Según la respuesta:
   - `res.ok` → oculta el formulario, muestra el éxito.
   - `429` → "Demasiados intentos…"
   - otro error → el mensaje del servidor, o uno genérico.
   - excepción de red → "Fallo de conexión…"
7. `finally` — restaura el botón **siempre**, incluso si hubo excepción. Sin
   esto, un fallo de red dejaría el botón inutilizable para siempre.

### 4.5 Qué hace el servidor (`functions/api/subscribe.js`)

En este orden exacto:

1. ¿Existe el binding `DB`? Si no → 503.
2. Cuerpo > 2048 bytes → 413.
3. JSON inválido → 400.
4. Honeypot relleno → **200 sin guardar**.
5. Email inválido o > 254 caracteres → 400.
6. Turnstile, **solo si `TURNSTILE_SECRET` está definido** → 403 si falla.
7. ¿Existe `IP_SALT`? Si no → 503.
8. Rate limit: más de 5 altas de esa IP en 60 minutos → 429.
9. **Guarda en D1** (`INSERT … ON CONFLICT(email) DO UPDATE`), en un `batch`
   junto al registro del intento y la limpieza de la ventana.
10. **Después** intenta el email de aviso. Si falla, lo registra en el log
    pero **devuelve 200 igualmente**.

⚠️ **El orden de 9 y 10 es deliberado.** Guardar antes de notificar significa
que si el proveedor de email se cae, el lead no se pierde y la persona no ve un
error por algo que no le compete. Si inviertes el orden, un fallo de Resend te
cuesta registros reales.

### 4.6 Ver los emails recogidos

```bash
# JSON
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://tu-dominio/api/leads

# CSV para Excel
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     "https://tu-dominio/api/leads?formato=csv" -o leads.csv

# Directo contra la base de datos
npx wrangler d1 execute landing-nueva-leads --remote \
  --command "SELECT email, origen, fecha FROM leads ORDER BY fecha DESC"
```

Parámetros: `?formato=csv`, `?limite=N` (por defecto 200, máximo 1000).

`/api/leads` **falla cerrado**: sin `ADMIN_TOKEN` configurado responde 503 en
lugar de servir los datos. El token se compara en tiempo constante para que no
se pueda deducir midiendo tiempos de respuesta.

### 4.7 Activar el aviso por email

Opcional. Sin esto, las altas se guardan bien pero no recibes ningún correo.

1. Cuenta en [resend.com](https://resend.com) (gratis hasta 3.000/mes).
2. Verifica tu dominio como remitente.
3. Añade los secretos en Pages → Settings → Variables and Secrets:
   - `RESEND_API_KEY` (marcar **Encrypt**)
   - `NOTIFY_FROM` — remitente verificado, p. ej. `Web <web@tudominio.com>`
   - `NOTIFY_TO` — destino (por defecto `info@steelbackfit.com`)

Para cambiar de proveedor solo se toca la función `notificar()`: una llamada
`fetch`. SendGrid o Mailgun encajan igual.

### 4.8 Activar el captcha (Turnstile)

Solo si empiezas a recibir spam que el honeypot no filtra.

1. Cloudflare → Turnstile → crea un widget. Te da *site key* y *secret*.
2. Añade `TURNSTILE_SECRET` como secreto en Pages. **Con solo esto, el servidor
   ya empieza a exigir el captcha.**
3. En el HTML, carga el script y añade el widget dentro de cada `<form>`:
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
   <div class="cf-turnstile" data-sitekey="TU_SITE_KEY"></div>
   ```
4. En el JS, envía el token en el cuerpo:
   ```js
   captcha: form.querySelector('[name="cf-turnstile-response"]')?.value
   ```

⚠️ **Si añades el secreto sin hacer los pasos 3 y 4, todos los formularios
empiezan a devolver 403 y dejas de recibir altas.** La CSP ya contempla
`challenges.cloudflare.com` en `script-src` y `frame-src`.

---

## 5. Base de datos

### 5.1 Esquema

```sql
CREATE TABLE leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,     -- UNIQUE: apuntarse dos veces actualiza, no duplica
  origen TEXT NOT NULL DEFAULT 'desconocido',
  fecha TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT                    -- hash con sal, NUNCA la IP en claro
);

CREATE TABLE intentos (           -- ventana del rate limit
  ip_hash TEXT NOT NULL,
  fecha TEXT NOT NULL
);
```

### 5.2 Cambiar el esquema

`schema.sql` usa `CREATE TABLE IF NOT EXISTS`, así que **no aplica cambios a
tablas que ya existen**. Para añadir una columna:

```bash
# 1. Añade la columna a schema.sql (para instalaciones nuevas)
# 2. Y aplícala a la base de datos existente:
npx wrangler d1 execute landing-nueva-leads --remote \
  --command "ALTER TABLE leads ADD COLUMN telefono TEXT"
```

Prueba siempre primero en local con `--local`.

### 5.3 Copia de seguridad

No hay backup automático. Hazlo periódicamente:

```bash
npx wrangler d1 export landing-nueva-leads --remote --output backup-$(date +%F).sql
```

---

## 6. Secretos

| Variable | Obligatoria | Para qué |
|---|---|---|
| `IP_SALT` | **sí** | Sal para hashear la IP. Sin ella, 503 |
| `ADMIN_TOKEN` | **sí** | Consultar `/api/leads`. Sin él, 503 |
| `RESEND_API_KEY` | no | Aviso por email |
| `NOTIFY_FROM` / `NOTIFY_TO` | no | Remitente y destino del aviso |
| `TURNSTILE_SECRET` | no | Activa el captcha (ver ⚠️ en §4.8) |

Generar uno:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ponerlos: Pages → Settings → **Variables and Secrets** → marcar **Encrypt**. O:

```bash
npx wrangler pages secret put IP_SALT --project-name landing-nueva
```

⚠️ **Nunca en `wrangler.toml`**, que va al repositorio. Ese fichero es solo
para bindings (D1, KV), que no son secretos.

⚠️ **Cambiar `IP_SALT` invalida todos los `ip_hash` guardados.** El rate limit
se reinicia. No es grave, pero perderás la capacidad de correlacionar altas
antiguas.

---

## 7. Dominio

### 7.1 Subdominio o dominio raíz

**El dominio personalizado de Pages se asocia a un *hostname* completo, no a
una ruta.** Un proyecto conectado a `tudominio.com` se queda con **todo** el
dominio: no puedes tener dos proyectos repartiéndose `/landing` y `/app`.

| Opción | Cuándo | Coste |
|---|---|---|
| `landing.tudominio.com` | Hay o habrá otra web en el dominio raíz | 0 € |
| `tudominio.com` | La landing es el sitio entero | 0 € |
| Worker enrutador | Necesitas `/landing` en el mismo host que la app | 0 € hasta 100k req/día |

Las rutas de Workers **sí** son por path (`tudominio.com/landing/*` gana sobre
`tudominio.com/*` por ser más específica), pero es una pieza más que mantener.

⚠️ **El Universal SSL gratuito cubre el dominio raíz y subdominios de primer
nivel.** `landing.tudominio.com` entra gratis; `a.b.tudominio.com` necesitaría
un certificado Advanced, que es de pago.

### 7.2 Conectar un subdominio SIN mover el DNS (lo habitual)

**No hace falta llevar el dominio a Cloudflare.** Pages admite un dominio
personalizado con el DNS en otro proveedor mediante un CNAME, y emite el
certificado igualmente. Tu DNS y tu correo se quedan donde están, intactos.

Solo vale para **subdominios**. Un dominio raíz sí exige los nameservers de
Cloudflare, porque un CNAME en el ápex no es válido en DNS.

**El orden no es negociable:**

1. Pages → proyecto → **Custom domains** → **Set up a custom domain** →
   `landing.tudominio.com`.
2. Cloudflare te dice el CNAME que espera. Créalo en tu proveedor de DNS:

   | Tipo | Nombre de host | Apunta a |
   |---|---|---|
   | `CNAME` | `landing` | `tu-proyecto.pages.dev` |

3. Vuelve a Cloudflare y confirma. Valida y emite el SSL en unos minutos.

⚠️ **Crear el CNAME sin haber dado antes de alta el dominio en Pages hace que
el subdominio no resuelva.** La documentación de Cloudflare lo advierte
expresamente: primero *Add a custom domain*, después el registro DNS.

### 7.3 Trampas concretas de IONOS

Documentado tras pelearse con ello de verdad. Si tu DNS está en IONOS:

**No uses "Crear subdominio".** Esa opción crea un registro **A apuntando al
hosting de IONOS** y lo deja **atado a un servicio**. Cuando luego intentes
borrarlo desde la tabla DNS, te dirá:

> *Este registro DNS pertenece a un servicio. Primero, desactive el servicio…*

La salida es ir a **Dominios y SSL → tu dominio → Subdominios**, eliminar allí
el subdominio, y solo entonces crear el CNAME desde la pestaña **DNS**.

⚠️ **Cuidado con qué fila borras.** La tabla mezcla el dominio raíz y los
subdominios. La fila `A @ …` es el **dominio raíz**, no tu subdominio: `@`
significa "el dominio en sí". Borrarla (o desactivar su servicio "Default Site")
toca tu web principal. La fila que buscas tiene el nombre del subdominio
(`landing`), no `@`.

**Formato de los campos:**

| Campo | Correcto | Incorrecto |
|---|---|---|
| Nombre de host | `landing` | `landing.tudominio.com` (queda duplicado) |
| Apunta a | `proyecto.pages.dev` | `https://proyecto.pages.dev/` |

### 7.4 "That domain is already associated with an existing project"

Cloudflare reserva el hostname globalmente en cuanto se da de alta una vez,
aunque la validación no llegara a completarse. Si intentas añadirlo de nuevo,
salta ese error.

⚠️ **`wrangler pages project list` NO muestra los dominios personalizados
pendientes** — su columna *Project Domains* solo enseña el `.pages.dev`. Tampoco
sirven `wrangler pages download config` (solo devuelve bindings) ni ningún otro
comando: en esta versión **no existe `wrangler pages domain`**. La única forma
de ver el estado real es el panel.

Qué hacer: entra en **Custom domains** del proyecto y busca el hostname en la
lista. Estará ahí en *Pending* o *Error*. **No lo añadas otra vez**: arregla el
DNS y pulsa **Check DNS records**. Si el estado es irrecuperable, bórralo de la
lista y vuelve a añadirlo con el DNS ya correcto.

Si no aparece en ningún proyecto tuyo, está reservado en otra cuenta. Lo más
rápido es usar otro subdominio (`web.`, `app.`…) en vez de investigar.

### 7.5 Diagnosticar un dominio que "no funciona"

**Este es el árbol de decisión que ahorra horas.** El síntoma "no carga" tiene
al menos cuatro causas distintas y se distinguen con dos comandos.

**Paso 1 — ¿a qué IP estás llegando de verdad?**

```bash
curl -s -o /dev/null -w "%{remote_ip} | %{http_code}\n" http://tu.dominio.com/
```

**Paso 2 — ¿qué ve el resto del mundo?** (esquiva tu caché local)

```bash
for ns in 8.8.8.8 1.1.1.1 9.9.9.9; do
  printf "%-9s " $ns; nslookup -type=CNAME tu.dominio.com $ns 2>&1 | grep -i canonical
done
```

**Paso 3 — ¿funciona el servidor, ignorando el DNS?** Fuerza la IP de destino:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  --resolve tu.dominio.com:443:188.114.97.5 https://tu.dominio.com/
```

Cruza los resultados:

| Local | Resolvers públicos | `--resolve` | Diagnóstico |
|---|---|---|---|
| IP vieja | IP nueva | 200 | **Caché de DNS local.** Todo está bien; solo tu red va retrasada |
| IP nueva | IP nueva | 200 | Funciona. Si el navegador falla, es su propia caché |
| IP nueva | IP nueva | 404 `nginx` | El hostname **no está activo** en el proyecto de Pages |
| NXDOMAIN | NXDOMAIN | — | El registro DNS no existe o no se guardó |
| IP del proveedor | IP del proveedor | — | El registro es **A**, no CNAME, o quedó uno residual |

**Cómo distinguir los dos 404:**

- `Server: nginx` **sin** cabecera `CF-Ray` → estás llegando a Cloudflare pero
  el hostname no está mapeado a ningún proyecto. Falta activarlo en el panel.
- `Server: Apache` y HTML del proveedor → ni siquiera has salido de tu
  proveedor de DNS: el registro sigue apuntando a ellos.
- Con `CF-Ray` y 200 → funciona.

**Si es caché local** (el caso más frecuente y el más confuso):

```bash
ipconfig /flushdns          # Windows
sudo dscacheutil -flushcache  # macOS
```

⚠️ **Vaciar la caché de Windows no basta si tu router también cachea.** Es él
quien responde a las aplicaciones. Reinicia el router, o espera al TTL del
registro anterior — comprueba cuál era:

```bash
nslookup -debug -type=CNAME tu.dominio.com ns-de-tu-proveedor 2>&1 | grep ttl
```

Un TTL de 3600 significa **hasta una hora** de espera.

**La prueba de 10 segundos:** abre la web en el móvil con **datos móviles, no
wifi**. Usa el DNS de la operadora, así que se salta tu router entero. Si ahí
carga, el problema es exclusivamente tu red local y el resto del mundo ya la ve
bien.

### 7.6 Mover todo el DNS a Cloudflare (solo si necesitas el dominio raíz)

El registro se queda en tu registrador y le sigues pagando a ellos; solo cambian
los nameservers. Cloudflare no cobra por esto.

1. Cloudflare → **Add a site** → tu dominio → plan **Free**.
2. **Antes de tocar nada, comprueba que ha importado los registros de correo.**
   Apúntalos primero desde tu DNS actual:
   ```bash
   nslookup -type=MX tudominio.com
   nslookup -type=TXT tudominio.com
   ```
3. En tu registrador, sustituye los nameservers por los de Cloudflare.
4. Propagación: de minutos a 24 h.

⚠️ **Cambiar los nameservers mueve TODO el DNS, incluido el correo.** Si los
registros **MX** no están replicados en Cloudflare, dejas de recibir email. Y
deben quedar en **DNS only (nube gris)**: Cloudflare no hace de proxy de correo,
y en naranja rompes la entrega. Los **TXT** de SPF y DKIM importan igual: sin
ellos tu correo saliente empieza a caer en spam.

### 7.7 Rutas y redirecciones

`_redirects`, en la raíz de `dist/`:

```
/landing     /    301
```

⚠️ **Nunca pongas la regla inversa `/  /landing  301`.** Pages normaliza rutas
y se produce un **bucle infinito de redirecciones** — pasó en este repo y la
página quedó inaccesible. El CI ahora lo comprueba y falla si alguien la
reintroduce.

Relacionado: si sirves la página desde `dist/landing/index.html`, Pages
redirige `/landing` → `/landing/` con un 308. Por eso aquí el fichero se llama
`index.html` en la raíz de `dist/`: se sirve con 200 directo, sin saltos.

---

## 8. Tests y CI

`npm run build` es `npm test && node scripts/build.mjs`. El `&&` es lo que
convierte los tests en una barrera real: **con un test en rojo ni siquiera se
genera `dist/`**, Cloudflare recibe un build fallido y mantiene en producción la
versión anterior.

Comprobado rompiendo un test a propósito:

```
con un test roto:       exit=1  |  dist/ existe: NO
con los tests en verde: exit=0  |  dist/index.html: OK
```

Los tests cubren `lib/validation.mjs`, que es lógica **pura** (sin red ni base
de datos) y por eso se puede probar con `node --test` sin levantar nada.

Si añades reglas de validación, añade su test. Casos que ya están cubiertos y
conviene mantener: emails inválidos, longitud máxima, honeypot, origen no
reconocido, comparación de tokens en tiempo constante, e **inyección de fórmulas
en el CSV** (un email que empiece por `=` se ejecutaría al abrir el fichero en
Excel).

⚠️ En Windows, `node --test test/` falla con `MODULE_NOT_FOUND`. Usa
`node --test` a secas, que autodescubre.

Hay además dos workflows en `.github/workflows/`:

- `ci.yml` — tests y build en cada push y PR, para ver el rojo antes de mergear.
- `deploy.yml` — despliegue alternativo por GitHub Actions, por si no quieres
  dar acceso OAuth de GitHub a Cloudflare. Se salta solo si no existen los
  secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`.

---

## 9. Trampas conocidas

Todas ocurrieron de verdad en este proyecto.

| Síntoma | Causa | Solución |
|---|---|---|
| `/landing` en bucle infinito de redirecciones | Regla `/` → `/landing` con el fichero en una carpeta | Servir como `index.html` en la raíz de `dist/`, sin regla inversa |
| `wrangler no se reconoce como un comando` | Los scripts llamaban a `wrangler` a secas sin `npm install` | Usar `npx wrangler` en `package.json` |
| Un binding configurado en el panel se ignora | Existe `wrangler.toml`: **manda sobre el panel** | Declarar los bindings en el fichero, no en la interfaz |
| `GET /api/loquesea` devuelve la landing con 200 | Sin `onRequest` catch-all, cae al handler de assets | Exportar `onRequest` que devuelva 405 |
| Imagen que se ve en local y da 404 en producción | Falta en la whitelist de `ASSETS` | Añadirla a `scripts/build.mjs` |
| Recurso externo que no carga, sin error visible | Bloqueado por la CSP | Añadir el dominio a la directiva correspondiente en `_headers` |
| Se dejan de recibir emails tras mover el DNS | MX ausentes o en nube naranja | Replicarlos en Cloudflare como **DNS only** |
| Los leads aparecen mezclados entre dos landings | `database_id` copiado de otro proyecto | Un `database_id` distinto por proyecto |
| Todos los formularios devuelven 403 | `TURNSTILE_SECRET` puesto sin implementar el widget | Implementar §4.8 o quitar el secreto |
| El formulario "funciona" pero no llega nada | El JS no lanza petición: falta `data-signup` | Revisar el contrato de §4.1 |
| El dominio nuevo da 404 y en el panel pone *Active* | Caché de DNS local o del router; el TTL viejo aún corre | §7.5 — probar con `--resolve` y desde datos móviles |
| 404 con `Server: nginx` y sin `CF-Ray` | Llegas a Cloudflare pero el hostname no está activo en el proyecto | Activarlo en Custom domains |
| 404 con `Server: Apache` y HTML del proveedor | El registro sigue siendo A hacia tu proveedor | Sustituirlo por un CNAME |
| *"That domain is already associated with an existing project"* | El hostname quedó reservado en un intento anterior | §7.4 — no re-añadir, buscarlo en la lista y reintentar |
| IONOS no deja borrar el registro del subdominio | Se creó con "Crear subdominio" y está atado a un servicio | Eliminarlo desde **Subdominios**, no desde DNS |
| Al borrar en IONOS avisa del servicio "Default Site" | Estás en la fila `@`, que es el **dominio raíz** | Buscar la fila con el nombre del subdominio |

---

## 10. Comprobación final antes de dar por buena una landing

No te fíes de que compile. Ejecuta esto contra la URL ya desplegada:

```bash
B=https://tu-proyecto.pages.dev
T=tu_admin_token

# La página carga
curl -s -o /dev/null -w "raíz: %{http_code}\n" $B/

# Sin bucles de redirección
curl -sL --max-redirs 5 -o /dev/null -w "saltos: %{num_redirects}\n" $B/

# Cabeceras de seguridad
curl -sI $B/ | grep -iE "content-security|strict-transport|x-frame"

# Un alta real
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"email":"prueba@ejemplo.com","origen":"hero"}' $B/api/subscribe

# Validación
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"email":"malo"}' $B/api/subscribe            # espera 400

# Honeypot: 200 pero NO debe guardarse
curl -s -X POST -H 'Content-Type: application/json' \
     -d '{"email":"bot@x.com","empresa":"X"}' $B/api/subscribe

# El endpoint de datos está protegido
curl -s -o /dev/null -w "sin token: %{http_code}\n" $B/api/leads   # espera 401

# Los datos están
curl -s -H "Authorization: Bearer $T" $B/api/leads

# Y borra la prueba
npx wrangler d1 execute landing-nueva-leads --remote \
  --command "DELETE FROM leads WHERE email='prueba@ejemplo.com'"
```

En el navegador, además:

- Ábrela en móvil (o con el viewport a 390 px) y comprueba que nada se corta.
- F12 → Consola: **cero** errores y cero avisos de CSP.
- Envía el formulario de verdad y confirma que el email aparece en `/api/leads`.
- Prueba con el móvil en modo avión: debe salir "Fallo de conexión…" y el botón
  volver a su estado normal.

⚠️ **`scrollWidth === clientWidth` no demuestra que no haya desbordamiento.**
`body { overflow-x: hidden }` lo enmascara: el contenido se corta pero la
métrica sale limpia. Aquí eso ocultó un fallo real en móvil. Mira la página con
tus ojos.

---

## 11. Rediseñar la landing sin romper nada

Cuando rehagas el diseño entero, el HTML y el CSS se tiran y se reescriben. El
problema es que **hay contratos invisibles incrustados en ese HTML**: cosas que
parecen decorativas, se borran sin pensar, y rompen la captación de emails sin
dar ningún error.

Ésta es la lista de lo que **no** puede desaparecer.

### 11.1 Lo que el JS necesita literalmente

Si rehaces el marcado, estos siete puntos tienen que sobrevivir tal cual:

| Elemento | Si lo quitas… |
|---|---|
| `data-signup` en el `<form>` | El JS no engancha el formulario. **No pasa nada al enviar**: ni error ni petición |
| `id` acabado en `Form` | El JS deriva de ahí los otros IDs. Sin el sufijo, no encuentra nada |
| `id="<base>Error"` | Excepción de JS al intentar mostrar un error; el envío se queda colgado |
| `id="<base>Success"` | El alta se guarda pero el usuario no ve confirmación y reenvía |
| `name="email"` en el input | El JS busca `input[name="email"]`. Sin él, envía vacío |
| El input honeypot `name="empresa"` | Empiezas a tragar spam |
| `novalidate` en el `<form>` | Vuelve la validación nativa: mensajes en el idioma del navegador y sin estilar |

Los tres IDs van acoplados por convención estricta:

```
id="heroForm"  →  id="heroError"  +  id="heroSuccess"
```

### 11.2 CSS que parece decorativo pero no lo es

Al reescribir la hoja de estilos es fácil llevarse por delante:

```css
/* Sin esto el honeypot se VE, y los usuarios lo rellenan → altas rechazadas */
.hp-field { position:absolute; left:-9999px; width:1px; height:1px;
            opacity:0; pointer-events:none; }

/* Sin esto los errores nunca se muestran: el JS solo añade la clase */
.form-error { display:none; }
.form-error.visible { display:block; }

/* El JS pone display:block al acertar; si tu CSS lo fuerza a none, no se ve */
.form-success { display:none; }

/* Feedback de envío en curso */
.email-btn[aria-busy="true"] { opacity:.65; cursor:progress; }
```

⚠️ **No conviertas `.hp-field` en `display:none`.** Los bots que interpretan CSS
lo detectan y se lo saltan.

### 11.3 Si extraes el CSS y el JS a ficheros

Muy razonable en un rediseño, pero hay que tocar tres sitios a la vez:

1. **`scripts/build.mjs`** — añade los ficheros nuevos a `ASSETS`, o darán 404
   en producción aunque en local se vean.
2. **`_headers`** — con el JS ya fuera del HTML puedes endurecer la CSP quitando
   `'unsafe-inline'` de `script-src`. Hazlo solo cuando **no quede ni un
   `onclick=` ni un `<script>` en línea**, o la página se queda sin JS.
3. **Rutas absolutas** en el HTML: `/assets/app.js`, no `assets/app.js`.

### 11.4 Si añades páginas nuevas

Cada `.html` nuevo hay que sumarlo a `ASSETS` en `scripts/build.mjs`. Recuerda
que un fichero en `dist/pagina.html` se sirve en `/pagina` (Pages quita el
`.html`), mientras que `dist/pagina/index.html` provoca un 308 de `/pagina` a
`/pagina/` — y si además pones una redirección de vuelta, **bucle infinito**
(§7.7 y la trampa de la tabla).

### 11.5 Si el rediseño trae librerías, fuentes o analítica

Todo recurso externo **se bloquea en silencio** si no está en la CSP de
`_headers`. La página carga a medias y no hay error visible salvo en la consola.

| Añades | Directiva a tocar |
|---|---|
| Tailwind/Bootstrap por CDN | `style-src` |
| Alpine, HTMX, jQuery por CDN | `script-src` |
| Google Analytics, Meta Pixel | `script-src` **y** `connect-src` |
| Vídeo embebido | `frame-src` |
| Fuentes que no sean Google | `font-src` |
| Imágenes de otro dominio | `img-src` |

### 11.6 Si cambias los formularios de sitio o añades uno

Recuerda los **tres** puntos de §4.3: marcado, el `origen` en el JS y la
whitelist `ORIGENES` del servidor. Si te dejas el tercero, las altas se guardan
con `origen: "desconocido"` y pierdes para siempre el dato de qué formulario
convierte mejor. Añade también su test.

### 11.7 Antes de dar el rediseño por bueno

```bash
npm run dev     # NO abras index.html con doble clic: no reproduce producción
```

- [ ] Enviar cada formulario y confirmar que el email llega a `/api/leads`
- [ ] Probar con un email inválido: mensaje en castellano, sin petición de red
- [ ] Consola del navegador: **cero** errores y cero avisos de CSP
- [ ] Verlo a 390 px de ancho con los ojos
- [ ] Modo avión: debe salir "Fallo de conexión…" y el botón recuperarse
- [ ] `npm test` en verde (si no, el despliegue se detiene)
- [ ] Repetir la comprobación de §10 contra la URL ya desplegada

⚠️ **`scrollWidth === clientWidth` no demuestra que no haya desbordamiento.**
`body { overflow-x: hidden }` lo enmascara: el contenido se corta pero la
métrica sale limpia. Aquí eso ocultó un fallo real en móvil durante todo un
rediseño. Míralo con los ojos.

---

## 12. Comandos de referencia

```bash
npm test              # 12 tests, sin red
npm run build         # tests + genera dist/  (lo que ejecuta Pages)
npm run build:only    # solo genera dist/, sin tests
npm run dev           # servidor local con D1 y bindings de prueba
npm run db:local      # aplica schema.sql a la D1 local
npm run db:remote     # aplica schema.sql a la D1 real
npm run setup         # alta completa en Cloudflare (idempotente)
npm run deploy        # despliegue manual por CLI

npx wrangler login
npx wrangler whoami
npx wrangler pages project list                          # ¿Git Provider: Yes?
npx wrangler pages deployment list --project-name X      # historial
npx wrangler pages secret put NOMBRE --project-name X
npx wrangler d1 execute BD --remote --command "SELECT …"
npx wrangler d1 export BD --remote --output backup.sql
```

---

## 13. Estructura de ficheros

```
index.html                    la landing (CSS y JS en línea)
_headers                      cabeceras de seguridad y caché (raíz de dist/)
_redirects                    redirecciones (raíz de dist/)
wrangler.toml                 nombre del proyecto y bindings (NO secretos)
schema.sql                    tablas de D1
package.json                  scripts; `build` = tests + copia

lib/validation.mjs            lógica pura: validación, hash, CSV
functions/api/subscribe.js    POST /api/subscribe — alta
functions/api/leads.js        GET  /api/leads     — consulta (token)
scripts/build.mjs             whitelist de ficheros a publicar
scripts/setup.mjs             alta completa en Cloudflare
test/validation.test.mjs      node:test

.github/workflows/ci.yml      tests y build en cada push y PR
.github/workflows/deploy.yml  despliegue alternativo por Actions
```

Lo que **nunca** se commitea (está en `.gitignore`): `dist/`, `node_modules/`,
`.wrangler/`, `.dev.vars`, y el material interno de `uploads/`.
