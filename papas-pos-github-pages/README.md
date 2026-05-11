# Papas POS para iPhone

App simple de punto de venta para ventas de papas. La base de datos queda en el iPhone mediante IndexedDB.

## Qué hace

- Registra ventas por saco y descuenta stock.
- Registra compras por saco y suma stock.
- Cada saco equivale a 25 kilos.
- Inventario simple en una sola categoría: Papa consumo.
- Permite elegir fecha en ventas, compras y pagos; por defecto usa el día actual.
- Calcula deuda a proveedores cuando compras y pagas de a poco.
- Muestra saldo a favor cuando los pagos superan la deuda.
- Guarda botones de precios/costos rápidos y recuerda el último valor usado.
- Registra pagos a proveedores y descuenta la deuda.
- Muestra ventas diarias, semanales y mensuales.
- Guarda historial de ventas, compras y pagos.
- Exporta e importa respaldos JSON.
- Puede instalarse en iPhone como PWA.

## Instalación recomendada en iPhone

Para que funcione como app instalada y offline, súbela a un hosting estático HTTPS como Netlify, Vercel, Cloudflare Pages o GitHub Pages.

La base de datos no se sube a internet: aunque la app se abra desde una URL, los datos quedan en el almacenamiento local del iPhone.

Luego en el iPhone:

1. Abre la URL en Safari.
2. Toca Compartir.
3. Toca Agregar a pantalla de inicio.
4. Abre Papas POS desde el icono instalado.

## Respaldo

Exporta respaldo JSON seguido desde la pestaña Historial. Guarda ese archivo en iCloud Drive, WhatsApp, correo o donde prefieras.

Si borras datos de Safari, cambias de iPhone o desinstalas la app, podrías perder la base local si no tienes respaldo.

## Importar datos

Guarda tu planilla como CSV desde Excel o Numbers e impórtala desde **Historial > Importar desde Excel**.

Esta versión pública no trae datos reales del negocio. Para pasar tus movimientos al iPhone, usa **Historial > Importar respaldo** con tu archivo JSON de respaldo.

Columnas recomendadas:

- `fecha`
- `tipo`: `venta`, `compra` o `pago`
- `variedad`
- `sacos`
- `precio_saco` para ventas
- `costo_saco` para compras
- `proveedor` para compras y pagos
- `monto` o `total`
- `abono` para compras pagadas parcialmente
- `nota`

Ejemplo:

```csv
fecha,tipo,variedad,sacos,precio_saco,costo_saco,proveedor,monto,abono,nota
2026-05-10,compra,Asterix,20,,9000,Don Luis,180000,50000,primera compra
2026-05-10,venta,Asterix,3,12000,,,36000,,cliente local
2026-05-11,pago,Asterix,,,,Don Luis,30000,,transferencia
```
