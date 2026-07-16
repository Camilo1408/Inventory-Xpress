# Manual de Usuario — Inventory Xpress

Guía práctica para usar el sistema. Está escrita para el **usuario final** (dueño,
administrador y personal del negocio), no para desarrolladores. Explica, paso a paso,
cómo usar cada funcionalidad para llevar el inventario de los insumos o productos de
**cualquier negocio** (tienda, bodega, minimercado, farmacia, bar, restaurante, etc.).

> **Sobre las capturas de pantalla:** las imágenes de este manual se tomaron del sistema
> en funcionamiento, con datos de ejemplo. Lo que usted vea puede variar según los
> productos y categorías de su negocio y según las funciones activadas en su instalación.

## Índice

- [1. Antes de empezar](#1-antes-de-empezar)
- [2. Ingresar al sistema (inicio de sesión)](#2-ingresar-al-sistema-inicio-de-sesión)
- [3. Pantalla principal (Dashboard)](#3-pantalla-principal-dashboard)
- [4. Productos](#4-productos)
- [5. Movimientos de stock](#5-movimientos-de-stock)
- [6. Inventario diario](#6-inventario-diario)
- [7. Control por nivel de botella (opcional)](#7-control-por-nivel-de-botella-opcional)
- [8. Alertas y lista de compras](#8-alertas-y-lista-de-compras)
- [9. Reportes](#9-reportes)
- [10. Auditoría](#10-auditoría)
- [11. Mi perfil](#11-mi-perfil)
- [12. Categorías](#12-categorías)
- [13. Usuarios](#13-usuarios)
- [14. Roles y permisos](#14-roles-y-permisos)
- [15. Cerrar sesión](#15-cerrar-sesión)
- [16. Preguntas frecuentes](#16-preguntas-frecuentes)

---

## 1. Antes de empezar

El sistema muestra en el **menú lateral** solo las opciones para las que usted tiene
permiso. Si no ve una opción de este manual, es porque su rol no la incluye. Además,
algunas funciones (inventario diario, control por nivel de botella) pueden estar
**activadas o no** según la configuración de su negocio.

**Roles básicos:**

| Rol | Qué puede hacer (resumen) |
|---|---|
| **Superadmin** | Todo: productos, categorías, usuarios, roles, auditoría, movimientos, inventario y reportes. |
| **Admin** | Operar el inventario (movimientos, inventario diario, ajustes, reabrir, reportes, activar/desactivar productos, auditoría). **No** crea/edita productos ni categorías, ni gestiona usuarios. |
| **Empleado** | Inventario diario, movimientos, ver productos, ver alertas y dashboard. |

> Su negocio puede tener además **roles personalizados** con combinaciones específicas de
> permisos. Los cambios de permisos pueden requerir **volver a iniciar sesión**.

![Menú lateral con las secciones disponibles según el rol](docs/img/dashboard.png)

---

## 2. Ingresar al sistema (inicio de sesión)

**Propósito:** entrar al sistema con su cuenta.
**Quién:** todos los usuarios.

**Pasos:**
1. Abra la dirección web del sistema en su navegador.
2. Escriba su **usuario** y su **contraseña**.
3. Presione **Iniciar sesión**.

**Datos requeridos:** usuario y contraseña.
**Resultado esperado:** acceso al **Dashboard**.

**Errores / situaciones comunes:**
- *Credenciales inválidas:* revise usuario/contraseña (distingue mayúsculas).
- *Cuenta desactivada:* contacte a un administrador para reactivarla.

**Recomendación:** cambie su contraseña inicial desde **Mi perfil** la primera vez y no la
comparta.

> Si su negocio usa el sistema **integrado con Nómina Xpress**, no verá esta pantalla:
> ingresa automáticamente con su sesión de Nómina. Para salir, use "Volver a Nómina".

![Pantalla de inicio de sesión](docs/img/login.png)

---

## 3. Pantalla principal (Dashboard)

**Propósito:** ver de un vistazo el estado del inventario.
**Quién:** todos los usuarios con acceso.

**Qué muestra:**
- **Tarjetas de resumen:** productos activos, alertas de stock, entradas y salidas del día.
- **Stock bajo mínimo:** lista de productos que necesitan reposición.
- **Movimientos recientes:** últimos registros de entradas/salidas/ajustes.

**Resultado esperado:** un panorama actualizado; los enlaces "Ver todos" y "Ver historial"
llevan a Alertas y a Movimientos.
**Recomendación:** revíselo al iniciar la jornada.

![Dashboard con tarjetas de resumen, stock bajo mínimo y movimientos recientes](docs/img/dashboard.png)

---

## 4. Productos

### 4.1 Ver productos

**Propósito:** consultar el catálogo y el stock actual.
**Quién:** todos los usuarios con acceso.
**Pasos:** menú **Productos** → use el buscador para filtrar por nombre o categoría.
**Resultado esperado:** lista con nombre, categoría, stock y estado (**En stock**, **Bajo
mínimo**, **Sin stock**).

![Listado de productos con buscador y estados de stock](docs/img/productos.png)

### 4.2 Crear un producto

**Propósito:** dar de alta un producto nuevo.
**Quién:** Superadmin (o rol con permiso "Crear productos").

**Pasos:**
1. Menú **Productos** → **Nuevo producto**.
2. Complete: **nombre**, **unidad de medida** (unidad, botella, kg, caja…), **categoría** y,
   opcionalmente, **stock mínimo** e **imagen**.
3. **Guardar**.

**Datos requeridos:** nombre, unidad y categoría.
**Resultado esperado:** el producto aparece en el listado.
**Errores / situaciones comunes:** faltan datos obligatorios; sin permiso (no verá el botón).
**Recomendación:** defina un **stock mínimo** realista para recibir alertas útiles de
reposición.

![Formulario de creación de producto](docs/img/producto-form.png)

### 4.3 Editar, activar/desactivar y eliminar

**Quién:** editar → permiso "Editar productos"; activar/desactivar → "Activar/desactivar";
borrado permanente → "Borrado permanente".
**Pasos:** menú **Productos** → seleccione el producto → **Editar**; o use las acciones de
la fila para activar/desactivar.
**Resultado esperado:** los cambios se reflejan de inmediato. **Desactivar** oculta el
producto de las operaciones sin borrar su historial. El **borrado permanente** solo es
posible si el producto **no** tiene historial de movimientos.
**Recomendación:** prefiera **desactivar** en vez de borrar para conservar la trazabilidad.

---

## 5. Movimientos de stock

**Propósito:** registrar entradas, salidas y ajustes de stock.
**Quién:** usuarios con permiso "Registrar movimientos" (Empleado, Admin, Superadmin o rol
equivalente). Los **ajustes** requieren además el permiso "Ajustar stock".

**Registrar una entrada o salida — pasos:**
1. Menú **Movimientos**.
2. Busque y seleccione el **producto** (verá su stock actual).
3. Elija el tipo: **Entrada** (compra/ingreso) o **Salida** (consumo/merma/venta).
4. Escriba la **cantidad** y, si desea, **observaciones**.
5. Presione **Registrar movimiento**.

**Datos requeridos:** producto, tipo y cantidad.
**Resultado esperado:** el stock se actualiza y aparece un aviso con el nuevo valor.

**Registrar un ajuste:** elija **Ajuste** e ingrese un valor **positivo** para aumentar o
**negativo** para disminuir (útil tras un conteo físico). Requiere el permiso "Ajustar
stock". Deje siempre una observación con el motivo.

**Ver el historial:** **Movimientos** → **Historial**. Filtre por producto, tipo y rango de
fechas.

**Errores / situaciones comunes:**
- *Stock insuficiente:* no se puede sacar más de lo que hay.
- *Cantidad inválida:* debe ser mayor que 0.

**Recomendación:** registre los movimientos en el momento para que el stock refleje siempre
la realidad.

![Formulario de movimiento con selector de producto y tipo](docs/img/movimientos.png)

![Historial de movimientos con filtros](docs/img/historial.png)

---

## 6. Inventario diario

> Disponible solo si su instalación tiene activada esta función.

**Propósito:** hacer el conteo del día por área (categoría), detectando diferencias entre el
stock del sistema y el conteo físico real.
**Quién:** usuarios con permiso para la categoría (típicamente Empleado, Admin, Superadmin).
**Reabrir** una jornada cerrada requiere un permiso adicional.

**Abrir la jornada — pasos:**
1. Menú **Inventario Diario**.
2. Elija la **categoría** (por ejemplo, Barra o Cocina en un restaurante; Bebidas o Abarrotes
   en una tienda). Verá su estado: *Sin iniciar*, *En curso* o *Cerrado*.
3. Abra la jornada e ingrese el **conteo inicial** de cada producto.
4. Confirme.

**Cerrar la jornada — pasos:**
1. Con la jornada **En curso**, ingrese el **conteo final** de cada producto.
2. Si hubo **entradas o salidas no registradas** durante el día, indíquelas con su **motivo**
   y **hora**.
3. Presione **Cerrar**.

**Reabrir una jornada:** abra la jornada cerrada → **Reabrir** → indique el **motivo**.
Requiere el permiso "Reabrir inventario".

**Resultado esperado:** al abrir/cerrar, si el conteo difiere del sistema se ajusta
automáticamente y queda registrado. La jornada reabierta vuelve a estar editable y deja
constancia de quién y por qué la reabrió.

**Errores / situaciones comunes:** faltan el motivo/hora de una entrada no registrada; sin
permiso para reabrir.
**Recomendación:** haga el conteo con el área cerrada para evitar movimientos mientras cuenta.

![Selección de categoría de inventario diario con su estado](docs/img/inv-selector.png)

![Pantalla de conteo de una jornada (apertura)](docs/img/inv-conteo.png)

---

## 7. Control por nivel de botella (opcional)

> Función opcional, útil para negocios que manejan **productos embotellados** que no se
> cuentan por unidad exacta (por ejemplo, licores en un bar o restaurante). Se activa por
> configuración y aplica a los productos de la subcategoría bajo seguimiento.

**Propósito:** controlar productos embotellados que duran varias semanas **sin** medir
cantidades exactas: se registra el **nivel de la botella abierta** y cuántas **botellas de
reserva** hay.
**Quién:** igual que Movimientos e Inventario diario.

**Cómo se registra:**
- **Nivel de la botella abierta:** seleccione uno de los 5 estados —
  **Llena → 3/4 → Mitad → 1/4 → Casi vacía**.
- **Botellas en reserva:** cuente las botellas cerradas disponibles (`− / +`).
- **Vaciar:** al marcar la botella abierta como vacía, si hay reserva se "destapa" una nueva
  automáticamente (reserva −1, nivel Llena).
- En el **inventario diario**, el botón **"Mantener igual"** copia el último estado
  registrado (útil los días sin movimiento).

**Resultado esperado:** el sistema calcula las **botellas disponibles** (reserva + 1 si hay
botella abierta con contenido) y avisa cuándo comprar.
**Recomendación:** configure el **umbral de alerta** del producto si desea que avise antes de
llegar a "Casi vacía".

![Control por nivel de botella (semáforo) y botellas en reserva](docs/img/bottle.png)

---

## 8. Alertas y lista de compras

**Propósito:** ver qué hay que reponer.
**Quién:** todos los usuarios con acceso.

**Qué incluye:**
1. **Productos bajo mínimo:** su stock es menor o igual al mínimo definido.
2. **Productos embotellados por reponer** (si la función está activa): botella en el umbral
   de alerta y **sin** reserva.

**Pasos:** menú **Alertas**. Use **Copiar lista de compras** para llevar la lista al celular
o pegarla en un chat/nota.
**Resultado esperado:** listado claro de lo que falta; si todo está en orden, se indica.
**Recomendación:** revise las alertas antes de hacer el pedido a proveedores.

![Pantalla de Alertas con los grupos de reposición y el botón "Copiar lista de compras"](docs/img/alertas.png)

---

## 9. Reportes

**Propósito:** analizar movimientos y stock por período.
**Quién:** usuarios con permiso "Ver reportes" (Admin, Superadmin o rol equivalente).

**Pasos:**
1. Menú **Reportes**.
2. Elija el período: **Semana**, **Quincena**, **Mes** o **Histórico**. Puede filtrar por
   categoría y por estado (activos/inactivos).

**Resultado esperado:** por cada producto verá el **stock inicial** del período, las
**entradas**, las **salidas** y el **stock actual**.
**Recomendación:** use el reporte **mensual** para evaluar consumo y planear compras.

![Pantalla de Reportes con selector de período y tabla de resultados](docs/img/reportes.png)

---

## 10. Auditoría

**Propósito:** revisar el historial de acciones sensibles (quién abrió/cerró/reabrió
inventarios, creó categorías, o intentos de acceso denegado).
**Quién:** usuarios con permiso "Ver auditoría" (Admin, Superadmin o rol equivalente).

**Pasos:** menú **Auditoría**. Filtre por **acción**, **usuario**, **resultado**, texto o
**rango de fechas**.
**Resultado esperado:** tabla con fecha, acción, categoría, usuario, detalle y resultado
(OK / Denegado).

**Nota:** los registros se conservan **6 meses**.

![Pantalla de Auditoría con filtros y tabla de eventos](docs/img/auditoria.png)

---

## 11. Mi perfil

> Disponible en el modo con login propio (standalone).

**Propósito:** actualizar sus datos y su contraseña.
**Quién:** cualquier usuario autenticado.
**Pasos:** abra **Perfil** → edite su **nombre de usuario** y/o **contraseña** → **Guardar**.
**Recomendación:** use una contraseña robusta y cámbiela periódicamente.

![Pantalla de perfil con cambio de usuario/contraseña](docs/img/perfil.png)

---

## 12. Categorías

**Propósito:** organizar los productos en categorías (por área, tipo o ubicación) y
subcategorías.
**Quién:** usuarios con permiso "Gestionar categorías" (típicamente Superadmin).

**Pasos:**
1. Menú **Categorías** → **Nueva categoría** (raíz o subcategoría de una existente).
2. Escriba el **nombre** y **Guardar**. Puede reordenarlas según el orden físico de su
   inventario.

**Datos requeridos:** nombre.
**Resultado esperado:** la categoría queda disponible al crear/editar productos y en el
inventario diario.
**Recomendación:** defina la estructura de categorías al inicio y evite duplicados.

**Nota:** al crear una categoría **raíz** se generan automáticamente sus permisos de
inventario diario. Renombrar una categoría **no** cambia su identificador interno.

![Pantalla de gestión de categorías (raíz y subcategorías)](docs/img/categorias.png)

---

## 13. Usuarios

> Disponible solo en el modo con login propio (standalone).

**Propósito:** crear y gestionar las cuentas de acceso al sistema.
**Quién:** usuarios con permiso "Gestionar usuarios" (Superadmin).

**Crear un usuario — pasos:**
1. Menú **Usuarios** → **Nuevo usuario**.
2. Complete **usuario**, **nombre**, **contraseña** y **rol base**.
3. Opcional: asigne un **rol personalizado** y ajuste **permisos individuales**
   (conceder/revocar) por acción.
4. **Guardar**.

**Datos requeridos:** usuario, contraseña y rol base.
**Resultado esperado:** la persona ya puede iniciar sesión con los permisos resultantes.
**Otras acciones:** editar, activar/desactivar y restablecer contraseñas.

**Errores / situaciones comunes:** nombre de usuario repetido (debe ser único); los cambios
de rol/permisos aplican de inmediato en standalone.
**Recomendación:** asigne el **rol más restrictivo** que permita el trabajo de la persona.

![Alta de usuario: rol base, rol personalizado y permisos individuales](docs/img/usuario-modal.png)

---

## 14. Roles y permisos

> Disponible solo en el modo con login propio (standalone).

**Propósito:** definir **roles personalizados** como conjuntos de permisos reutilizables, para
no depender solo de los roles base.
**Quién:** usuarios con permiso "Gestionar usuarios" (Superadmin).

**Crear un rol — pasos:**
1. Menú **Roles** → **Nuevo rol**.
2. Escriba **nombre** y descripción.
3. Marque los **permisos** por grupo (General, Operación, Productos, Admin).
4. **Guardar**. Luego asígnelo a un usuario desde **Usuarios**.

**Datos requeridos:** nombre y selección de permisos.
**Resultado esperado:** el rol queda disponible; un usuario con ese rol usa exactamente esos
permisos (reemplaza a su rol base).
**Recomendación:** cree roles por función real del negocio (por ejemplo, "Encargado de
bodega") en vez de dar permisos sueltos a cada usuario.

![Pantalla de roles con el catálogo de permisos por grupo](docs/img/roles.png)

---

## 15. Cerrar sesión

**Modo con login propio:** use la opción **Cerrar sesión** del encabezado (icono arriba a la
derecha, junto a su nombre).
**Modo integrado con Nómina:** use **Volver a Nómina** (la sesión se gestiona desde Nómina
Xpress).
**Recomendación:** cierre sesión al terminar, especialmente en equipos compartidos.

![Encabezado con el nombre de usuario y el icono para cerrar sesión](docs/img/header.png)

---

## 16. Preguntas frecuentes

**No veo una opción en el menú.**
Su rol no tiene ese permiso, o la función no está activada en su instalación. Consulte con el
administrador.

**Cambié permisos de un usuario y no se reflejan.**
En el modo con login propio aplican de inmediato. En el modo integrado con Nómina, el usuario
debe **cerrar sesión y volver a entrar**.

**No puedo registrar una salida.**
Verifique que haya stock suficiente; el sistema no permite dejar el stock por debajo de 0.

**¿Por qué un producto embotellado no aparece en alertas aunque está casi vacío?**
Porque tiene **botellas de reserva**. Solo alerta cuando no queda reserva.

**Necesito corregir un inventario ya cerrado.**
Pida a alguien con permiso "Reabrir inventario" que lo reabra; deberá indicar un motivo.

**¿Para qué tipo de negocio sirve el sistema?**
Para cualquiera que necesite controlar existencias de insumos o productos: tiendas, bodegas,
minimercados, farmacias, bares, restaurantes, cafeterías, etc. Las categorías y unidades se
configuran según su negocio.
