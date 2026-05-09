import { useState, useEffect, Component } from "react";
import SourcedApp from "../components/SourcedApp";

class ErrorBoundary extends Component<{ children: any }, { error: string | null }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e: any) {
    return { error: String(e) };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, background: "#1a0000", color: "#ff6b6b", fontFamily: "monospace", fontSize: 13 }}>
          <strong>Fehler:</strong>
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{this.state.error}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0d1117", color: "#58a6ff", fontFamily: "monospace", fontSize: 13 }}>
      Initialisiere…
    </div>
  );
  return (
    <ErrorBoundary>
      <SourcedApp />
    </ErrorBoundary>
  );
}
