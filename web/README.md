# sv

Todo lo que necesitas para construir un proyecto Svelte, impulsado por [`sv`](https://github.com/sveltejs/cli).

## Creando un proyecto

Si estás viendo esto, probablemente ya hayas realizado este paso. ¡Felicidades!

```sh
# crear un nuevo proyecto
npx sv create my-app
```

Para recrear este proyecto con la misma configuración:

```sh
# recrear este proyecto
npx sv create --template minimal --types ts --install npm web
```

## Desarrollo

Una vez creado el proyecto e instalado las dependencias con `npm install` (o `pnpm install` o `yarn`), inicia el servidor de desarrollo:

```sh
npm run dev

# o inicia el servidor y abre la aplicación en una nueva pestaña del navegador
npm run dev -- --open
```

## Construcción

Para crear una versión de producción de tu aplicación:

```sh
npm run build
```

Puedes previsualizar la compilación de producción con `npm run preview`.

> Para desplegar tu aplicación, es posible que necesites instalar un [adaptador](https://svelte.dev/docs/kit/adapters) para tu entorno de destino.
