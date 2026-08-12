import React, { useEffect } from "react";
import type { CSSProperties } from "react";
import type { NavigateFn, PageParams, PageParamsMap } from "../App";
import UnboxedItems from "../components/UnboxedItems";
import { useHeader } from "../contexts/HeaderContext";

interface UnboxedDetailProps {
  navigate: NavigateFn;
  params: PageParams<"UnboxedDetail">;
}

export default function UnboxedDetail({ navigate, params }: UnboxedDetailProps): React.ReactElement {
  const space      = params.space;
  const from       = params.from ?? "GroupDetail";
  const fromParam  = params.fromParam ?? {};
  const { setHeader } = useHeader();

  useEffect(() => {
    setHeader({
      title: "Ohne Box",
      onBack: () => navigate(from as "GroupDetail", fromParam as PageParamsMap["GroupDetail"]),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.container}>
      <p style={styles.sub}>Gegenstände ohne Box in „{space?.name}"</p>
      <UnboxedItems space={space} />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: { padding: "16px" },
  title: { fontSize: 26, fontWeight: 800, color: "var(--c-text-1)", margin: "0 0 4px" },
  sub: { fontSize: 13, color: "var(--c-text-3)", marginBottom: 20 },
};
