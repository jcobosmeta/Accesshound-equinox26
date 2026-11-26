# AccessHound demo run sheet

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
- [ ] Quick rehearsal of Marta (below), then **Restablecer** again.
- [ ] Turn off notifications, close other tabs, and set the font size so the back row can read it.

## The script

| Time | What you click | What you say |
|---|---|---|
| **0:00** | Nothing. Show the **Mapa de riesgo**. | «Toda empresa reparte cientos de llaves: cuentas, grupos de administración, VPN, dispositivos. Nadie controla quién sigue teniendo cuáles. AccessHound lo pone todo en un mismo mapa, unas reglas señalan lo que no encaja y un agente de IA lo investiga para que una persona decida.» |
| **0:25** | Point at the map, then at **Javier Ortega (98%)**. | «Cada círculo es una persona o cuenta de Brisa Networks, con su riesgo. Media del 41 %, y alguien al 98 %.» |
| **0:40** | **Hallazgos**, then **Empezar análisis**, then **Investigar todos (6)**. | «Las reglas han encontrado seis problemas. Lanzo el agente sobre los seis a la vez: cuatro en paralelo, el resto en cola.» |
| **0:55** | Open **Marta Ruiz**'s row. Point at the red paths in **Mapa de accesos**. | «Marta pasó de Finanzas a Marketing en marzo. En rojo, lo que ha señalado la regla: sigue teniendo Jira y Azure de Finanzas.» Read one of the agent's notes aloud as it appears. |
| **1:20** | Point at the proposal card. | «Recomienda **revocar**. Fijaos en las pruebas: su ticket de Azure se aprobó para un puesto de Controller cloud que ya no tiene, y ninguno de sus compañeros de Marketing tiene ese acceso.» |
| **1:40** | Click **Aprobar y revocar**. Point at the map. | «Decide una persona, no la IA. Al aprobar, el cambio se aplica: esos caminos quedan revocados. Su acceso de Marketing se mantiene.» |
| **2:00** | Open **Javier Ortega**'s row. | «Javier se fue a la competencia en septiembre. Aquí no basta con limpiar: su móvil de trabajo y el Descodificador DEMO se usaron en la sede de Madrid a las 22:41 y 22:47 del 14 de noviembre, de noche.» |
| **2:25** | Point at **Escalar**, then click **Aprobar y escalar**. | «Propone **escalar**: desactivar cuenta y dispositivos y abrir un incidente. Aprobado, y queda registrado.» |
| **2:45** | Open **Elena Navarro**'s row. | «Elena es la única ingeniera con un Descodificador DEMO. Una herramienta ingenua diría “revocar”.» |
| **3:05** | Point at **Mantener**, then click **Aprobar: mantener el acceso**. | «El agente ha encontrado un ticket aprobado por el CISO para la guardia de dispositivos DEMO, vigente hasta marzo de 2027. Recomienda **mantener**: comprueba antes de acusar. No cambia nada, pero queda registrado.» |
| **3:30** | **Auditoría**, then **Descargar CSV**. | «Cada decisión: qué propuso el agente, quién lo aprobó y qué cambió realmente. Es la evidencia que pide una auditoría de NIS2, y aquí está como archivo para entregar.» |
| **3:55** | **Hallazgos**. Point at the three you didn't open. | «También ha encontrado una cuenta de copias de seguridad con permisos de administrador cuyo responsable se fue, una analista con Firebase y un Azure temporal que caducó hace un año, y un acceso a la VPN desde Lagos 19 minutos después de que su móvil se registrara en Madrid.» |
| **4:20** | **Mapa de riesgo**. Point at Javier, Marta and Elena. | «Y el mapa se ha calmado: Javier ha bajado del 98 % al 12 %, Marta del 81 % al 13 %, y Elena del 69 % al 40 %, porque su acceso ya está revisado y justificado.» |
| **4:45** | Nothing. | «Las reglas deciden qué no encaja, así que no se escapa nada. La IA investiga y explica. Y siempre decide una persona.» |

**Short on time?** Drop Javier: Marta, then Elena, then the audit trail and the risk map still tell the whole story.

**Why "Investigar todos" at the start:** by the time you finish with Marta, the other five are ready, so you never wait on the agent. If you'd rather show one investigation from the beginning, open Marta's row and click **Investigar** instead, then use **Investigar todos** after her.

## If something goes wrong

| What you see | What to do |
|---|---|
| The agent's steps say **El agente en vivo no está disponible: se pasa a reproducción.** | Carry on. Replay mode runs the same read-only lookups on the same data, so the evidence is real. You can mention it: «y ahí está la red de seguridad». |
| The agent takes more than 30 seconds | Keep talking over its notes, or open another finding and come back; the investigation keeps running. |
| You approved the wrong thing | **Restablecer** (top right), then **Restablecer** in the dialog. It restores all data and clears the analyses and the audit trail. Redo the case you were on. |
| A section shows "No se puede…" | Click **Reintentar**, or open another finding. |
| The whole page shows **AccessHound ha tenido un problema** | Click **Recargar**. The data lives on the server, so nothing is lost. |
| The network or gateway is down | Set `AGENT_MODE=replay` in `server/.env` and restart `npm start`. Everything works offline, with the header saying **Agente en reproducción**. |

## Likely questions

- **«¿Y si la IA se equivoca?»** No puede cambiar nada: sus herramientas solo leen. Todo cambio necesita la aprobación de una persona, y las pruebas que cita están en la tarjeta para comprobarlas.
- **«¿Cómo sabéis que no se os escapa nada?»** La detección no es IA. Reglas fijas señalan los hallazgos; el agente solo investiga lo que señalan.
- **«¿De dónde salen los datos?»** En esta demo, de una empresa generada. En producción: RR. HH., grupos del directorio, cuentas SaaS y registros de dispositivos, unidos en un solo grafo.
- **«¿Cuánto cuesta?»** Unos 6 céntimos por investigación con Claude Opus 5.5, y entre 7 y 17 segundos.
- **«¿Por qué no quitar sin más todo acceso inusual?»** Elena: inusual no es lo mismo que indebido. El agente busca el motivo antes de recomendar nada.
