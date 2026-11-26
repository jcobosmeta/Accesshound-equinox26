// Shared hook to load a principal's access profile and remember paths removed
// by approved decisions during this session, so the Access Map shows them dashed.

import * as React from "react";
import { api, type AccessPath, type PrincipalDetail } from "./api";

const pathKey = (a: AccessPath) => `${a.group.id}|${a.entitlement.id}`;

const lastSeen = new Map<string, AccessPath[]>();
const revoked = new Map<string, Map<string, AccessPath>>();

/** Forget remembered revocations (after the demo is reset). */
export function forgetRevocations() {
  lastSeen.clear();
  revoked.clear();
}

export function usePrincipal(principalId: string | undefined, dataVersion: number) {
  const [detail, setDetail] = React.useState<PrincipalDetail>();
  const [error, setError] = React.useState<string>();
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!principalId) {
      setDetail(undefined);
      setError(undefined);
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    api.principal(principalId).then(
      (d) => {
        if (!current) return;
        const now = new Set(d.access.map(pathKey));
        const gone = revoked.get(principalId) ?? new Map<string, AccessPath>();
        for (const a of lastSeen.get(principalId) ?? []) if (!now.has(pathKey(a))) gone.set(pathKey(a), a);
        for (const k of now) gone.delete(k); // restored, e.g. after a reset
        revoked.set(principalId, gone);
        lastSeen.set(principalId, d.access);
        setDetail(d);
        setError(undefined);
        setLoading(false);
      },
      (err) => {
        if (!current) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    );
    return () => {
      current = false;
    };
  }, [principalId, dataVersion]);

  const removed = principalId ? [...(revoked.get(principalId)?.values() ?? [])] : [];
  return { detail: detail?.profile.id === principalId ? detail : undefined, error, loading, removed };
}
