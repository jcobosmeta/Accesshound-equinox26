// Dark-mode Interactive Organization & Risk Map: displays every person and
// service account connected by organizational hierarchy, service ownership,
// and team links — each with a glowing 0–100% risk gauge. Switchable between
// Radial Risk Map and Hierarchy Tree views. Clicking any node opens their
// Access Map and Investigation directly underneath; clicking empty canvas deselects.

import {
  Box,
  Boxed,
  ButtonPrimary,
  EmptyStateCard,
  Inline,
  SkeletonRectangle,
  Text1,
  Text2,
  skinVars,
} from "@telefonica/mistica";
import IconErrorRegular from "@telefonica/mistica-icons/icon-error-regular";
import * as React from "react";
import type { Finding, GraphEdge, GraphEdgeKind, GraphNode, OrgGraph, Summary } from "../api";
import { departmentAccent, initials, scorePalette } from "../present";

type LayoutMode = "radial" | "hierarchy";
type FilterMode = "all" | "flagged" | "elevated";

interface NodePos {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  col?: number;
  angle?: number;
}

interface ColumnFrame {
  dept: string;
  x: number;
  y: number;
  w: number;
  h: number;
  avgRisk: number;
  flaggedCount: number;
}

interface SectorLabel {
  dept: string;
  x: number;
  y: number;
  align: "start" | "end";
  avgRisk: number;
  flaggedCount: number;
}

const DEPT_ORDER = ["Finanzas", "Marketing", "Ingeniería", "TI"];

// Hierarchy layout constants
const H_OUTER_X = 40;
const H_COL_W = 264;
const H_COL_GAP = 32;
const H_COL_STEP = H_COL_W + H_COL_GAP;
const H_CARD_W = 232;
const H_CARD_H = 60;
const H_SVC_W = 216;
const H_SVC_H = 54;
const H_ROOT_W = 320;
const H_ROOT_H = 66;
const H_ROOT_Y = 24;
const H_HEAD_Y = 162;
const H_FIRST_CHILD_Y = 250;
const H_ROW_STEP = 74;

// Radial map layout constants
const R_W = 1280;
const R_H = 820;
const R_CX = R_W / 2;
const R_CY = R_H / 2;

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function computeHierarchyLayout(graph: OrgGraph) {
  const positions = new Map<string, NodePos>();
  const columns: ColumnFrame[] = [];

  const root = graph.nodes.find((n) => n.kind === "org");
  const heads = graph.nodes.filter((n) => n.kind === "person" && n.managerId === "org-root");
  const orderedDepts = [
    ...DEPT_ORDER.filter((d) => heads.some((h) => h.department === d)),
    ...heads.map((h) => h.department).filter((d) => !DEPT_ORDER.includes(d)),
  ];

  const totalW = H_OUTER_X * 2 + orderedDepts.length * H_COL_W + Math.max(0, orderedDepts.length - 1) * H_COL_GAP;
  let maxBottom = H_FIRST_CHILD_Y + 200;

  if (root) {
    const rx = (totalW - H_ROOT_W) / 2;
    positions.set(root.id, {
      x: rx,
      y: H_ROOT_Y,
      w: H_ROOT_W,
      h: H_ROOT_H,
      cx: rx + H_ROOT_W / 2,
      cy: H_ROOT_Y + H_ROOT_H / 2,
    });
  }

  const servicesByOwner = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind === "service" && n.managerId) {
      const list = servicesByOwner.get(n.managerId) ?? [];
      list.push(n);
      servicesByOwner.set(n.managerId, list);
    }
  }

  orderedDepts.forEach((dept, colIdx) => {
    const colX = H_OUTER_X + colIdx * H_COL_STEP;
    const head = heads.find((h) => h.department === dept);
    if (!head) return;

    const headX = colX + 16;
    positions.set(head.id, {
      x: headX,
      y: H_HEAD_Y,
      w: H_CARD_W,
      h: H_CARD_H,
      cx: headX + H_CARD_W / 2,
      cy: H_HEAD_Y + H_CARD_H / 2,
      col: colIdx,
    });

    const reports = graph.nodes
      .filter((n) => n.kind === "person" && n.managerId === head.id)
      .sort((a, b) => {
        const aFlag = a.topFindingSeverity ? 1 : 0;
        const bFlag = b.topFindingSeverity ? 1 : 0;
        if (bFlag !== aFlag) return bFlag - aFlag;
        const aOwnsFlag = (servicesByOwner.get(a.id) ?? []).some((s) => s.topFindingSeverity) ? 1 : 0;
        const bOwnsFlag = (servicesByOwner.get(b.id) ?? []).some((s) => s.topFindingSeverity) ? 1 : 0;
        if (bOwnsFlag !== aOwnsFlag) return bOwnsFlag - aOwnsFlag;
        return b.riskScore - a.riskScore || a.name.localeCompare(b.name);
      });

    let rowY = H_FIRST_CHILD_Y;
    const colMembers: GraphNode[] = [head];

    for (const rep of reports) {
      const rx = colX + 22;
      const rw = H_CARD_W - 6;
      positions.set(rep.id, {
        x: rx,
        y: rowY,
        w: rw,
        h: H_CARD_H,
        cx: rx + rw / 2,
        cy: rowY + H_CARD_H / 2,
        col: colIdx,
      });
      colMembers.push(rep);
      rowY += H_ROW_STEP;

      for (const svc of servicesByOwner.get(rep.id) ?? []) {
        const sx = colX + 36;
        positions.set(svc.id, {
          x: sx,
          y: rowY - 4,
          w: H_SVC_W - 4,
          h: H_SVC_H,
          cx: sx + (H_SVC_W - 4) / 2,
          cy: rowY - 4 + H_SVC_H / 2,
          col: colIdx,
        });
        colMembers.push(svc);
        rowY += H_SVC_H + 16;
      }
    }

    const colBottom = rowY + 8;
    maxBottom = Math.max(maxBottom, colBottom);
    const avgRisk = Math.round(colMembers.reduce((s, n) => s + n.riskScore, 0) / Math.max(1, colMembers.length));
    const flaggedCount = colMembers.filter((n) => Boolean(n.topFindingSeverity)).length;

    columns.push({
      dept,
      x: colX,
      y: H_HEAD_Y - 34,
      w: H_COL_W,
      h: colBottom - (H_HEAD_Y - 34),
      avgRisk,
      flaggedCount,
    });
  });

  return { width: totalW, height: maxBottom + 36, positions, columns, sectors: [] as SectorLabel[] };
}

function computeRadialLayout(graph: OrgGraph) {
  const positions = new Map<string, NodePos>();
  const sectors: SectorLabel[] = [];
  const root = graph.nodes.find((n) => n.kind === "org");

  if (root) {
    positions.set(root.id, { x: R_CX - 54, y: R_CY - 54, w: 108, h: 108, cx: R_CX, cy: R_CY });
  }

  const heads = graph.nodes.filter((n) => n.kind === "person" && n.managerId === "org-root");
  const orderedHeads = [
    ...DEPT_ORDER.map((d) => heads.find((h) => h.department === d)).filter((h): h is GraphNode => Boolean(h)),
    ...heads.filter((h) => !DEPT_ORDER.includes(h.department)),
  ];

  const servicesByOwner = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) {
    if (n.kind === "service" && n.managerId) {
      const list = servicesByOwner.get(n.managerId) ?? [];
      list.push(n);
      servicesByOwner.set(n.managerId, list);
    }
  }

  const count = Math.max(1, orderedHeads.length);
  const sweep = (Math.PI * 2) / count;
  let cursor = -Math.PI;

  const cornerAnchors: { x: number; y: number; align: "start" | "end" }[] = [
    { x: 34, y: 40, align: "start" },
    { x: R_W - 34, y: 40, align: "end" },
    { x: R_W - 34, y: R_H - 36, align: "end" },
    { x: 34, y: R_H - 36, align: "start" },
  ];

  orderedHeads.forEach((head, idx) => {
    const mid = cursor + sweep / 2;
    const headRx = 185;
    const headRy = 148;
    const hx = R_CX + Math.cos(mid) * headRx;
    const hy = R_CY + Math.sin(mid) * headRy;

    positions.set(head.id, { x: hx - 28, y: hy - 28, w: 56, h: 56, cx: hx, cy: hy, col: idx, angle: mid });

    const reports = graph.nodes
      .filter((n) => n.kind === "person" && n.managerId === head.id)
      .sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name));

    const pad = sweep * 0.16;
    const usable = Math.max(0.1, sweep - pad * 2);
    const sectorMembers: GraphNode[] = [head];

    reports.forEach((rep, rIdx) => {
      const t = reports.length === 1 ? 0.5 : rIdx / (reports.length - 1);
      const angle = cursor + pad + t * usable;
      const stagger = reports.length >= 4 && rIdx % 2 === 1 ? 1.08 : 0.96;
      const repRx = 395 * stagger;
      const repRy = 290 * stagger;
      const rx = R_CX + Math.cos(angle) * repRx;
      const ry = R_CY + Math.sin(angle) * repRy;
      positions.set(rep.id, { x: rx - 24, y: ry - 24, w: 48, h: 48, cx: rx, cy: ry, col: idx, angle });
      sectorMembers.push(rep);

      const svcs = servicesByOwner.get(rep.id) ?? [];
      svcs.forEach((svc, sIdx) => {
        const sAngle = angle + (sIdx - (svcs.length - 1) / 2) * 0.12;
        const sx = Math.max(84, Math.min(R_W - 84, rx + Math.cos(sAngle) * 116));
        const sy = Math.max(66, Math.min(R_H - 76, ry + Math.sin(sAngle) * 76));
        positions.set(svc.id, { x: sx - 22, y: sy - 22, w: 44, h: 44, cx: sx, cy: sy, col: idx, angle: sAngle });
        sectorMembers.push(svc);
      });
    });

    const avgRisk = Math.round(sectorMembers.reduce((s, n) => s + n.riskScore, 0) / Math.max(1, sectorMembers.length));
    const flaggedCount = sectorMembers.filter((n) => Boolean(n.topFindingSeverity)).length;
    const anchor = cornerAnchors[idx] ?? {
      x: R_CX + Math.cos(mid) * 520,
      y: R_CY + Math.sin(mid) * 350,
      align: Math.cos(mid) >= 0 ? ("end" as const) : ("start" as const),
    };
    sectors.push({
      dept: head.department,
      x: anchor.x,
      y: anchor.y,
      align: anchor.align,
      avgRisk,
      flaggedCount,
    });

    cursor += sweep;
  });

  return { width: R_W, height: R_H, positions, columns: [] as ColumnFrame[], sectors };
}

function hierarchyEdgePath(edge: GraphEdge, a: NodePos, b: NodePos): { d: string; mx: number; my: number } {
  if (edge.kind === "hierarchy") {
    if (edge.from === "org-root") {
      const x1 = a.cx;
      const y1 = a.y + a.h;
      const x2 = b.cx;
      const y2 = b.y;
      const midY = y1 + (y2 - y1) * 0.52;
      return { d: `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`, mx: (x1 + x2) / 2, my: midY };
    }
    const spineX = a.x - 8;
    const y1 = a.y + a.h;
    const x2 = b.x;
    const y2 = b.cy;
    const r = 8;
    const startX = a.x + 12;
    const dropY = y1 + 10;
    return {
      d: `M${startX},${y1} V${dropY - 4} Q${startX},${dropY} ${startX - 4},${dropY} H${spineX + 4} Q${spineX},${dropY} ${spineX},${dropY + 4} V${y2 - r} Q${spineX},${y2} ${spineX + r},${y2} H${x2}`,
      mx: spineX,
      my: (y1 + y2) / 2,
    };
  }

  if (edge.kind === "owns") {
    const startX = a.x + 14;
    const y1 = a.y + a.h;
    const x2 = b.x;
    const y2 = b.cy;
    const r = 7;
    return {
      d: `M${startX},${y1} V${y2 - r} Q${startX},${y2} ${startX + r},${y2} H${x2}`,
      mx: (startX + x2) / 2,
      my: y2 - 10,
    };
  }

  // peer_mesh
  if (Math.abs(a.cy - b.cy) < 10) {
    const x1 = a.x + a.w;
    const y1 = a.cy;
    const x2 = b.x;
    const y2 = b.cy;
    const mx = (x1 + x2) / 2;
    const my = y1 - 14;
    return { d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}`, mx, my: my + 4 };
  }
  const x1 = a.x + a.w;
  const y1 = a.cy;
  const x2 = b.x + b.w;
  const y2 = b.cy;
  const bow = Math.max(x1, x2) + 14;
  return { d: `M${x1},${y1} Q${bow},${(y1 + y2) / 2} ${x2},${y2}`, mx: bow, my: (y1 + y2) / 2 };
}

function radialEdgePath(edge: GraphEdge, a: NodePos, b: NodePos): { d: string; mx: number; my: number } {
  if (edge.kind === "hierarchy" || edge.kind === "owns") {
    return { d: `M${a.cx},${a.cy} L${b.cx},${b.cy}`, mx: (a.cx + b.cx) / 2, my: (a.cy + b.cy) / 2 };
  }
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const cx = mx + (mx - R_CX) * 0.12;
  const cy = my + (my - R_CY) * 0.12;
  return { d: `M${a.cx},${a.cy} Q${cx},${cy} ${b.cx},${b.cy}`, mx: cx, my: cy };
}

function edgeVisual(edge: GraphEdge, highlighted: boolean, dimmed: boolean) {
  let stroke = "#475569";
  let width = 1.5;
  let opacity = 0.78;
  let dash: string | undefined = edge.dashed ? "5 4" : undefined;

  switch (edge.kind) {
    case "hierarchy":
      stroke = edge.risk === "high" ? "#FF4D5E" : "#475569";
      width = edge.from === "org-root" ? 2 : 1.6;
      opacity = 0.88;
      break;
    case "owns":
      stroke = edge.risk === "high" ? "#FF4D5E" : "#A78BFA";
      width = 2;
      opacity = 0.92;
      break;
    case "peer_mesh":
      stroke = "#334155";
      width = 1.2;
      opacity = 0.6;
      dash = "2 5";
      break;
  }

  if (highlighted) {
    width = Math.max(width + 1, 2.6);
    opacity = 1;
    if (edge.kind === "hierarchy" && !edge.risk) stroke = "#3898FF";
    if (edge.kind === "peer_mesh") stroke = "#3898FF";
  } else if (dimmed) {
    opacity = 0.1;
  }

  return { stroke, width, opacity, dash };
}

function NodeRiskRing({ cx, cy, r, score, stroke }: { cx: number; cy: number; r: number; score: number; stroke: string }) {
  const circ = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(100, score)) / 100) * circ;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0B1120" stroke="#1E293B" strokeWidth={3.4} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={3.4}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circ}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text
        x={cx}
        y={cy + 3.8}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={800}
        fill={stroke}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {score}%
      </text>
    </g>
  );
}

interface Props {
  graph?: OrgGraph;
  summary?: Summary;
  findings?: Finding[];
  selectedPrincipalId?: string;
  onSelectPrincipal: (principalId: string | undefined) => void;
  error?: string;
  onRetry: () => void;
}

const VISIBLE_KINDS = new Set<GraphEdgeKind>(["hierarchy", "owns", "peer_mesh"]);

export function OrgRiskGraph({
  graph,
  summary,
  findings,
  selectedPrincipalId,
  onSelectPrincipal,
  error,
  onRetry,
}: Props) {
  const [layout, setLayout] = React.useState<LayoutMode>("radial");
  const [filter, setFilter] = React.useState<FilterMode>("all");
  const [query, setQuery] = React.useState("");
  const [hoverId, setHoverId] = React.useState<string>();

  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState({ x: 0, y: 0 });
  const dragRef = React.useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [layout]);

  const computed = React.useMemo(() => {
    if (!graph) return undefined;
    return layout === "radial" ? computeRadialLayout(graph) : computeHierarchyLayout(graph);
  }, [graph, layout]);

  const visibleEdges = React.useMemo(() => {
    if (!graph) return [];
    return graph.edges.filter((e) => VISIBLE_KINDS.has(e.kind));
  }, [graph]);

  const focusId = hoverId ?? selectedPrincipalId;
  const connected = React.useMemo(() => {
    if (!focusId || focusId === "org-root") return undefined;
    const nodeIds = new Set<string>([focusId]);
    const edgeIds = new Set<string>();
    for (const e of visibleEdges) {
      if (e.from === focusId || e.to === focusId) {
        nodeIds.add(e.from);
        nodeIds.add(e.to);
        edgeIds.add(e.id);
      }
    }
    return { nodeIds, edgeIds };
  }, [focusId, visibleEdges]);

  const matchingIds = React.useMemo(() => {
    if (!graph) return undefined;
    const q = query.trim().toLowerCase();
    if (!q && filter === "all") return undefined;
    const ids = new Set<string>(["org-root"]);
    for (const n of graph.nodes) {
      if (n.kind === "org") continue;
      const matchesFilter =
        filter === "all" ||
        (filter === "flagged" && Boolean(n.topFindingSeverity)) ||
        (filter === "elevated" && n.riskScore > 35);
      const matchesQuery =
        !q ||
        n.name.toLowerCase().includes(q) ||
        n.subtitle.toLowerCase().includes(q) ||
        n.department.toLowerCase().includes(q);
      if (matchesFilter && matchesQuery) ids.add(n.id);
    }
    return ids;
  }, [graph, filter, query]);

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.max(0.6, Math.min(2.6, Number((z * factor).toFixed(2)))));
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest("[data-graph-node]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || !svgRef.current || !computed) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = computed.width / Math.max(1, rect.width);
    const scaleY = computed.height / Math.max(1, rect.height);
    const dx = (e.clientX - d.x) * scaleX;
    const dy = (e.clientY - d.y) * scaleY;
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    setPan({ x: d.panX + dx, y: d.panY + dy });
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (d) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      dragRef.current = null;
      if (!d.moved && selectedPrincipalId) {
        onSelectPrincipal(undefined);
      }
    }
  };

  if (error && !graph) {
    return (
      <EmptyStateCard
        asset={<IconErrorRegular size="100%" color={skinVars.colors.error} />}
        title="No se puede cargar el mapa de riesgo de la organización"
        description={`${error}. ¿Está el servidor en marcha en el puerto 8787?`}
        button={
          <ButtonPrimary small onPress={onRetry}>
            Reintentar
          </ButtonPrimary>
        }
      />
    );
  }

  if (!graph || !computed) {
    return <SkeletonRectangle height={640} />;
  }

  const flaggedTotal = graph.nodes.filter((n) => n.kind !== "org" && Boolean(n.topFindingSeverity)).length;
  const elevatedTotal = graph.nodes.filter((n) => n.kind !== "org" && n.riskScore > 35).length;
  const principalTotal = graph.nodes.filter((n) => n.kind !== "org").length;

  const isNodeDimmed = (n: GraphNode) => {
    if (matchingIds && !matchingIds.has(n.id)) return true;
    if (connected && !connected.nodeIds.has(n.id)) return true;
    return false;
  };

  const findingStatusFor = (n: GraphNode) => {
    if (!findings || !n.findingIds.length) return undefined;
    return findings.find((f) => n.findingIds.includes(f.id))?.status;
  };

  const edgePriority: Record<GraphEdgeKind, number> = {
    peer_mesh: 0,
    hierarchy: 1,
    owns: 2,
    shared_privilege: 3,
    ticket_approval: 4,
    cross_dept_access: 5,
  };
  const sortedEdges = [...visibleEdges].sort((a, b) => {
    const aHi = connected?.edgeIds.has(a.id) ? 10 : 0;
    const bHi = connected?.edgeIds.has(b.id) ? 10 : 0;
    return edgePriority[a.kind] + aHi - (edgePriority[b.kind] + bHi);
  });

  const cx = computed.width / 2;
  const cy = computed.height / 2;
  const transform = `translate(${pan.x}, ${pan.y}) translate(${cx}, ${cy}) scale(${zoom}) translate(${-cx}, ${-cy})`;

  return (
    <Boxed>
      <style>{`
        @keyframes ah-pulse {
          0%, 100% { opacity: 0.95; transform: scale(1); }
          50% { opacity: 0.25; transform: scale(1.38); }
        }
        @keyframes ah-flow {
          from { stroke-dashoffset: 18; }
          to { stroke-dashoffset: 0; }
        }
        .ah-graph-node { cursor: pointer; transition: opacity 150ms ease; }
        .ah-graph-node:hover .ah-card-bg { filter: drop-shadow(0 0 14px rgba(56, 152, 255, 0.35)); }
        .ah-risk-flow { animation: ah-flow 1.3s linear infinite; }
        .ah-risk-pulse { transform-box: fill-box; transform-origin: center; animation: ah-pulse 2s ease-in-out infinite; }
      `}</style>

      {/* Clean Top Bar: Search + Filter dropdown + View mode dropdown */}
      <div style={{ borderBottom: `1px solid ${skinVars.colors.border}`, background: "#0F1624" }}>
        <Box padding={16}>
          <Inline space="between" alignItems="center" wrap verticalSpace={12}>
            <Inline space={12} alignItems="center" wrap verticalSpace={8}>
              <input
                type="search"
                aria-label="Buscar usuarios en el mapa"
                placeholder="Buscar usuario, puesto, departamento…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{
                  ...controlStyle,
                  minWidth: 230,
                }}
              />

              <select
                aria-label="Filtrar usuarios por riesgo"
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterMode)}
                style={{
                  ...controlStyle,
                  cursor: "pointer",
                  paddingRight: 28,
                }}
              >
                <option value="all">{`Filtro: todos (${principalTotal})`}</option>
                <option value="flagged">{`Filtro: en riesgo (${flaggedTotal})`}</option>
                <option value="elevated">{`Filtro: >35% (${elevatedTotal})`}</option>
              </select>

              <select
                aria-label="Elegir la vista del mapa"
                value={layout}
                onChange={(e) => setLayout(e.target.value as LayoutMode)}
                style={{
                  ...controlStyle,
                  cursor: "pointer",
                  paddingRight: 28,
                }}
              >
                <option value="radial">Vista: mapa de riesgo</option>
                <option value="hierarchy">Vista: jerarquía</option>
              </select>
            </Inline>

            <Inline space={16} alignItems="center" wrap verticalSpace={8}>
              <Inline space={12} alignItems="center" wrap verticalSpace={4}>
                <LegendDot color={scorePalette.critical.stroke} label="80–100%" />
                <LegendDot color={scorePalette.high.stroke} label="60–79%" />
                <LegendDot color={scorePalette.medium.stroke} label="35–59%" />
                <LegendDot color={scorePalette.low.stroke} label="0–34%" />
              </Inline>
            </Inline>
          </Inline>
        </Box>
      </div>

      {/* Dark Interactive Map Canvas */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "min(80vh, 760px)",
          minHeight: 540,
          backgroundColor: "#080C14",
          backgroundImage:
            "radial-gradient(circle at 50% 50%, rgba(23, 37, 84, 0.42) 0%, rgba(8, 12, 20, 0.92) 72%), radial-gradient(#1E293B 1px, transparent 1px)",
          backgroundSize: "100% 100%, 24px 24px",
          overflow: "hidden",
          userSelect: "none",
          cursor: dragRef.current ? "grabbing" : "grab",
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${computed.width} ${computed.height}`}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="img"
          aria-label="Mapa interactivo de la jerarquía y el riesgo de la organización"
          style={{ display: "block", touchAction: "none" }}
        >
          <defs>
            <filter id="ah-shadow" x="-15%" y="-20%" width="130%" height="150%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.55" />
            </filter>
            <filter id="ah-selected-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#3898FF" floodOpacity="0.7" />
            </filter>
            <filter id="ah-risk-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#FF4D5E" floodOpacity="0.45" />
            </filter>
          </defs>

          <g transform={transform}>
            {/* Radial radar rings & quadrant labels */}
            {layout === "radial" && (
              <g pointerEvents="none">
                <ellipse cx={R_CX} cy={R_CY} rx={185} ry={148} fill="none" stroke="#1E293B" strokeDasharray="4 7" strokeWidth={1.2} />
                <ellipse cx={R_CX} cy={R_CY} rx={395} ry={290} fill="none" stroke="#1E293B" strokeDasharray="4 7" strokeWidth={1.2} />
                <ellipse cx={R_CX} cy={R_CY} rx={510} ry={365} fill="none" stroke="#131C2E" strokeDasharray="2 8" strokeWidth={1} />
                <line x1={R_CX - 540} y1={R_CY} x2={R_CX + 540} y2={R_CY} stroke="#162033" strokeWidth={1} strokeDasharray="3 8" />
                <line x1={R_CX} y1={R_CY - 375} x2={R_CX} y2={R_CY + 375} stroke="#162033" strokeWidth={1} strokeDasharray="3 8" />

                {computed.sectors.map((sec) => {
                  const acc = departmentAccent[sec.dept] ?? departmentAccent["Dirección"]!;
                  const badgeW = 196;
                  const bx = sec.align === "start" ? sec.x : sec.x - badgeW;
                  return (
                    <g key={sec.dept}>
                      <rect
                        x={bx}
                        y={sec.y - 16}
                        width={badgeW}
                        height={28}
                        rx={8}
                        fill={acc.bg}
                        fillOpacity={0.82}
                        stroke={acc.border}
                        strokeWidth={1}
                      />
                      <text x={bx + 12} y={sec.y + 2} fontSize={11.5} fontWeight={800} fill={acc.text} letterSpacing="0.06em">
                        {sec.dept.toUpperCase()}
                      </text>
                      <text
                        x={bx + badgeW - 12}
                        y={sec.y + 2}
                        textAnchor="end"
                        fontSize={11}
                        fontWeight={700}
                        fill={sec.flaggedCount > 0 ? "#FF8592" : "#94A3B8"}
                      >
                        {`media ${sec.avgRisk}%${sec.flaggedCount > 0 ? ` · ${sec.flaggedCount}!` : ""}`}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            {/* Department column frames (Hierarchy mode) */}
            {layout === "hierarchy" &&
              computed.columns.map((col) => {
                const accent = departmentAccent[col.dept] ?? departmentAccent["Dirección"]!;
                return (
                  <g key={col.dept}>
                    <rect
                      x={col.x}
                      y={col.y}
                      width={col.w}
                      height={col.h}
                      rx={14}
                      fill="#0E1525"
                      fillOpacity={0.86}
                      stroke={accent.border}
                      strokeOpacity={0.55}
                      strokeWidth={1.2}
                    />
                    <rect x={col.x + 10} y={col.y + 8} width={col.w - 20} height={22} rx={6} fill={accent.bg} />
                    <text x={col.x + 18} y={col.y + 23} fontSize={11} fontWeight={700} fill={accent.text} letterSpacing="0.05em">
                      {col.dept.toUpperCase()}
                    </text>
                    <text
                      x={col.x + col.w - 18}
                      y={col.y + 23}
                      textAnchor="end"
                      fontSize={10.5}
                      fontWeight={700}
                      fill={col.flaggedCount > 0 ? "#FF8592" : accent.text}
                    >
                      {`media ${col.avgRisk}%${col.flaggedCount > 0 ? ` · ${col.flaggedCount}!` : ""}`}
                    </text>
                  </g>
                );
              })}

            {/* Edges */}
            <g>
              {sortedEdges.map((edge) => {
                const a = computed.positions.get(edge.from);
                const b = computed.positions.get(edge.to);
                if (!a || !b) return null;

                const isHighlighted = Boolean(connected?.edgeIds.has(edge.id));
                const isDimmed =
                  Boolean(connected && !isHighlighted) ||
                  Boolean(matchingIds && (!matchingIds.has(edge.from) || !matchingIds.has(edge.to)));

                const vis = edgeVisual(edge, isHighlighted, isDimmed);
                const geom = layout === "radial" ? radialEdgePath(edge, a, b) : hierarchyEdgePath(edge, a, b);
                const animateFlow = edge.kind === "owns" && edge.risk === "high" && !isDimmed;
                const showLabel = Boolean(edge.label) && isHighlighted && edge.kind === "owns";

                return (
                  <g key={edge.id} style={{ transition: "opacity 150ms ease", opacity: vis.opacity }}>
                    <path
                      d={geom.d}
                      fill="none"
                      stroke={vis.stroke}
                      strokeWidth={vis.width}
                      strokeDasharray={animateFlow ? "6 4" : vis.dash}
                      strokeLinecap="round"
                      className={animateFlow ? "ah-risk-flow" : undefined}
                    />
                    {showLabel && edge.label && (
                      <g pointerEvents="none">
                        <rect
                          x={geom.mx - Math.min(115, edge.label.length * 3.4 + 12)}
                          y={geom.my - 11}
                          width={Math.min(230, edge.label.length * 6.8 + 24)}
                          height={22}
                          rx={11}
                          fill="#0B1220"
                          stroke={vis.stroke}
                          strokeWidth={1.3}
                        />
                        <text x={geom.mx} y={geom.my + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#F8FAFC">
                          {truncate(edge.label, 32)}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {graph.nodes.map((node) => {
                const pos = computed.positions.get(node.id);
                if (!pos) return null;
                const pal = scorePalette[node.riskLevel];
                const isSelected = selectedPrincipalId === node.id;
                const isHovered = hoverId === node.id;
                const dimmed = isNodeDimmed(node);
                const status = findingStatusFor(node);
                const isActiveFlagged = Boolean(node.topFindingSeverity);

                if (node.kind === "org") {
                  if (layout === "radial") {
                    const hubR = 54;
                    const hubCirc = 2 * Math.PI * (hubR + 5);
                    const hubFill = (node.riskScore / 100) * hubCirc;
                    return (
                      <g
                        key={node.id}
                        data-graph-node={node.id}
                        className="ah-graph-node"
                        onClick={() => onSelectPrincipal(undefined)}
                      >
                        <circle cx={pos.cx} cy={pos.cy} r={hubR + 5} fill="#090D16" stroke="#1E293B" strokeWidth={4} />
                        <circle
                          cx={pos.cx}
                          cy={pos.cy}
                          r={hubR + 5}
                          fill="none"
                          stroke={pal.stroke}
                          strokeWidth={4}
                          strokeLinecap="round"
                          strokeDasharray={`${hubFill} ${hubCirc}`}
                          transform={`rotate(-90 ${pos.cx} ${pos.cy})`}
                        />
                        <circle
                          cx={pos.cx}
                          cy={pos.cy}
                          r={hubR}
                          fill="#0F172A"
                          stroke="#3898FF"
                          strokeWidth={2}
                          filter="url(#ah-shadow)"
                        />
                        <text x={pos.cx} y={pos.cy - 12} textAnchor="middle" fontSize={12.5} fontWeight={800} fill="#F8FAFC">
                          {node.name}
                        </text>
                        <text x={pos.cx} y={pos.cy + 5} textAnchor="middle" fontSize={10} fill="#94A3B8">
                          Riesgo medio
                        </text>
                        <text x={pos.cx} y={pos.cy + 27} textAnchor="middle" fontSize={18} fontWeight={800} fill={pal.stroke}>
                          {node.riskScore}%
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g
                      key={node.id}
                      data-graph-node={node.id}
                      className="ah-graph-node"
                      onClick={() => onSelectPrincipal(undefined)}
                    >
                      <rect
                        className="ah-card-bg"
                        x={pos.x}
                        y={pos.y}
                        width={pos.w}
                        height={pos.h}
                        rx={16}
                        fill="#111A2E"
                        stroke="#3898FF"
                        strokeWidth={2.2}
                        filter="url(#ah-shadow)"
                      />
                      <circle cx={pos.x + 32} cy={pos.cy} r={19} fill="#172554" stroke="#3B82F6" strokeWidth={1.2} />
                      <text x={pos.x + 32} y={pos.cy + 4.5} textAnchor="middle" fontSize={12} fontWeight={800} fill="#60A5FA">
                        BN
                      </text>
                      <text x={pos.x + 62} y={pos.y + 28} fontSize={14.5} fontWeight={700} fill="#F8FAFC">
                        {node.name}
                      </text>
                      <text x={pos.x + 62} y={pos.y + 46} fontSize={11} fill="#94A3B8">
                        {node.subtitle}
                      </text>
                      <NodeRiskRing cx={pos.x + pos.w - 34} cy={pos.cy} r={20} score={node.riskScore} stroke={pal.stroke} />
                    </g>
                  );
                }

                // RADIAL RISK MAP NODE
                if (layout === "radial") {
                  const isHead = node.managerId === "org-root";
                  const isSvc = node.kind === "service";
                  const r = isHead ? 27 : isSvc ? 21 : 23;
                  const ringR = r + 5;
                  const circ = 2 * Math.PI * ringR;
                  const filled = (node.riskScore / 100) * circ;
                  const deptAcc = departmentAccent[node.department] ?? departmentAccent["Dirección"]!;
                  const labelW = Math.max(114, Math.min(174, node.name.length * 6.8 + 48));

                  return (
                    <g
                      key={node.id}
                      data-graph-node={node.id}
                      className="ah-graph-node"
                      style={{ opacity: dimmed ? 0.2 : 1 }}
                      onMouseEnter={() => setHoverId(node.id)}
                      onMouseLeave={() => setHoverId(undefined)}
                      onClick={() => onSelectPrincipal(node.id)}
                    >
                      {isActiveFlagged && !dimmed && (
                        <circle
                          cx={pos.cx}
                          cy={pos.cy}
                          r={ringR + 6}
                          fill="none"
                          stroke={pal.stroke}
                          strokeWidth={1.8}
                          className="ah-risk-pulse"
                        />
                      )}
                      <circle cx={pos.cx} cy={pos.cy} r={ringR} fill="#090D16" stroke="#1E293B" strokeWidth={4} />
                      <circle
                        cx={pos.cx}
                        cy={pos.cy}
                        r={ringR}
                        fill="none"
                        stroke={pal.stroke}
                        strokeWidth={4}
                        strokeLinecap="round"
                        strokeDasharray={`${filled} ${circ}`}
                        transform={`rotate(-90 ${pos.cx} ${pos.cy})`}
                      />
                      <circle
                        className="ah-card-bg"
                        cx={pos.cx}
                        cy={pos.cy}
                        r={r}
                        fill={isSelected ? "#0066FF" : isActiveFlagged ? pal.bg : isSvc ? "#1E1638" : deptAcc.bg}
                        stroke={isSelected ? "#60A5FA" : isHovered ? "#3898FF" : isActiveFlagged ? pal.border : deptAcc.border}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                        strokeDasharray={node.status === "left" ? "4 3" : undefined}
                        filter={isSelected ? "url(#ah-selected-glow)" : isActiveFlagged ? "url(#ah-risk-glow)" : "url(#ah-shadow)"}
                      />
                      <text
                        x={pos.cx}
                        y={pos.cy + 4.5}
                        textAnchor="middle"
                        fontSize={isSvc ? 10 : isHead ? 12.5 : 11.5}
                        fontWeight={800}
                        fill={isSelected ? "#FFFFFF" : isActiveFlagged ? pal.text : deptAcc.text}
                      >
                        {isSvc ? "SVC" : initials(node.name)}
                      </text>

                      {!isActiveFlagged && (status === "approved" || status === "resolved") && (
                        <circle cx={pos.cx + r - 3} cy={pos.cy - r + 3} r={5} fill="#10B981" stroke="#090D16" strokeWidth={1.6} />
                      )}

                      <rect
                        x={pos.cx - labelW / 2}
                        y={pos.cy + ringR + 7}
                        width={labelW}
                        height={22}
                        rx={11}
                        fill={isSelected ? "#0066FF" : "#0F172A"}
                        fillOpacity={0.95}
                        stroke={isSelected ? "#60A5FA" : isActiveFlagged ? pal.border : "#334155"}
                        strokeWidth={1.2}
                      />
                      <text
                        x={pos.cx - labelW / 2 + 10}
                        y={pos.cy + ringR + 21.5}
                        fontSize={10.8}
                        fontWeight={600}
                        fill={isSelected ? "#FFFFFF" : "#F1F5F9"}
                      >
                        {truncate(node.name, 16)}
                      </text>
                      <text
                        x={pos.cx + labelW / 2 - 9}
                        y={pos.cy + ringR + 21.5}
                        textAnchor="end"
                        fontSize={10.8}
                        fontWeight={800}
                        fill={isSelected ? "#FFFFFF" : pal.stroke}
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {node.riskScore}%
                      </text>
                    </g>
                  );
                }

                // HIERARCHY DARK CARD
                const isSvc = node.kind === "service";
                const deptAcc = departmentAccent[node.department] ?? departmentAccent["Dirección"]!;
                const fill = isSelected ? "#13294B" : isActiveFlagged ? pal.bg : isSvc ? "#1A1430" : "#111827";
                const borderColor = isSelected
                  ? "#3898FF"
                  : isHovered
                    ? "#3898FF"
                    : isActiveFlagged
                      ? pal.border
                      : isSvc
                        ? "#7C3AED"
                        : "#273549";

                return (
                  <g
                    key={node.id}
                    data-graph-node={node.id}
                    className="ah-graph-node"
                    style={{ opacity: dimmed ? 0.22 : 1 }}
                    onMouseEnter={() => setHoverId(node.id)}
                    onMouseLeave={() => setHoverId(undefined)}
                    onClick={() => onSelectPrincipal(node.id)}
                  >
                    <rect
                      className="ah-card-bg"
                      x={pos.x}
                      y={pos.y}
                      width={pos.w}
                      height={pos.h}
                      rx={11}
                      fill={fill}
                      stroke={borderColor}
                      strokeWidth={isSelected ? 2.5 : isActiveFlagged ? 2 : 1.3}
                      strokeDasharray={node.status === "left" ? "5 3" : undefined}
                      filter={isSelected ? "url(#ah-selected-glow)" : "url(#ah-shadow)"}
                    />
                    <circle
                      cx={pos.x + 25}
                      cy={pos.cy}
                      r={isSvc ? 14 : 16}
                      fill={isSvc ? "#2E1065" : isActiveFlagged ? "#0B1120" : deptAcc.bg}
                      stroke={isSvc ? "#A78BFA" : isActiveFlagged ? pal.border : deptAcc.border}
                      strokeWidth={1.2}
                    />
                    <text
                      x={pos.x + 25}
                      y={pos.cy + 4}
                      textAnchor="middle"
                      fontSize={isSvc ? 9.5 : 11}
                      fontWeight={700}
                      fill={isSvc ? "#C4B5FD" : isActiveFlagged ? pal.text : deptAcc.text}
                    >
                      {isSvc ? "SVC" : initials(node.name)}
                    </text>

                    {isActiveFlagged ? (
                      <circle cx={pos.x + 36} cy={pos.cy - 11} r={4.5} fill={pal.stroke} stroke="#0B1120" strokeWidth={1.5} className="ah-risk-pulse" />
                    ) : status === "approved" || status === "resolved" ? (
                      <circle cx={pos.x + 36} cy={pos.cy - 11} r={4.5} fill="#10B981" stroke="#0B1120" strokeWidth={1.5} />
                    ) : null}

                    <text x={pos.x + 50} y={pos.y + (isSvc ? 23 : 25)} fontSize={12.5} fontWeight={700} fill="#F8FAFC">
                      {truncate(node.name, 18)}
                    </text>
                    <text x={pos.x + 50} y={pos.y + (isSvc ? 39 : 43)} fontSize={10.5} fill="#94A3B8">
                      {node.status === "left" ? `Baja · ${truncate(node.subtitle, 14)}` : truncate(node.subtitle, 20)}
                    </text>

                    <NodeRiskRing cx={pos.x + pos.w - 26} cy={pos.cy} r={17.5} score={node.riskScore} stroke={pal.stroke} />
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        {/* Floating hover HUD */}
        {(() => {
          const hoveredNode = hoverId ? graph.nodes.find((n) => n.id === hoverId && n.kind !== "org") : undefined;
          if (!hoveredNode) return null;
          const pal = scorePalette[hoveredNode.riskLevel];
          const linkCount = visibleEdges.filter((e) => e.from === hoveredNode.id || e.to === hoveredNode.id).length;
          return (
            <div
              style={{
                position: "absolute",
                left: 14,
                bottom: 12,
                padding: "7px 14px",
                borderRadius: 10,
                background: "rgba(15, 23, 42, 0.94)",
                border: `1.5px solid ${pal.border}`,
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
                pointerEvents: "none",
              }}
            >
              <Inline space={12} alignItems="center">
                <Text2 medium color="#F8FAFC">
                  {hoveredNode.name}
                </Text2>
                <Text1 regular color="#94A3B8">
                  {`${hoveredNode.subtitle} · ${hoveredNode.department}`}
                </Text1>
                <Text2 medium color={pal.stroke}>
                  {`${hoveredNode.riskScore}% de riesgo`}
                </Text2>
                <Text1 regular color="#94A3B8">
                  {`${hoveredNode.entitlementCount} servicios · ${linkCount} vínculos · Clic para inspeccionar`}
                </Text1>
              </Inline>
            </div>
          );
        })()}
      </div>
    </Boxed>
  );
}

const controlStyle: React.CSSProperties = {
  height: 36,
  padding: "0 12px",
  borderRadius: 8,
  border: "1px solid #263449",
  background: "#090D16",
  color: "#F8FAFC",
  fontSize: 13,
  outline: "none",
};

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Inline space={4} alignItems="center">
      <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block" }} />
      <Text1 regular color="#94A3B8">
        {label}
      </Text1>
    </Inline>
  );
}
