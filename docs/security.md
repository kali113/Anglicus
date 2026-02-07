# Seguridad / Security

## Principios / Principles
ES: No subas secretos al repo. Todo lo sensible va en variables de entorno.
EN: Never commit secrets. All sensitive data must live in environment variables.

## Estrategia 3 niveles / 3-tier strategy
1. **Owner keys:** Backend router con claves propias.
2. **BYOK:** La clave del usuario vive solo en su dispositivo.
3. **Fallback:** Puter.js u otro proveedor gratuito (si aplica).

## BYOK
ES: La clave se almacena cifrada localmente, pero no protege contra XSS.
EN: The key is encrypted locally, but it does not protect against XSS.

## Archivos prohibidos / Never commit
```
.env
.env.local
.env.production
local.properties
*.keystore
```
