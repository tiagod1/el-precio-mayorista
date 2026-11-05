# El Precio Mayorista

Crear una aplicación web completa, responsive y en español para el comercio argentino “El Precio Mayorista”. Debe funcionar muy bien en celulares iPhone y Android y también en computadora. Es un catálogo mayorista para clientes: encabezado con logo/nombre, buscador instantáneo, navegación por categorías, filtros por proveedor y categoría, fichas de producto con nombre, código, precio unitario, stock/estado de disponibilidad y foto cuando exista; carrito con selector de cantidades, edición y eliminación de artículos, subtotal y total estimado; botón para generar un pedido de WhatsApp con detalle de productos, cantidades y total. No inventar teléfono de WhatsApp: dejarlo configurable desde administración. Crear además un panel de administración protegido por inicio de sesión, donde se pueda importar el Excel actualizado de precios y stock (mismo formato de columnas Codigo, Nombre, Familia, Proveedor principal, Precio final, Stock), actualizar productos existentes por código sin perder fotos, agregar productos nuevos, marcar sin stock, administrar fotos, ocultar productos sin stock si se desea y mostrar fecha de última actualización. Preparar la estructura para cargar el catálogo real de aproximadamente 4.835 productos; no inventar productos ni precios de ejemplo que puedan confundirse con precios reales. Hasta importar el archivo, mostrar una pantalla de catálogo vacío con instrucciones de importación. Unificar cigarrillos bajo categoría CIGARRILLOS y excluir los artículos Jumbo Pack y las categorías ya descartadas en el catálogo preparado. Diseño moderno, claro, comercial, rápido, accesible, con identidad visual basada en el logo que se adjuntará luego. Priorizar experiencia mobile-first. Incluir validaciones para importación Excel y mensajes claros de error/éxito. No publicar todavía; primero generar una vista previa funcional para revisar.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/deac6aee-e59d-4884-aba0-8c1da578bf9f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
