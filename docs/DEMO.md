# Mi Portero demo run sheet

A 5-minute demo: the risk map, three cases end to end, the audit trail, then back to the risk map to show it calmer. Stage directions are in English; what to say is in Spanish, like the app. Live investigations take 7–17 seconds each.

## Before you go on

Do these 15 minutes before, on the machine you present from.

- [ ] Your LiteLLM key is in `server/.env`, and `npm run check-agent` prints **Works**.
- [ ] Start the app on one port:
  ```bash
  npm run build && npm start      # UI and API on http://localhost:8787
  ```
- [ ] Open http://localhost:8787. The header must say **Agente en vivo**. If it says **Agente en reproducción**, the key wasn't picked up: check `server/.env` and restart.
- [ ] The browser window is at least 1280px wide, or zoomed to 90%, so the risk map and the findings table have room.
- [ ] Run one case and approve it, typing your name as **Revisor** so it's pre-filled. Then click **Restablecer** and **Restablecer** again in the dialog.
- [ ] Quick rehearsal of Patricia (below), then **Restablecer** again.
- [ ] Turn off notifications, close other tabs, and set the font size so the back row can read it.

## The script

| Time | What you click | What you say |
|---|---|---|
| **0:00** | Nothing. Show the **Mapa de riesgo**. | «Toda empresa reparte cientos de llaves: cuentas, grupos de administración, VPN, dispositivos. Nadie controla quién sigue teniendo cuáles. Mi Portero lo pone todo en un mismo mapa, unas reglas señalan lo que no encaja y un agente de IA lo investiga para que una persona decida.» |
| **0:25** | Point at the map, then at **Carlos Nieto (98%)**. | «Cada círculo es una persona o cuenta de FCYBERL, con su riesgo. Media del 12 %, y alguien al 98 %.» |
| **0:40** | **Hallazgos**, then **Empezar análisis**, then **Investigar todos (3)**. | «Las reglas han encontrado tres problemas. Lanzo el agente sobre los tres a la vez.» |
| **0:55** | Open **Patricia Román Castro**'s row. Point at the red paths in **Mapa de accesos**. | «Patricia pasó de Marketing a Diseño en marzo. En rojo, lo que ha señalado la regla: sigue teniendo VPN DEMO y Firebase de Marketing.» Read one of the agent's notes aloud as it appears. |
| **1:20** | Point at the proposal card. | «Recomienda **revocar**. Fijaos en las pruebas: su ticket de Firebase se aprobó para analítica de campañas en Marketing, un puesto que ya no tiene, y nadie en Diseño tiene ese acceso.» |
| **1:40** | Click **Aprobar y revocar**. Point at the map. | «Decide una persona, no la IA. Al aprobar, el cambio se aplica: esos caminos quedan revocados. Su acceso general se mantiene.» |
| **2:00** | Open **Carlos Nieto**'s row. | «El 8 de septiembre, el móvil de trabajo de Carlos se registró en la sede de Madrid a las 09:12 y, 19 minutos después, alguien entró en la VPN con su cuenta desde Lagos. Una persona no puede estar en los dos sitios. Pasó hace once semanas y nadie lo vio: es justo lo que una auditoría tiene que encontrar.» |
| **2:25** | Point at **Escalar**, then click **Aprobar y escalar**. | «Propone **escalar**: restablecer las credenciales de la VPN y abrir un incidente, porque alguien puede seguir teniendo su contraseña. Aprobado, y queda registrado.» |
| **2:45** | Open **Marcos Barba Ballarín**'s row. | «Marcos es la única persona de IA con un Descodificador DEMO. Una herramienta ingenua diría “revocar”.» |
| **3:05** | Point at **Mantener**, then click **Aprobar: mantener el acceso**. | «El agente ha encontrado un ticket aprobado por el CISO para las pruebas de modelos sobre dispositivos DEMO, vigente hasta marzo de 2027. Recomienda **mantener**: comprueba antes de acusar. No cambia nada, pero queda registrado.» |
| **3:30** | **Auditoría**, then **Descargar CSV**. | «Cada decisión: qué propuso el agente, quién lo aprobó y qué cambió realmente. Es la evidencia que pide una auditoría de NIS2, y aquí está como archivo para entregar.» |
| **4:20** | **Mapa de riesgo**. Point at Carlos, Patricia and Marcos. | «Y el mapa se ha calmado: Carlos, Patricia y Marcos han bajado, porque su acceso ya está revisado y justificado.» |
| **4:45** | Nothing. | «Las reglas deciden qué no encaja, así que no se escapa nada. La IA investiga y explica. Y siempre decide una persona.» |

**Short on time?** Drop Carlos: Patricia, then Marcos, then the audit trail and the risk map still tell the whole story.

**Why "Investigar todos" at the start:** by the time you finish with Patricia, the other three are ready, so you never wait on the agent. If you'd rather show one investigation from the beginning, open Patricia's row and click **Investigar** instead, then use **Investigar todos** after her.

## If something goes wrong

| What you see | What to do |
|---|---|
| The agent's steps say **El agente en vivo no está disponible: se pasa a reproducción.** | Carry on. Replay mode runs the same read-only lookups on the same data, so the evidence is real. You can mention it: «y ahí está la red de seguridad». |
| The agent takes more than 30 seconds | Keep talking over its notes, or open another finding and come back; the investigation keeps running. |
| You approved the wrong thing | **Restablecer** (top right), then **Restablecer** in the dialog. It restores all data and clears the analyses and the audit trail. Redo the case you were on. |
| A section shows "No se puede…" | Click **Reintentar**, or open another finding. |
| The whole page shows **Mi Portero ha tenido un problema** | Click **Recargar**. The data lives on the server, so nothing is lost. |
| The network or gateway is down | Set `AGENT_MODE=replay` in `server/.env` and restart `npm start`. Everything works offline, with the header saying **Agente en reproducción**. |

## Likely questions

- **«¿Y si la IA se equivoca?»** No puede cambiar nada: sus herramientas solo leen. Todo cambio necesita la aprobación de una persona, y las pruebas que cita están en la tarjeta para comprobarlas.
- **«¿Cómo sabéis que no se os escapa nada?»** La detección no es IA. Reglas fijas señalan los hallazgos; el agente solo investiga lo que señalan.
- **«¿De dónde salen los datos?»** En esta demo, de datos generados con el equipo de FCYBERL: los roles y los incidentes son inventados. En producción: RR. HH., grupos del directorio, cuentas SaaS y registros de dispositivos, unidos en un solo grafo.
- **«¿Cuánto cuesta?»** Unos 6 céntimos por investigación con Claude Opus 5.5, y entre 7 y 17 segundos.
- **«¿Por qué no quitar sin más todo acceso inusual?»** Marcos: inusual no es lo mismo que indebido. El agente busca el motivo antes de recomendar nada.
