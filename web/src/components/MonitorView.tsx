import {
  Boxed,
  ButtonLink,
  ButtonPrimary,
  ButtonSecondary,
  EmptyStateCard,
  IconButton,
  Inline,
  SearchField,
  Spinner,
  Stack,
  Tag,
  Text1,
  Text2,
  Text3,
  Text5,
  Title2,
  Title1,
  skinVars,
  useScreenSize,
  useTheme,
} from "@telefonica/mistica";
import IconBellRegular from "@telefonica/mistica-icons/icon-bell-regular";
import IconCloseRegular from "@telefonica/mistica-icons/icon-close-regular";
import IconLockClosedRegular from "@telefonica/mistica-icons/icon-lock-closed-regular";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  api,
  type AlertSeverity,
  type BlockedPrincipal,
  type MonitorConfig,
  type MonitorEvent,
  type WatchedPrincipal,
} from "../api";
import { formatTime, getScorePalette } from "../present";

export interface MonitorState {
  config?: MonitorConfig;
  events: MonitorEvent[];
  blocked: BlockedPrincipal[];
  iaAvailable: boolean;
  connected: boolean;
}

const severityTag: Record<AlertSeverity, { type: "error" | "warning" | "inactive" | "promo"; text: string }> = {
  critical: { type: "error", text: "Crítica" },
  high: { type: "error", text: "Alta" },
  medium: { type: "warning", text: "Media" },
  low: { type: "inactive", text: "Baja" },
};

const outcome = (e: MonitorEvent): { text: string; type: "error" | "warning" | "inactive" | "info" | "active"; accent: string } => {
  if (e.status === "analyzing") return { text: "Analizando", type: "active", accent: skinVars.colors.brand };
  if (e.status === "pending_block") return { text: "Bloqueo pendiente", type: "warning", accent: skinVars.colors.warning };
  if (e.status === "dismissed") return { text: "Bloqueo descartado", type: "info", accent: skinVars.colors.neutralMedium };
  switch (e.decision?.action) {
    case "block":
      return { text: "Accesos bloqueados", type: "error", accent: skinVars.colors.error };
    case "watch":
      return { text: "En vigilancia", type: "warning", accent: skinVars.colors.warning };
    default:
      return { text: "Sin acción", type: "inactive", accent: skinVars.colors.border };
  }
};

const Secondary = ({ children }: { children: React.ReactNode }) => (
  <Text1 regular color={skinVars.colors.textSecondary}>
    {children}
  </Text1>
);

const Stat = ({ value, label, color }: { value: number; label: string; color?: string }) => (
  <Stack space={2}>
    <Text5 color={value ? color : undefined}>{value}</Text5>
    <Secondary>{label}</Secondary>
  </Stack>
);

const LiveDot = ({ on }: { on: boolean }) => (
  <span
    aria-hidden
    style={{
      width: 10,
      height: 10,
      borderRadius: "50%",
      display: "inline-block",
      background: on ? skinVars.colors.success : skinVars.colors.neutralMedium,
      animation: on ? "ah-pulse 1.6s ease-out infinite" : undefined,
    }}
  />
);

function EventCard({ event, onConfirm }: { event: MonitorEvent; onConfirm: (accept: boolean) => void }) {
  const { alert, decision } = event;
  const o = outcome(event);
  const fresh = Date.now() - new Date(alert.time).getTime() < 4000;
  return (
    <div
      style={{
        borderRadius: 8,
        background: skinVars.colors.backgroundContainer,
        // Longhand only: mixing `border` with `borderLeft*` makes React warn when the accent changes.
        borderStyle: "solid",
        borderWidth: "1px 1px 1px 4px",
        borderColor: `${skinVars.colors.border} ${skinVars.colors.border} ${skinVars.colors.border} ${o.accent}`,
        padding: "12px 16px",
        animation: fresh ? "ah-in .35s ease-out" : undefined,
      }}
    >
      <Stack space={8}>
        <Inline space="between" alignItems="center" wrap verticalSpace={4}>
          <Inline space={8} alignItems="center" wrap verticalSpace={4}>
            <Tag type={severityTag[alert.severity].type}>{severityTag[alert.severity].text}</Tag>
            <Text2 medium>{alert.title}</Text2>
            <Secondary>· {alert.source}</Secondary>
          </Inline>
          <Secondary>
            {alert.id} · {formatTime(alert.time)}
          </Secondary>
        </Inline>
        <Stack space={2}>
          <Text3 medium>{alert.principalName}</Text3>
          <Text2 regular color={skinVars.colors.textSecondary}>
            {alert.detail}
          </Text2>
        </Stack>
        {event.status === "analyzing" ? (
          <Inline space={8} alignItems="center">
            <Spinner size={16} />
            <Secondary>Evaluando el aviso frente a los datos de auditoría…</Secondary>
          </Inline>
        ) : (
          <Stack space={8}>
            <Inline space={8} alignItems="center" wrap verticalSpace={4}>
              <Tag type={o.type} Icon={decision?.action === "block" && event.status === "decided" ? IconLockClosedRegular : undefined}>
                {o.text}
              </Tag>
            </Inline>
            {decision && <Text2 regular>{decision.reason}</Text2>}
            {event.applied.length > 0 && (
              <Stack space={2}>
                {event.applied.map((a, i) => (
                  <Secondary key={i}>✓ {a}</Secondary>
                ))}
              </Stack>
            )}
            {event.status === "pending_block" && (
              <Inline space={8}>
                <ButtonPrimary small StartIcon={IconLockClosedRegular} onPress={() => onConfirm(true)}>
                  Bloquear accesos
                </ButtonPrimary>
                <ButtonSecondary small onPress={() => onConfirm(false)}>
                  Descartar
                </ButtonSecondary>
              </Inline>
            )}
          </Stack>
        )}
      </Stack>
    </div>
  );
}

function WatchRow({ w, onUnblock }: { w: WatchedPrincipal; onUnblock: () => void }) {
  const { isDarkMode } = useTheme();
  const p = getScorePalette(isDarkMode)[w.riskLevel];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: `1px solid ${skinVars.colors.divider}` }}>
      <div
        style={{
          width: 44,
          height: 28,
          borderRadius: 14,
          background: p.bg,
          border: `1px solid ${p.border}`,
          color: p.text,
          fontSize: 12,
          fontWeight: 500,
          display: "grid",
          placeItems: "center",
        }}
        title={p.label}
      >
        {w.riskScore}%
      </div>
      <Stack space={2}>
        <Text2 medium truncate>
          {w.name}
        </Text2>
        <Text1 regular truncate color={skinVars.colors.textSecondary}>
          {w.openFindings ? `${w.openFindings} ${w.openFindings > 1 ? "hallazgos" : "hallazgo"} · ` : ""}
          {w.subtitle}
        </Text1>
      </Stack>
      {w.blocked ? (
        <Stack space={4}>
          <Tag type="error" Icon={IconLockClosedRegular} small>
            Bloqueado
          </Tag>
          <ButtonLink small onPress={onUnblock}>
            Desbloquear
          </ButtonLink>
        </Stack>
      ) : (
        <Tag type="warning" small>
          Vigilado
        </Tag>
      )}
    </div>
  );
}

function WatchlistModal({
  watchlist,
  onClose,
  onUnblock,
}: {
  watchlist: WatchedPrincipal[];
  onClose: () => void;
  onUnblock: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const sorted = [...watchlist].sort((a, b) => b.riskScore - a.riskScore);
  const shown = q ? sorted.filter((w) => `${w.name} ${w.subtitle}`.toLowerCase().includes(q)) : sorted;
  const blockedCount = watchlist.filter((w) => w.blocked).length;

  return createPortal(
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,.5)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        animation: "ah-fade .15s ease-out",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="watchlist-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 100%)",
          maxHeight: "min(80vh, 760px)",
          display: "flex",
          flexDirection: "column",
          background: skinVars.colors.backgroundContainer,
          border: `1px solid ${skinVars.colors.border}`,
          borderRadius: 12,
          boxShadow: "0 16px 48px rgba(0,0,0,.35)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "20px 20px 12px" }}>
          <Stack space={12}>
            <Inline space="between" alignItems="flex-start">
              <Stack space={4}>
                <Title1 as="h3" id="watchlist-modal-title">
                  Usuarios vigilados
                </Title1>
                <Secondary>
                  {watchlist.length} {watchlist.length === 1 ? "usuario" : "usuarios"}
                  {blockedCount ? ` · ${blockedCount} ${blockedCount === 1 ? "bloqueado" : "bloqueados"}` : ""} · ordenados por riesgo
                </Secondary>
              </Stack>
              <IconButton Icon={IconCloseRegular} aria-label="Cerrar" onPress={onClose} />
            </Inline>
            <SearchField name="watchlist-search" label="Buscar usuario" value={query} onChangeValue={setQuery} />
          </Stack>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 16px" }}>
          {shown.length === 0 ? (
            <div style={{ padding: "16px 0" }}>
              <Secondary>Ningún usuario coincide con «{query}».</Secondary>
            </div>
          ) : (
            shown.map((w) => <WatchRow key={w.id} w={w} onUnblock={() => onUnblock(w.id)} />)
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Below this risk score a watched user is hidden from the card; "Ver todos" opens the full list in a modal.
const WATCH_MIN_SCORE = 10;

export function MonitorView({
  state,
  dataVersion,
  onError,
}: {
  state: MonitorState;
  dataVersion: number;
  onError: (message: string) => void;
}) {
  const { config, events, blocked, connected } = state;
  const { isTabletOrSmaller } = useScreenSize();
  const [watchlist, setWatchlist] = React.useState<WatchedPrincipal[]>();
  const [watchlistOpen, setWatchlistOpen] = React.useState(false);
  const closeWatchlist = React.useCallback(() => setWatchlistOpen(false), []);

  const fail = (err: unknown) => onError(err instanceof Error ? err.message : String(err));

  // The watchlist depends on findings and blocks, so refetch whenever either changes.
  const blockedKey = blocked.map((b) => b.principalId).join(",");
  React.useEffect(() => {
    api.monitor.watchlist().then(setWatchlist, fail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockedKey, dataVersion]);

  const configure = (patch: Partial<MonitorConfig>) => {
    api.monitor.configure(patch).catch(fail);
  };

  const decided = events.filter((e) => e.status !== "analyzing");
  const count = (pred: (e: MonitorEvent) => boolean) => decided.filter(pred).length;

  const running = Boolean(config?.running);

  const visibleWatchlist = watchlist?.filter((w) => w.riskScore > WATCH_MIN_SCORE);

  // Monitoring starts as soon as this tab opens (and again after a demo reset): no start button.
  React.useEffect(() => {
    if (connected && config && !config.running) configure({ running: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, config?.running]);

  return (
    <Stack space={24}>
      <style>{`
        @keyframes ah-pulse { 0% { box-shadow: 0 0 0 0 rgba(52,211,153,.7) } 70% { box-shadow: 0 0 0 8px rgba(52,211,153,0) } 100% { box-shadow: 0 0 0 0 rgba(52,211,153,0) } }
        @keyframes ah-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes ah-in { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
      `}</style>

      <Inline space="between" alignItems="flex-end" wrap verticalSpace={16}>
        <Stack space={4}>
          <Title2 as="h2">Monitorización en tiempo real</Title2>
          <Text2 regular color={skinVars.colors.textSecondary}>
            Cada aviso de seguridad (SIEM, EDR, IdP, DLP, fichajes) se cruza con lo que ya sabe la auditoría del usuario. Si
            la combinación es peligrosa, se bloquean sus accesos al momento.
          </Text2>
        </Stack>
        <Inline space={12} alignItems="center">
          <LiveDot on={running && connected} />
          <Stack space={2}>
            {!(connected && running) && <Text2 medium>{!connected ? "Sin conexión con el servidor" : "Iniciando…"}</Text2>}
          </Stack>
        </Inline>
      </Inline>

      <Inline space={40} wrap verticalSpace={12}>
        <Stat value={events.length} label="Avisos recibidos" />
        <Stat value={blocked.length} label="Usuarios bloqueados" color={skinVars.colors.error} />
        <Stat value={count((e) => e.status === "pending_block")} label="Bloqueos pendientes" color={skinVars.colors.warning} />
        <Stat value={count((e) => e.decision?.action === "watch")} label="En vigilancia" color={skinVars.colors.warning} />
        <Stat value={count((e) => e.decision?.action === "ignore" || e.status === "dismissed")} label="Sin acción" />
      </Inline>

      <div style={{ display: "grid", gap: 24, gridTemplateColumns: isTabletOrSmaller ? "1fr" : "minmax(0,1.7fr) minmax(320px,1fr)", alignItems: "start" }}>
        <Stack space={12}>
          <Title1 as="h3">Avisos en directo</Title1>
          {events.length === 0 ? (
            <EmptyStateCard
              asset={<IconBellRegular size="100%" color={skinVars.colors.brand} />}
              title="Todavía no ha llegado ningún aviso"
              description="Los avisos de seguridad aparecerán aquí en cuanto lleguen."
            />
          ) : (
            <Stack space={12}>
              {events.map((e) => (
                <EventCard key={e.alert.id} event={e} onConfirm={(accept) => {
                    api.monitor.confirm(e.alert.id, accept).catch(fail);
                  }} />
              ))}
            </Stack>
          )}
        </Stack>

        <Stack space={24}>
          <Boxed>
            <div style={{ padding: 20 }}>
              <Stack space={8}>
                <Title1 as="h3">Usuarios vigilados</Title1>
                <Secondary>Marcados por la auditoría: hallazgos abiertos o riesgo alto. Sus avisos pesan más.</Secondary>
                <div>
                  {watchlist === undefined || visibleWatchlist === undefined ? (
                    <Spinner size={20} />
                  ) : visibleWatchlist.length === 0 ? (
                    <Secondary>
                      {watchlist.length === 0 ? "Nadie en la lista ahora mismo." : `Nadie supera el ${WATCH_MIN_SCORE}% de riesgo ahora mismo.`}
                    </Secondary>
                  ) : (
                    visibleWatchlist.map((w) => <WatchRow key={w.id} w={w} onUnblock={() => {
                        api.monitor.unblock(w.id).catch(fail);
                      }} />)
                  )}
                </div>
                {watchlist && watchlist.length > 0 && (
                  <div>
                    <ButtonLink small onPress={() => setWatchlistOpen(true)}>
                      {`Ver todos (${watchlist.length})`}
                    </ButtonLink>
                  </div>
                )}
              </Stack>
            </div>
          </Boxed>
        </Stack>
      </div>

      {watchlistOpen && watchlist && (
        <WatchlistModal
          watchlist={watchlist}
          onClose={closeWatchlist}
          onUnblock={(id) => {
            api.monitor.unblock(id).catch(fail);
          }}
        />
      )}
    </Stack>
  );
}
