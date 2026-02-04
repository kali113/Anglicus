# Contribuir a Anglicus

¡Gracias por tu interés en contribuir! Este documento te explica cómo funciona todo.

## 📁 Estructura del Proyecto

```
/web          - Aplicación web
/android      - Aplicación Android nativa
/api          - Backend/router para la IA
/shared       - Código compartido entre plataformas
/docs         - Documentación técnica
```

## 🔧 Documentación Técnica (en inglés)

- [AGENTS.md](../AGENTS.md) - Instrucciones para el agente IA de desarrollo
- [development-prompt.md](development-prompt.md) - Prompt completo para empezar a construir
- [security.md](security.md) - Manejo seguro de claves API
- [architecture.md](architecture.md) - Diseño del sistema
- [exercises.md](exercises.md) - Tipos de ejercicios
- [spanish-errors.md](spanish-errors.md) - Errores comunes de hispanohablantes
- [guidelines.md](guidelines.md) - Guía para escribir AGENTS.md

## 🚀 Stack Tecnológico

| Componente | Tecnología |
|------------|------------|
| Web | Por definir (hosting gratuito) |
| Android | Por definir (probablemente Kotlin) |
| Backend | Router API propio (para claves del dueño) |
| IA | APIs compatibles con OpenAI (3 niveles) |

## ⚠️ Seguridad

**NUNCA** subas claves API al repositorio. Lee [security.md](security.md) para entender cómo manejamos esto.

## 🤝 Cómo Contribuir

1. Haz fork del repositorio
2. Crea una rama para tu feature (`git checkout -b mi-feature`)
3. Haz commit de tus cambios
4. Abre un Pull Request

## 🤖 Worktrees para agentes IA

Para aislar agentes IA por tarea, usa el script de worktrees:

```powershell
.\scripts\create-agent-worktrees.ps1
```

Por defecto crea worktrees para: `web`, `api`, `android`, `shared`, `docs`.
Puedes pasar una lista personalizada:

```powershell
.\scripts\create-agent-worktrees.ps1 web api
```

## 📝 Licencia

Por definir (será open source)
