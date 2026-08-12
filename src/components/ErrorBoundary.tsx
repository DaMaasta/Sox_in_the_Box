import React from "react";
import type { CSSProperties, ReactNode } from "react";

interface Props {
  children: ReactNode;
  onReset: () => void;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={styles.root}>
        <div style={styles.icon}>⚠️</div>
        <p style={styles.title}>Etwas ist schiefgelaufen</p>
        <p style={styles.subtitle}>Die Seite konnte nicht geladen werden.</p>
        <button
          style={styles.btn}
          onClick={() => {
            this.setState({ hasError: false });
            this.props.onReset();
          }}
        >
          Zurück zur Startseite
        </button>
      </div>
    );
  }
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "64px 32px",
    textAlign: "center",
    minHeight: "40vh",
  },
  icon: { fontSize: 40, marginBottom: 16 },
  title: { fontSize: 17, fontWeight: 700, color: "var(--c-text-1)", margin: "0 0 6px" },
  subtitle: { fontSize: 14, color: "var(--c-text-3)", margin: "0 0 24px" },
  btn: {
    background: "#2C2926",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "12px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
