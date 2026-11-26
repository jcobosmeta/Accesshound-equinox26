// Access map: principal → groups → entitlements in three fixed columns, joined by right-angled
// connectors. The structure is always these three hops, so a fixed layout beats a general graph
// library: it's predictable, and the columns read as "who · through what · can do what".

import { Avatar, Boxed, Box, Chip, Inline, Stack, Text1, Text2, skinVars, useScreenSize } from "@telefonica/mistica";
import IconRobotRegular from "@telefonica/mistica-icons/icon-robot-regular";
import * as React from "react";
import type { AccessPath, PrincipalDetail } from "../api";
import { entitlementIcon, groupSourceIcon, initials } from "../present";

type NodeState = "normal" | "flagged" | "removed" | "dimmed";

interface GroupNode {
  id: string;
  name: string;
  source: AccessPath["group"]["source"];
  granted: string;
  ticketId: string | null;
  state: NodeState;
}

interface EntNode {
  id: string;
  entitlement: AccessPath["entitlement"];
  state: NodeState;
}

interface Edge {
  from: string;
  to: string;
  state: NodeState;
  lane: number; // which vertical channel the connector uses, so connectors from different groups don't merge
}

const COLUMN_GAP = 40;
const sourceShort: Record<AccessPath["group"]["source"], string> = {
  "Active Directory": "AD",
  SaaS: "SaaS",
  "Physical access": "Badge",
};
// The principal column holds one short box; give the width to groups and entitlements.
const COLUMNS = "minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.2fr)";

const nodeStyle = (state: NodeState, hovered: boolean, fill: boolean): React.CSSProperties => ({
  position: "relative",
  borderRadius: skinVars.borderRadii.container,
  border: `${state === "flagged" ? 2 : 1}px ${state === "removed" ? "dashed" : "solid"} ${
    state === "flagged" ? skinVars.colors.error : hovered ? skinVars.colors.brand : skinVars.colors.border
  }`,
  background: state === "flagged" && fill ? skinVars.colors.errorLow : skinVars.colors.backgroundContainer,
  opacity: state === "dimmed" ? 0.45 : state === "removed" ? 0.7 : 1,
  transition: "opacity 120ms, border-color 120ms",
});

function Node(props: {
  id: string;
  state: NodeState;
  hovered: boolean;
  onHover: (id?: string) => void;
  icon: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  /** Tint flagged nodes, not just outline them. Used for entitlements: the access itself is the problem. */
  fill?: boolean;
}) {
  const { id, state, hovered, onHover, icon, title, subtitle, fill = false } = props;
  return (
    <div
      data-node={id}
      title={title}
      style={nodeStyle(state, hovered, fill)}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(undefined)}
    >
      <Box paddingX={12} paddingY={8}>
        <Inline space={8} alignItems="center" expand={1}>
          {icon}
          <Stack space={2}>
            <Text2 medium truncate={2} decoration={state === "removed" ? "line-through" : undefined}>
              {title}
            </Text2>
            <Text1 regular truncate color={skinVars.colors.textSecondary}>
              {subtitle}
            </Text1>
          </Stack>
        </Inline>
      </Box>
    </div>
  );
}

/** Right-angled connector from (x1,y1) to (x2,y2) turning at x = mx, with rounded corners. */
function connector(x1: number, y1: number, x2: number, y2: number, mx: number) {
  const dy = y2 - y1;
  if (Math.abs(dy) < 1) return `M${x1},${y1} H${x2}`;
  const s = Math.sign(dy);
  const r = Math.min(8, Math.abs(dy) / 2, mx - x1, x2 - mx);
  return `M${x1},${y1} H${mx - r} Q${mx},${y1} ${mx},${y1 + s * r} V${y2 - s * r} Q${mx},${y2} ${mx + r},${y2} H${x2}`;
}

interface Props {
  detail: PrincipalDetail;
  /** Paths that existed earlier in this session and were removed by an approved decision. */
  removed: AccessPath[];
  /** Entitlement ids the finding is about. */
  flagged: string[];
}

export function AccessGraph({ detail, removed, flagged }: Props) {
  const [hoverId, setHoverId] = React.useState<string>();
  const [flaggedOnly, setFlaggedOnly] = React.useState(false);
  const { isMobile } = useScreenSize();
  const flaggedSet = React.useMemo(() => new Set(flagged), [flagged]);
  const principalNodeId = `p:${detail.profile.id}`;

  // Build nodes and edges. Paths that lead to flagged access sort to the top.
  const { groups, ents, edges, hiddenCount } = React.useMemo(() => {
    const live = detail.access.map((a) => ({ a, removed: false }));
    const gone = removed.map((a) => ({ a, removed: true }));
    let paths = [...live, ...gone];
    const groupIsFlagged = (gid: string) => paths.some((p) => p.a.group.id === gid && flaggedSet.has(p.a.entitlement.id));
    const total = new Set(paths.map((p) => p.a.entitlement.id)).size;
    if (flaggedOnly) paths = paths.filter((p) => groupIsFlagged(p.a.group.id) || p.removed);

    const rank = (p: (typeof paths)[number]) => (p.removed ? 0 : groupIsFlagged(p.a.group.id) ? 1 : 2);
    paths.sort((x, y) => rank(x) - rank(y));

    const groups = new Map<string, GroupNode>();
    const ents = new Map<string, EntNode>();
    for (const { a, removed: isRemoved } of paths) {
      const g = groups.get(a.group.id);
      const gState: NodeState = isRemoved ? "removed" : groupIsFlagged(a.group.id) ? "flagged" : "normal";
      if (!g) groups.set(a.group.id, { ...a.group, granted: a.granted, ticketId: a.ticketId, state: gState });
      else if (g.state === "removed" && !isRemoved) g.state = gState;
      const e = ents.get(a.entitlement.id);
      const eState: NodeState = isRemoved ? "removed" : flaggedSet.has(a.entitlement.id) ? "flagged" : "normal";
      if (!e) ents.set(a.entitlement.id, { id: a.entitlement.id, entitlement: a.entitlement, state: eState });
      else if (e.state === "removed" && !isRemoved) e.state = eState;
    }
    // Sort entitlements by the first group that grants them, so connectors cross as little as possible.
    const groupOrder = [...groups.keys()];
    const firstGroup = (eid: string) =>
      Math.min(...paths.filter((p) => p.a.entitlement.id === eid).map((p) => groupOrder.indexOf(p.a.group.id)));
    const entList = [...ents.values()].sort((x, y) => firstGroup(x.id) - firstGroup(y.id));

    const edges: Edge[] = [];
    groupOrder.forEach((gid, i) => {
      const g = groups.get(gid)!;
      edges.push({ from: principalNodeId, to: `g:${gid}`, state: g.state, lane: 0 });
      const seen = new Set<string>();
      for (const { a, removed: isRemoved } of paths) {
        if (a.group.id !== gid || seen.has(a.entitlement.id)) continue;
        seen.add(a.entitlement.id);
        const state: NodeState = isRemoved ? "removed" : flaggedSet.has(a.entitlement.id) ? "flagged" : "normal";
        edges.push({
          from: `g:${gid}`,
          to: `e:${a.entitlement.id}`,
          state,
          lane: groupOrder.length > 1 ? i / (groupOrder.length - 1) : 0.5,
        });
      }
    });
    return { groups: [...groups.values()], ents: entList, edges, hiddenCount: total - entList.length };
  }, [detail, removed, flaggedSet, flaggedOnly, principalNodeId]);

  // Hovering a node lights up every path through it and fades the rest.
  const related = React.useMemo(() => {
    if (!hoverId || hoverId === principalNodeId) return undefined;
    const ids = new Set([hoverId, principalNodeId]);
    const gEdges = edges.filter((e) => e.from !== principalNodeId);
    for (const e of gEdges) if (e.from === hoverId || e.to === hoverId) ids.add(e.from).add(e.to);
    return ids;
  }, [hoverId, edges, principalNodeId]);
  const nodeState = (id: string, state: NodeState): NodeState => (related && !related.has(id) ? "dimmed" : state);

  // Measure node positions and draw connectors between them.
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = React.useState<{ w: number; h: number; rects: Map<string, DOMRect> }>();
  React.useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      const origin = body.getBoundingClientRect();
      const rects = new Map<string, DOMRect>();
      body.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => {
        const r = el.getBoundingClientRect();
        rects.set(el.dataset.node!, new DOMRect(r.x - origin.x, r.y - origin.y, r.width, r.height));
      });
      setGeometry({ w: origin.width, h: origin.height, rects });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    return () => ro.disconnect();
  }, [groups, ents, isMobile]);

  const edgeColor = (e: Edge, active: boolean) =>
    e.state === "flagged" ? skinVars.colors.error : active ? skinVars.colors.brand : skinVars.colors.neutralMedium;

  const principalSubtitle =
    detail.kind === "person" ? `${detail.profile.title} · ${detail.profile.department}` : "Service account";

  const columnHeader = (text: string) => (
    <Text1 medium color={skinVars.colors.textSecondary}>
      {text}
    </Text1>
  );
  const flaggedCount = ents.filter((e) => e.state === "flagged").length;

  const groupNode = (g: GroupNode) => {
    const Icon = groupSourceIcon[g.source];
    const id = `g:${g.id}`;
    return (
      <Node
        key={id}
        id={id}
        state={nodeState(id, g.state)}
        hovered={hoverId === id}
        onHover={setHoverId}
        icon={<Icon size={20} color={g.state === "flagged" ? skinVars.colors.error : skinVars.colors.neutralHigh} />}
        title={g.name}
        subtitle={
          g.state === "removed"
            ? "Removed"
            : `${sourceShort[g.source]} · since ${g.granted.slice(0, 4)}${g.ticketId ? ` · ${g.ticketId}` : ""}`
        }
      />
    );
  };

  const entNode = ({ id: eid, entitlement: e, state }: EntNode) => {
    const Icon = entitlementIcon(e.physical);
    const id = `e:${eid}`;
    return (
      <Node
        key={id}
        id={id}
        state={nodeState(id, state)}
        hovered={hoverId === id}
        onHover={setHoverId}
        icon={<Icon size={20} color={state === "flagged" ? skinVars.colors.error : skinVars.colors.neutralHigh} />}
        title={e.name}
        fill
        subtitle={
          state === "removed" ? (
            `${e.system} · revoked`
          ) : (
            <>
              {e.system}
              {e.risk !== "low" && (
                <Text1 as="span" medium color={e.risk === "high" ? skinVars.colors.error : skinVars.colors.warning}>
                  {` · ${e.risk} risk`}
                </Text1>
              )}
            </>
          )
        }
      />
    );
  };

  return (
    <Boxed>
      <Box padding={16}>
        <Stack space={16}>
          <Inline space="between" alignItems="center" wrap verticalSpace={8}>
            <Inline space={16} alignItems="center" wrap verticalSpace={8}>
              <Text1 regular color={skinVars.colors.textSecondary}>
                {`${detail.access.length} access paths · ${flaggedCount} flagged`}
                {removed.length ? ` · ${removed.length} revoked` : ""}
              </Text1>
            </Inline>
            <Chip active={flaggedOnly} onPress={() => setFlaggedOnly((v) => !v)}>
              {flaggedOnly && hiddenCount ? `Flagged only (${hiddenCount} hidden)` : "Flagged only"}
            </Chip>
          </Inline>

          {isMobile ? (
            // Too narrow for three columns: list each group with the access it grants underneath.
            <Stack space={16}>
              {groups.map((g) => (
                <Stack space={8} key={g.id}>
                  {groupNode(g)}
                  <Box paddingLeft={24}>
                    <Stack space={8}>
                      {ents.filter((e) => edges.some((x) => x.from === `g:${g.id}` && x.to === `e:${e.id}`)).map(entNode)}
                    </Stack>
                  </Box>
                </Stack>
              ))}
            </Stack>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: COLUMNS, columnGap: COLUMN_GAP }}>
                {columnHeader(detail.kind === "person" ? "Person" : "Service account")}
                {columnHeader("Member of")}
                {columnHeader("Which grants")}
              </div>

              <div
                ref={bodyRef}
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: COLUMNS,
                  columnGap: COLUMN_GAP,
                  alignItems: "center",
                }}
              >
                {geometry && (
                  <svg
                    width={geometry.w}
                    height={geometry.h}
                    style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
                    aria-hidden
                  >
                    {[...edges]
                      // Draw flagged and hovered connectors last so they sit on top.
                      .map((e) => ({ e, active: !!related && related.has(e.from) && related.has(e.to) }))
                      .sort((x, y) => Number(x.e.state === "flagged" || x.active) - Number(y.e.state === "flagged" || y.active))
                      .map(({ e, active }) => {
                        const a = geometry.rects.get(e.from);
                        const b = geometry.rects.get(e.to);
                        if (!a || !b) return null;
                        const x1 = a.right;
                        const y1 = a.top + a.height / 2;
                        const x2 = b.left;
                        const y2 = b.top + b.height / 2;
                        const mx = x1 + (x2 - x1) * (0.3 + 0.4 * e.lane);
                        const faded = related && !active;
                        return (
                          <g key={`${e.from}>${e.to}`} style={{ opacity: faded ? 0.25 : e.state === "removed" ? 0.6 : 1 }}>
                            <path
                              d={connector(x1, y1, x2, y2, mx)}
                              fill="none"
                              style={{
                                stroke: edgeColor(e, active),
                                strokeWidth: e.state === "flagged" ? 2.5 : active ? 2 : 1.25,
                                strokeDasharray: e.state === "removed" ? "5 4" : undefined,
                              }}
                            />
                            <circle cx={x2} cy={y2} r={3} style={{ fill: edgeColor(e, active) }} />
                          </g>
                        );
                      })}
                  </svg>
                )}

                {/* Column 1: the principal */}
                <div>
                  <Node
                    id={principalNodeId}
                    state="normal"
                    hovered={hoverId === principalNodeId}
                    onHover={setHoverId}
                    icon={
                      detail.kind === "person" ? (
                        <Avatar size={32} initials={initials(detail.profile.name)} />
                      ) : (
                        <Avatar size={32} Icon={IconRobotRegular} />
                      )
                    }
                    title={detail.profile.name}
                    subtitle={principalSubtitle}
                  />
                </div>

                {/* Column 2: groups */}
                <Stack space={8}>{groups.map(groupNode)}</Stack>

                {/* Column 3: entitlements */}
                <Stack space={8}>{ents.map(entNode)}</Stack>
              </div>
            </>
          )}

          <Inline space={24} wrap verticalSpace={8} alignItems="center">
            <Text1 regular color={skinVars.colors.textSecondary}>
              Red: the access this finding is about
            </Text1>
            {removed.length > 0 && (
              <Text1 regular color={skinVars.colors.textSecondary}>
                Dashed: removed by an approved decision
              </Text1>
            )}
            {!isMobile && (
              <Text1 regular color={skinVars.colors.textSecondary}>
                Hover a box to trace its paths
              </Text1>
            )}
          </Inline>
        </Stack>
      </Box>
    </Boxed>
  );
}
