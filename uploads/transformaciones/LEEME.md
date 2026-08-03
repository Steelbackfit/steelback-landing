# Fotos de antes / después

Deja aquí las fotos de la sección **"Gente como tú"**. El build las detecta
solas, las copia a `dist/assets/transformaciones/` y genera las tarjetas. No
hay que tocar el HTML.

> ⚠️ Esta carpeta **sí se publica**. Es la única excepción dentro de
> `uploads/`, que por lo demás guarda material interno que nunca sale del
> repositorio. No dejes aquí nada que no quieras en internet.

## Cómo nombrar los ficheros

```
nombre_edad_meses.jpg
```

| Fichero | Etiqueta que sale en la web |
|---|---|
| `marcos_28_6.jpg` | Marcos, 28 — 6 meses |
| `alvaro_23_9.webp` | Álvaro, 23 — 9 meses |
| `maria-jose_31_4.png` | Maria Jose, 31 — 4 meses |

- Guiones en el nombre para separar palabras: `maria-jose` → "Maria Jose".
- Si el nombre no sigue el patrón, se usa el nombre del fichero tal cual como
  etiqueta. No falla nada, solo queda menos fino.
- Extensiones admitidas: `.jpg`, `.jpeg`, `.png`, `.webp`, `.avif`.
- Se ordenan alfabéticamente. Prefija con `01_`, `02_`… si quieres un orden
  concreto; el prefijo numérico se ignora en la etiqueta.

## Formato recomendado

- **Proporción 316 × 400** (vertical). Se recorta centrado, así que deja aire.
- **WebP** a calidad ~80. Pesa la mitad que un JPEG con la misma pinta.
- **Máximo 300 KB por foto.** El CI avisa si alguna se pasa: son fotos que
  cargan todos los visitantes de la landing.

Para convertir y redimensionar:

```bash
# con ImageMagick
magick original.jpg -resize 632x800^ -gravity center -extent 632x800 -quality 80 marcos_28_6.webp
```

## Publicar

Deja los ficheros, commitea y empuja. El despliegue es automático:

```bash
git add uploads/transformaciones/
git commit -m "feat(transformaciones): añade fotos de Marcos y Álvaro"
git push
```

Mientras la carpeta esté vacía, la web muestra tarjetas de marcador de posición
con el texto "foto antes / después", que es como está diseñado.

## Consentimiento

Antes de publicar la foto de alguien, ten su permiso por escrito. Son datos
personales y además imágenes de su cuerpo: si luego pide retirarla, hay que
poder hacerlo rápido — basta con borrar el fichero y empujar.
